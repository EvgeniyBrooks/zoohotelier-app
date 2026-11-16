'use strict';

const PERIOD = 30 * 86_400_000;

function paidGiftProgress(payments, subscriptionId, subscriptionStart, now) {
 const receipts = new Map();
 if (subscriptionId && Number.isFinite(subscriptionStart)) {
  for (const row of payments) {
   const paidAt = Date.parse(row.paid_at);
   const id = row.prodamus_payment_id;
   if (row.product_id !== 'noya:' + subscriptionId || row.status !== 'paid' ||
       row.currency !== 'RUB' || !(Number(row.amount) > 0) ||
       typeof id !== 'string' || !id.trim() || !Number.isFinite(paidAt) ||
       paidAt < subscriptionStart || paidAt > now) continue;
   if (!receipts.has(id)) receipts.set(id, paidAt);
  }
 }

 let start = null;
 let end = null;
 let paidMonths = 0;
 for (const paidAt of [...receipts.values()].sort((a, b) => a - b)) {
  if (end === null || paidAt > end) {
   start = paidAt;
   end = paidAt;
   paidMonths = 0;
  }
  paidMonths++;
  end += PERIOD;
 }

 const unlockedMonths = end > now
  ? Math.min(12, paidMonths - 1, Math.floor((now - start) / PERIOD))
  : 0;
 const next = unlockedMonths + 1;
 const nextUnlockAt = next <= 12 && paidMonths > next && end > now
  ? new Date(start + next * PERIOD).toISOString()
  : null;
 return {paidMonths, unlockedMonths, nextUnlockAt};
}

function giftPaymentsPath(studentId, subscriptionId) {
 return 'payments?select=prodamus_payment_id,paid_at,product_id,status,amount,currency'
  +'&student_id=eq.'+encodeURIComponent(studentId)
  +'&product_type=eq.club&product_id=eq.'+encodeURIComponent('noya:'+subscriptionId)
  +'&status=eq.paid&order=paid_at.asc,id.asc&limit=1000';
}

module.exports = {paidGiftProgress, giftPaymentsPath};
