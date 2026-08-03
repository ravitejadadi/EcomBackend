import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { optionalAuth } from '../middleware/auth.js';
import { sendOrderConfirmationEmail } from '../utils/emailService.js';

const router = express.Router();

// Helper: Check if a key string is a dummy placeholder
const isPlaceholder = (val) => {
    if (!val || typeof val !== 'string') return true;
    const clean = val.trim().toLowerCase();
    return (
        clean === '' ||
        clean.includes('xxxxxxxx') ||
        clean.includes('placeholder') ||
        clean.includes('your_') ||
        clean.includes('change_me')
    );
};

// Razorpay instance helper — initialised with env credentials for Test (rzp_test_) or Production (rzp_live_)
const getRazorpay = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (isPlaceholder(keyId) || isPlaceholder(keySecret)) {
        return null;
    }

    return new Razorpay({ key_id: keyId.trim(), key_secret: keySecret.trim() });
};

// @desc    Get Razorpay gateway configuration status
// @route   GET /api/payment/config
// @access  Public
router.get('/config', (req, res) => {
    const razorpay = getRazorpay();
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const isLive = keyId.startsWith('rzp_live_');
    const isTest = keyId.startsWith('rzp_test_');

    res.json({
        configured: Boolean(razorpay),
        mode: isLive ? 'live' : isTest ? 'test' : 'unconfigured',
        key: Boolean(razorpay) ? keyId : null,
    });
});

// @desc    Create a Razorpay order (step 1 of payment)
// @route   POST /api/payment/create-order
// @access  Public
router.post('/create-order', async (req, res) => {
    try {
        const { amount, currency = 'INR' } = req.body; // amount in major units (e.g. INR/USD) from frontend

        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ message: 'Valid payment amount is required.' });
        }

        const razorpay = getRazorpay();
        if (!razorpay) {
            return res.status(503).json({
                message: 'Razorpay payment gateway is not properly configured. Please update RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.',
            });
        }

        const keyId = process.env.RAZORPAY_KEY_ID.trim();
        const mode = keyId.startsWith('rzp_live_') ? 'live' : 'test';

        const targetCurrency = String(currency).toUpperCase().trim();

        const options = {
            amount: Math.round(numericAmount * 100), // Razorpay expects amount in subunits (e.g., 1 INR = 100 paise, 1 USD = 100 cents)
            currency: targetCurrency,
            receipt: `receipt_${Date.now()}`,
            notes: {
                environment: mode,
                store: 'THE ELEGANT',
            },
        };

        const razorpayOrder = await razorpay.orders.create(options);

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: keyId, // sent to frontend to initialise Razorpay checkout modal
            mode,
        });
    } catch (error) {
        console.error('Razorpay create-order error:', error);
        const statusCode = error?.statusCode || error?.status || 500;
        const razorpayDesc = error?.error?.description || error?.message || '';

        if (statusCode === 401 || razorpayDesc.includes('Authentication failed')) {
            return res.status(502).json({
                message: 'Razorpay Gateway Authentication Failed: The RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in backend/.env is invalid or expired. Please update backend/.env with valid API keys from Razorpay Dashboard (Settings -> API Keys).',
                details: razorpayDesc,
            });
        }

        res.status(500).json({ message: razorpayDesc || 'Failed to create payment order with Razorpay. Please try again.' });
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

        const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
        if (isPlaceholder(keySecret)) {
            return res.status(500).json({ message: 'Server configuration error: missing Razorpay secret key.' });
        }

        // Verify HMAC-SHA256 signature using timing-safe comparison to prevent side-channel leaks
        const expectedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const receivedBuf = Buffer.from(razorpay_signature, 'utf8');

        const isSignatureValid =
            expectedBuf.length === receivedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, receivedBuf);

        if (!isSignatureValid) {
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
            const product = await Product.findOne({ id: item.id }) ||
                            await Product.findById(item.id).catch(() => null);
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

        // Send booking confirmation email asynchronously (non-blocking)
        sendOrderConfirmationEmail(order).catch(err => console.error('[Payment Route] Non-blocking email error:', err));

        res.status(201).json(order);
    } catch (error) {
        console.error('Razorpay verify error:', error);
        res.status(500).json({ message: 'Order creation failed after payment. Please contact support.' });
    }
});

export default router;
