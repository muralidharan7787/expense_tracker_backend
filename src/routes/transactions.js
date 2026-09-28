const express = require('express');
const { allAsync, getAsync, runAsync } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/transactions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { search, category_id, payment_method, type, start_date, end_date } = req.query;

    let query = `
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.is_needs
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ?
    `;
    const params = [userId];

    if (search) {
      query += ` AND (t.title LIKE ? OR t.note LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category_id) {
      query += ` AND t.category_id = ?`;
      params.push(category_id);
    }

    if (payment_method) {
      query += ` AND t.payment_method = ?`;
      params.push(payment_method);
    }

    if (type) {
      query += ` AND t.type = ?`;
      params.push(type);
    }

    if (start_date) {
      query += ` AND t.date >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND t.date <= ?`;
      params.push(end_date);
    }

    query += ` ORDER BY t.date DESC, t.id DESC`;

    const transactions = await allAsync(query, params);
    res.json({ transactions });
  } catch (err) {
    console.error('Fetch transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/transactions
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, title, amount, category_id, payment_method, date, note, receipt_path, is_recurring } = req.body;

    if (!type || !title || !amount || !date) {
      return res.status(400).json({ error: 'Type, title, amount, and date are required' });
    }

    const result = await runAsync(
      `INSERT INTO transactions (user_id, type, title, amount, category_id, payment_method, date, note, receipt_path, is_recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        type,
        title,
        amount,
        category_id || null,
        payment_method || 'UPI',
        date,
        note || '',
        receipt_path || '',
        is_recurring ? 1 : 0
      ]
    );

    const transaction = await getAsync(
      `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.is_needs
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`,
      [result.lastID]
    );

    res.status(201).json({ transaction });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { type, title, amount, category_id, payment_method, date, note, receipt_path, is_recurring } = req.body;

    const existing = await getAsync('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await runAsync(
      `UPDATE transactions SET
        type = COALESCE(?, type),
        title = COALESCE(?, title),
        amount = COALESCE(?, amount),
        category_id = COALESCE(?, category_id),
        payment_method = COALESCE(?, payment_method),
        date = COALESCE(?, date),
        note = COALESCE(?, note),
        receipt_path = COALESCE(?, receipt_path),
        is_recurring = COALESCE(?, is_recurring)
       WHERE id = ? AND user_id = ?`,
      [type, title, amount, category_id, payment_method, date, note, receipt_path, is_recurring, id, userId]
    );

    const transaction = await getAsync(
      `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.is_needs
       FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`,
      [id]
    );

    res.json({ transaction });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await runAsync('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully', id: Number(id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

module.exports = router;
