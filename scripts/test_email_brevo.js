import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load backend/.env regardless of current working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { sendOrderConfirmationEmail } from '../utils/emailService.js';

const mockOrder = {
    _id: '66a1b2c3d4e5f67890123456',
    shippingAddress: {
        firstName: 'Test',
        lastName: 'Customer',
        email: process.env.BREVO_FROM_EMAIL || 'theelegant2327@gmail.com',
        phone: '+91 9876543210',
        address: '123 Elegant Way, Penthouse 4B',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
    },
    orderItems: [
        {
            name: 'Emerald Silk Satin Slip Dress',
            price: 2499,
            quantity: 1,
            variant: { size: 'M', color: 'Emerald Green' },
            image: { url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80' },
        },
    ],
    paymentMethod: 'UPI',
    shippingCost: 0,
    gstAmount: 450,
    totalAmount: 2949,
    createdAt: new Date(),
};

console.log('--- STARTING BREVO EMAIL TEST ---');
console.log('Loaded BREVO_API_KEY:', process.env.BREVO_API_KEY ? `${process.env.BREVO_API_KEY.slice(0, 15)}...` : 'MISSING');
console.log('Loaded BREVO_FROM_EMAIL:', process.env.BREVO_FROM_EMAIL);

await sendOrderConfirmationEmail(mockOrder);
console.log('--- TEST COMPLETED ---');
