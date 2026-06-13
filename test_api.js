/**
 * Automated API integration test script for ChitLite
 * Runs native fetch requests against the local server (Port 5000)
 */

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 STARTING CHITLITE API INTEGRATION TESTS...\n');
  let jwtToken = null;
  let testGroupId = null;
  let testMemberId = null;
  let testClientId = null;

  // 1. Test Server Ping
  try {
    const res = await fetch('http://localhost:5000');
    if (res.ok) {
      console.log('✅ Step 1: Local server is UP and running on http://localhost:5000');
    } else {
      throw new Error();
    }
  } catch (err) {
    console.error('❌ Step 1 FAIL: Server is not running! Make sure to run "node server.js" first.');
    process.exit(1);
  }

  // 2. Test Owner Login
  try {
    const res = await fetch(`${BASE_URL}/owner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'password123' })
    });
    const data = await res.json();
    if (res.ok && data.success && data.token) {
      jwtToken = data.token;
      console.log('✅ Step 2: Owner login successful. JWT Token retrieved.');
    } else {
      throw new Error(data.error || 'Invalid credentials');
    }
  } catch (err) {
    console.error('❌ Step 2 FAIL: Owner login failed:', err.message);
    process.exit(1);
  }

  // 3. Test Create Group
  try {
    const res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Automated Test Group',
        totalValue: 100000,
        durationMonths: 5,
        commissionAmount: 5000,
        chitType: 'auction'
      })
    });
    const data = await res.json();
    if (res.ok && data.id) {
      testGroupId = data.id;
      console.log(`✅ Step 3: Created test group successfully. ID: ${testGroupId}`);
    } else {
      throw new Error(data.error || 'Group insertion failed');
    }
  } catch (err) {
    console.error('❌ Step 3 FAIL: Group creation failed:', err.message);
    process.exit(1);
  }

  // 4. Test Add Member manually
  try {
    const res = await fetch(`${BASE_URL}/groups/${testGroupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Test Ramesh',
        phone: '9845012345',
        email: 'ramesh.test@gmail.com'
      })
    });
    const data = await res.json();
    if (res.ok && data.id) {
      testMemberId = data.id;
      testClientId = data.client_id;
      console.log(`✅ Step 4: Enrolled member manually. Member ID: ${testMemberId}`);
    } else {
      throw new Error(data.error || 'Member insertion failed');
    }
  } catch (err) {
    console.error('❌ Step 4 FAIL: Adding member failed:', err.message);
    process.exit(1);
  }

  // 5. Test Client Login
  try {
    const res = await fetch(`${BASE_URL}/client/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: testClientId,
        phone: '9845012345'
      })
    });
    const data = await res.json();
    if (res.ok && data.success && data.memberships[0].member.id === testMemberId) {
      console.log('✅ Step 5: Client dashboard login verified successfully using Client ID + Phone.');
    } else {
      throw new Error(data.error || 'Verification mismatch');
    }
  } catch (err) {
    console.error('❌ Step 5 FAIL: Client login test failed:', err.message);
    process.exit(1);
  }

  // 6. Test Fetch Notification Log
  try {
    const res = await fetch(`${BASE_URL}/notifications`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      console.log(`✅ Step 6: Fetch notification logs verified. Retrieved ${data.length} entries.`);
    } else {
      throw new Error('Invalid log format');
    }
  } catch (err) {
    console.error('❌ Step 6 FAIL: Fetching notifications failed:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 ALL API TESTS PASSED SUCCESSFULLY! The server is fully operational.');
}

runTests();
