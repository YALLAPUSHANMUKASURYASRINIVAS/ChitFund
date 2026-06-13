/**
 * Integration test for Past Winner Extra Dues, Member Profile Editing, and Support Query Portal
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
  console.log('🧪 STARTING INTEGRATION TESTS FOR PREMIUM DUES AND SUPPORT QUERIES...\n');
  let jwtToken = null;
  let groupId = null;
  let memberA_Id = null;
  let memberB_Id = null;
  let memberC_Id = null;
  let queryId = null;

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

  // 2. Create Group with winnerExtraAmount = 1000
  try {
    const res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Premium Test Group',
        totalValue: 90000,
        durationMonths: 3,
        commissionAmount: 4500,
        chitType: 'auction',
        winnerExtraAmount: 1000
      })
    });
    const data = await res.json();
    groupId = data.id;
    console.log(`✅ Step 2: Created group ${groupId} with winnerExtraAmount = 1000.`);
  } catch (err) {
    console.error('❌ Step 2 FAIL: Group creation failed:', err.message);
    process.exit(1);
  }

  // 3. Add Members
  try {
    // Add A
    let res = await fetch(`${BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ name: 'Amit Sharma', phone: '9000011111', email: 'amit@gmail.com', language: 'hindi' })
    });
    let data = await res.json();
    memberA_Id = data.id;

    // Add B
    res = await fetch(`${BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ name: 'Kalyan Kumar', phone: '9000022222', email: 'kalyan@gmail.com', language: 'telugu' })
    });
    data = await res.json();
    memberB_Id = data.id;

    // Add C
    res = await fetch(`${BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ name: 'John Doe', phone: '9000033333', email: 'john@gmail.com', language: 'english' })
    });
    data = await res.json();
    memberC_Id = data.id;

    console.log('✅ Step 3: Added 3 members (Amit, Kalyan, John).');
  } catch (err) {
    console.error('❌ Step 3 FAIL: Adding members failed:', err.message);
    process.exit(1);
  }

  // 4. Hold Month 1 auction. Winner is Amit (memberA_Id) with amountWon = 75000
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        winnerMemberId: memberA_Id,
        amountWon: 75000,
        commissionAmount: 4500,
        netPayablePerMember: 25000 // (75000 / 3)
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Auction failed');
    console.log('✅ Step 4: Held Month 1 auction. Winner: Amit Sharma.');
  } catch (err) {
    console.error('❌ Step 4 FAIL: Month 1 auction failed:', err.message);
    process.exit(1);
  }

  // 5. Verify Month 1 Payments
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`);
    const data = await res.json();
    const payments = data.payments.filter(p => p.month_number === 1);

    const payA = payments.find(p => p.member_id === memberA_Id);
    const payB = payments.find(p => p.member_id === memberB_Id);
    const payC = payments.find(p => p.member_id === memberC_Id);

    if (Number(payA.amount_paid) !== 25000 || payA.status !== 'paid') {
      throw new Error(`Winner Amit should have 25000 dues and status paid. Got: ${payA.amount_paid}, ${payA.status}`);
    }
    if (Number(payB.amount_paid) !== 25000 || payB.status !== 'unpaid') {
      throw new Error(`Non-winner Kalyan should pay 25000. Got: ${payB.amount_paid}, ${payB.status}`);
    }
    if (Number(payC.amount_paid) !== 25000 || payC.status !== 'unpaid') {
      throw new Error(`Non-winner John should pay 25000. Got: ${payC.amount_paid}, ${payC.status}`);
    }

    console.log('✅ Step 5: Verified Month 1 payments successfully.');
  } catch (err) {
    console.error('❌ Step 5 FAIL:', err.message);
    process.exit(1);
  }

  // 6. Hold Month 2 auction. Winner is Kalyan (memberB_Id) with amountWon = 81000
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        winnerMemberId: memberB_Id,
        amountWon: 81000,
        commissionAmount: 4500,
        netPayablePerMember: 27000 // (81000 / 3)
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Auction failed');
    console.log('✅ Step 6: Held Month 2 auction. Winner: Kalyan Kumar.');
  } catch (err) {
    console.error('❌ Step 6 FAIL: Month 2 auction failed:', err.message);
    process.exit(1);
  }

  // 7. Verify Month 2 Payments (Kalyan pays 0, Amit pays 30000 + 1000 = 31000, John pays 27000)
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`);
    const data = await res.json();
    const payments = data.payments.filter(p => p.month_number === 2);

    const payA = payments.find(p => p.member_id === memberA_Id);
    const payB = payments.find(p => p.member_id === memberB_Id);
    const payC = payments.find(p => p.member_id === memberC_Id);

    if (Number(payB.amount_paid) !== 27000 || payB.status !== 'paid') {
      throw new Error(`Winner Kalyan should have 27000 dues and status paid. Got: ${payB.amount_paid}, ${payB.status}`);
    }
    // Amit is past winner. Pays totalValue/N + winnerExtraAmount = 90000/3 + 1000 = 31000
    if (Number(payA.amount_paid) !== 31000 || payA.status !== 'unpaid') {
      throw new Error(`Past winner Amit should pay premium 31000. Got: ${payA.amount_paid}, ${payA.status}`);
    }
    // John is non-winner. Pays 81000/3 = 27000
    if (Number(payC.amount_paid) !== 27000 || payC.status !== 'unpaid') {
      throw new Error(`Non-winner John should pay 27000. Got: ${payC.amount_paid}, ${payC.status}`);
    }

    console.log('✅ Step 7: Verified Month 2 premium payments successfully.');
  } catch (err) {
    console.error('❌ Step 7 FAIL:', err.message);
    process.exit(1);
  }

  // 8. Edit Member details: Change Kalyan Kumar (memberB_Id) to Kalyan Reddy, phone 9000022999
  try {
    const res = await fetch(`${BASE_URL}/members/${memberB_Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Kalyan Reddy',
        phone: '9000022999',
        email: 'kalyan.reddy@gmail.com',
        language: 'telugu'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to edit member');
    console.log('✅ Step 8: Updated Kalyan Kumar to Kalyan Reddy.');
  } catch (err) {
    console.error('❌ Step 8 FAIL:', err.message);
    process.exit(1);
  }

  // 9. Verify edited member details in group payload & payments update
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`);
    const data = await res.json();
    const updatedB = data.members.find(m => m.id === memberB_Id);
    
    if (updatedB.name !== 'Kalyan Reddy' || updatedB.phone !== '9000022999' || updatedB.email !== 'kalyan.reddy@gmail.com') {
      throw new Error(`Member B details not updated correctly: ${JSON.stringify(updatedB)}`);
    }

    // Verify payments table member_name updated
    const paymentsB = data.payments.filter(p => p.member_id === memberB_Id);
    paymentsB.forEach(p => {
      if (p.member_name !== 'Kalyan Reddy') {
        throw new Error(`Payment record member_name was not updated to Kalyan Reddy: ${JSON.stringify(p)}`);
      }
    });

    console.log('✅ Step 9: Verified edited member details and matching payments update.');
  } catch (err) {
    console.error('❌ Step 9 FAIL:', err.message);
    process.exit(1);
  }

  // 10. Submit support query from Kalyan Reddy (memberB_Id)
  try {
    const res = await fetch(`${BASE_URL}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        memberId: memberB_Id,
        message: 'Hello Owner, please check if you can receive my GPay reference number 1234.'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Query submit failed');
    console.log('✅ Step 10: Submitted support query from client Kalyan Reddy.');
  } catch (err) {
    console.error('❌ Step 10 FAIL:', err.message);
    process.exit(1);
  }

  // 11. Retrieve queries as Owner, find B's query and Reply to it
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/queries`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    });
    const queries = await res.json();
    const qB = queries.find(q => q.member_id === memberB_Id);
    if (!qB) throw new Error('Query not found in group inquiries');
    queryId = qB.id;

    // Send reply
    const replyRes = await fetch(`${BASE_URL}/queries/${queryId}/reply`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({ reply: 'Yes, I received your payment. Updated!' })
    });
    const replyData = await replyRes.json();
    if (!replyRes.ok) throw new Error(replyData.error || 'Failed to reply');
    console.log('✅ Step 11: Owner replied to the support query.');
  } catch (err) {
    console.error('❌ Step 11 FAIL:', err.message);
    process.exit(1);
  }

  // 12. Retrieve queries as Client Kalyan Reddy and verify status resolved and reply text
  try {
    const res = await fetch(`${BASE_URL}/members/${memberB_Id}/queries`);
    const queries = await res.json();
    const qB = queries.find(q => q.id === queryId);

    if (!qB || qB.status !== 'resolved' || qB.reply !== 'Yes, I received your payment. Updated!') {
      throw new Error(`Query reply mismatch: ${JSON.stringify(qB)}`);
    }

    console.log('✅ Step 12: Verified Client-Owner Support Query Portal loop.');
  } catch (err) {
    console.error('❌ Step 12 FAIL:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 ALL PREMIUM AND SUPPORT QUERY INTEGRATION TESTS PASSED!');
}

runTests();
