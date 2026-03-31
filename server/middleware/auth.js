const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'waste_management_secret';

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access token required' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }
        req.user = user;
        next();
    });
};

// Middleware to require admin role
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ 
            success: false, 
            message: 'Admin access required' 
        });
    }
};

// Middleware to require driver or admin role
const requireDriver = (req, res, next) => {
    if (req.user && (req.user.role === 'driver' || req.user.role === 'admin')) {
        next();
    } else {
        return res.status(403).json({ 
            success: false, 
            message: 'Driver or Admin access required' 
        });
    }
};

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role,
            name: user.name 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

module.exports = { authenticateToken, requireAdmin, requireDriver, generateToken };
