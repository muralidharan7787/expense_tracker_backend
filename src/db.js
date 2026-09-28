const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../expense_tracker.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Helper for promises with SQLite
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables
async function initDb() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      monthly_income REAL DEFAULT 0,
      savings_target REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      icon TEXT DEFAULT 'category',
      color TEXT DEFAULT '#6200EE',
      is_needs INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER,
      payment_method TEXT DEFAULT 'UPI',
      date TEXT NOT NULL,
      note TEXT,
      receipt_path TEXT,
      is_recurring INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      monthly_limit REAL NOT NULL,
      alert_threshold REAL DEFAULT 0.8,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, category_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER,
      frequency TEXT DEFAULT 'Monthly',
      next_due_date TEXT NOT NULL,
      payment_method TEXT DEFAULT 'UPI',
      is_subscription INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

  // Seed default categories if none exist
  const catCount = await getAsync(`SELECT COUNT(*) as count FROM categories WHERE user_id IS NULL`);
  if (catCount && catCount.count === 0) {
    const defaultCategories = [
      ['Food', 'expense', 'fastfood', '#FF7043', 1],
      ['Transport', 'expense', 'directions_car', '#42A5F5', 1],
      ['Shopping', 'expense', 'shopping_bag', '#EC407A', 0],
      ['Entertainment', 'expense', 'sports_esports', '#AB47BC', 0],
      ['Bills', 'expense', 'receipt_long', '#FFA726', 1],
      ['Rent', 'expense', 'home', '#26A69A', 1],
      ['Salary', 'income', 'account_balance_wallet', '#66BB6A', 0],
      ['Freelance', 'income', 'work', '#78909C', 0],
      ['Investments', 'income', 'trending_up', '#26C6DA', 0],
      ['Others', 'expense', 'more_horiz', '#8D6E63', 0],
    ];

    for (const [name, type, icon, color, isNeeds] of defaultCategories) {
      await runAsync(
        `INSERT INTO categories (name, type, icon, color, is_needs) VALUES (?, ?, ?, ?, ?)`,
        [name, type, icon, color, isNeeds]
      );
    }
    console.log('Seeded default categories.');
  }

  // Seed default demo user if demo@expensetracker.com doesn't exist
  const demoUser = await getAsync(`SELECT * FROM users WHERE email = ?`, ['demo@expensetracker.com']);
  if (!demoUser) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);
    const userRes = await runAsync(
      `INSERT INTO users (name, email, password_hash, monthly_income, savings_target) VALUES (?, ?, ?, ?, ?)`,
      ['Demo User', 'demo@expensetracker.com', hashedPassword, 40000, 10000]
    );

    const userId = userRes.lastID;
    console.log('Seeded demo user demo@expensetracker.com with id:', userId);

    // Seed sample transactions for demo user
    const today = new Date().toISOString().split('T')[0];

    // Get category IDs
    const foodCat = await getAsync(`SELECT id FROM categories WHERE name = 'Food'`);
    const rentCat = await getAsync(`SELECT id FROM categories WHERE name = 'Rent'`);
    const salaryCat = await getAsync(`SELECT id FROM categories WHERE name = 'Salary'`);
    const entertainmentCat = await getAsync(`SELECT id FROM categories WHERE name = 'Entertainment'`);
    const shoppingCat = await getAsync(`SELECT id FROM categories WHERE name = 'Shopping'`);
    const transportCat = await getAsync(`SELECT id FROM categories WHERE name = 'Transport'`);

    await runAsync(
      `INSERT INTO transactions (user_id, type, title, amount, category_id, payment_method, date, note) VALUES
       (?, 'income', 'Monthly Salary', 40000, ?, 'Bank Transfer', ?, 'Salary credit'),
       (?, 'expense', 'House Rent', 10000, ?, 'Bank Transfer', ?, 'Monthly rent payment'),
       (?, 'expense', 'Swiggy Food Order', 450, ?, 'UPI', ?, 'Dinner order'),
       (?, 'expense', 'Uber Ride to Office', 280, ?, 'UPI', ?, 'Morning commute'),
       (?, 'expense', 'Amazon Shopping', 1250, ?, 'Credit Card', ?, 'Electronics accessory'),
       (?, 'expense', 'Netflix Subscription', 649, ?, 'Credit Card', ?, 'Monthly stream')`,
      [
        userId, salaryCat ? salaryCat.id : null, today,
        userId, rentCat ? rentCat.id : null, today,
        userId, foodCat ? foodCat.id : null, today,
        userId, transportCat ? transportCat.id : null, today,
        userId, shoppingCat ? shoppingCat.id : null, today,
        userId, entertainmentCat ? entertainmentCat.id : null, today
      ]
    );

    // Seed category budget
    if (foodCat) {
      await runAsync(
        `INSERT INTO budgets (user_id, category_id, monthly_limit, alert_threshold) VALUES (?, ?, ?, ?)`,
        [userId, foodCat.id, 5000, 0.8]
      );
    }

    // Seed subscriptions
    await runAsync(
      `INSERT INTO recurring_expenses (user_id, title, amount, category_id, frequency, next_due_date, payment_method, is_subscription) VALUES
       (?, 'Netflix Premium', 649, ?, 'Monthly', ?, 'Credit Card', 1),
       (?, 'Spotify Duo', 149, ?, 'Monthly', ?, 'UPI', 1),
       (?, 'Highspeed Broadband', 799, ?, 'Monthly', ?, 'UPI', 0)`,
      [
        userId, entertainmentCat ? entertainmentCat.id : null, today,
        userId, entertainmentCat ? entertainmentCat.id : null, today,
        userId, null, today
      ]
    );

    console.log('Seeded sample financial data for demo user.');
  }
}

module.exports = {
  db,
  runAsync,
  getAsync,
  allAsync,
  initDb
};
