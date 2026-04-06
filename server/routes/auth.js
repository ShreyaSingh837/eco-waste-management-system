const express = require('express');
const bcrypt = require('bcryptjs');

const { pool } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const normalizedName = normalizeText(req.body.name);
    const normalizedEmail = normalizeEmail(req.body.email);
    const password = req.body.password;
    const normalizedPhone = normalizeText(req.body.phone) || null;
    const normalizedAddress = normalizeText(req.body.address) || null;

    if (!normalizedName || !normalizedEmail || !password) {
        return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    try {
        const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)',
            [normalizedName, normalizedEmail, hashedPassword, normalizedPhone, normalizedAddress, 'user']
        );

        const token = generateToken({
            id: result.insertId,
            email: normalizedEmail,
            role: 'user',
            name: normalizedName
        });

        await pool.execute(
            'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [
                result.insertId,
                'Welcome to EcoWaste!',
                `Hello ${normalizedName}! Your account has been created successfully. Start requesting waste pickups to keep our city clean!`,
                'success'
            ]
        );

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: {
                id: result.insertId,
                name: normalizedName,
                email: normalizedEmail,
                role: 'user'
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const normalizedEmail = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!normalizedEmail || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    try {
        const [users] = await pool.execute(
            'SELECT id, name, email, password, role, phone, address, avatar, is_active FROM users WHERE email = ?',
            [normalizedEmail]
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
        const { password: _password, ...userWithoutPassword } = user;

        return res.json({
            success: true,
            message: 'Login successful',
            token,
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, message: 'Server error during login' });
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

        return res.json({ success: true, user: users[0] });
    } catch (error) {
        console.error('Profile error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/auth/profile - Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    const name = normalizeText(req.body.name);
    const phone = normalizeText(req.body.phone) || null;
    const address = normalizeText(req.body.address) || null;

    try {
        await pool.execute(
            'UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?',
            [name, phone, address, req.user.id]
        );

        return res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
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

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);

        return res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
