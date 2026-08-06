import express from 'express';
import mongoose from 'mongoose';
import Coupon from '../models/Coupon.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { fallbackDB } from '../utils/dbFallback.js';

const router = express.Router();

// Helper to check MongoDB connection status
const isDBOnline = () => mongoose.connection.readyState === 1;

// Helper to validate coupon logic against subtotal
const checkCouponValidity = (coupon, cartSubtotal) => {
    const now = new Date();

    if (!coupon.isActive) {
        return { valid: false, message: 'This coupon code is inactive.' };
    }

    if (coupon.startDate && new Date(coupon.startDate) > now) {
        return { valid: false, message: 'This coupon promotion has not started yet.' };
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < now) {
        return { valid: false, message: 'This coupon code has expired.' };
    }

    if (
        coupon.usageLimit !== null &&
        coupon.usageLimit !== undefined &&
        coupon.usedCount >= coupon.usageLimit
    ) {
        return { valid: false, message: 'This coupon code usage limit has been reached.' };
    }

    const subtotal = Number(cartSubtotal) || 0;
    if (subtotal < coupon.minPurchaseAmount) {
        return {
            valid: false,
            message: `Minimum purchase of ₹${coupon.minPurchaseAmount.toLocaleString('en-IN')} is required to apply '${coupon.code}'.`,
        };
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
        discount = (subtotal * coupon.discountAmount) / 100;
        if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
            discount = Math.min(discount, coupon.maxDiscountAmount);
        }
    } else {
        discount = coupon.discountAmount;
    }

    discount = Math.min(Math.round(discount), subtotal);

    return {
        valid: true,
        coupon: {
            _id: coupon._id,
            code: coupon.code,
            discountType: coupon.discountType,
            discountAmount: coupon.discountAmount,
            maxDiscountAmount: coupon.maxDiscountAmount,
            minPurchaseAmount: coupon.minPurchaseAmount,
            description: coupon.description,
        },
        discount,
        finalSubtotal: subtotal - discount,
    };
};

// @desc    Validate a coupon code for cart subtotal (Public/Customer)
// @route   POST /api/coupons/validate
// @access  Public
router.post('/validate', async (req, res) => {
    try {
        const { code, cartSubtotal } = req.body;

        if (!code || typeof code !== 'string' || !code.trim()) {
            return res.status(400).json({ message: 'Please enter a coupon code.' });
        }

        const cleanCode = code.trim().toUpperCase();
        const subtotal = Number(cartSubtotal);

        if (isNaN(subtotal) || subtotal <= 0) {
            return res.status(400).json({ message: 'Cart subtotal must be a valid positive amount.' });
        }

        let coupon;
        if (isDBOnline()) {
            coupon = await Coupon.findOne({ code: cleanCode });
        } else {
            coupon = await fallbackDB.getCouponByCode(cleanCode);
        }

        if (!coupon) {
            return res.status(404).json({ message: 'Invalid coupon code. Please check and try again.' });
        }

        const validation = checkCouponValidity(coupon, subtotal);
        if (!validation.valid) {
            return res.status(400).json({ message: validation.message });
        }

        return res.json({
            message: `Coupon '${coupon.code}' applied successfully!`,
            ...validation,
        });
    } catch (error) {
        console.error('Validate coupon error:', error);
        res.status(500).json({ message: 'Server error validating coupon.' });
    }
});

// @desc    Get public active coupons hints for checkout suggestions (Public)
// @route   GET /api/coupons/available
// @access  Public
router.get('/available', async (req, res) => {
    try {
        let coupons = [];
        if (isDBOnline()) {
            coupons = await Coupon.find({ isActive: true }).sort({ createdAt: -1 });
        } else {
            coupons = await fallbackDB.getCoupons();
            coupons = coupons.filter(c => c.isActive);
        }

        const now = new Date();
        const available = coupons
            .filter((c) => {
                if (c.expiryDate && new Date(c.expiryDate) < now) return false;
                if (c.startDate && new Date(c.startDate) > now) return false;
                if (c.usageLimit !== null && c.usageLimit !== undefined && c.usedCount >= c.usageLimit) return false;
                return true;
            })
            .map((c) => ({
                code: c.code,
                discountType: c.discountType,
                discountAmount: c.discountAmount,
                maxDiscountAmount: c.maxDiscountAmount,
                minPurchaseAmount: c.minPurchaseAmount,
                description: c.description,
            }));

        res.json(available);
    } catch (error) {
        console.error('Get available coupons error:', error);
        res.status(500).json({ message: 'Server error retrieving coupons.' });
    }
});

// @desc    Get all coupons (Admin)
// @route   GET /api/coupons
// @access  Private/Admin
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        if (isDBOnline()) {
            const coupons = await Coupon.find().sort({ createdAt: -1 });
            return res.json(coupons);
        } else {
            const coupons = await fallbackDB.getCoupons();
            return res.json(coupons);
        }
    } catch (error) {
        console.error('Get coupons error:', error);
        res.status(500).json({ message: 'Server error fetching coupons.' });
    }
});

// @desc    Get single coupon (Admin)
// @route   GET /api/coupons/:id
// @access  Private/Admin
router.get('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        let coupon;
        if (isDBOnline()) {
            coupon = await Coupon.findById(req.params.id);
        } else {
            coupon = await fallbackDB.getCouponById(req.params.id);
        }

        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found.' });
        }

        res.json(coupon);
    } catch (error) {
        console.error('Get coupon by id error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

// @desc    Create a new coupon (Admin)
// @route   POST /api/coupons
// @access  Private/Admin
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            code,
            description,
            discountType,
            discountAmount,
            maxDiscountAmount,
            minPurchaseAmount,
            startDate,
            expiryDate,
            usageLimit,
            isActive,
        } = req.body;

        if (!code || !code.trim()) {
            return res.status(400).json({ message: 'Coupon code is required.' });
        }

        const cleanCode = code.trim().toUpperCase();

        if (discountAmount === undefined || discountAmount === null || Number(discountAmount) < 0) {
            return res.status(400).json({ message: 'Valid discount amount is required.' });
        }

        if (discountType === 'percentage' && (Number(discountAmount) <= 0 || Number(discountAmount) > 100)) {
            return res.status(400).json({ message: 'Percentage discount must be between 1% and 100%.' });
        }

        // Validate expiry date (must be today or future date)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        if (expiryDate) {
            const exp = new Date(expiryDate);
            if (isNaN(exp.getTime())) {
                return res.status(400).json({ message: 'Invalid expiration date format.' });
            }
            if (exp < todayStart) {
                return res.status(400).json({ message: 'Expiration date must be today or a future date.' });
            }
            if (startDate && new Date(startDate) > exp) {
                return res.status(400).json({ message: 'Expiration date cannot be earlier than the campaign start date.' });
            }
        }

        if (isDBOnline()) {
            const existing = await Coupon.findOne({ code: cleanCode });
            if (existing) {
                return res.status(400).json({ message: `Coupon code '${cleanCode}' already exists.` });
            }

            const coupon = await Coupon.create({
                code: cleanCode,
                description: description || '',
                discountType: discountType || 'percentage',
                discountAmount: Number(discountAmount),
                maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
                minPurchaseAmount: Number(minPurchaseAmount) || 0,
                startDate: startDate ? new Date(startDate) : new Date(),
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                usageLimit: usageLimit ? Number(usageLimit) : null,
                isActive: isActive !== undefined ? Boolean(isActive) : true,
            });

            return res.status(201).json(coupon);
        } else {
            try {
                const coupon = await fallbackDB.createCoupon({
                    code: cleanCode,
                    description,
                    discountType,
                    discountAmount,
                    maxDiscountAmount,
                    minPurchaseAmount,
                    startDate,
                    expiryDate,
                    usageLimit,
                    isActive,
                });
                return res.status(201).json(coupon);
            } catch (err) {
                return res.status(400).json({ message: err.message });
            }
        }
    } catch (error) {
        console.error('Create coupon error:', error);
        res.status(500).json({ message: error.message || 'Server error creating coupon.' });
    }
});

// @desc    Update an existing coupon (Admin)
// @route   PUT /api/coupons/:id
// @access  Private/Admin
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            code,
            description,
            discountType,
            discountAmount,
            maxDiscountAmount,
            minPurchaseAmount,
            startDate,
            expiryDate,
            usageLimit,
            isActive,
        } = req.body;

        if (code && !code.trim()) {
            return res.status(400).json({ message: 'Coupon code cannot be empty.' });
        }

        if (discountType === 'percentage' && discountAmount !== undefined && (Number(discountAmount) <= 0 || Number(discountAmount) > 100)) {
            return res.status(400).json({ message: 'Percentage discount must be between 1% and 100%.' });
        }

        if (expiryDate !== undefined && expiryDate !== null && expiryDate !== '') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const exp = new Date(expiryDate);
            if (isNaN(exp.getTime())) {
                return res.status(400).json({ message: 'Invalid expiration date format.' });
            }
            if (exp < todayStart) {
                return res.status(400).json({ message: 'Expiration date must be today or a future date.' });
            }
            if (startDate && new Date(startDate) > exp) {
                return res.status(400).json({ message: 'Expiration date cannot be earlier than the campaign start date.' });
            }
        }

        if (isDBOnline()) {
            const coupon = await Coupon.findById(req.params.id);
            if (!coupon) {
                return res.status(404).json({ message: 'Coupon not found.' });
            }

            if (code) {
                const cleanCode = code.trim().toUpperCase();
                if (cleanCode !== coupon.code) {
                    const existing = await Coupon.findOne({ code: cleanCode });
                    if (existing) {
                        return res.status(400).json({ message: `Coupon code '${cleanCode}' already exists.` });
                    }
                    coupon.code = cleanCode;
                }
            }

            if (description !== undefined) coupon.description = description;
            if (discountType !== undefined) coupon.discountType = discountType;
            if (discountAmount !== undefined) coupon.discountAmount = Number(discountAmount);
            if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount ? Number(maxDiscountAmount) : null;
            if (minPurchaseAmount !== undefined) coupon.minPurchaseAmount = Number(minPurchaseAmount);
            if (startDate !== undefined) coupon.startDate = startDate ? new Date(startDate) : new Date();
            if (expiryDate !== undefined) coupon.expiryDate = expiryDate ? new Date(expiryDate) : null;
            if (usageLimit !== undefined) coupon.usageLimit = usageLimit ? Number(usageLimit) : null;
            if (isActive !== undefined) coupon.isActive = Boolean(isActive);

            await coupon.save();
            return res.json(coupon);
        } else {
            try {
                const updated = await fallbackDB.updateCoupon(req.params.id, req.body);
                if (!updated) return res.status(404).json({ message: 'Coupon not found.' });
                return res.json(updated);
            } catch (err) {
                return res.status(400).json({ message: err.message });
            }
        }
    } catch (error) {
        console.error('Update coupon error:', error);
        res.status(500).json({ message: 'Server error updating coupon.' });
    }
});

// @desc    Toggle coupon active status (Admin)
// @route   PATCH /api/coupons/:id/toggle
// @access  Private/Admin
router.patch('/:id/toggle', verifyToken, isAdmin, async (req, res) => {
    try {
        if (isDBOnline()) {
            const coupon = await Coupon.findById(req.params.id);
            if (!coupon) {
                return res.status(404).json({ message: 'Coupon not found.' });
            }
            coupon.isActive = !coupon.isActive;
            await coupon.save();
            return res.json(coupon);
        } else {
            const existing = await fallbackDB.getCouponById(req.params.id);
            if (!existing) {
                return res.status(404).json({ message: 'Coupon not found.' });
            }
            const updated = await fallbackDB.updateCoupon(req.params.id, { isActive: !existing.isActive });
            return res.json(updated);
        }
    } catch (error) {
        console.error('Toggle coupon error:', error);
        res.status(500).json({ message: 'Server error toggling coupon.' });
    }
});

// @desc    Delete coupon (Admin)
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        if (isDBOnline()) {
            const coupon = await Coupon.findByIdAndDelete(req.params.id);
            if (!coupon) {
                return res.status(404).json({ message: 'Coupon not found.' });
            }
            return res.json({ message: 'Coupon deleted successfully.' });
        } else {
            const deleted = await fallbackDB.deleteCoupon(req.params.id);
            if (!deleted) {
                return res.status(404).json({ message: 'Coupon not found.' });
            }
            return res.json({ message: 'Coupon deleted successfully.' });
        }
    } catch (error) {
        console.error('Delete coupon error:', error);
        res.status(500).json({ message: 'Server error deleting coupon.' });
    }
});

export default router;
