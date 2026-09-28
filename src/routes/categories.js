const express = require('express');
const { allAsync, runAsync } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories
router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await allAsync(
      `SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY id ASC`,
      [req.user.id]
    );
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, type, icon, color, is_needs } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const result = await runAsync(
      `INSERT INTO categories (user_id, name, type, icon, color, is_needs) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, type, icon || 'category', color || '#6200EE', is_needs ? 1 : 0]
    );

    res.status(201).json({
      category: {
        id: result.lastID,
        user_id: req.user.id,
        name,
        type,
        icon: icon || 'category',
        color: color || '#6200EE',
        is_needs: is_needs ? 1 : 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

module.exports = router;
