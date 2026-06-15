# ChitLite - Interview Coding Guide

This document contains coding challenges and interview questions inspired by the ChitLite codebase. They cover financial math, multi-group consolidation, database transaction logic, and algorithms.

---

## Question 1: Chit Fund Auction Dividend Calculator

### Problem Statement
In a chit fund group with $N$ members and a total fund value $V$ (e.g. ₹300,000), an auction is held monthly. The organizer takes a commission of $C\%$ (e.g. 5%) of the total fund value.
Members place bids for the "discount" $D$ they are willing to give up to receive the cash immediately. The highest bid discount wins.
The discount amount remaining after deducting the organizer's commission is distributed equally among all $N$ members as a dividend.

Write a function `calculate_monthly_dividend(total_value, num_members, commission_percent, bid_discount)` that returns a dictionary containing:
1. `organizer_commission_value`: The flat fee the organizer takes.
2. `amount_won`: The gross amount the winning member won (Total Value - Bid Discount).
3. `dividend_per_member`: The dividend distributed to each member.
4. `net_monthly_due_per_member`: The actual cash installment amount each member has to contribute for that month.

### JavaScript Solution
```javascript
function calculateMonthlyDividend(totalValue, numMembers, commissionPercent, bidDiscount) {
  // 1. Calculate Organizer Commission
  const organizerCommissionValue = totalValue * (commissionPercent / 100);

  // 2. Calculate Gross Amount Won by Bidder
  const amountWon = totalValue - bidDiscount;

  // 3. Calculate Dividend Pool
  const dividendPool = bidDiscount - organizerCommissionValue;

  // 4. Calculate Dividend Per Member
  const dividendPerMember = dividendPool > 0 ? (dividendPool / numMembers) : 0;

  // 5. Calculate Net Due per member for the month
  const baseInstallment = totalValue / numMembers;
  const netMonthlyDuePerMember = baseInstallment - dividendPerMember;

  return {
    organizer_commission_value: organizerCommissionValue,
    amount_won: amountWon,
    dividend_per_member: Math.max(0, dividendPerMember),
    net_monthly_due_per_member: Math.max(0, netMonthlyDuePerMember)
  };
}

// Example usage:
// calculateMonthlyDividend(300000, 30, 5, 60000);
// Returns: { organizer_commission_value: 15000, amount_won: 240000, dividend_per_member: 1500, net_monthly_due_per_member: 8500 }
```

### Complexity
* **Time Complexity**: $O(1)$ - Only basic arithmetic operations.
* **Space Complexity**: $O(1)$ - No dynamic memory allocation.

---

## Question 2: Net Winner Payout & Backward Dues Deduction

### Problem Statement
A customer is enrolled in multiple chit groups. In Group A, the customer wins the auction and is entitled to a gross payout of $W$. However, the customer has unpaid dues across other groups.

Write a function `settleDuesAndPayout(grossWinnerPayout, unpaidDuesList)` that:
1. Deducts outstanding dues from the gross payout.
2. Marks the dues as paid in order (oldest first) until the gross payout runs out or all dues are cleared.
3. Returns the remaining net payout to be handed to the winner, and a list of updated dues with their status.

Each due in `unpaidDuesList` is represented as an object: `{ dueId: string, groupName: string, amount: number, createdDate: string }`.

### JavaScript Solution
```javascript
function settleDuesAndPayout(grossWinnerPayout, unpaidDuesList) {
  // Sort unpaid dues by date ascending (oldest dues first)
  const sortedDues = [...unpaidDuesList].sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate));

  let remainingPayout = grossWinnerPayout;
  const settledDues = [];

  for (const due of sortedDues) {
    if (remainingPayout >= due.amount) {
      // Payout is enough to cover the entire due
      remainingPayout -= due.amount;
      settledDues.push({
        ...due,
        status: 'paid',
        amountPaid: due.amount,
        deductedFromPayout: true
      });
    } else if (remainingPayout > 0) {
      // Payout can only cover a portion of the due
      const amountPaid = remainingPayout;
      remainingPayout = 0;
      settledDues.push({
        ...due,
        status: 'partially_paid',
        amountPaid: amountPaid,
        deductedFromPayout: true
      });
    } else {
      // Payout is fully exhausted
      settledDues.push({
        ...due,
        status: 'unpaid',
        amountPaid: 0,
        deductedFromPayout: false
      });
    }
  }

  return {
    netReceivablePayout: remainingPayout,
    settledDuesList: settledDues
  };
}

// Example usage:
/*
const dues = [
  { dueId: 'D1', groupName: 'Group A', amount: 5000, createdDate: '2026-05-10' },
  { dueId: 'D2', groupName: 'Group B', amount: 8000, createdDate: '2026-04-15' } // Oldest
];
settleDuesAndPayout(10000, dues);
// Returns:
// {
//   netReceivablePayout: 0,
//   settledDuesList: [
//     { dueId: 'D2', ..., status: 'paid', amountPaid: 8000 },
//     { dueId: 'D1', ..., status: 'partially_paid', amountPaid: 2000 }
//   ]
// }
*/
```

### Complexity
* **Time Complexity**: $O(K \log K)$ where $K$ is the number of unpaid dues (dominated by the sorting step).
* **Space Complexity**: $O(K)$ to store and return the list of settled records.

---

## Question 3: Database Transactions (ACID) in Node pg

### Problem Statement
Explain why database transactions are necessary when implementing a chit fund dues checkout. Write a code snippet showing how you would execute a safe database transaction in Node.js using the `pg` library pool client to clear outstanding dues.

### Interview Explanation (ACID)
In a dues checkout system, multiple database updates must happen atomically:
1. Create a payment record (marked as `paid`).
2. Deduct the user's outstanding balance.
3. Update group stats.

If step 1 succeeds but the server crashes before step 2, the customer will have paid money but their outstanding dues will still show as unpaid (Inconsistency). A database **Transaction** ensures that either all operations succeed, or they all roll back (Atomicity).

### JavaScript Implementation
```javascript
const { Pool } = require('pg');
const pool = new Pool();

async function processPaymentTransaction(memberId, paymentId, amount, transactionId) {
  const client = await pool.connect();

  try {
    // Start Transaction
    await client.query('BEGIN');

    // 1. Verify the payment is still unpaid
    const dueCheck = await client.query(
      'SELECT status, amount_due FROM payments WHERE id = $1 FOR UPDATE', 
      [paymentId]
    );
    
    if (dueCheck.rows.length === 0) {
      throw new Error('Payment record not found.');
    }
    if (dueCheck.rows[0].status === 'paid') {
      throw new Error('Payment has already been cleared.');
    }

    // 2. Perform the payment update
    await client.query(
      `UPDATE payments 
       SET status = 'paid', payment_method = 'razorpay', transaction_id = $2, paid_at = NOW() 
       WHERE id = $1`,
      [paymentId, transactionId]
    );

    // 3. Log a notification alert entry
    await client.query(
      `INSERT INTO notifications (id, member_id, type, status, message) 
       VALUES ($1, $2, 'email', 'pending', $3)`,
      [generateUuid(), memberId, `Payment of ${amount} confirmed.`]
    );

    // Commit Transaction if all queries succeeded
    await client.query('COMMIT');
    return { success: true };

  } catch (err) {
    // Rollback changes if any error occurs
    await client.query('ROLLBACK');
    console.error('Transaction rolled back due to error:', err.message);
    throw err;
  } finally {
    // Release client back to the pool
    client.release();
  }
}
```
---
