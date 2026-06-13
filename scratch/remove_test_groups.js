const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'chitfund_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234'
});

async function removeTestGroups() {
  console.log('Connecting to PostgreSQL to remove test groups...');
  try {
    await client.connect();

    // Query all groups to see what we have
    const groupsRes = await client.query('SELECT id, name FROM groups');
    console.log('Current groups in DB:', groupsRes.rows);

    // Delete groups where name is NOT '2_1'
    // CASCADE will automatically clean up members, payments, auctions, etc.
    const deleteRes = await client.query("DELETE FROM groups WHERE name != '2_1'");
    console.log(`Deleted ${deleteRes.rowCount} groups.`);

    // Verify remaining groups
    const remainingRes = await client.query('SELECT id, name FROM groups');
    console.log('Remaining groups in DB:', remainingRes.rows);
  } catch (err) {
    console.error('Error modifying database:', err.message);
  } finally {
    await client.end();
  }
}

removeTestGroups();
