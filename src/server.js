require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const transactionRoutes = require('./routes/transactions');
const budgetRoutes = require('./routes/budgets');
const recurringRoutes = require('./routes/recurring');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Personal Expense Tracker Backend API', timestamp: new Date() });
});

// Start DB and Express server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`🚀 Personal Expense Tracker Backend Server Live`);
      console.log(`🌐 API Endpoint: http://localhost:${PORT}/api`);
      console.log(`=================================================`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
  });
