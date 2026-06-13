require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const Razorpay = require('razorpay');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parser
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Razorpay SDK
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'your_razorpay_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret'
});

// Initialize Nodemailer SMTP transporter
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  lookup: (hostname, options, callback) => {
    options.family = 4;
    dns.lookup(hostname, options, callback);
  }
});

// Initialize Twilio client
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.error('Failed to initialize Twilio client:', err.message);
  }
}

// Phone number formatter for Twilio (+91 default country code for India)
function formatPhoneNumber(phone) {
  let clean = phone.trim().replace(/[-\s()]/g, '');
  if (!clean.startsWith('+')) {
    clean = '+91' + clean;
  }
  return clean;
}

// Generate or retrieve a unique 5-digit client ID
async function getOrCreateClientId(name, phone) {
  const cleanName = name.trim();
  const cleanPhone = phone.trim();

  // Check if member already has a client_id
  const check = await db.query(
    'SELECT client_id FROM members WHERE name = $1 AND phone = $2 AND client_id IS NOT NULL LIMIT 1',
    [cleanName, cleanPhone]
  );

  if (check.rowCount > 0) {
    return check.rows[0].client_id;
  }

  // Generate new unique 5-digit client ID
  let uniqueId = '';
  while (true) {
    const candidate = Math.floor(10000 + Math.random() * 90000).toString();
    const checkColl = await db.query('SELECT COUNT(*)::int as count FROM members WHERE client_id = $1', [candidate]);
    if (checkColl.rows[0].count === 0) {
      uniqueId = candidate;
      break;
    }
  }
  return uniqueId;
}

// Helper: Get localized message template based on member's preferred language
function getNotificationMessage(type, memberName, language, params = {}) {
  const lang = (language || 'english').toLowerCase();
  
  const templates = {
    invite: {
      english: `Chit "${params.groupName}" invite. Client ID: ${params.clientId}. Login with ID & phone.`,
      hindi: `चिट "${params.groupName}" आमंत्रण। आईडी: ${params.clientId}। इससे लॉगिन करें।`,
      telugu: `చిట్ "${params.groupName}" ఆహ్వానం. ఐడి: ${params.clientId}. దీనితో లాగిన్ అవ్వండి.`
    },
    group_alert: {
      english: `New Chit "${params.groupName}" (₹${Number(params.totalValue).toLocaleString()}). ID: ${params.clientId}. Contact admin.`,
      hindi: `नया चिट "${params.groupName}"। आईडी: ${params.clientId}। संपर्क करें।`,
      telugu: `కొత్త చిట్ "${params.groupName}". ఐడి: ${params.clientId}. సంప్రదించండి.`
    },
    winner: {
      english: `🏆 WINNER: You won Month ${params.month} in "${params.groupName}". Payout: ₹${Number(params.netPayout).toLocaleString()}.`,
      hindi: `🏆 विजेता: आप "${params.groupName}" महीना ${params.month} जीते। शुद्ध भुगतान: ₹${Number(params.netPayout).toLocaleString()}।`,
      telugu: `🏆 విజేత: "${params.groupName}" నెల ${params.month} గెలిచారు. నెట్ పేమెంట్: ₹${Number(params.netPayout).toLocaleString()}.`
    },
    installment: {
      english: `🔔 BILL: Month ${params.month} in "${params.groupName}" due: ₹${Number(params.installment).toLocaleString()}. Pay now.`,
      hindi: `🔔 बिल: ग्रूप "${params.groupName}" महीना ${params.month} देय: ₹${Number(params.installment).toLocaleString()}। भुगतान करें।`,
      telugu: `🔔 బిల్: "${params.groupName}" నెల ${params.month} బకాయి: ₹${Number(params.installment).toLocaleString()}. చెల్లించండి.`
    },
    reminder: {
      english: `Reminder: ₹${Number(params.amount).toLocaleString()} due for Month ${params.month} of "${params.groupName}".${params.pastDues > 0 ? ` Past dues: ₹${Number(params.pastDues).toLocaleString()}. Total: ₹${Number(params.totalOutstanding).toLocaleString()}.` : ''} Pay now.`,
      hindi: `रिमाइंडर: ग्रूप "${params.groupName}" महीना ${params.month} के लिए ₹${Number(params.amount).toLocaleString()} देय।${params.pastDues > 0 ? ` पुराना बकाया: ₹${Number(params.pastDues).toLocaleString()}। कुल: ₹${Number(params.totalOutstanding).toLocaleString()}।` : ''} भुगतान करें।`,
      telugu: `రిమైండర్: "${params.groupName}" నెల ${params.month} కి ₹${Number(params.amount).toLocaleString()} పెండింగ్.${params.pastDues > 0 ? ` బకాయి: ₹${Number(params.pastDues).toLocaleString()}. మొత్తం: ₹${Number(params.totalOutstanding).toLocaleString()}.` : ''} చెల్లించండి.`
    },
    confirmation: {
      english: `Paid! Received ₹${Number(params.amount).toLocaleString()} for Month ${params.month} of "${params.groupName}" via ${params.method}.`,
      hindi: `प्राप्त! ग्रूप "${params.groupName}" महीना ${params.month} के लिए ₹${Number(params.amount).toLocaleString()} का भुगतान प्राप्त हुआ।`,
      telugu: `అందింది! "${params.groupName}" నెల ${params.month} కి ₹${Number(params.amount).toLocaleString()} పేమెంట్ అందింది.`
    }
  };
  
  const typeTemplates = templates[type] || templates.invite;
  return typeTemplates[lang] || typeTemplates.english;
}

async function dispatchNotification(groupId, member, type, message, isTest = false) {
  const notifId = crypto.randomUUID();
  let status = 'sent';
  let errorMsg = '';

  const isTestNumber = member.phone && (
    member.phone.startsWith('99999') || 
    member.phone.startsWith('98450') || 
    member.phone.startsWith('+9199999') || 
    member.phone.startsWith('+9198450')
  );

  if (type === 'sms') {
    const recipientPhone = formatPhoneNumber(member.phone);
    if (twilioClient && !isTest && !isTestNumber) {
      try {
        await twilioClient.messages.create({
          body: message,
          to: recipientPhone,
          from: process.env.TWILIO_PHONE_NUMBER
        });
        console.log(`[Twilio SMS Sent to ${recipientPhone}]`);
      } catch (err) {
        console.error(`[Twilio SMS Fail to ${recipientPhone}]:`, err.message);
        status = 'failed';
        errorMsg = err.message;
      }
    } else {
      console.log(`[SIMULATED SMS to ${recipientPhone}]: ${message}`);
      status = 'simulated';
    }
  } else if (type === 'email') {
    const recipientEmail = member.email ? member.email.trim() : null;
    if (recipientEmail && !isTest && !isTestNumber) {
      try {
        await emailTransporter.sendMail({
          from: `"ChitLite Portal" <${process.env.EMAIL_USER}>`,
          to: recipientEmail,
          subject: 'Chit Fund Alert Details',
          text: message
        });
        console.log(`[Nodemailer Email Sent to ${recipientEmail}]`);
      } catch (err) {
        console.error(`[Nodemailer Email Fail to ${recipientEmail}]:`, err.message);
        status = 'failed';
        errorMsg = err.message;
      }
    } else {
      console.log(`[SIMULATED EMAIL to ${recipientEmail}]: ${message}`);
      status = 'simulated';
    }
  }

  // Insert to DB log
  try {
    await db.query(
      `INSERT INTO notifications (id, group_id, member_id, member_name, type, recipient, message, status, error_message) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        notifId,
        groupId,
        member.id,
        member.name,
        type,
        type === 'sms' ? member.phone : (member.email || 'None'),
        message,
        status,
        errorMsg
      ]
    );
  } catch (err) {
    console.error('Failed to log notification in DB:', err.message);
  }
}

// JWT Authentication Middleware for Owner routes
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required. Please login.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ error: 'Token expired or invalid.' });
    }
    req.user = decodedUser;
    next();
  });
}

// Database startup initialization
db.initDb().then(async () => {
  // Seed default admin if empty
  try {
    const check = await db.query('SELECT * FROM owners LIMIT 1');
    if (check.rowCount === 0) {
      const defaultOwner = {
        id: crypto.randomUUID(),
        username: 'owner',
        passwordHash: db.hashPassword('password123'),
        fullName: 'Chit Fund Administrator'
      };
      await db.query(
        `INSERT INTO owners (id, username, password_hash, full_name) VALUES ($1, $2, $3, $4)`,
        [defaultOwner.id, defaultOwner.username, defaultOwner.passwordHash, defaultOwner.fullName]
      );
      console.log('--- DATABASE SEEDED IN POSTGRESQL ---');
      console.log('Username: owner | Password: password123');
    }
  } catch (err) {
    console.error('Failed to seed owner user:', err.message);
  }
});

// ================= OWNER AUTH ROUTES =================

app.post('/api/owner/register', async (req, res) => {
  const { username, password, fullName } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'Username, password, and full name are required' });
  }

  try {
    const checkUser = await db.query('SELECT * FROM owners WHERE username = $1', [username]);
    if (checkUser.rowCount > 0) {
      return res.status(400).json({ error: 'Username is already registered' });
    }

    const id = 'own_' + crypto.randomUUID().substring(0, 8);
    const passwordHash = db.hashPassword(password);

    await db.query(
      `INSERT INTO owners (id, username, password_hash, full_name) VALUES ($1, $2, $3, $4)`,
      [id, username.trim().toLowerCase(), passwordHash, fullName.trim()]
    );

    // Sign JWT Token
    const token = jwt.sign(
      { id, username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      owner: {
        username,
        fullName
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM owners WHERE username = $1', [username]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const owner = result.rows[0];
    const hash = db.hashPassword(password);
    if (owner.password_hash !== hash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Sign JWT Token
    const token = jwt.sign(
      { id: owner.id, username: owner.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      token,
      owner: {
        username: owner.username,
        fullName: owner.full_name
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= GROUP ROUTES =================

// Create Group (Protected)
app.post('/api/groups', authenticateToken, async (req, res) => {
  const { name, totalValue, durationMonths, commissionAmount, chitType, winnerExtraAmount } = req.body;

  if (!name || !totalValue || !durationMonths || !commissionAmount || !chitType) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const groupId = 'grp_' + crypto.randomUUID().substring(0, 8);
  const total = Number(totalValue);
  const duration = Number(durationMonths);
  const monthlyContribution = total / duration;
  const extra = Number(winnerExtraAmount || 0);

  try {
    const result = await db.query(
      `INSERT INTO groups (id, name, total_value, monthly_contribution, duration_months, commission_amount, chit_type, winner_extra_amount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [groupId, name, total, monthlyContribution, duration, Number(commissionAmount), chitType, extra]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List Groups
app.get('/api/groups', async (req, res) => {
  try {
    // Select group details combined with count of members registered
    const result = await db.query(`
      SELECT g.*, COUNT(m.id)::int as "memberCount" 
      FROM groups g 
      LEFT JOIN members m ON g.id = m.group_id 
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single group details
app.get('/api/groups/:id', async (req, res) => {
  const groupId = req.params.id;

  try {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const membersRes = await db.query('SELECT * FROM members WHERE group_id = $1 ORDER BY created_at ASC', [groupId]);
    const auctionsRes = await db.query('SELECT * FROM auctions WHERE group_id = $1 ORDER BY month_number ASC', [groupId]);
    const paymentsRes = await db.query('SELECT * FROM payments WHERE group_id = $1 ORDER BY month_number ASC, member_name ASC', [groupId]);

    res.json({
      group: groupRes.rows[0],
      members: membersRes.rows,
      auctions: auctionsRes.rows,
      payments: paymentsRes.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete group (Protected)
app.delete('/api/groups/:id', authenticateToken, async (req, res) => {
  const groupId = req.params.id;

  try {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    await db.query('DELETE FROM groups WHERE id = $1', [groupId]);
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clone Group to start new phase with same members (Protected)
app.post('/api/groups/:id/clone', authenticateToken, async (req, res) => {
  const sourceGroupId = req.params.id;
  const { name, totalValue, durationMonths, commissionAmount, winnerExtraAmount, chitType } = req.body;

  if (!name || !totalValue || !durationMonths || !commissionAmount || !chitType) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if source group exists
    const sourceGroupRes = await db.query('SELECT * FROM groups WHERE id = $1', [sourceGroupId]);
    if (sourceGroupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Source group not found' });
    }

    // Get members of the source group
    const membersRes = await db.query('SELECT * FROM members WHERE group_id = $1 ORDER BY created_at ASC', [sourceGroupId]);
    if (membersRes.rowCount === 0) {
      return res.status(400).json({ error: 'Source group has no members to copy.' });
    }

    const newGroupId = 'grp_' + crypto.randomUUID().substring(0, 8);
    const total = Number(totalValue);
    const duration = Number(durationMonths);
    const monthlyContribution = total / duration;
    const extra = Number(winnerExtraAmount || 0);

    await db.query('BEGIN');

    // Create the new group
    await db.query(
      `INSERT INTO groups (id, name, total_value, monthly_contribution, duration_months, commission_amount, chit_type, winner_extra_amount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newGroupId, name, total, monthlyContribution, duration, Number(commissionAmount), chitType, extra]
    );

    const newMembers = [];
    // Insert each member into the new group
    for (const m of membersRes.rows) {
      const memberId = 'mem_' + crypto.randomUUID().substring(0, 8);
      await db.query(
        `INSERT INTO members (id, group_id, name, email, phone, language, client_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [memberId, newGroupId, m.name, m.email, m.phone, m.language, m.client_id]
      );
      newMembers.push({
        id: memberId,
        name: m.name,
        email: m.email,
        phone: m.phone,
        language: m.language,
        client_id: m.client_id
      });
    }

    await db.query('COMMIT');

    // Send invitations to copied members (outside SQL transaction to prevent db locking)
    const isTest = req.headers['x-test-request'] === 'true';
    const ownerRes = await db.query('SELECT full_name FROM owners WHERE id = $1', [req.user.id]);
    const ownerName = ownerRes.rows[0] ? ownerRes.rows[0].full_name : 'Owner';
    
    const notifPromises = [];
    for (const m of newMembers) {
      const inviteMsg = getNotificationMessage('invite', m.name, m.language, {
        groupName: name,
        ownerName,
        groupId: newGroupId,
        clientId: m.client_id
      });
      notifPromises.push(dispatchNotification(newGroupId, m, 'sms', inviteMsg, isTest));
      if (m.email) {
        notifPromises.push(dispatchNotification(newGroupId, m, 'email', inviteMsg, isTest));
      }
    }
    await Promise.all(notifPromises);

    res.status(201).json({ success: true, newGroupId });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// ================= MEMBER ROUTES =================

// Add member manually (Protected)
app.post('/api/groups/:id/members', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const { name, email, phone, language } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and Phone number are required' });
  }

  try {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const group = groupRes.rows[0];

    const countRes = await db.query('SELECT COUNT(*)::int as count FROM members WHERE group_id = $1', [groupId]);
    if (countRes.rows[0].count >= group.duration_months) {
      return res.status(400).json({ error: `Group is full. Max capacity: ${group.duration_months} members.` });
    }

    const memberId = 'mem_' + crypto.randomUUID().substring(0, 8);
    const lang = (language && ['english', 'hindi', 'telugu'].includes(language.toLowerCase().trim())) 
      ? language.toLowerCase().trim() 
      : 'english';

    const clientId = await getOrCreateClientId(name, phone);

    const result = await db.query(
      `INSERT INTO members (id, group_id, name, email, phone, language, client_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [memberId, groupId, name.trim(), email ? email.trim() : '', phone.trim(), lang, clientId]
    );

    const addedMember = result.rows[0];

    // Fetch owner details
    const ownerRes = await db.query('SELECT full_name FROM owners WHERE id = $1', [req.user.id]);
    const ownerName = ownerRes.rows[0] ? ownerRes.rows[0].full_name : 'Owner';

    // Group is "newly created" if 0 auctions have been held
    const auctionsCountRes = await db.query('SELECT COUNT(*)::int as count FROM auctions WHERE group_id = $1', [groupId]);
    const isNewGroup = auctionsCountRes.rows[0].count === 0;
    const isTest = req.headers['x-test-request'] === 'true';

    if (isNewGroup) {
      const inviteMsg = getNotificationMessage('invite', addedMember.name, addedMember.language, {
        groupName: group.name,
        ownerName,
        groupId,
        clientId: addedMember.client_id
      });
      await dispatchNotification(groupId, addedMember, 'sms', inviteMsg, isTest);
      if (addedMember.email) {
        await dispatchNotification(groupId, addedMember, 'email', inviteMsg, isTest);
      }
    }

    res.status(201).json(addedMember);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk upload members via JSON array (Protected)
app.post('/api/groups/:id/members/bulk', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const { members } = req.body;

  if (!members || !Array.isArray(members)) {
    return res.status(400).json({ error: 'Invalid members data' });
  }

  try {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const group = groupRes.rows[0];

    const currentCountRes = await db.query('SELECT COUNT(*)::int as count FROM members WHERE group_id = $1', [groupId]);
    const slotsRemaining = group.duration_months - currentCountRes.rows[0].count;

    if (members.length > slotsRemaining) {
      return res.status(400).json({
        error: `Import failed. You uploaded ${members.length} members, but only ${slotsRemaining} slots are available.`
      });
    }

    const added = [];
    const ownerRes = await db.query('SELECT full_name FROM owners WHERE id = $1', [req.user.id]);
    const ownerName = ownerRes.rows[0] ? ownerRes.rows[0].full_name : 'Owner';

    // Group is "newly created" if 0 auctions have been held
    const auctionsCountRes = await db.query('SELECT COUNT(*)::int as count FROM auctions WHERE group_id = $1', [groupId]);
    const isNewGroup = auctionsCountRes.rows[0].count === 0;
    const isTest = req.headers['x-test-request'] === 'true';

    const notifPromises = [];
    for (const m of members) {
      if (m.name && m.phone) {
        const memberId = 'mem_' + crypto.randomUUID().substring(0, 8);
        const rawLang = m.language || m.lang || 'english';
        const lang = ['english', 'hindi', 'telugu'].includes(rawLang.toLowerCase().trim()) 
          ? rawLang.toLowerCase().trim() 
          : 'english';

        const clientId = await getOrCreateClientId(m.name, m.phone);
        const ins = await db.query(
          `INSERT INTO members (id, group_id, name, email, phone, language, client_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [memberId, groupId, m.name.trim(), (m.email || '').trim(), m.phone.trim(), lang, clientId]
        );
        const addedMember = ins.rows[0];
        added.push(addedMember);

        if (isNewGroup) {
          const inviteMsg = getNotificationMessage('invite', addedMember.name, addedMember.language, {
            groupName: group.name,
            ownerName,
            groupId,
            clientId: addedMember.client_id
          });
          notifPromises.push(dispatchNotification(groupId, addedMember, 'sms', inviteMsg, isTest));
          if (addedMember.email) {
            notifPromises.push(dispatchNotification(groupId, addedMember, 'email', inviteMsg, isTest));
          }
        }
      }
    }
    await Promise.all(notifPromises);

    res.json({ success: true, count: added.length, members: added });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete member (Protected)
app.delete('/api/members/:id', authenticateToken, async (req, res) => {
  const memberId = req.params.id;

  try {
    const memberRes = await db.query('SELECT * FROM members WHERE id = $1', [memberId]);
    if (memberRes.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await db.query('DELETE FROM members WHERE id = $1', [memberId]);
    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit member details (Protected)
app.put('/api/members/:id', authenticateToken, async (req, res) => {
  const memberId = req.params.id;
  const { name, phone, email, language } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and Phone number are required' });
  }

  try {
    const memberRes = await db.query('SELECT * FROM members WHERE id = $1', [memberId]);
    if (memberRes.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const lang = (language && ['english', 'hindi', 'telugu'].includes(language.toLowerCase().trim()))
      ? language.toLowerCase().trim()
      : 'english';

    const clientId = await getOrCreateClientId(name, phone);

    await db.query(
      `UPDATE members SET name = $1, phone = $2, email = $3, language = $4, client_id = $5 WHERE id = $6`,
      [name.trim(), phone.trim(), email ? email.trim() : '', lang, clientId, memberId]
    );

    // Also update member_name in payments table so names match on matrix
    await db.query(
      `UPDATE payments SET member_name = $1 WHERE member_id = $2`,
      [name.trim(), memberId]
    );

    res.json({ success: true, message: 'Member details updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= CLIENT AUTH ROUTE =================

app.post('/api/client/login', async (req, res) => {
  const { clientId, phone } = req.body;

  if (!clientId || !phone) {
    return res.status(400).json({ error: 'Client ID and Phone number are required' });
  }

  try {
    const membershipsRes = await db.query(
      `SELECT m.*, g.name as group_name, g.total_value, g.monthly_contribution, g.duration_months, g.commission_amount, g.chit_type, g.current_month, g.status as group_status, g.created_at as group_created_at
       FROM members m 
       JOIN groups g ON m.group_id = g.id 
       WHERE m.client_id = $1 AND m.phone = $2`,
      [clientId.trim(), phone.trim()]
    );

    if (membershipsRes.rowCount === 0) {
      return res.status(404).json({ error: 'Invalid Client ID or registered phone number.' });
    }

    const memberships = membershipsRes.rows.map(row => ({
      member: {
        id: row.id,
        group_id: row.group_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        language: row.language,
        client_id: row.client_id,
        created_at: row.created_at
      },
      group: {
        id: row.group_id,
        name: row.group_name,
        total_value: row.total_value,
        monthly_contribution: row.monthly_contribution,
        duration_months: row.duration_months,
        commission_amount: row.commission_amount,
        chit_type: row.chit_type,
        current_month: row.current_month,
        status: row.group_status,
        created_at: row.group_created_at
      }
    }));

    res.json({
      success: true,
      memberships
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= AUCTIONS & PROCESS BILLS =================

// Hold Monthly Auction (Protected)
app.post('/api/groups/:id/auctions', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const { winnerMemberId, netPayablePerMember, amountWon, commissionAmount } = req.body;

  try {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const group = groupRes.rows[0];

    const membersRes = await db.query('SELECT * FROM members WHERE group_id = $1', [groupId]);
    const N = membersRes.rowCount;

    if (N < group.duration_months) {
      return res.status(400).json({
        error: `Requires ${group.duration_months} members to start auctions. Group currently has ${N}.`
      });
    }

    const currentMonth = group.current_month;
    if (currentMonth > group.duration_months) {
      return res.status(400).json({ error: 'Chit fund duration completed.' });
    }

    // Check if auction already held for this month
    const checkAuction = await db.query('SELECT * FROM auctions WHERE group_id = $1 AND month_number = $2', [groupId, currentMonth]);
    if (checkAuction.rowCount > 0) {
      return res.status(400).json({ error: `Auction for month ${currentMonth} already completed.` });
    }

    const winner = membersRes.rows.find(m => m.id === winnerMemberId);
    if (!winner) {
      return res.status(404).json({ error: 'Winner member not found' });
    }

    // Check if winner has already won previously
    const checkWinner = await db.query('SELECT * FROM auctions WHERE group_id = $1 AND winner_member_id = $2', [groupId, winnerMemberId]);
    if (checkWinner.rowCount > 0) {
      return res.status(400).json({ error: `${winner.name} already won an auction.` });
    }

    if (netPayablePerMember === undefined || amountWon === undefined || commissionAmount === undefined) {
      return res.status(400).json({ error: 'All three auction amounts (net payable per member, amount won, commission) are required' });
    }

    // Retrieve past winners
    const pastAuctionsRes = await db.query('SELECT winner_member_id FROM auctions WHERE group_id = $1', [groupId]);
    const pastWinnerIds = pastAuctionsRes.rows.map(r => r.winner_member_id);

    const amountWonVal = Number(amountWon);
    const commissionVal = Number(commissionAmount);

    const discount = Number(group.total_value) - amountWonVal;
    const commission = commissionVal;

    const discountPerMember = Math.max(0, discount / N);
    const netPayablePerMemberFinal = Number(netPayablePerMember);
    const extraFromPastWinners = pastWinnerIds.length * Number(group.winner_extra_amount || 0);
    const grossWinnerPayout = amountWonVal - netPayablePerMemberFinal - commissionVal + extraFromPastWinners;

    const auctionId = 'auc_' + crypto.randomUUID().substring(0, 8);

    // SQL Transaction to insert auction, create payments, increment group month
    await db.query('BEGIN');

    // Auto-deduct unpaid payments from other groups for this client (phone number match)
    const clientPhone = winner.phone.trim();
    const otherPaymentsRes = await db.query(
      `SELECT p.*, g.name as group_name 
       FROM payments p 
       JOIN members m ON p.member_id = m.id 
       JOIN groups g ON p.group_id = g.id
       WHERE m.phone = $1 AND p.group_id != $2 AND p.status = 'unpaid'
       ORDER BY p.created_at ASC`,
      [clientPhone, groupId]
    );

    let remainingWinnerPayout = Math.max(0, grossWinnerPayout);
    const nowStr = new Date().toISOString();

    for (const payRow of otherPaymentsRes.rows) {
      const dueAmount = Number(payRow.amount_paid);
      
      if (remainingWinnerPayout >= dueAmount) {
        await db.query(
          `UPDATE payments SET status = 'paid', payment_method = 'winner', notes = $1, paid_at = $2 WHERE id = $3`,
          [`Deducted from winner payout of group ${group.name}`, nowStr, payRow.id]
        );
        remainingWinnerPayout -= dueAmount;
      } else if (remainingWinnerPayout > 0) {
        const newDueAmount = dueAmount - remainingWinnerPayout;
        await db.query(
          `UPDATE payments SET amount_paid = $1, notes = $2 WHERE id = $3`,
          [newDueAmount, `Partially covered by winner payout of group ${group.name} (Original: ₹${dueAmount})`, payRow.id]
        );
        remainingWinnerPayout = 0;
        break;
      } else {
        break;
      }
    }

    const finalWinnerPayout = remainingWinnerPayout;

    await db.query(
      `INSERT INTO auctions (id, group_id, month_number, winner_member_id, winner_name, bid_discount, commission_earned, dividend_per_member, net_payable_per_member, net_amount_paid_to_winner) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [auctionId, groupId, currentMonth, winnerMemberId, winner.name, discount, commission, discountPerMember, netPayablePerMemberFinal, finalWinnerPayout]
    );

    // Create payment records for all members
    for (const m of membersRes.rows) {
      const payId = 'pay_' + crypto.randomUUID().substring(0, 8);
      
      const isWinner = m.id === winnerMemberId;
      const isPastWinner = pastWinnerIds.includes(m.id);
      
      let amount = 0;
      let status = 'unpaid';
      let method = '';
      let notes = '';
      let paidAt = null;

      if (isWinner) {
        amount = netPayablePerMemberFinal;
        status = 'paid';
        method = 'winner_exemption';
        notes = 'Winner - No Dues';
        paidAt = new Date().toISOString();
      } else if (isPastWinner) {
        amount = (Number(group.total_value) / N) + Number(group.winner_extra_amount || 0);
        notes = 'Past Winner - Extra Due';
      } else {
        amount = netPayablePerMemberFinal;
        notes = 'Installment Due';
      }

      let finalAmount = amount;
      if (!isWinner && amount > 0) {
        const clientPhone = m.phone.trim();
        const pastWinnerPayoutsRes = await db.query(
          `SELECT a.id, a.net_amount_paid_to_winner, g.name as group_name 
           FROM auctions a 
           JOIN members m_winner ON a.winner_member_id = m_winner.id 
           JOIN groups g ON a.group_id = g.id
           WHERE m_winner.phone = $1 AND a.group_id != $2 AND a.net_amount_paid_to_winner > 0
           ORDER BY a.auction_date ASC`,
          [clientPhone, groupId]
        );

        let remainingDue = amount;
        for (const auctionRow of pastWinnerPayoutsRes.rows) {
          const payoutCredit = Number(auctionRow.net_amount_paid_to_winner);
          if (payoutCredit >= remainingDue) {
            const newPayoutCredit = payoutCredit - remainingDue;
            await db.query(
              `UPDATE auctions SET net_amount_paid_to_winner = $1 WHERE id = $2`,
              [newPayoutCredit, auctionRow.id]
            );
            status = 'paid';
            method = 'winner';
            notes = `Fully covered by winner payout credit from group ${auctionRow.group_name}`;
            paidAt = new Date().toISOString();
            remainingDue = 0;
            break;
          } else {
            await db.query(
              `UPDATE auctions SET net_amount_paid_to_winner = 0 WHERE id = $2`,
              [auctionRow.id]
            );
            remainingDue -= payoutCredit;
            notes = `Partially covered by winner payout credit from group ${auctionRow.group_name} (Original due: ₹${amount})`;
          }
        }
        
        if (status === 'paid') {
          finalAmount = amount;
        } else {
          finalAmount = remainingDue;
        }
      }

      await db.query(
        `INSERT INTO payments (id, group_id, member_id, member_name, month_number, amount_paid, status, payment_method, notes, paid_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [payId, groupId, m.id, m.name, currentMonth, finalAmount, status, method, notes, paidAt]
      );
    }

    // Increment current month
    const nextMonth = currentMonth + 1;
    await db.query('UPDATE groups SET current_month = $1 WHERE id = $2', [nextMonth, groupId]);

    await db.query('COMMIT');

    // Send payout alert to the winner only (outside transaction to prevent database lock waiting)
    const isTest = req.headers['x-test-request'] === 'true';
    const winMsg = getNotificationMessage('winner', winner.name, winner.language, {
      groupName: group.name,
      month: currentMonth,
      amountWon: amountWonVal,
      commission: commissionVal,
      netPayout: finalWinnerPayout
    });
    const notifPromises = [];
    notifPromises.push(dispatchNotification(groupId, winner, 'sms', winMsg, isTest));
    if (winner.email) {
      notifPromises.push(dispatchNotification(groupId, winner, 'email', winMsg, isTest));
    }
    await Promise.all(notifPromises);

    res.status(201).json({ success: true, nextMonth });
  } catch (error) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// ================= PAYMENT ACTIONS =================

// Update Payment status manually by Owner (Protected)
app.put('/api/payments/:paymentId', authenticateToken, async (req, res) => {
  const { paymentId } = req.params;
  const { status, paymentMethod, notes } = req.body;

  try {
    const payRes = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (payRes.rowCount === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    const payment = payRes.rows[0];

    const transitionToPaid = (payment.status === 'unpaid' && status === 'paid');
    const isTest = req.headers['x-test-request'] === 'true';
    const paidAt = status === 'paid' ? new Date().toISOString() : null;

    await db.query(
      `UPDATE payments SET status = $1, payment_method = $2, notes = $3, paid_at = $4 WHERE id = $5`,
      [status, paymentMethod || 'cash', notes || '', paidAt, paymentId]
    );

    if (transitionToPaid) {
      const memberRes = await db.query('SELECT * FROM members WHERE id = $1', [payment.member_id]);
      const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [payment.group_id]);
      
      if (memberRes.rowCount > 0 && groupRes.rowCount > 0) {
        const m = memberRes.rows[0];
        const g = groupRes.rows[0];
        
        const msg = getNotificationMessage('confirmation', m.name, m.language, {
          groupName: g.name,
          month: payment.month_number,
          amount: payment.amount_paid,
          method: (paymentMethod || 'cash').toUpperCase()
        });
        
        const notifPromises = [];
        notifPromises.push(dispatchNotification(g.id, m, 'sms', msg, isTest));
        if (m.email) {
          notifPromises.push(dispatchNotification(g.id, m, 'email', msg, isTest));
        }
        await Promise.all(notifPromises);
      }
    }

    res.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Razorpay Order (Client)
app.post('/api/payments/create-order', async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: 'paymentId is required' });
  }

  try {
    const payRes = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (payRes.rowCount === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    const payment = payRes.rows[0];

    // Razorpay expects integer amount in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(Number(payment.amount_paid) * 100);

    const orderOptions = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: payment.id,
      notes: {
        paymentId: payment.id,
        memberId: payment.member_id,
        monthNumber: payment.month_number
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    res.json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      paymentId: payment.id
    });
  } catch (error) {
    console.error('Razorpay Order Creation Failed:', error);
    res.status(500).json({ error: 'Failed to initiate gateway transaction' });
  }
});

// Verify Razorpay Payment and Mark Paid (Client)
app.post('/api/payments/verify-signature', async (req, res) => {
  const { paymentId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!paymentId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment signature verification details' });
  }

  try {
    // Generate signature verify hash using HMAC-SHA256 with key secret
    const secret = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret';
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature verification failed. Security alert.' });
    }

    // Update DB
    const payRes = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (payRes.rowCount === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    const payment = payRes.rows[0];

    const transitionToPaid = (payment.status === 'unpaid');
    const isTest = req.headers['x-test-request'] === 'true';

    await db.query(
      `UPDATE payments 
       SET status = 'paid', payment_method = 'gateway_online', notes = $1, paid_at = $2 
       WHERE id = $3`,
      [`Razorpay Pay ID: ${razorpay_payment_id} | Order ID: ${razorpay_order_id}`, new Date().toISOString(), paymentId]
    );

    if (transitionToPaid) {
      const memberRes = await db.query('SELECT * FROM members WHERE id = $1', [payment.member_id]);
      const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [payment.group_id]);

      if (memberRes.rowCount > 0 && groupRes.rowCount > 0) {
        const m = memberRes.rows[0];
        const g = groupRes.rows[0];
        
        const successMsg = getNotificationMessage('confirmation', m.name, m.language, {
          groupName: g.name,
          month: payment.month_number,
          amount: payment.amount_paid,
          method: `Razorpay Online (${razorpay_payment_id})`
        });
        
        const notifPromises = [];
        notifPromises.push(dispatchNotification(g.id, m, 'sms', successMsg, isTest));
        if (m.email) {
          notifPromises.push(dispatchNotification(g.id, m, 'email', successMsg, isTest));
        }
        await Promise.all(notifPromises);
      }
    }

    res.json({ success: true, message: 'Payment verified and cleared!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Bulk Order on Razorpay (Client)
app.post('/api/payments/create-bulk-order', async (req, res) => {
  const { paymentIds } = req.body;

  if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
    return res.status(400).json({ error: 'paymentIds array is required' });
  }

  try {
    const payRes = await db.query('SELECT * FROM payments WHERE id = ANY($1)', [paymentIds]);
    if (payRes.rowCount === 0) {
      return res.status(404).json({ error: 'No matching payment records found' });
    }

    const payments = payRes.rows;
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
    const amountInPaise = Math.round(totalAmount * 100);

    const orderOptions = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: 'bulk_' + payments[0].id.substring(0, 10),
      notes: {
        paymentIds: paymentIds.join(','),
        memberId: payments[0].member_id
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    res.json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      paymentIds: paymentIds
    });
  } catch (error) {
    console.error('Razorpay Bulk Order Creation Failed:', error);
    res.status(500).json({ error: 'Failed to initiate gateway transaction' });
  }
});

// Verify Bulk Razorpay Payment and Mark Paid (Client)
app.post('/api/payments/verify-bulk-signature', async (req, res) => {
  const { paymentIds, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!paymentIds || !Array.isArray(paymentIds) || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment signature verification details' });
  }

  try {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret';
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment signature verification failed. Security alert.' });
    }

    const payRes = await db.query('SELECT * FROM payments WHERE id = ANY($1)', [paymentIds]);
    if (payRes.rowCount === 0) {
      return res.status(404).json({ error: 'No matching payment records found' });
    }

    const isTest = req.headers['x-test-request'] === 'true';

    for (const payment of payRes.rows) {
      const transitionToPaid = (payment.status === 'unpaid');
      
      await db.query(
        `UPDATE payments 
         SET status = 'paid', payment_method = 'gateway_online', notes = $1, paid_at = $2 
         WHERE id = $3`,
        [`Razorpay Pay ID: ${razorpay_payment_id} | Order ID: ${razorpay_order_id} (Bulk)`, new Date().toISOString(), payment.id]
      );

      if (transitionToPaid) {
        const memberRes = await db.query('SELECT * FROM members WHERE id = $1', [payment.member_id]);
        const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [payment.group_id]);

        if (memberRes.rowCount > 0 && groupRes.rowCount > 0) {
          const m = memberRes.rows[0];
          const g = groupRes.rows[0];
          
          const successMsg = getNotificationMessage('confirmation', m.name, m.language, {
            groupName: g.name,
            month: payment.month_number,
            amount: payment.amount_paid,
            method: `Razorpay Online (${razorpay_payment_id})`
          });
          
          const notifPromises = [];
          notifPromises.push(dispatchNotification(g.id, m, 'sms', successMsg, isTest));
          if (m.email) {
            notifPromises.push(dispatchNotification(g.id, m, 'email', successMsg, isTest));
          }
          await Promise.all(notifPromises);
        }
      }
    }

    res.json({ success: true, message: 'All payments verified and cleared!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ================= NOTIFICATIONS & REMINDERS =================

// Send payment reminders manually (Protected)
app.post('/api/groups/:id/remind', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const { monthNumber } = req.body;

  if (!monthNumber) {
    return res.status(400).json({ error: 'Month number is required' });
  }

  try {
    const groupRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (groupRes.rowCount === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const group = groupRes.rows[0];

    const unpaidPayments = await db.query(
      'SELECT * FROM payments WHERE group_id = $1 AND month_number = $2 AND status = $3',
      [groupId, Number(monthNumber), 'unpaid']
    );

    const membersRes = await db.query('SELECT * FROM members WHERE group_id = $1', [groupId]);

    let count = 0;
    const isTest = req.headers['x-test-request'] === 'true';
    const notifPromises = [];
    for (const pay of unpaidPayments.rows) {
      const m = membersRes.rows.find(item => item.id === pay.member_id);
      if (m) {
        const pastDuesRes = await db.query(
          `SELECT COALESCE(SUM(amount_paid), 0) as past_dues 
           FROM payments 
           WHERE group_id = $1 AND member_id = $2 AND month_number < $3 AND status = 'unpaid'`,
          [groupId, m.id, Number(monthNumber)]
        );
        const pastDues = Number(pastDuesRes.rows[0].past_dues);
        const totalOutstanding = Number(pay.amount_paid) + pastDues;

        const textMsg = getNotificationMessage('reminder', m.name, m.language, {
          groupName: group.name,
          month: monthNumber,
          amount: pay.amount_paid,
          pastDues,
          totalOutstanding
        });
        notifPromises.push(dispatchNotification(groupId, m, 'sms', textMsg, isTest));
        if (m.email) {
          notifPromises.push(dispatchNotification(groupId, m, 'email', textMsg, isTest));
        }
        count++;
      }
    }
    await Promise.all(notifPromises);

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch notifications log list
app.get('/api/notifications', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM notifications ORDER BY sent_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= SUPPORT QUERY PORTAL ROUTE =================

// Submit member query (Client)
app.post('/api/queries', async (req, res) => {
  const { groupId, memberId, message } = req.body;
  if (!groupId || !memberId || !message) {
    return res.status(400).json({ error: 'Group ID, Member ID and Message are required' });
  }
  try {
    const memberRes = await db.query('SELECT name FROM members WHERE id = $1', [memberId]);
    if (memberRes.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const memberName = memberRes.rows[0].name;
    const queryId = 'qur_' + crypto.randomUUID().substring(0, 8);
    await db.query(
      `INSERT INTO queries (id, group_id, member_id, member_name, message) VALUES ($1, $2, $3, $4, $5)`,
      [queryId, groupId, memberId, memberName, message.trim()]
    );
    res.status(201).json({ success: true, message: 'Query submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retrieve queries list for group (Owner - Protected)
app.get('/api/groups/:id/queries', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  try {
    const result = await db.query(
      'SELECT * FROM queries WHERE group_id = $1 ORDER BY created_at DESC',
      [groupId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reply to query (Owner - Protected)
app.put('/api/queries/:id/reply', authenticateToken, async (req, res) => {
  const queryId = req.params.id;
  const { reply } = req.body;
  if (!reply) {
    return res.status(400).json({ error: 'Reply text is required' });
  }
  try {
    await db.query(
      `UPDATE queries SET reply = $1, status = 'resolved' WHERE id = $2`,
      [reply.trim(), queryId]
    );
    res.json({ success: true, message: 'Reply sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retrieve member's submitted queries (Client)
app.get('/api/members/:memberId/queries', async (req, res) => {
  const memberId = req.params.memberId;
  try {
    const result = await db.query(
      'SELECT * FROM queries WHERE member_id = $1 ORDER BY created_at DESC',
      [memberId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug route to log client layout measurements
app.post('/api/debug-log', (req, res) => {
  console.log('--- DEBUG DOM LOG ---');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('---------------------');
  res.sendStatus(200);
});

// ================= START SERVER =================

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Chit Fund Management Server running on port ${PORT}`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`========================================`);
});
