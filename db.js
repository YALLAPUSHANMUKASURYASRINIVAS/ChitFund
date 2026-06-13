const { Pool } = require('pg');
const crypto = require('crypto');

// Load environment configurations (will be loaded by server.js, but fallback load here is safe)
require('dotenv').config();

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'chitfund_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '1234'
    });

// Helper to run query
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Log queries in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Executing Query]:', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
}

// Password hashing utility
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Database schema table definitions
async function initDb() {
  console.log('--- INITIALIZING POSTGRESQL TABLES ---');
  try {
    // 1. Owners
    await query(`
      CREATE TABLE IF NOT EXISTS owners (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Groups
    await query(`
      CREATE TABLE IF NOT EXISTS groups (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        total_value NUMERIC(12, 2) NOT NULL,
        monthly_contribution NUMERIC(12, 2) NOT NULL,
        duration_months INTEGER NOT NULL,
        commission_amount NUMERIC(12, 2) NOT NULL,
        chit_type VARCHAR(20) NOT NULL,
        current_month INTEGER DEFAULT 1,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Members
    await query(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(100) PRIMARY KEY,
        group_id VARCHAR(100) REFERENCES groups(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20) NOT NULL,
        language VARCHAR(20) DEFAULT 'english',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration to ensure language column exists if table was already created
    await query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'english'
    `);

    // Migration to ensure client_id column exists
    await query(`
      ALTER TABLE members ADD COLUMN IF NOT EXISTS client_id VARCHAR(10)
    `);

    // Assign 5-digit client IDs to any existing members who do not have one
    const nullClients = await query(`SELECT id, name, phone FROM members WHERE client_id IS NULL`);
    if (nullClients.rowCount > 0) {
      console.log(`--- migrating ${nullClients.rowCount} member(s) to assign client_id ---`);
      const clientMap = new Map();
      for (const row of nullClients.rows) {
        const key = `${row.name.trim()}|${row.phone.trim()}`;
        if (!clientMap.has(key)) {
          let uniqueId = '';
          while (true) {
            const candidate = Math.floor(10000 + Math.random() * 90000).toString();
            const check = await query(`SELECT COUNT(*)::int as count FROM members WHERE client_id = $1`, [candidate]);
            if (check.rows[0].count === 0) {
              uniqueId = candidate;
              break;
            }
          }
          clientMap.set(key, uniqueId);
        }
        const assignedId = clientMap.get(key);
        await query(`UPDATE members SET client_id = $1 WHERE id = $2`, [assignedId, row.id]);
      }
      console.log('--- client_id migration completed successfully ---');
    }

    // 4. Auctions
    await query(`
      CREATE TABLE IF NOT EXISTS auctions (
        id VARCHAR(100) PRIMARY KEY,
        group_id VARCHAR(100) REFERENCES groups(id) ON DELETE CASCADE,
        month_number INTEGER NOT NULL,
        winner_member_id VARCHAR(100) REFERENCES members(id) ON DELETE SET NULL,
        winner_name VARCHAR(100) NOT NULL,
        bid_discount NUMERIC(12, 2) NOT NULL,
        commission_earned NUMERIC(12, 2) NOT NULL,
        dividend_per_member NUMERIC(12, 2) NOT NULL,
        net_payable_per_member NUMERIC(12, 2) NOT NULL,
        net_amount_paid_to_winner NUMERIC(12, 2) NOT NULL,
        auction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Payments
    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(100) PRIMARY KEY,
        group_id VARCHAR(100) REFERENCES groups(id) ON DELETE CASCADE,
        member_id VARCHAR(100) REFERENCES members(id) ON DELETE CASCADE,
        member_name VARCHAR(100) NOT NULL,
        month_number INTEGER NOT NULL,
        amount_paid NUMERIC(12, 2) NOT NULL,
        status VARCHAR(20) DEFAULT 'unpaid',
        payment_method VARCHAR(50) DEFAULT '',
        notes TEXT DEFAULT '',
        paid_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Notifications
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(100) PRIMARY KEY,
        group_id VARCHAR(100) REFERENCES groups(id) ON DELETE CASCADE,
        member_id VARCHAR(100) REFERENCES members(id) ON DELETE CASCADE,
        member_name VARCHAR(100) NOT NULL,
        type VARCHAR(10) NOT NULL,
        recipient VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'sent'
      )
    `);

    // 7. Queries
    await query(`
      CREATE TABLE IF NOT EXISTS queries (
        id VARCHAR(100) PRIMARY KEY,
        group_id VARCHAR(100) REFERENCES groups(id) ON DELETE CASCADE,
        member_id VARCHAR(100) REFERENCES members(id) ON DELETE CASCADE,
        member_name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        reply TEXT DEFAULT '',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration to ensure groups.winner_extra_amount exists
    await query(`
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS winner_extra_amount NUMERIC(12, 2) DEFAULT 0
    `);

    // Migration to ensure notifications has error_message column
    await query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT ''
    `);

    console.log('--- POSTGRESQL TABLES INITIALIZED SUCCESS ---');
  } catch (error) {
    console.error('--- DATABASE INITIALIZATION FAILED ---');
    console.error(error);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  hashPassword,
  initDb
};
