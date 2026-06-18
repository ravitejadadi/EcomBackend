// dotenv must be the first import — ES module imports are hoisted and evaluated
// before any function call in this file, so dotenv.config() would fire too late.
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
// Node.js 17+ changed DNS result ordering; this restores IPv4-first behavior
// so c-ares can successfully perform MongoDB Atlas SRV lookups on Windows
// dns.setDefaultResultOrder('ipv4first');

// Route Imports
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import dashboardRoutes from './routes/dashboard.js';
import userRoutes from './routes/users.js';
import paymentRoutes from './routes/payment.js';

const app = express();

// Set up __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payment', paymentRoutes);

// Root Endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the LUXE E-commerce API' });
});

// Database connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luxe-ecom';

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected — falling back to local data store');
});
mongoose.connection.on('error', (err) => {
    console.error('MongoDB runtime error:', err.message);
});

mongoose
    .connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB Connected successfully');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB Database connection failed:', err.message);
        console.log('Starting local Express server anyway for offline operations...');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT} without MongoDB connection`);
        });
    });
