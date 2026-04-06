const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const { testConnection } = require('./config/database');
const authRoutes = require('./routes/auth');
const requestRoutes = require('./routes/requests');
const adminRoutes = require('./routes/admin');
const wasteTypeRoutes = require('./routes/wasteTypes');
const notificationRoutes = require('./routes/notifications');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://*.vercel.app'
];

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

function isOriginAllowed(origin) {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = origin.replace(/\/+$/, '');

    return allowedOrigins.some(pattern => {
        if (pattern === normalizedOrigin) {
            return true;
        }

        if (!pattern.includes('*')) {
            return false;
        }

        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');

        return new RegExp(`^${regexPattern}$`).test(normalizedOrigin);
    });
}

app.use(cors({
    origin(origin, callback) {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/waste-types', wasteTypeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'EcoWaste Management API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        databasePath: process.env.DATABASE_PATH || './database/ecowaste.db'
    });
});

app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, '../public', 'index.html'));
    }

    return res.status(404).json({ success: false, message: 'API endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    if (err.message && err.message.includes('not allowed by CORS')) {
        return res.status(403).json({
            success: false,
            message: 'Request blocked by CORS policy'
        });
    }

    return res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
});

async function startServer() {
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.error('Database connection failed. Authentication will not work until SQLite initializes correctly.');
    }

    app.listen(PORT, () => {
        console.log('\n====================================');
        console.log(' EcoWaste Management System');
        console.log('====================================');
        console.log(`Server running at: http://localhost:${PORT}`);
        console.log(`API Health:        http://localhost:${PORT}/api/health`);
        console.log('Admin Login:       admin@wastems.com / Admin@123');
        console.log('Demo User:         user@wastems.com / User@123');
        console.log(`Allowed Origins:   ${allowedOrigins.join(', ')}`);
        console.log('====================================\n');
    });
}

startServer();

module.exports = app;
