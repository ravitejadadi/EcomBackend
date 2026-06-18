import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
    id: { type: String, required: true }, // custom product id (e.g. run-1)
    name: { type: String, required: true },
    slug: { type: String, required: true },
    price: { type: Number, required: true },
    image: {
        url: { type: String, required: true },
        alt: { type: String, default: '' },
    },
    variant: {
        id: { type: String, required: true },
        size: { type: String, required: true },
        color: { type: String, required: true },
    },
    quantity: { type: Number, required: true, min: 1 },
});

const shippingAddressSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
});

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null, // Allow guest checkout
        },
        orderItems: [orderItemSchema],
        shippingAddress: shippingAddressSchema,
        paymentMethod: {
            type: String,
            required: true,
            enum: ['UPI', 'Card', 'COD', 'Net Banking'],
        },
        paymentStatus: {
            type: String,
            required: true,
            enum: ['Pending', 'Paid', 'Failed'],
            default: 'Pending',
        },
        orderStatus: {
            type: String,
            required: true,
            enum: ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
            default: 'Confirmed',
        },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        shippingCost: {
            type: Number,
            default: 0,
        },
        gstAmount: {
            type: Number,
            default: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

const Order = mongoose.model('Order', orderSchema);
export default Order;
