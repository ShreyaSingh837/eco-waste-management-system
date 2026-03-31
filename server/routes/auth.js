const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { name, email, password, phone, address } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    try {
        const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, phone || null, address || null, 'user']
        );

        const token = generateToken({ id: result.insertId, email, role: 'user', name });

        // Create welcome notification
        await pool.execute(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [result.insertId, 'Welcome to EcoWaste! 🌿', `Hello ${name}! Your account has been created successfully. Start requesting waste pickups to keep our city clean!`, 'success']
        );

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: { id: result.insertId, name, email, role: 'user' }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    try {
        const [users] = await pool.execute(
            'SELECT id, name, email, password, role, phone, address, avatar, is_active FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const user = users[0];

        if (!user.is_active) {
            return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const token = generateToken(user);
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, name, email, role, phone, address, avatar, is_active, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user: users[0] });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/auth/profile - Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    const { name, phone, address } = req.body;
    try {
        await pool.execute(
            'UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?',
            [name, phone, address, req.user.id]
        );

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    try {
        const [users] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
        const valid = await bcrypt.compare(currentPassword, users[0].password);

        if (!valid) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
