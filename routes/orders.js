import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { verifyToken, isAdmin, optionalAuth } from '../middleware/auth.js';
import { fallbackDB } from '../utils/dbFallback.js';

const router = express.Router();

// @desc    Place a new order
// @route   POST /api/orders
// @access  Public/Optional Registered
router.post('/', optionalAuth, async (req, res) => {
    try {
        const { orderItems, shippingAddress, paymentMethod } = req.body;

        if (!orderItems || orderItems.length === 0) {
            return res.status(400).json({ message: 'No order items' });
        }
        if (!shippingAddress) {
            return res.status(400).json({ message: 'Shipping address is required' });
        }
        if (!paymentMethod) {
            return res.status(400).json({ message: 'Payment method is required' });
        }

        const isOnline = mongoose.connection.readyState === 1;

        if (isOnline) {
            // Validate products and check inventory, recalculating price
            let calculatedTotal = 0;
            const itemsToSave = [];

            for (const item of orderItems) {
                const product = await Product.findOne({ id: item.id });
                if (!product) {
                    return res.status(404).json({ message: `Product with id ${item.id} not found` });
                }

                // Find variant
                const variant = product.variants.find(
                    (v) => v.id === item.variant.id || (v.size === item.variant.size && v.color === item.variant.color)
                );
                if (!variant) {
                    return res.status(400).json({ message: `Variant not found for product ${product.name}` });
                }

                if (variant.inventory < item.quantity) {
                    return res.status(400).json({
                        message: `Insufficient inventory for ${product.name} (Size: ${variant.size}, Color: ${variant.color}). Available: ${variant.inventory}`,
                    });
                }

                // Deduct inventory
                variant.inventory -= item.quantity;
                if (variant.inventory <= 0) {
                    variant.inStock = false;
                }

                // Update main product inventory sum
                product.inventory = product.variants.reduce((sum, v) => sum + v.inventory, 0);
                if (product.inventory <= 0) {
                    product.inStock = false;
                }

                await product.save();

                // Calculate item cost
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
                    variant: {
                        id: variant.id,
                        size: variant.size,
                        color: variant.color,
                    },
                    quantity: item.quantity,
                });
            }

            // Apply GST structure and shipping
            const gstAmount = Math.round(calculatedTotal * 0.18);
            const shippingCost = calculatedTotal > 2500 ? 0 : 150;
            const totalAmount = calculatedTotal + gstAmount + shippingCost;

            const order = await Order.create({
                user: req.user ? req.user._id : null,
                orderItems: itemsToSave,
                shippingAddress,
                paymentMethod,
                paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid',
                orderStatus: 'Confirmed',
                shippingCost,
                gstAmount,
                totalAmount,
            });

            res.status(201).json(order);
        } else {
            // Offline fallback
            let calculatedTotal = 0;
            const itemsToSave = [];

            for (const item of orderItems) {
                const product = await fallbackDB.getProductById(item.id);
                if (!product) {
                    return res.status(404).json({ message: `Product with id ${item.id} not found` });
                }

                const variant = product.variants.find(
                    (v) => v.id === item.variant.id || (v.size === item.variant.size && v.color === item.variant.color)
                );
                if (!variant) {
                    return res.status(400).json({ message: `Variant not found for product ${product.name}` });
                }

                if (variant.inventory < item.quantity) {
                    return res.status(400).json({
                        message: `Insufficient inventory for ${product.name} (Size: ${variant.size}, Color: ${variant.color}). Available: ${variant.inventory}`,
                    });
                }

                calculatedTotal += (variant.price || product.price) * item.quantity;
                itemsToSave.push({
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    price: variant.price || product.price,
                    image: {
                        url: item.image?.url || product.images[0]?.url,
                        alt: item.image?.alt || product.images[0]?.alt || product.name,
                    },
                    variant: {
                        id: variant.id,
                        size: variant.size,
                        color: variant.color,
                    },
                    quantity: item.quantity,
                });
            }

            const gstAmount = Math.round(calculatedTotal * 0.18);
            const shippingCost = calculatedTotal > 2500 ? 0 : 150;
            const totalAmount = calculatedTotal + gstAmount + shippingCost;

            const order = await fallbackDB.createOrder({
                user: req.user ? req.user._id : null,
                orderItems: itemsToSave,
                shippingAddress,
                paymentMethod,
                paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid',
                orderStatus: 'Confirmed',
                shippingCost,
                gstAmount,
                totalAmount,
            });

            res.status(201).json(order);
        }
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// @desc    Get all orders (Admin only) or Customer orders
// @route   GET /api/orders
// @access  Private
router.get('/', verifyToken, async (req, res) => {
    try {
        const isOnline = mongoose.connection.readyState === 1;

        if (isOnline) {
            if (req.user.role === 'admin') {
                const orders = await Order.find().sort({ createdAt: -1 });
                return res.json(orders);
            } else {
                const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
                return res.json(orders);
            }
        } else {
            const userId = req.user.role === 'admin' ? null : req.user._id;
            const orders = await fallbackDB.getOrders(userId);
            return res.json(orders);
        }
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Update order status
// @route   PUT /api/orders/:id
// @access  Private/Admin
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { orderStatus, paymentStatus } = req.body;
        const isOnline = mongoose.connection.readyState === 1;

        if (isOnline) {
            const order = await Order.findById(req.params.id);
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            if (orderStatus !== undefined) order.orderStatus = orderStatus;
            if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;

            await order.save();
            res.json(order);
        } else {
            const updated = await fallbackDB.updateOrder(req.params.id, { orderStatus, paymentStatus });
            if (!updated) {
                return res.status(404).json({ message: 'Order not found' });
            }
            res.json(updated);
        }
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Track order by ID (Public)
// @route   GET /api/orders/track/:id
// @access  Public
router.get('/track/:id', async (req, res) => {
    try {
        const isOnline = mongoose.connection.readyState === 1;
        let order;

        if (isOnline) {
            if (mongoose.Types.ObjectId.isValid(req.params.id)) {
                order = await Order.findById(req.params.id);
            }
        } else {
            order = await fallbackDB.getOrderById(req.params.id);
        }

        if (!order) {
            return res.status(404).json({ message: 'Order not found with the provided ID' });
        }

        res.json(order);
    } catch (error) {
        console.error('Track order error:', error);
        res.status(500).json({ message: 'Server error tracking shipment' });
    }
});

export default router;
