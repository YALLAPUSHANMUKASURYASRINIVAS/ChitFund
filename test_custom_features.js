/**
 * Integration test for Custom Auction Inputs & Localized Multilingual Notifications
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

async function testCustomFeatures() {
  console.log('🧪 STARTING CUSTOM FEATURES INTEGRATION TESTS...\n');
  let jwtToken = null;
  let groupId = null;
  let memberHindiId = null;
  let memberTeluguId = null;
  let memberEnglishId = null;

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

  // 2. Create Group (Duration 3 months/members)
  try {
    const res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Custom Feature Group',
        totalValue: 90000,
        durationMonths: 3,
        commissionAmount: 4500,
        chitType: 'auction'
      })
    });
    const data = await res.json();
    groupId = data.id;
    console.log(`✅ Step 2: Created group ${groupId} (Duration: 3 months).`);
  } catch (err) {
    console.error('❌ Step 2 FAIL: Group creation failed:', err.message);
    process.exit(1);
  }

  // 3. Add Hindi Member
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Amit Sharma',
        phone: '9845012341',
        email: 'amit@gmail.com',
        language: 'hindi'
      })
    });
    const data = await res.json();
    memberHindiId = data.id;
    console.log(`✅ Step 3: Added Hindi member Amit Sharma (ID: ${memberHindiId}).`);
  } catch (err) {
    console.error('❌ Step 3 FAIL:', err.message);
    process.exit(1);
  }

  // 4. Add Telugu Member
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Kalyan Kumar',
        phone: '9845012342',
        email: 'kalyan@gmail.com',
        language: 'telugu'
      })
    });
    const data = await res.json();
    memberTeluguId = data.id;
    console.log(`✅ Step 4: Added Telugu member Kalyan Kumar (ID: ${memberTeluguId}).`);
  } catch (err) {
    console.error('❌ Step 4 FAIL:', err.message);
    process.exit(1);
  }

  // 5. Add English Member via bulk
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/members/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        members: [
          { name: 'John Doe', phone: '9845012343', email: 'john@gmail.com', language: 'english' }
        ]
      })
    });
    const data = await res.json();
    memberEnglishId = data.members[0].id;
    console.log(`✅ Step 5: Added English member John Doe via bulk (ID: ${memberEnglishId}).`);
  } catch (err) {
    console.error('❌ Step 5 FAIL:', err.message);
    process.exit(1);
  }

  // 6. Verify Invitation Notifications translation (Skipped - Automatic notifications disabled)
  /*
  try {
    console.log('⏳ Waiting 2.5 seconds for async notifications dispatch to complete...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    const res = await fetch(`${BASE_URL}/notifications`);
    const logs = await res.json();
    
    // Find Amit's invitation (Hindi)
    const amitSMS = logs.find(l => l.member_id === memberHindiId && l.type === 'sms');
    if (!amitSMS || !amitSMS.message.includes('नमस्ते Amit Sharma')) {
      throw new Error('Hindi invitation notification mismatch: ' + (amitSMS ? amitSMS.message : 'Not found'));
    }
    console.log('✅ Step 6a: Hindi Invitation template verified.');

    // Find Kalyan's invitation (Telugu)
    const kalyanSMS = logs.find(l => l.member_id === memberTeluguId && l.type === 'sms');
    if (!kalyanSMS || !kalyanSMS.message.includes('నమస్కారం Kalyan Kumar')) {
      throw new Error('Telugu invitation notification mismatch: ' + (kalyanSMS ? kalyanSMS.message : 'Not found'));
    }
    console.log('✅ Step 6b: Telugu Invitation template verified.');

    // Find John's invitation (English)
    const johnSMS = logs.find(l => l.member_id === memberEnglishId && l.type === 'sms');
    if (!johnSMS || !johnSMS.message.includes('Hello John Doe')) {
      throw new Error('English invitation notification mismatch: ' + (johnSMS ? johnSMS.message : 'Not found'));
    }
    console.log('✅ Step 6c: English Invitation template verified.');
  } catch (err) {
    console.error('❌ Step 6 FAIL:', err.message);
    process.exit(1);
  }
  */

  // 7. Hold Auction with Owner-decided Custom Amounts
  // NetPayable = 28000, AmountWon = 90000, Commission = 4500. Winner is Amit Sharma (Hindi)
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        winnerMemberId: memberHindiId,
        netPayablePerMember: 28000,
        amountWon: 90000,
        commissionAmount: 4500
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to hold auction');
    console.log('✅ Step 7: Auction held with custom owner options (Winner: Amit Sharma).');
  } catch (err) {
    console.error('❌ Step 7 FAIL:', err.message);
    process.exit(1);
  }

  // 8. Verify Payments generated in DB
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`);
    const data = await res.json();
    
    // Find winner's payment record (should be 28000, status paid)
    const winnerPay = data.payments.find(p => p.member_id === memberHindiId);
    if (!winnerPay || Number(winnerPay.amount_paid) !== 28000 || winnerPay.status !== 'paid' || winnerPay.payment_method !== 'winner_exemption') {
      throw new Error('Winner exemption payment mismatch: ' + JSON.stringify(winnerPay));
    }
    console.log('✅ Step 8a: Winner dues exemption verified (Amount: ₹28,000, Status: paid).');

    // Find non-winner's payment record (should be 28000, status unpaid)
    const teluguPay = data.payments.find(p => p.member_id === memberTeluguId);
    if (!teluguPay || Number(teluguPay.amount_paid) !== 28000 || teluguPay.status !== 'unpaid') {
      throw new Error('Non-winner payable payment mismatch: ' + JSON.stringify(teluguPay));
    }
    console.log('✅ Step 8b: Non-winner payable installment verified (Amount: ₹28,000, Status: unpaid).');
  } catch (err) {
    console.error('❌ Step 8 FAIL:', err.message);
    process.exit(1);
  }

  // 9. Verify Auction winner and billing notifications
  try {
    console.log('⏳ Waiting 2.5 seconds for async notifications dispatch to complete...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    const res = await fetch(`${BASE_URL}/notifications`);
    const logs = await res.json();

    // Amit Sharma (winner - Hindi) should receive winner notification
    const amitWinnerLog = logs.find(l => l.member_id === memberHindiId && l.message.includes('विजेता'));
    if (!amitWinnerLog || !amitWinnerLog.message.includes('शुद्ध भुगतान: ₹57,500')) {
      throw new Error('Hindi winner notification mismatch: ' + (amitWinnerLog ? amitWinnerLog.message : 'Not found'));
    }
    console.log('✅ Step 9a: Hindi Winner payout notification verified (Net: ₹57,500).');
  } catch (err) {
    console.error('❌ Step 9 FAIL:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 ALL CUSTOM FEATURE INTEGRATION TESTS PASSED!');
}

testCustomFeatures();
