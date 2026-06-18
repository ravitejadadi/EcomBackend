import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { fallbackDB } from '../utils/dbFallback.js';

export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production');

        let user;
        if (mongoose.connection.readyState === 1) {
            user = await User.findById(decoded.id).select('-password');
        } else {
            user = await fallbackDB.findUserById(decoded.id);
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth verification error:', error);
        return res.status(401).json({ message: 'Token is not valid' });
    }
};

export const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Access denied: Admin role required' });
    }
};

export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production');
            let user;
            if (mongoose.connection.readyState === 1) {
                user = await User.findById(decoded.id);
            } else {
                user = await fallbackDB.findUserById(decoded.id);
            }
            if (user) req.user = user;
        }
        next();
    } catch {
        next(); // continue as guest if token is missing or expired
    }
};
