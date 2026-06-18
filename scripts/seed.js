import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

import { products } from '../data/products.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI ;

const seedDatabase = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('MongoDB Connected.');

        // Clean tables
        console.log('Clearing database collection tables...');
        await Product.deleteMany({});
        await User.deleteMany({});
        await Order.deleteMany({});
        console.log('Database cleared.');

        // Seed Users
        console.log('Seeding default users...');
        const adminUser = await User.create({
            name: 'Luxe Admin',
            email: 'admin@luxe.com',
            password: 'adminpassword', // Will be hashed via pre-save middleware
            role: 'admin',
        });
        console.log(`Admin user seeded: email: ${adminUser.email}, password: adminpassword`);

        const customerUser = await User.create({
            name: 'Luxe Customer',
            email: 'customer@luxe.com',
            password: 'customerpassword', // Will be hashed via pre-save middleware
            role: 'customer',
        });
        console.log(`Customer user seeded: email: ${customerUser.email}, password: customerpassword`);

        // Seed Products
        console.log('Seeding product catalog...');
        // Prepare products by calculating total inventory and ensuring inStock flag is correct
        const formattedProducts = products.map((prod) => {
            const totalInventory = prod.variants ? prod.variants.reduce((sum, v) => sum + (Number(v.inventory) || 0), 0) : 0;
            const inStock = totalInventory > 0;
            return {
                ...prod,
                inventory: totalInventory,
                inStock,
            };
        });

        await Product.insertMany(formattedProducts);
        console.log(`Catalog seeded with ${formattedProducts.length} products successfully!`);

        mongoose.connection.close();
        console.log('Database connection closed.');
        process.exit(0);
    } catch (error) {
        console.error('Seeding database failed:', error);
        process.exit(1);
    }
};

seedDatabase();
