const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Generate request number
const generateRequestNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `WM-${dateStr}-${random}`;
};

// POST /api/requests - Create new pickup request
router.post('/', authenticateToken, async (req, res) => {
    const {
        waste_type_id,
        waste_description,
        quantity_kg,
        pickup_address,
        preferred_date,
        preferred_time_slot,
        priority,
        notes
    } = req.body;

    if (!pickup_address || !preferred_date) {
        return res.status(400).json({ success: false, message: 'Pickup address and preferred date are required' });
    }

    const requestNumber = generateRequestNumber();

    try {
        const [result] = await pool.execute(
            `INSERT INTO pickup_requests 
            (request_number, user_id, waste_type_id, waste_description, quantity_kg, pickup_address, preferred_date, preferred_time_slot, priority, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [requestNumber, req.user.id, waste_type_id || null, waste_description || null,
             quantity_kg || null, pickup_address, preferred_date, preferred_time_slot || 'morning',
             priority || 'normal', notes || null]
        );

        // Create notification
        await pool.execute(
            'INSERT INTO notifications (user_id, title, message, type, related_request_id) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, 'Pickup Request Submitted ✅',
             `Your request #${requestNumber} has been submitted successfully. We will confirm shortly.`,
             'success', result.insertId]
        );

        // Log status change
        await pool.execute(
            'INSERT INTO status_history (request_id, new_status, changed_by, notes) VALUES (?, ?, ?, ?)',
            [result.insertId, 'pending', req.user.id, 'Request created by user']
        );

        res.status(201).json({
            success: true,
            message: 'Pickup request created successfully',
            requestNumber,
            requestId: result.insertId
        });
    } catch (error) {
        console.error('Create request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/requests - Get all requests for current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [requests] = await pool.execute(
            `SELECT pr.*, wt.name as waste_type_name, wt.category as waste_category, wt.icon as waste_icon,
             u.name as user_name, u.phone as user_phone,
             v.vehicle_number, d.name as driver_name
             FROM pickup_requests pr
             LEFT JOIN waste_types wt ON pr.waste_type_id = wt.id
             LEFT JOIN users u ON pr.user_id = u.id
             LEFT JOIN vehicles v ON pr.assigned_vehicle_id = v.id
             LEFT JOIN users d ON pr.assigned_driver_id = d.id
             WHERE pr.user_id = ?
             ORDER BY pr.created_at DESC`,
            [req.user.id]
        );

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Get requests error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/requests/:id - Get specific request
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        // Admin can view any request; users only their own
        const isAdmin = req.user.role === 'admin';
        const sql = isAdmin
            ? `SELECT pr.*, wt.name as waste_type_name, wt.category as waste_category, wt.icon as waste_icon, wt.color as waste_color,
               u.name as user_name, u.phone as user_phone, u.email as user_email,
               v.vehicle_number, d.name as driver_name, d.phone as driver_phone
               FROM pickup_requests pr
               LEFT JOIN waste_types wt ON pr.waste_type_id = wt.id
               LEFT JOIN users u ON pr.user_id = u.id
               LEFT JOIN vehicles v ON pr.assigned_vehicle_id = v.id
               LEFT JOIN users d ON pr.assigned_driver_id = d.id
               WHERE pr.id = ?`
            : `SELECT pr.*, wt.name as waste_type_name, wt.category as waste_category, wt.icon as waste_icon, wt.color as waste_color,
               u.name as user_name, u.phone as user_phone, u.email as user_email,
               v.vehicle_number, d.name as driver_name, d.phone as driver_phone
               FROM pickup_requests pr
               LEFT JOIN waste_types wt ON pr.waste_type_id = wt.id
               LEFT JOIN users u ON pr.user_id = u.id
               LEFT JOIN vehicles v ON pr.assigned_vehicle_id = v.id
               LEFT JOIN users d ON pr.assigned_driver_id = d.id
               WHERE pr.id = ? AND pr.user_id = ?`;
        const params = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
        const [requests] = await pool.execute(sql, params);

        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        // Get status history
        const [history] = await pool.execute(
            `SELECT sh.*, u.name as changed_by_name
             FROM status_history sh
             LEFT JOIN users u ON sh.changed_by = u.id
             WHERE sh.request_id = ? ORDER BY sh.created_at ASC`,
            [req.params.id]
        );

        res.json({ success: true, request: requests[0], history });
    } catch (error) {
        console.error('Get request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/requests/:id/cancel - Cancel a request
router.put('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const [requests] = await pool.execute(
            'SELECT * FROM pickup_requests WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );

        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const request = requests[0];
        if (['completed', 'cancelled', 'in_progress'].includes(request.status)) {
            return res.status(400).json({ success: false, message: `Cannot cancel a ${request.status} request` });
        }

        await pool.execute(
            'UPDATE pickup_requests SET status = ? WHERE id = ?',
            ['cancelled', req.params.id]
        );

        await pool.execute(
            'INSERT INTO status_history (request_id, old_status, new_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, request.status, 'cancelled', req.user.id, 'Cancelled by user']
        );

        await pool.execute(
            'INSERT INTO notifications (user_id, title, message, type, related_request_id) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, 'Request Cancelled', `Your request #${request.request_number} has been cancelled.`, 'warning', req.params.id]
        );

        res.json({ success: true, message: 'Request cancelled successfully' });
    } catch (error) {
        console.error('Cancel request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/requests/:id/rate - Rate completed request
router.post('/:id/rate', authenticateToken, async (req, res) => {
    const { rating, feedback } = req.body;
    try {
        await pool.execute(
            "UPDATE pickup_requests SET rating = ?, feedback = ? WHERE id = ? AND user_id = ? AND status = 'completed'",
            [rating, feedback, req.params.id, req.user.id]
        );
        res.json({ success: true, message: 'Thank you for your feedback!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
