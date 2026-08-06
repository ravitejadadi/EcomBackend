import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        description: {
            type: String,
            default: '',
        },
        discountType: {
            type: String,
            required: true,
            enum: ['percentage', 'flat'],
            default: 'percentage',
        },
        discountAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        maxDiscountAmount: {
            type: Number,
            default: null, // Optional cap for percentage discounts
        },
        minPurchaseAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        expiryDate: {
            type: Date,
            default: null, // Null means no expiry
        },
        usageLimit: {
            type: Number,
            default: null, // Null means unlimited
        },
        usedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Method to check if coupon is valid for a given subtotal
couponSchema.methods.isValidForSubtotal = function (subtotal) {
    const now = new Date();

    if (!this.isActive) {
        return { valid: false, message: 'This coupon code is inactive.' };
    }

    if (this.startDate && new Date(this.startDate) > now) {
        return { valid: false, message: 'This coupon promotion has not started yet.' };
    }

    if (this.expiryDate && new Date(this.expiryDate) < now) {
        return { valid: false, message: 'This coupon code has expired.' };
    }

    if (this.usageLimit !== null && this.usageLimit !== undefined && this.usedCount >= this.usageLimit) {
        return { valid: false, message: 'This coupon code usage limit has been reached.' };
    }

    if (subtotal < this.minPurchaseAmount) {
        return {
            valid: false,
            message: `Minimum order amount of ₹${this.minPurchaseAmount} required to apply coupon '${this.code}'.`,
        };
    }

    return { valid: true };
};

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function (subtotal) {
    if (subtotal <= 0) return 0;

    let discount = 0;
    if (this.discountType === 'percentage') {
        discount = (subtotal * this.discountAmount) / 100;
        if (this.maxDiscountAmount && this.maxDiscountAmount > 0) {
            discount = Math.min(discount, this.maxDiscountAmount);
        }
    } else {
        discount = this.discountAmount;
    }

    return Math.min(Math.round(discount), subtotal);
};

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
