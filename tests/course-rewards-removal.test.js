'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('course lesson page has homework instructions but no video submission button or crystal rewards',()=>{
 const html=read('index.html');
 assert.match(html,/📝 ДОМАШНЕЕ ЗАДАНИЕ/);
 assert.match(html,/escapeHtml\(lesson\.homework/);
 assert.doesNotMatch(html,/Отправить выполнение|Отправить видео|Здесь позже появится отправка выполнения кинологу/);
 assert.doesNotMatch(html,/crystal_reward|кристалл|💎 НАГРАДА/);
});

test('course lesson API never advertises crystal awards',()=>{
 const api=read('api/stream-token.js');
 assert.match(api,/course_lesson_details/);
 assert.doesNotMatch(api,/crystal_reward/);
 assert.match(api,/course_complete/);
});

test('completed lessons can still track progress but no longer advertise NOINCOINS',()=>{
 const shop=read('shop.html');
 const api=read('api/club-shop.js');
 const course=read('index.html');
 assert.doesNotMatch(shop,/\+25 за каждый завершённый урок/);
 assert.doesNotMatch(api,/Подтверждённое прохождение урока|Завершённый урок',coins:25/);
 assert.match(shop,/500 за каждую полную оплату друга/);
 assert.match(api,/Каждая подтверждённая оплата приглашённого друга/);
 assert.match(course,/course_complete/);
 assert.match(course,/Отметить урок пройденным/);
});

test('legacy course Students and Cohorts administrator dashboard is removed from course UI',()=>{
 const page=read('index.html');
 assert.doesNotMatch(page,/👨‍💼 Админка|Панель администратора|👥 Ученики|📚 Потоки/);
 assert.doesNotMatch(page,/onclick="loadAdmin\(\)"/);
 assert.match(page,/async function loadAdmin\(\) \{\s*await loadCourse\(\);/);
 assert.match(page,/УПРАВЛЕНИЕ ВНИМАНИЕМ/);
});
