const express = require('express');
const { allAsync, getAsync, runAsync } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/recurring
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const items = await allAsync(
      `SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM recurring_expenses r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = ?
       ORDER BY r.next_due_date ASC`,
      [userId]
    );

    const subscriptions = items.filter(i => i.is_subscription === 1);
    const recurringBills = items.filter(i => i.is_subscription === 0);

    const monthlySubscriptionTotal = subscriptions.reduce((sum, item) => sum + item.amount, 0);
    const yearlySubscriptionTotal = monthlySubscriptionTotal * 12;

    const monthlyRecurringTotal = items.reduce((sum, item) => sum + item.amount, 0);

    res.json({
      all: items,
      subscriptions,
      recurring_bills: recurringBills,
      summary: {
        monthly_recurring_total: monthlyRecurringTotal,
        monthly_subscription_total: monthlySubscriptionTotal,
        yearly_subscription_total: yearlySubscriptionTotal
      }
    });
  } catch (err) {
    console.error('Fetch recurring error:', err);
    res.status(500).json({ error: 'Failed to fetch recurring expenses' });
  }
});

// POST /api/recurring
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, amount, category_id, frequency, next_due_date, payment_method, is_subscription } = req.body;

    if (!title || !amount || !next_due_date) {
      return res.status(400).json({ error: 'Title, amount, and next due date are required' });
    }

    const result = await runAsync(
      `INSERT INTO recurring_expenses (user_id, title, amount, category_id, frequency, next_due_date, payment_method, is_subscription)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title,
        amount,
        category_id || null,
        frequency || 'Monthly',
        next_due_date,
        payment_method || 'UPI',
        is_subscription ? 1 : 0
      ]
    );

    const item = await getAsync(
      `SELECT r.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM recurring_expenses r LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.id = ?`,
      [result.lastID]
    );

    res.status(201).json({ item });
  } catch (err) {
    console.error('Create recurring error:', err);
    res.status(500).json({ error: 'Failed to create recurring expense' });
  }
});

// DELETE /api/recurring/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await runAsync('DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ message: 'Recurring expense removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete recurring expense' });
  }
});

module.exports = router;
