/**
 * Integration test for Group Deletion and Cascading Cleanup
 */
const BASE_URL = 'http://localhost:5000/api';

async function testDeleteGroup() {
  console.log('🧪 STARTING GROUP DELETION INTEGRATION TESTS...\n');
  let jwtToken = null;
  let groupId = null;
  let memberId = null;

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
    console.error('❌ Step 1 FAIL:', err.message);
    process.exit(1);
  }

  // 2. Create Group
  try {
    const res = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Group to Delete',
        totalValue: 50000,
        durationMonths: 5,
        commissionAmount: 2500,
        chitType: 'auction'
      })
    });
    const data = await res.json();
    groupId = data.id;
    console.log(`✅ Step 2: Created group ${groupId}.`);
  } catch (err) {
    console.error('❌ Step 2 FAIL:', err.message);
    process.exit(1);
  }

  // 3. Add Member
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        name: 'Temporary Member',
        phone: '9845099999',
        email: 'temp@gmail.com',
        language: 'english'
      })
    });
    const data = await res.json();
    memberId = data.id;
    console.log(`✅ Step 3: Added temporary member (ID: ${memberId}).`);
  } catch (err) {
    console.error('❌ Step 3 FAIL:', err.message);
    process.exit(1);
  }

  // 4. Delete the Group
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete group');
    console.log('✅ Step 4: DELETE request to /api/groups/:id completed successfully.');
  } catch (err) {
    console.error('❌ Step 4 FAIL:', err.message);
    process.exit(1);
  }

  // 5. Verify 404 on group lookup
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`);
    if (res.status === 404) {
      console.log('✅ Step 5: Group lookup returned 404 (Not Found) as expected.');
    } else {
      throw new Error(`Expected 404 but got status ${res.status}`);
    }
  } catch (err) {
    console.error('❌ Step 5 FAIL:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 GROUP DELETION INTEGRATION TESTS PASSED!');
}

testDeleteGroup();
