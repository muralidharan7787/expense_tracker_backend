const express = require('express');
const { allAsync, getAsync, runAsync } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/budgets
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const budgets = await allAsync(
      `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ?`,
      [userId]
    );

    // Calculate actual spending per category for current month
    const spendingRows = await allAsync(
      `SELECT category_id, SUM(amount) as total_spent
       FROM transactions
       WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
       GROUP BY category_id`,
      [userId, currentMonth]
    );

    const spendingMap = {};
    spendingRows.forEach(row => {
      spendingMap[row.category_id] = row.total_spent;
    });

    const enrichedBudgets = budgets.map(b => {
      const spent = spendingMap[b.category_id] || 0;
      const percentage = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
      const isExceeded = spent > b.monthly_limit;
      const isWarning = percentage >= (b.alert_threshold * 100) && !isExceeded;
      const exceededAmount = isExceeded ? spent - b.monthly_limit : 0;

      return {
        ...b,
        current_spent: spent,
        percentage_used: Math.round(percentage),
        is_warning: isWarning,
        is_exceeded: isExceeded,
        exceeded_amount: exceededAmount
      };
    });

    res.json({ budgets: enrichedBudgets });
  } catch (err) {
    console.error('Fetch budgets error:', err);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// POST /api/budgets
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category_id, monthly_limit, alert_threshold } = req.body;

    if (!category_id || !monthly_limit) {
      return res.status(400).json({ error: 'Category ID and monthly limit are required' });
    }

    const threshold = alert_threshold || 0.8;

    await runAsync(
      `INSERT INTO budgets (user_id, category_id, monthly_limit, alert_threshold)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category_id) DO UPDATE SET
       monthly_limit = excluded.monthly_limit,
       alert_threshold = excluded.alert_threshold`,
      [userId, category_id, monthly_limit, threshold]
    );

    const budget = await getAsync(
      `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM budgets b JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ? AND b.category_id = ?`,
      [userId, category_id]
    );

    res.status(201).json({ budget });
  } catch (err) {
    console.error('Save budget error:', err);
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await runAsync('DELETE FROM budgets WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ message: 'Budget removed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

module.exports = router;
