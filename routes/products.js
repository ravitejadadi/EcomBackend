import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import Product from '../models/Product.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { fallbackDB } from '../utils/dbFallback.js';

const router = express.Router();

// Ensure uploads folder exists locally
const UPLOADS_DIR = './uploads';
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Disk Storage for local fallback / Cloudinary temp file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only JPEG, JPG, PNG, and WebP images are allowed!'));
    },
});

// Configure Cloudinary helper
const isCloudinaryConfigured = () => {
    return (
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
};

if (isCloudinaryConfigured()) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

// Handle Image Upload & returns URL
const uploadToCloudinaryOrLocal = async (file, host) => {
    if (isCloudinaryConfigured()) {
        try {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: 'luxe_ecom',
            });
            // Remove temp file
            fs.unlinkSync(file.path);
            return result.secure_url;
        } catch (error) {
            console.error('Cloudinary upload failed, falling back to local storage:', error);
        }
    }
    // Local fallback path
    const relativePath = file.path.replace(/\\/g, '/');
    return `http://${host}/${relativePath}`;
};

// @desc    Get all products
// @route   GET /api/products
// @access  Public
router.get('/', async (req, res) => {
    try {
        const category = req.query.category;
        const gender = req.query.gender;
        const search = req.query.search;

        const isOnline = mongoose.connection.readyState === 1;
        let productsList;

        if (isOnline) {
            let query = {};
            if (category && category !== 'all' && category !== 'new-arrivals' && category !== 'bestsellers' && category !== 'sale' && category !== 'trending') {
                query.category = new RegExp(`^${category}$`, 'i');
            }
            if (gender && gender !== 'all') {
                query.gender = gender;
            }
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { category: { $regex: search, $options: 'i' } },
                ];
            }
            productsList = await Product.find(query);
        } else {
            productsList = await fallbackDB.getProducts({ category, gender, search });
        }

        // Client collection page filters can also filter special categories
        if (category === 'new-arrivals') {
            productsList = productsList.filter(p => p.badges && p.badges.includes('NEW'));
        } else if (category === 'bestsellers') {
            productsList = productsList.filter(p => p.badges && p.badges.includes('BESTSELLER'));
        } else if (category === 'sale') {
            productsList = productsList.filter(p => p.badges && p.badges.includes('SALE'));
        } else if (category === 'trending') {
            productsList = productsList.filter(p => p.badges && p.badges.includes('TRENDING'));
        }

        res.json(productsList);
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Get product by slug
// @route   GET /api/products/:slug
// @access  Public
router.get('/:slug', async (req, res) => {
    try {
        const isOnline = mongoose.connection.readyState === 1;
        let product;

        if (isOnline) {
            product = await Product.findOne({ slug: req.params.slug });
        } else {
            product = await fallbackDB.getProductBySlug(req.params.slug);
        }

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Get product details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Upload product image
// @route   POST /api/products/upload-image
// @access  Private/Admin
router.post('/upload-image', verifyToken, isAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const host = req.get('host');
        const url = await uploadToCloudinaryOrLocal(req.file, host);
        res.json({ url });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            compareAtPrice,
            gender,
            category,
            subcategory,
            material,
            careInstructions,
            sizeGuide,
            images,
            variants,
            badges,
            tags,
        } = req.body;

        if (!name || !price || !category) {
            return res.status(400).json({ message: 'Name, price, and category are required' });
        }

        const isOnline = mongoose.connection.readyState === 1;

        // Generate dynamic custom ID if not supplied
        const randomId = Math.random().toString(36).substring(2, 7);
        const id = req.body.id || `${category.substring(0, 3).toLowerCase()}-${randomId}`;

        // Generate unique slug
        let baseSlug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').trim();
        let slug = baseSlug;
        let slugExists;
        
        if (isOnline) {
            slugExists = await Product.findOne({ slug });
        } else {
            slugExists = await fallbackDB.getProductBySlug(slug);
        }

        let counter = 1;
        while (slugExists) {
            slug = `${baseSlug}-${counter}`;
            if (isOnline) {
                slugExists = await Product.findOne({ slug });
            } else {
                slugExists = await fallbackDB.getProductBySlug(slug);
            }
            counter++;
        }

        const productData = {
            id,
            name,
            slug,
            description,
            price: Number(price),
            compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
            gender: gender || 'unisex',
            category,
            subcategory,
            material,
            careInstructions,
            sizeGuide: sizeGuide || 'standard',
            images: images || [],
            variants: variants || [],
            badges: badges || [],
            tags: tags || [],
        };

        let product;
        if (isOnline) {
            const totalInventory = variants ? variants.reduce((sum, v) => sum + (Number(v.inventory) || 0), 0) : 0;
            product = await Product.create({
                ...productData,
                inventory: totalInventory,
                inStock: totalInventory > 0,
            });
        } else {
            product = await fallbackDB.createProduct(productData);
        }

        res.status(201).json(product);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            compareAtPrice,
            gender,
            category,
            subcategory,
            material,
            careInstructions,
            sizeGuide,
            images,
            variants,
            badges,
            tags,
        } = req.body;

        const isOnline = mongoose.connection.readyState === 1;
        let product;

        if (isOnline) {
            product = await Product.findOne({ id: req.params.id });
        } else {
            product = await fallbackDB.getProductById(req.params.id);
        }

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        let newSlug = product.slug;
        // Generate baseSlug if name changes
        if (name && name !== product.name) {
            let baseSlug = name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').trim();
            let slug = baseSlug;
            let slugExists;
            if (isOnline) {
                slugExists = await Product.findOne({ slug, id: { $ne: product.id } });
            } else {
                slugExists = (await fallbackDB.getProductBySlug(slug))?.id !== product.id;
            }
            let counter = 1;
            while (slugExists) {
                slug = `${baseSlug}-${counter}`;
                if (isOnline) {
                    slugExists = await Product.findOne({ slug, id: { $ne: product.id } });
                } else {
                    slugExists = (await fallbackDB.getProductBySlug(slug))?.id !== product.id;
                }
                counter++;
            }
            newSlug = slug;
        }

        const updates = {};
        if (name !== undefined) updates.name = name;
        updates.slug = newSlug;
        if (description !== undefined) updates.description = description;
        if (price !== undefined) updates.price = Number(price);
        if (compareAtPrice !== undefined) updates.compareAtPrice = compareAtPrice ? Number(compareAtPrice) : null;
        if (gender !== undefined) updates.gender = gender;
        if (category !== undefined) updates.category = category;
        if (subcategory !== undefined) updates.subcategory = subcategory;
        if (material !== undefined) updates.material = material;
        if (careInstructions !== undefined) updates.careInstructions = careInstructions;
        if (sizeGuide !== undefined) updates.sizeGuide = sizeGuide;
        if (images !== undefined) updates.images = images;
        if (variants !== undefined) updates.variants = variants;
        if (badges !== undefined) updates.badges = badges;
        if (tags !== undefined) updates.tags = tags;

        let updatedProduct;
        if (isOnline) {
            Object.assign(product, updates);
            if (variants !== undefined) {
                product.inventory = variants.reduce((sum, v) => sum + (Number(v.inventory) || 0), 0);
                product.inStock = product.inventory > 0;
            }
            await product.save();
            updatedProduct = product;
        } else {
            updatedProduct = await fallbackDB.updateProduct(req.params.id, updates);
        }

        res.json(updatedProduct);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ message: error.message || 'Server error' });
    }
});

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const isOnline = mongoose.connection.readyState === 1;
        let success = false;

        if (isOnline) {
            const product = await Product.findOneAndDelete({ id: req.params.id });
            success = !!product;
        } else {
            success = await fallbackDB.deleteProduct(req.params.id);
        }

        if (!success) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json({ message: 'Product removed' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
