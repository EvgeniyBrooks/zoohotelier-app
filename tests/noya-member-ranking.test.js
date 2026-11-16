'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {LAUNCH, membershipRanking} = require('../lib/noya-member-ranking.cjs');

const day = 86_400_000;
const date = offset => new Date(LAUNCH + offset * day).toISOString();
const payment = (student_id, offset, product_id = 'noya:' + student_id) =>
 ({student_id, product_id, paid_at: date(offset)});
const invite = (referred_student_id, offset) =>
 ({inviter_student_id: 'owner', referred_student_id, created_at: date(offset)});

test('the launch cutoff and paid coverage exclude partial days, gaps and overlaps', () => {
 const paid = [payment('owner', -5), payment('owner', 1, 'noya:other'), payment('owner', 40)];
 assert.equal(membershipRanking(paid, [], LAUNCH - 1).score('owner').points, 0);
 assert.equal(membershipRanking(paid, [], LAUNCH + day - 1).score('owner').points, 0);
 assert.equal(membershipRanking(paid, [], LAUNCH + 42 * day).score('owner').activeDays, 33);
});

test('each invited first payment from launch gives 30 points once', () => {
 const paid = [payment('old', -1), payment('new', 1), payment('late', 2),
  payment('old', 30), payment('new', 31), payment('future', 60)];
 const invites = [invite('old', -2), invite('new', 0), invite('new', 0),
  invite('late', 3), invite('future', 0), invite('trial', 0)];
 assert.deepEqual(membershipRanking(paid, invites, LAUNCH + 32 * day).score('owner'),
  {activeDays: 0, referrals: 1, points: 30});
});

test('an early renewal extends coverage and the earlier entrant wins a tie', () => {
 const paid = [payment('first', -3), payment('second', -2), payment('first', 20)];
 const before = membershipRanking(paid, [], LAUNCH + day);
 const tied = ['second', 'first'].map(id => ({id, ...before.score(id)}));
 assert.deepEqual(tied.sort(before.compare).map(row => row.id), ['first', 'second']);
 assert.equal(membershipRanking(paid, [], LAUNCH + 45 * day).score('first').activeDays, 45);
});
