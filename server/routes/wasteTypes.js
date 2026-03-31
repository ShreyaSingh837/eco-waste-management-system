const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/waste-types - Get all waste types
router.get('/', async (req, res) => {
    try {
        const [wasteTypes] = await pool.execute(
            'SELECT * FROM waste_types ORDER BY category, name'
        );
        res.json({ success: true, wasteTypes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/waste-types/:category - Get waste types by category
router.get('/category/:category', async (req, res) => {
    try {
        const [wasteTypes] = await pool.execute(
            'SELECT * FROM waste_types WHERE category = ? ORDER BY name',
            [req.params.category]
        );
        res.json({ success: true, wasteTypes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
