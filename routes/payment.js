import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { optionalAuth } from '../middleware/auth.js';
import { sendOrderConfirmationEmail } from '../utils/emailService.js';

const router = express.Router();

// Razorpay instance — initialised once using env credentials
const getRazorpay = () => {
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET ||
        RAZORPAY_KEY_ID === 'rzp_test_xxxxxxxxxxxx') {
        return null;
    }
    return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
};

// @desc    Create a Razorpay order (step 1 of payment)
// @route   POST /api/payment/create-order
// @access  Public
router.post('/create-order', async (req, res) => {
    try {
        const { amount } = req.body; // amount in rupees from frontend

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required.' });
        }

        const razorpay = getRazorpay();
        if (!razorpay) {
            return res.status(503).json({ message: 'Payment gateway is not configured. Please contact support.' });
        }

        const options = {
            amount: Math.round(amount * 100), // Razorpay expects paise (1 INR = 100 paise)
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
        };

        const razorpayOrder = await razorpay.orders.create(options);

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID, // sent to frontend to initialise Razorpay checkout
        });
    } catch (error) {
        console.error('Razorpay create-order error:', error);
        res.status(500).json({ message: 'Failed to create payment order. Please try again.' });
    }
});

// @desc    Verify payment signature & create order in DB (step 2 of payment)
// @route   POST /api/payment/verify
// @access  Public
router.post('/verify', optionalAuth, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderItems,
            shippingAddress,
            paymentMethod,
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: 'Payment verification data is incomplete.' });
        }

        // Verify HMAC-SHA256 signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
        }

        // Signature valid — create the order in MongoDB
        const isOnline = mongoose.connection.readyState === 1;
        if (!isOnline) {
            return res.status(503).json({ message: 'Database unavailable. Please contact support with your payment ID.' });
        }

        let calculatedTotal = 0;
        const itemsToSave = [];

        for (const item of orderItems) {
            const product = await Product.findOne({ id: item.id });
            if (!product) {
                return res.status(404).json({ message: `Product ${item.id} not found.` });
            }

            const variant = product.variants.find(
                (v) => v.id === item.variant.id ||
                    (v.size === item.variant.size && v.color === item.variant.color)
            );
            if (!variant) {
                return res.status(400).json({ message: `Variant not found for ${product.name}.` });
            }

            if (variant.inventory < item.quantity) {
                return res.status(400).json({
                    message: `Insufficient stock for ${product.name} (${variant.size}, ${variant.color}). Available: ${variant.inventory}`,
                });
            }

            variant.inventory -= item.quantity;
            product.inventory = product.variants.reduce((sum, v) => sum + v.inventory, 0);
            product.inStock = product.inventory > 0;
            await product.save();

            const itemPrice = variant.price || product.price;
            calculatedTotal += itemPrice * item.quantity;

            itemsToSave.push({
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: itemPrice,
                image: {
                    url: item.image?.url || product.images[0]?.url,
                    alt: item.image?.alt || product.images[0]?.alt || product.name,
                },
                variant: { id: variant.id, size: variant.size, color: variant.color },
                quantity: item.quantity,
            });
        }

        const gstAmount = Math.round(calculatedTotal * 0.18);
        const shippingCost = calculatedTotal > 2500 ? 0 : 150;
        const totalAmount = calculatedTotal + gstAmount + shippingCost;

        const order = await Order.create({
            user: req.user ? req.user._id : null,
            orderItems: itemsToSave,
            shippingAddress,
            paymentMethod,
            paymentStatus: 'Paid',
            orderStatus: 'Confirmed',
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            shippingCost,
            gstAmount,
            totalAmount,
        });

        // Send booking confirmation email asynchronously
        sendOrderConfirmationEmail(order);

        res.status(201).json(order);
    } catch (error) {
        console.error('Razorpay verify error:', error);
        res.status(500).json({ message: 'Order creation failed after payment. Please contact support.' });
    }
});

export default router;
