'use strict';

const DAY = 86_400_000;
const PAID_PERIOD = 30 * DAY;
const LAUNCH = Date.parse('2026-12-12T00:00:00+03:00');

function membershipRanking(payments, attributions, now) {
 const subscriptions = new Map();
 // Receipts arrive in paid_at order. Early renewals extend the current period.
 for (const payment of payments) {
  const paidAt = Date.parse(payment.paid_at);
  if (!payment.student_id || !Number.isFinite(paidAt) || paidAt > now) continue;
  const profiles = subscriptions.get(payment.student_id) || new Map();
  const history = profiles.get(payment.product_id) || [];
  const last = history.at(-1);
  if (last && paidAt <= last.end) last.end += PAID_PERIOD;
  else history.push({start: paidAt, end: paidAt + PAID_PERIOD});
  profiles.set(payment.product_id, history);
  subscriptions.set(payment.student_id, profiles);
 }

 const periods = new Map();
 for (const [id, profiles] of subscriptions) {
  const merged = [];
  for (const period of [...profiles.values()].flat().sort((a, b) => a.start - b.start)) {
   const last = merged.at(-1);
   if (last && period.start <= last.end) last.end = Math.max(last.end, period.end);
   else merged.push({...period});
  }
  periods.set(id, merged);
 }

 const referrals = new Map();
 for (const attribution of attributions) {
  const {inviter_student_id: inviter, referred_student_id: referred} = attribution;
  const firstPayment = periods.get(referred)?.[0]?.start;
  if (!inviter || inviter === referred || firstPayment === undefined || firstPayment < LAUNCH
      || !(Date.parse(attribution.created_at) <= firstPayment)) continue;
  const invited = referrals.get(inviter) || new Set();
  invited.add(referred);
  referrals.set(inviter, invited);
 }

 return {
  score(id) {
   const history = periods.get(id) || [];
   const duration = history.reduce((total, {start, end}) =>
    total + Math.max(0, Math.min(end, now) - Math.max(start, LAUNCH)), 0);
   const activeDays = Math.floor(duration / DAY);
   const referred = referrals.get(id)?.size || 0;
   return {activeDays, referrals: referred, points: activeDays + 30 * referred};
  },
  compare(a, b) {
   return b.points - a.points
    || (periods.get(a.id)?.[0]?.start ?? Infinity) - (periods.get(b.id)?.[0]?.start ?? Infinity)
    || a.id.localeCompare(b.id);
  }
 };
}

module.exports = {LAUNCH, membershipRanking};
