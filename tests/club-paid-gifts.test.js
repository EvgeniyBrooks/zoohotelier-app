'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {paidGiftProgress} = require('../lib/club-paid-gifts');

const day = 86_400_000;
const start = Date.parse('2026-12-12T08:00:00Z');
const receipt = (number, days, extra={}) => ({
 prodamus_payment_id:String(number), paid_at:new Date(start+days*day).toISOString(),
 product_id:'noya:42', status:'paid', currency:'RUB', amount:2900, ...extra
});
const progress = (rows, days) => paidGiftProgress(rows,'42',start,start+days*day);

test('an early renewal opens the gift only after the first 30-day period',()=>{
 const rows=[receipt(1,0),receipt(2,29)];
 assert.deepEqual(progress(rows,29),{paidMonths:2,unlockedMonths:0,nextUnlockAt:'2027-01-11T08:00:00.000Z'});
 assert.equal(progress(rows,30).unlockedMonths,1);
 assert.equal(progress(rows.slice(0,1),30).unlockedMonths,0);
});

test('the twelfth gift requires the thirteenth payment and completion of period twelve',()=>{
 const rows=Array.from({length:13},(_,i)=>receipt(i+1,i===12?359:i*30));
 assert.equal(progress(rows,359).unlockedMonths,11);
 assert.equal(progress(rows.slice(0,12),360).unlockedMonths,0);
 assert.deepEqual(progress(rows,360),{paidMonths:13,unlockedMonths:12,nextUnlockAt:null});
});

test('duplicates, other products, unpaid and future charges cannot unlock a gift',()=>{
 const rows=[receipt(1,0),receipt(1,29),receipt(2,29,{status:'pending'}),
  receipt(3,29,{amount:0}),receipt(4,29,{product_id:'noya:other'}),receipt(5,31)];
 assert.equal(progress(rows,30).unlockedMonths,0);
 assert.equal(progress(rows,31).unlockedMonths,0);
});

test('a gap starts a new paid streak and touching periods remain continuous',()=>{
 const rows=[receipt(1,0),receipt(2,30),receipt(3,65),receipt(4,90)];
 assert.equal(progress(rows,30).unlockedMonths,1);
 assert.equal(progress(rows,94).unlockedMonths,0);
 assert.equal(progress(rows,95).unlockedMonths,1);
});
