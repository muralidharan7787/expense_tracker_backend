const express = require('express');
const { allAsync, getAsync } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/analytics/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    const currentMonthStr = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;

    // Compute previous month string
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // Get user details
    const user = await getAsync('SELECT monthly_income, savings_target FROM users WHERE id = ?', [userId]);
    const userIncomeProfile = user ? user.monthly_income : 0;
    const userSavingsTarget = user ? user.savings_target : 0;

    // Current month transactions summary
    const summaryRows = await allAsync(
      `SELECT type, SUM(amount) as total
       FROM transactions
       WHERE user_id = ? AND strftime('%Y-%m', date) = ?
       GROUP BY type`,
      [userId, currentMonthStr]
    );

    let totalIncome = 0;
    let totalExpense = 0;
    summaryRows.forEach(row => {
      if (row.type === 'income') totalIncome = row.total;
      if (row.type === 'expense') totalExpense = row.total;
    });

    // If user specified a baseline profile income, use the higher of profile or actual transactions
    const effectiveIncome = Math.max(userIncomeProfile, totalIncome);
    const netSaved = effectiveIncome - totalExpense;
    const savingsRate = effectiveIncome > 0 ? Math.round((netSaved / effectiveIncome) * 100) : 0;

    // Needs vs Wants breakdown
    const needsWantsRows = await allAsync(
      `SELECT c.is_needs, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'expense' AND strftime('%Y-%m', date) = ?
       GROUP BY c.is_needs`,
      [userId, currentMonthStr]
    );

    let needsAmount = 0;
    let wantsAmount = 0;
    needsWantsRows.forEach(row => {
      if (row.is_needs === 1) needsAmount = row.total;
      else wantsAmount = row.total;
    });

    // Current Month Category Breakdown
    const categorySpendingCurrent = await allAsync(
      `SELECT c.id, c.name, c.icon, c.color, c.is_needs, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'expense' AND strftime('%Y-%m', date) = ?
       GROUP BY c.id
       ORDER BY total DESC`,
      [userId, currentMonthStr]
    );

    // Previous Month Category Breakdown
    const categorySpendingPrev = await allAsync(
      `SELECT c.id, c.name, SUM(t.amount) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'expense' AND strftime('%Y-%m', date) = ?
       GROUP BY c.id`,
      [userId, prevMonthStr]
    );

    const prevCategoryMap = {};
    categorySpendingPrev.forEach(row => {
      prevCategoryMap[row.name] = row.total;
    });

    // Month-over-Month Comparison
    const momComparison = categorySpendingCurrent.map(c => {
      const prevTotal = prevCategoryMap[c.name] || 0;
      const delta = c.total - prevTotal;
      const percentChange = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : 100;
      return {
        category_name: c.name,
        current_amount: c.total,
        prev_amount: prevTotal,
        delta,
        percent_change: percentChange
      };
    });

    // Daily Spending Limit calculation
    // Fixed expenses (Needs like Rent, Bills)
    const fixedExpenses = needsAmount;
    const discretionaryMoney = Math.max(0, effectiveIncome - fixedExpenses - userSavingsTarget);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const remainingDays = Math.max(1, daysInMonth - currentDay + 1);

    const recommendedDailyLimit = Math.round(discretionaryMoney / daysInMonth);

    // Today's actual spending
    const todayStr = now.toISOString().split('T')[0];
    const todaySpendingRow = await getAsync(
      `SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND type = 'expense' AND date = ?`,
      [userId, todayStr]
    );
    const todaySpending = todaySpendingRow ? (todaySpendingRow.total || 0) : 0;

    // Payment Method Breakdown
    const paymentMethodRows = await allAsync(
      `SELECT payment_method, SUM(amount) as total
       FROM transactions
       WHERE user_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
       GROUP BY payment_method
       ORDER BY total DESC`,
      [userId, currentMonthStr]
    );

    // Upcoming Recurring Bills Total
    const upcomingRecurringRow = await getAsync(
      `SELECT SUM(amount) as total FROM recurring_expenses WHERE user_id = ?`,
      [userId]
    );
    const upcomingRecurringTotal = upcomingRecurringRow ? (upcomingRecurringRow.total || 0) : 0;

    res.json({
      summary: {
        income: effectiveIncome,
        expenses: totalExpense,
        balance: netSaved,
        savings_rate: savingsRate,
        savings_target: userSavingsTarget
      },
      daily_spending: {
        recommended_daily_limit: recommendedDailyLimit,
        today_spending: todaySpending,
        remaining_today: Math.max(0, recommendedDailyLimit - todaySpending),
        days_remaining_in_month: remainingDays
      },
      needs_vs_wants: {
        needs: needsAmount,
        wants: wantsAmount,
        needs_percentage: totalExpense > 0 ? Math.round((needsAmount / totalExpense) * 100) : 0,
        wants_percentage: totalExpense > 0 ? Math.round((wantsAmount / totalExpense) * 100) : 0
      },
      category_spending: categorySpendingCurrent,
      mom_comparison: momComparison,
      payment_methods: paymentMethodRows,
      upcoming_recurring_total: upcomingRecurringTotal
    });
  } catch (err) {
    console.error('Fetch analytics error:', err);
    res.status(500).json({ error: 'Failed to generate analytics dashboard' });
  }
});

module.exports = router;
