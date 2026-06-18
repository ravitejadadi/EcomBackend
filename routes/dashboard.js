import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { fallbackDB } from '../utils/dbFallback.js';

const router = express.Router();

// @desc    Get dashboard stats
// @route   GET /api/dashboard
// @access  Private/Admin
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const isOnline = mongoose.connection.readyState === 1;

        if (isOnline) {
            // 1. Total sales revenue (for Paid or non-Cancelled orders)
            const orders = await Order.find({ orderStatus: { $ne: 'Cancelled' } });
            const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);

            // 2. Orders count
            const totalOrders = await Order.countDocuments();

            // 3. Products count
            const totalProducts = await Product.countDocuments();

            // 4. Customers count
            const totalCustomers = await User.countDocuments({ role: 'customer' });

            // 5. Orders status breakdown
            const statusBreakdown = {
                Pending: await Order.countDocuments({ orderStatus: 'Pending' }),
                Processing: await Order.countDocuments({ orderStatus: 'Processing' }),
                Shipped: await Order.countDocuments({ orderStatus: 'Shipped' }),
                Delivered: await Order.countDocuments({ orderStatus: 'Delivered' }),
                Cancelled: await Order.countDocuments({ orderStatus: 'Cancelled' }),
            };

            // 6. Recent orders (last 5 orders)
            const recentOrders = await Order.find()
                .sort({ createdAt: -1 })
                .limit(5);

            // 7. Inventory alert products (products with total inventory < 15)
            const lowStockProducts = await Product.find({ inventory: { $lt: 15 } })
                .select('id name inventory category')
                .limit(5);

            res.json({
                totalSales,
                totalOrders,
                totalProducts,
                totalCustomers,
                statusBreakdown,
                recentOrders,
                lowStockProducts,
            });
        } else {
            // Read from fallback DB
            const orders = await fallbackDB.getOrders();
            const products = await fallbackDB.getProducts();
            const users = await fallbackDB.getUsers();

            const nonCancelledOrders = orders.filter((o) => o.orderStatus !== 'Cancelled');
            const totalSales = nonCancelledOrders.reduce((sum, order) => sum + order.totalAmount, 0);
            
            const totalOrders = orders.length;
            const totalProducts = products.length;
            const totalCustomers = users.filter((u) => u.role === 'customer').length;

            const statusBreakdown = {
                Pending: orders.filter((o) => o.orderStatus === 'Pending').length,
                Processing: orders.filter((o) => o.orderStatus === 'Processing').length,
                Shipped: orders.filter((o) => o.orderStatus === 'Shipped').length,
                Delivered: orders.filter((o) => o.orderStatus === 'Delivered').length,
                Cancelled: orders.filter((o) => o.orderStatus === 'Cancelled').length,
            };

            const recentOrders = orders.slice(0, 5);
            const lowStockProducts = products
                .filter((p) => p.inventory < 15)
                .slice(0, 5)
                .map((p) => ({ id: p.id, name: p.name, inventory: p.inventory, category: p.category }));

            res.json({
                totalSales,
                totalOrders,
                totalProducts,
                totalCustomers,
                statusBreakdown,
                recentOrders,
                lowStockProducts,
            });
        }
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
