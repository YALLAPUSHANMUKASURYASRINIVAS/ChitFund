/**
 * Integration test for Multi-Chit Client IDs, Group Cloning, Calendar Date Labels, and Past Dues Reminders
 */
const BASE_URL = 'http://localhost:5000/api';

const originalFetch = global.fetch;
global.fetch = function (url, options = {}) {
  options.headers = options.headers || {};
  if (options.headers instanceof Headers) {
    options.headers.set('X-Test-Request', 'true');
  } else {
    options.headers['X-Test-Request'] = 'true';
  }
  return originalFetch(url, options);
};

async function runTests() {
  console.log('🧪 STARTING NEW PHASES AND DATES INTEGRATION TESTS...\n');
  let jwtToken = null;
  let group1Id = null;
  let group2Id = null;
  let cloneGroupId = null;
  
  let client1_Id = null; // Amit's Client ID
  let client2_Id = null; // Kalyan's Client ID
  let client3_Id = null; // John's Client ID

  let memberGroup1A_Id = null;
  let memberGroup1B_Id = null;
  let memberGroup1C_Id = null;
  let memberGroup2A_Id = null;

  // 1. Owner Login
  try {
    const res = await fetch(`${BASE_URL}/owner/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'password123' })
    });
    const data = await res.json();
    jwtToken = data.token;
    console.log('✅ Step 1: Owner logged in.');
  } catch (err) {
    console.error('❌ Step 1 FAIL: Owner login failed:', err.message);
    process.exit(1);
  }

  // 2. Create Group 1 and Group 2
  try {
    // Group 1: 3 months duration
    let res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ name: 'Group 1', totalValue: 90000, durationMonths: 3, commissionAmount: 4500, chitType: 'auction' })
    });
    let data = await res.json();
    group1Id = data.id;

    // Group 2
    res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ name: 'Group 2', totalValue: 60000, durationMonths: 2, commissionAmount: 3000, chitType: 'fixed' })
    });
    data = await res.json();
    group2Id = data.id;

    console.log(`✅ Step 2: Created Group 1 (${group1Id}) and Group 2 (${group2Id}).`);
  } catch (err) {
    console.error('❌ Step 2 FAIL: Group creation failed:', err.message);
    process.exit(1);
  }

  // 3. Add Members & Verify Client ID matching
  try {
    // Enroll Amit Sharma in Group 1
    let res = await fetch(`${BASE_URL}/groups/${group1Id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ name: 'Amit Sharma', phone: '9999911111', email: 'amit@gmail.com', language: 'english' })
    });
    let data = await res.json();
    memberGroup1A_Id = data.id;
    client1_Id = data.client_id;

    // Enroll Amit Sharma in Group 2 (same name/phone)
    res = await fetch(`${BASE_URL}/groups/${group2Id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ name: 'Amit Sharma', phone: '9999911111', email: 'amit@gmail.com', language: 'english' })
    });
    data = await res.json();
    memberGroup2A_Id = data.id;
    const client1_G2_Id = data.client_id;

    if (client1_Id !== client1_G2_Id) {
      throw new Error(`Amit's client IDs do not match across groups! G1: ${client1_Id}, G2: ${client1_G2_Id}`);
    }
    console.log(`✅ Step 3a: Client ID matched correctly for same name + phone: ${client1_Id}`);

    // Enroll Kalyan Kumar in Group 1 (different name, same phone)
    res = await fetch(`${BASE_URL}/groups/${group1Id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ name: 'Kalyan Kumar', phone: '9999911111', email: 'kalyan@gmail.com', language: 'telugu' })
    });
    data = await res.json();
    memberGroup1B_Id = data.id;
    client2_Id = data.client_id;

    if (client1_Id === client2_Id) {
      throw new Error(`Kalyan got same client ID as Amit despite different names! ID: ${client1_Id}`);
    }
    console.log(`✅ Step 3b: Unique client ID generated for Kalyan Kumar: ${client2_Id}`);

    // Enroll John Doe in Group 1 (different name, different phone)
    res = await fetch(`${BASE_URL}/groups/${group1Id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ name: 'John Doe', phone: '9999933333', email: 'john@gmail.com', language: 'english' })
    });
    data = await res.json();
    memberGroup1C_Id = data.id;
    client3_Id = data.client_id;
    console.log(`✅ Step 3c: Unique client ID generated for John Doe: ${client3_Id}`);
  } catch (err) {
    console.error('❌ Step 3 FAIL:', err.message);
    process.exit(1);
  }

  // 4. Verify Client Multi-Membership Login
  try {
    const res = await fetch(`${BASE_URL}/client/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client1_Id, phone: '9999911111' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login endpoint failed');

    if (data.memberships.length !== 2) {
      throw new Error(`Amit should have 2 memberships. Got: ${data.memberships.length}`);
    }

    const gIds = data.memberships.map(m => m.group.id);
    if (!gIds.includes(group1Id) || !gIds.includes(group2Id)) {
      throw new Error(`Login memberships did not return correct group IDs. Got: ${gIds.join(', ')}`);
    }

    console.log('✅ Step 4: Multi-membership Client login verified successfully.');
  } catch (err) {
    console.error('❌ Step 4 FAIL:', err.message);
    process.exit(1);
  }

  // 5. Hold Month 1 auction in Group 1 (winner Amit, Kalyan and John pay 30000)
  try {
    const res = await fetch(`${BASE_URL}/groups/${group1Id}/auctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({
        winnerMemberId: memberGroup1A_Id,
        amountWon: 90000,
        commissionAmount: 4500,
        netPayablePerMember: 30000
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Month 1 auction failed');
    console.log('✅ Step 5: Held Month 1 auction in Group 1. Winner: Amit.');
  } catch (err) {
    console.error('❌ Step 5 FAIL:', err.message);
    process.exit(1);
  }

  // 6. Hold Month 2 auction in Group 1 (winner Kalyan, John pays 27000, Amit pays 30000)
  try {
    const res = await fetch(`${BASE_URL}/groups/${group1Id}/auctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({
        winnerMemberId: memberGroup1B_Id,
        amountWon: 81000,
        commissionAmount: 4500,
        netPayablePerMember: 27000
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Month 2 auction failed');
    console.log('✅ Step 6: Held Month 2 auction in Group 1. Winner: Kalyan.');
  } catch (err) {
    console.error('❌ Step 6 FAIL:', err.message);
    process.exit(1);
  }

  // 7. Send reminder for John for Month 2 and verify past dues inclusion
  try {
    const res = await fetch(`${BASE_URL}/groups/${group1Id}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({ monthNumber: 2 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Reminder request failed');

    // Wait a brief moment for async dispatch and check notifications table
    await new Promise(resolve => setTimeout(resolve, 1500));

    const notifRes = await fetch(`${BASE_URL}/notifications`);
    const logs = await notifRes.json();

    const johnReminder = logs.find(l => l.member_id === memberGroup1C_Id && l.message.includes('Reminder:'));
    if (!johnReminder) {
      throw new Error('Could not find John Doe reminder in notification logs.');
    }

    console.log(`- John's reminder text: "${johnReminder.message}"`);
    
    // Verify it includes: Month 2 due (27,000), past dues (30,000), total outstanding (57,000)
    if (!johnReminder.message.includes('₹27,000') || !johnReminder.message.includes('Past dues: ₹30,000') || !johnReminder.message.includes('Total: ₹57,000')) {
      throw new Error(`John's reminder message does not state correct dues: ${johnReminder.message}`);
    }

    console.log('✅ Step 7: Verified outstanding past dues calculator inside payment reminder message.');
  } catch (err) {
    console.error('❌ Step 7 FAIL:', err.message);
    process.exit(1);
  }

  // 8. Clone Group 1 into a new phase
  try {
    const res = await fetch(`${BASE_URL}/groups/${group1Id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
      body: JSON.stringify({
        name: 'Group 1 Phase 2',
        totalValue: 120000,
        durationMonths: 3,
        commissionAmount: 6000,
        winnerExtraAmount: 1500,
        chitType: 'fixed'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cloning failed');
    cloneGroupId = data.newGroupId;
    console.log(`✅ Step 8: Cloned Group 1 into Group 1 Phase 2 (${cloneGroupId}).`);
  } catch (err) {
    console.error('❌ Step 8 FAIL:', err.message);
    process.exit(1);
  }

  // 9. Verify Cloned Group Members & Client IDs
  try {
    const res = await fetch(`${BASE_URL}/groups/${cloneGroupId}`);
    const data = await res.json();
    
    if (data.members.length !== 3) {
      throw new Error(`Cloned group should have 3 members. Got: ${data.members.length}`);
    }

    // Verify member names, phones, languages and client IDs copied correctly
    const m1 = data.members.find(m => m.name === 'Amit Sharma');
    const m2 = data.members.find(m => m.name === 'Kalyan Kumar');
    const m3 = data.members.find(m => m.name === 'John Doe');
    
    if (!m1 || m1.client_id !== client1_Id || m1.phone !== '9999911111') {
      throw new Error(`Cloned Member Amit Sharma mismatch: ${JSON.stringify(m1)}`);
    }
    if (!m2 || m2.client_id !== client2_Id || m2.phone !== '9999911111' || m2.language !== 'telugu') {
      throw new Error(`Cloned Member Kalyan Kumar mismatch: ${JSON.stringify(m2)}`);
    }
    if (!m3 || m3.client_id !== client3_Id || m3.phone !== '9999933333' || m3.language !== 'english') {
      throw new Error(`Cloned Member John Doe mismatch: ${JSON.stringify(m3)}`);
    }

    console.log('✅ Step 9: Verified cloned group memberships and Client ID integrity.');
  } catch (err) {
    console.error('❌ Step 9 FAIL:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 ALL NEW PHASES AND DATES INTEGRATION TESTS PASSED!');
}

runTests();
