const db = require('./db');

async function reset() {
  try {
    // Initialise DB pool
    await db.initDb();
    
    // Hash default password 'password123'
    const newHash = db.hashPassword('password123');
    
    // Update the database
    const res = await db.query(
      "UPDATE owners SET password_hash = $1 WHERE username = 'owner'",
      [newHash]
    );
    
    if (res.rowCount > 0) {
      console.log("✅ Success: Reset password for username 'owner' to 'password123'");
    } else {
      // If the owner user doesn't exist, insert it
      const newId = 'own_default';
      await db.query(
        "INSERT INTO owners (id, username, password_hash, full_name) VALUES ($1, $2, $3, $4)",
        [newId, 'owner', newHash, 'Chit Fund Administrator']
      );
      console.log("✅ Success: Created default 'owner' account with password 'password123'");
    }
  } catch (err) {
    console.error("❌ Reset failed:", err.message);
  } finally {
    process.exit(0);
  }
}

reset();
