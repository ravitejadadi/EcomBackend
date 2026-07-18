import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { products as initialProducts } from '../data/products.js';

const activeOtps = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PRODUCTS_FILE = path.join(DATA_DIR, 'fallback_products.json');
const USERS_FILE = path.join(DATA_DIR, 'fallback_users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'fallback_orders.json');

// Helper to read JSON file
const readJSON = (filePath, defaultData = []) => {
    if (!fs.existsSync(filePath)) {
        writeJSON(filePath, defaultData);
        return defaultData;
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
        return defaultData;
    }
};

// Helper to write JSON file
const writeJSON = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`Error writing to ${filePath}:`, err);
    }
};

// Seeding standard accounts on initialization
const seedInitialUsers = () => {
    const users = readJSON(USERS_FILE, []);
    if (users.length === 0) {
        const salt = bcrypt.genSaltSync(10);
        const adminPassword = bcrypt.hashSync('adminpassword', salt);
        const customerPassword = bcrypt.hashSync('customerpassword', salt);

        users.push({
            _id: 'fallback-admin-id',
            name: 'The Elegant Admin',
            email: 'admin@theelegant.com',
            password: adminPassword,
            role: 'admin',
            createdAt: new Date().toISOString(),
        });

        users.push({
            _id: 'fallback-customer-id',
            name: 'The Elegant Customer',
            email: 'customer@theelegant.com',
            password: customerPassword,
            role: 'customer',
            createdAt: new Date().toISOString(),
        });

        writeJSON(USERS_FILE, users);
    }
};

const seedInitialProducts = () => {
    const products = readJSON(PRODUCTS_FILE, []);
    if (products.length === 0) {
        const formatted = initialProducts.map((prod) => {
            const totalInventory = prod.variants ? prod.variants.reduce((sum, v) => sum + (Number(v.inventory) || 0), 0) : 0;
            return {
                ...prod,
                _id: `fb-prod-${prod.id}`,
                inventory: totalInventory,
                inStock: totalInventory > 0,
                createdAt: prod.createdAt || new Date().toISOString(),
            };
        });
        writeJSON(PRODUCTS_FILE, formatted);
    }
};

// Initialize fallbacks
seedInitialUsers();
seedInitialProducts();

export const fallbackDB = {
    // === USERS ===
    async findUserByEmail(email) {
        const users = readJSON(USERS_FILE);
        return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    },

    async findUserByPhone(phone) {
        const users = readJSON(USERS_FILE);
        return users.find((u) => u.phone === phone);
    },

    async findUserById(id) {
        const users = readJSON(USERS_FILE);
        return users.find((u) => u._id === id);
    },

    async createUser(user) {
        const users = readJSON(USERS_FILE);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);

        const newUser = {
            _id: 'fb-user-' + Math.random().toString(36).substring(2, 9),
            name: user.name,
            email: user.email.toLowerCase(),
            phone: user.phone || undefined,
            password: hashedPassword,
            role: user.role || 'customer',
            createdAt: new Date().toISOString(),
        };

        users.push(newUser);
        writeJSON(USERS_FILE, users);
        return newUser;
    },

    async getUsers() {
        const users = readJSON(USERS_FILE);
        // Exclude password
        return users.map(({ password, ...u }) => u);
    },

    // === PRODUCTS ===
    async getProducts(query = {}) {
        const products = readJSON(PRODUCTS_FILE);
        let filtered = [...products];

        if (query.category) {
            filtered = filtered.filter(p => p.category.toLowerCase() === query.category.toLowerCase());
        }
        if (query.gender && query.gender !== 'all') {
            filtered = filtered.filter(p => p.gender === query.gender);
        }
        if (query.search) {
            const s = query.search.toLowerCase();
            filtered = filtered.filter(
                p => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)
            );
        }
        return filtered;
    },

    async getProductBySlug(slug) {
        const products = readJSON(PRODUCTS_FILE);
        return products.find((p) => p.slug === slug);
    },

    async getProductById(id) {
        const products = readJSON(PRODUCTS_FILE);
        return products.find((p) => p.id === id);
    },

    async createProduct(productData) {
        const products = readJSON(PRODUCTS_FILE);
        const totalInventory = productData.variants
            ? productData.variants.reduce((sum, v) => sum + (Number(v.inventory) || 0), 0)
            : 0;

        const newProduct = {
            ...productData,
            _id: 'fb-prod-' + Math.random().toString(36).substring(2, 9),
            inventory: totalInventory,
            inStock: totalInventory > 0,
            createdAt: new Date().toISOString(),
        };

        products.push(newProduct);
        writeJSON(PRODUCTS_FILE, products);
        return newProduct;
    },

    async updateProduct(id, updates) {
        const products = readJSON(PRODUCTS_FILE);
        const idx = products.findIndex((p) => p.id === id);
        if (idx === -1) return null;

        const updated = { ...products[idx], ...updates };

        if (updates.variants !== undefined) {
            updated.inventory = updates.variants.reduce((sum, v) => sum + (Number(v.inventory) || 0), 0);
            updated.inStock = updated.inventory > 0;
        }

        products[idx] = updated;
        writeJSON(PRODUCTS_FILE, products);
        return updated;
    },

    async deleteProduct(id) {
        let products = readJSON(PRODUCTS_FILE);
        const initialLen = products.length;
        products = products.filter((p) => p.id !== id);
        writeJSON(PRODUCTS_FILE, products);
        return products.length < initialLen;
    },

    // === ORDERS ===
    async createOrder(orderData) {
        const orders = readJSON(ORDERS_FILE);
        const products = readJSON(PRODUCTS_FILE);

        // Deduct variant stock
        for (const item of orderData.orderItems) {
            const prodIdx = products.findIndex((p) => p.id === item.id);
            if (prodIdx !== -1) {
                const prod = products[prodIdx];
                const variant = prod.variants.find((v) => v.id === item.variant.id);
                if (variant) {
                    variant.inventory = Math.max(0, variant.inventory - item.quantity);
                    if (variant.inventory <= 0) {
                        variant.inStock = false;
                    }
                }
                prod.inventory = prod.variants.reduce((sum, v) => sum + v.inventory, 0);
                prod.inStock = prod.inventory > 0;
            }
        }
        writeJSON(PRODUCTS_FILE, products);

        const newOrder = {
            ...orderData,
            _id: 'fb-order-' + Math.random().toString(36).substring(2, 9),
            orderStatus: orderData.orderStatus || 'Pending',
            paymentStatus: orderData.paymentStatus || 'Pending',
            createdAt: new Date().toISOString(),
        };

        orders.push(newOrder);
        writeJSON(ORDERS_FILE, orders);
        return newOrder;
    },

    async getOrders(userId = null) {
        const orders = readJSON(ORDERS_FILE);
        if (userId) {
            return orders.filter((o) => o.user === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getOrderById(id) {
        const orders = readJSON(ORDERS_FILE);
        return orders.find((o) => o._id === id);
    },

    async updateOrder(id, updates) {
        const orders = readJSON(ORDERS_FILE);
        const idx = orders.findIndex((o) => o._id === id);
        if (idx === -1) return null;

        orders[idx] = { ...orders[idx], ...updates };
        writeJSON(ORDERS_FILE, orders);
        return orders[idx];
    },

    // === OTP AUTH ===
    async saveOTP(phone, otp) {
        activeOtps[phone] = {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        };
    },

    async verifyOTP(phone, otp) {
        const entry = activeOtps[phone];
        if (!entry) return false;
        if (entry.expiresAt < Date.now()) {
            delete activeOtps[phone];
            return false;
        }
        const isValid = entry.otp === otp;
        if (isValid) {
            delete activeOtps[phone];
        }
        return isValid;
    },

    async findOrCreateUserByPhone(phone) {
        const email = `${phone}@theelegant.com`;
        const users = readJSON(USERS_FILE);
        let user = users.find((u) => u.email === email);
        if (!user) {
            user = {
                _id: 'fb-user-' + Math.random().toString(36).substring(2, 9),
                name: `Customer ${phone.substring(phone.length - 4)}`,
                email: email,
                password: bcrypt.hashSync('dummy_otp_pass_change_me', 10),
                role: 'customer',
                createdAt: new Date().toISOString(),
            };
            users.push(user);
            writeJSON(USERS_FILE, users);
        }
        return user;
    },
};
