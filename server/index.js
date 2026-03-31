const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const requestRoutes = require('./routes/requests');
const adminRoutes = require('./routes/admin');
const wasteTypeRoutes = require('./routes/wasteTypes');
const notificationRoutes = require('./routes/notifications');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;
const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

// ===================== MIDDLEWARE =====================
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

// ===================== API ROUTES =====================
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/waste-types', wasteTypeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'EcoWaste Management API is running 🌿',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ===================== FRONTEND ROUTING =====================
// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public', 'index.html'));
    } else {
        res.status(404).json({ success: false, message: 'API endpoint not found' });
    }
});

// ===================== ERROR HANDLER =====================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        success: false, 
        message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
    });
});

// ===================== START SERVER =====================
async function startServer() {
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
        console.error('⚠️  Database connection failed. Server starting without DB...');
        console.error('📝  Please set up MySQL and run: database/schema.sql');
    }

    app.listen(PORT, () => {
        console.log('\n🌿 ====================================');
        console.log('   EcoWaste Management System');
        console.log('🌿 ====================================');
        console.log(`🚀 Server running at: http://localhost:${PORT}`);
        console.log(`📊 API Health:        http://localhost:${PORT}/api/health`);
        console.log(`🔐 Admin Login:       admin@wastems.com / Admin@123`);
        console.log('🌿 ====================================\n');
    });
}

startServer();

module.exports = app;
