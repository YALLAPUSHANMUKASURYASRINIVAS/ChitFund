const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'chitfund_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234'
});

async function clean() {
  console.log('Connecting to PostgreSQL to clean test groups...');
  try {
    await client.connect();
    // Truncate groups and members. CASCADE will automatically clear referencing payments, auctions, queries, etc.
    await client.query('TRUNCATE TABLE groups, members, auctions, payments, notifications, queries CASCADE;');
    console.log('✅ Successfully cleared all test groups, members, and payments. Owner accounts have been preserved.');
  } catch (err) {
    console.error('Error cleaning database:', err.message);
  } finally {
    await client.end();
  }
}

clean();
