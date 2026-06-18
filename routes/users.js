import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { fallbackDB } from '../utils/dbFallback.js';

const router = express.Router();

// @route   GET /api/users
// @access  Private/Admin
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const isOnline = mongoose.connection.readyState === 1;
        if (isOnline) {
            const users = await User.find().select('-password').sort({ createdAt: -1 });
            res.json(users);
        } else {
            const users = await fallbackDB.getUsers();
            res.json(users);
        }
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/users/:id
// @access  Private/Admin
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { role, name } = req.body;
        const allowedRoles = ['customer', 'admin'];

        if (role && !allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Invalid role value' });
        }

        // Prevent admin from demoting themselves
        if (req.user._id.toString() === req.params.id && role && role !== 'admin') {
            return res.status(400).json({ message: 'You cannot remove your own admin role' });
        }

        const isOnline = mongoose.connection.readyState === 1;
        if (isOnline) {
            const updateFields = {};
            if (role) updateFields.role = role;
            if (name) updateFields.name = name;

            const user = await User.findByIdAndUpdate(
                req.params.id,
                { $set: updateFields },
                { new: true }
            ).select('-password');

            if (!user) return res.status(404).json({ message: 'User not found' });
            res.json(user);
        } else {
            res.status(503).json({ message: 'Database offline — user updates not available in fallback mode' });
        }
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        // Prevent admin from deleting themselves
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        const isOnline = mongoose.connection.readyState === 1;
        if (isOnline) {
            const user = await User.findByIdAndDelete(req.params.id);
            if (!user) return res.status(404).json({ message: 'User not found' });
            res.json({ message: 'User deleted successfully' });
        } else {
            res.status(503).json({ message: 'Database offline — user deletion not available in fallback mode' });
        }
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
