const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin);

// GET /api/admin/dashboard - Dashboard statistics
router.get('/dashboard', async (req, res) => {
    try {
        const [totalRequests] = await pool.execute("SELECT COUNT(*) as count FROM pickup_requests");
        const [pendingRequests] = await pool.execute("SELECT COUNT(*) as count FROM pickup_requests WHERE status = 'pending'");
        const [completedRequests] = await pool.execute("SELECT COUNT(*) as count FROM pickup_requests WHERE status = 'completed'");
        const [totalUsers] = await pool.execute("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const [totalVehicles] = await pool.execute("SELECT COUNT(*) as count FROM vehicles");
        const [availableVehicles] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'available'");
        const [totalWaste] = await pool.execute("SELECT SUM(quantity_kg) as total FROM pickup_requests WHERE status = 'completed'");

        // Recent requests
        const [recentRequests] = await pool.execute(
            `SELECT pr.*, u.name as user_name, wt.name as waste_type_name, wt.icon as waste_icon
             FROM pickup_requests pr
             LEFT JOIN users u ON pr.user_id = u.id
             LEFT JOIN waste_types wt ON pr.waste_type_id = wt.id
             ORDER BY pr.created_at DESC LIMIT 10`
        );

        // Waste by category
        const [wasteByCategory] = await pool.execute(
            `SELECT wt.category, COUNT(*) as count, SUM(pr.quantity_kg) as total_kg
             FROM pickup_requests pr
             JOIN waste_types wt ON pr.waste_type_id = wt.id
             WHERE pr.status = 'completed'
             GROUP BY wt.category`
        );

        // Monthly data for chart (last 6 months) - SQLite compatible
        const [monthlyData] = await pool.execute(
            `SELECT strftime('%Y-%m', created_at) as month,
             COUNT(*) as total_requests,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
             FROM pickup_requests
             WHERE created_at >= date('now','-6 months')
             GROUP BY month ORDER BY month`
        );

        res.json({
            success: true,
            stats: {
                totalRequests: totalRequests[0].count,
                pendingRequests: pendingRequests[0].count,
                completedRequests: completedRequests[0].count,
                totalUsers: totalUsers[0].count,
                totalVehicles: totalVehicles[0].count,
                availableVehicles: availableVehicles[0].count,
                totalWasteCollected: totalWaste[0].total || 0
            },
            recentRequests,
            wasteByCategory,
            monthlyData
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/requests - Get all pickup requests
router.get('/requests', async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        let whereClause = '';
        let params = [];

        if (status) {
            whereClause = 'WHERE pr.status = ?';
            params.push(status);
        }

        const [requests] = await pool.execute(
            `SELECT pr.*, u.name as user_name, u.phone as user_phone, u.email as user_email,
             wt.name as waste_type_name, wt.category, wt.icon as waste_icon,
             v.vehicle_number, d.name as driver_name
             FROM pickup_requests pr
             LEFT JOIN users u ON pr.user_id = u.id
             LEFT JOIN waste_types wt ON pr.waste_type_id = wt.id
             LEFT JOIN vehicles v ON pr.assigned_vehicle_id = v.id
             LEFT JOIN users d ON pr.assigned_driver_id = d.id
             ${whereClause}
             ORDER BY pr.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
            params
        );

        const [countResult] = await pool.execute(
            `SELECT COUNT(*) as total FROM pickup_requests pr ${whereClause}`, params
        );

        res.json({
            success: true,
            requests,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Admin requests error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/requests/:id/status - Update request status
router.put('/requests/:id/status', async (req, res) => {
    const { status, admin_notes, assigned_vehicle_id, assigned_driver_id, estimated_pickup_time } = req.body;

    try {
        const [requests] = await pool.execute('SELECT * FROM pickup_requests WHERE id = ?', [req.params.id]);
        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const oldStatus = requests[0].status;

        const actualPickup = status === 'completed' ? new Date().toISOString() : requests[0].actual_pickup_time;
        await pool.execute(
            `UPDATE pickup_requests SET 
             status = ?, admin_notes = ?, assigned_vehicle_id = ?, assigned_driver_id = ?,
             estimated_pickup_time = ?, actual_pickup_time = ?
             WHERE id = ?`,
            [status, admin_notes || null, assigned_vehicle_id || null, assigned_driver_id || null,
             estimated_pickup_time || null, actualPickup, req.params.id]
        );

        await pool.execute(
            'INSERT INTO status_history (request_id, old_status, new_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, oldStatus, status, req.user.id, admin_notes || `Status updated to ${status}`]
        );

        // Notify user
        const statusMessages = {
            confirmed: 'Your pickup request has been confirmed! ✅',
            assigned: 'A vehicle and driver have been assigned to your pickup. 🚛',
            in_progress: 'Your waste is being collected right now! 🚛',
            completed: 'Your waste has been successfully collected! 🎉 Thank you for keeping our city green.',
            cancelled: 'Unfortunately, your pickup request has been cancelled.'
        };

        if (statusMessages[status]) {
            const notifUser = requests[0].user_id;
            await pool.execute(
                'INSERT INTO notifications (user_id, title, message, type, related_request_id) VALUES (?, ?, ?, ?, ?)',
                [notifUser, `Request #${requests[0].request_number} Update`,
                 statusMessages[status],
                 status === 'cancelled' ? 'error' : status === 'completed' ? 'success' : 'info',
                 req.params.id]
            );
        }

        res.json({ success: true, message: 'Request status updated successfully' });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/users - Get all users
router.get('/users', async (req, res) => {
    try {
        const [users] = await pool.execute(
            `SELECT u.id, u.name, u.email, u.role, u.phone, u.is_active, u.created_at,
             COUNT(pr.id) as total_requests
             FROM users u
             LEFT JOIN pickup_requests pr ON u.id = pr.user_id
             GROUP BY u.id ORDER BY u.created_at DESC`
        );
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/users/:id/toggle - Toggle user active status
router.put('/users/:id/toggle', async (req, res) => {
    try {
        const [current] = await pool.execute('SELECT is_active FROM users WHERE id = ?', [req.params.id]);
        const newStatus = current[0].is_active ? 0 : 1;
        await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
        res.json({ success: true, message: 'User status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/vehicles - Get all vehicles
router.get('/vehicles', async (req, res) => {
    try {
        const [vehicles] = await pool.execute(
            `SELECT v.*, u.name as driver_name, u.phone as driver_phone
             FROM vehicles v
             LEFT JOIN users u ON v.driver_id = u.id
             ORDER BY v.created_at DESC`
        );
        res.json({ success: true, vehicles });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/vehicles/:id/status - Update vehicle status
router.put('/vehicles/:id/status', async (req, res) => {
    const { status, current_location } = req.body;
    try {
        await pool.execute(
            'UPDATE vehicles SET status = ?, current_location = ? WHERE id = ?',
            [status, current_location || null, req.params.id]
        );
        res.json({ success: true, message: 'Vehicle status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/users - Create new user (admin/driver)
router.post('/users', async (req, res) => {
    const { name, email, password, role, phone, address } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, role, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, role || 'user', phone || null, address || null]
        );
        res.status(201).json({ success: true, message: 'User created', userId: result.insertId });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || (error.message && error.message.includes('UNIQUE'))) {
            return res.status(409).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
