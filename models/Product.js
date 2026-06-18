import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
    id: { type: String, required: true },
    url: { type: String, required: true },
    alt: { type: String, default: '' },
    position: { type: Number, default: 1 },
});

const variantSchema = new mongoose.Schema({
    id: { type: String, required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    sku: { type: String, default: '' },
    price: { type: Number, required: true },
    inStock: { type: Boolean, default: true },
    inventory: { type: Number, default: 0 },
});

const productSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        description: {
            type: String,
            trim: true,
        },
        price: {
            type: Number,
            required: [true, 'Product price is required'],
            min: 0,
        },
        compareAtPrice: {
            type: Number,
            default: null,
        },
        currency: {
            type: String,
            default: 'INR',
        },
        gender: {
            type: String,
            enum: ['men', 'women', 'unisex', 'kids'],
            default: 'unisex',
        },
        images: [imageSchema],
        variants: [variantSchema],
        category: {
            type: String,
            required: [true, 'Product category is required'],
            trim: true,
        },
        subcategory: {
            type: String,
            trim: true,
        },
        tags: [String],
        badges: [String],
        inStock: {
            type: Boolean,
            default: true,
        },
        inventory: {
            type: Number,
            default: 0,
        },
        material: {
            type: String,
        },
        careInstructions: {
            type: String,
        },
        sizeGuide: {
            type: String,
            default: 'standard',
        },
    },
    {
        timestamps: true,
    }
);

const Product = mongoose.model('Product', productSchema);
export default Product;
