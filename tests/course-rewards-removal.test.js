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
 assert.match(course,/Посмотри не менее 90% видео/);
 assert.doesNotMatch(course,/id="course-manual-complete"/);
});

test('legacy course Students and Cohorts administrator dashboard is removed from course UI',()=>{
 const page=read('index.html');
 assert.doesNotMatch(page,/👨‍💼 Админка|Панель администратора|👥 Ученики|📚 Потоки/);
 const home=page.slice(page.indexOf('async function loadCourse()'),page.indexOf('async function loadNews()'));
 assert.doesNotMatch(home,/onclick="loadAdmin\(\)"/);
 assert.match(page,/async function loadAdmin\(\) \{\s*await loadCourse\(\);/);
 assert.match(page,/УПРАВЛЕНИЕ ВНИМАНИЕМ/);
});

test('NOYA club Attention Management card is yellow, loads dynamic progress and deep-links to course',()=>{
 const html=read('club.html');
 assert.doesNotMatch(html,/Отдельный продукт/);
 assert.doesNotMatch(html,/<h2>МОЙ КУРС<\/h2>/);
 assert.match(html,/attention-course-card/);
 assert.match(html,/background:var\(--accent\);color:#111/);
 assert.match(html,/КУРС<br>УПРАВЛЕНИЕ ВНИМАНИЕМ/);
 assert.match(html,/id="attention-course-progress"[^>]*>— из —<\/span>/);
 assert.match(html,/href="\.\/index\.html">Перейти в курс/);
 assert.match(html,/action:'folder_summary',initData/);
 assert.match(html,/courseIndicator\.textContent=course\.watched\+' из '\+course\.total/);
 assert.match(html,/liveIndicator\.textContent='✓ '\+live\.watched\+' ИЗ '\+live\.total/);
});

test('NOYA club has one bottom navigation, without a duplicated sticky header menu',()=>{
 const page=read('club.html');
 assert.doesNotMatch(page,/club-quick-nav|Быстрый переход по разделам/);
 assert.match(page,/<nav class="bottom" aria-label="Основная навигация">/);
 assert.equal((page.match(/<nav class="bottom"/g)||[]).length,1);
 for(const name of ['Главная','Участники','Библиотека','Бонусы']){
  assert.match(page,new RegExp('>'+name+'<\\/span>'));
 }
 assert.match(page,/href="\.\/club-demo\.html"/);
 assert.match(page,/id="route"/);
 assert.match(page,/id="ai"/);
 assert.match(page,/id="attention-course-progress"[^>]*>— из —<\/span>/);
});

test('NOYA home starts with feature tiles then a single yellow course card without extra labels',()=>{
 const page=read('club.html');
 const home=page.slice(page.indexOf('<section id="home"'),page.indexOf('<section id="route"'));
 assert.doesNotMatch(home,/<h1 id="home-title">НАЧНИ ЗДЕСЬ<\/h1>/);
 assert.doesNotMatch(page,/<header class="top">|<div class="logo">NOYA CLUB<\/div>|<div class="by">by Brooks<\/div>/);
 assert.ok(home.indexOf('class="tiles"')<home.indexOf('class="attention-course-card"'));
 assert.equal((home.match(/class="attention-course-card"/g)||[]).length,1);
 assert.doesNotMatch(home,/ТВОЙ КУРС|ТВОЯ СОБАКА-КОМПАНЬОН|МАГАЗИН РАЗБОРОВ|Отдельный продукт/);
 assert.match(home,/КУРС<br>УПРАВЛЕНИЕ ВНИМАНИЕМ/);
 assert.match(home,/attention-course-count/);
 assert.match(page,/<nav class="bottom"/);
 assert.doesNotMatch(page,/trajectory-title|trajectory-action|trajectory-link/);
});

test('NOYA home places recordings into a standalone folder below Attention Management course',()=>{
 const club=read('club.html');
 const home=club.slice(club.indexOf('<section id="home"'),club.indexOf('<section id="route"'));
 const course=read('index.html');
 const live=read('course-live.html');
 assert.ok(home.indexOf('class="tiles"')<home.indexOf('class="attention-course-card"'));
 assert.ok(home.indexOf('class="attention-course-card"')<home.indexOf('noya-material-folders'));
 assert.match(home,/class="noya-media-folder" href="\.\/course-live\.html"/);
 assert.match(home,/ПРЯМЫЕ ЭФИРЫ/);
 assert.match(home,/class="noya-media-folder-title">ПРЯМЫЕ ЭФИРЫ<\/strong>/);
 assert.doesNotMatch(course,/href="\.\/course-live\.html"|ПРЯМЫЕ ЭФИРЫ С ЕВГЕНИЕМ/);
 assert.match(live,/class="back noya-legacy-return" href="\.\/club\.html#home"/);
});

test('Attention Management course always has a direct return link to club home',()=>{
 const course=read('index.html');
 const nav=course.indexOf('class="course-club-return noya-legacy-return" href="./club.html#home"');
 const header=course.indexOf('<div class="header">');
 assert.ok(nav>0&&header>nav);
 assert.match(course,/На главную NOYA CLUB/);
 assert.match(course,/course-club-return:focus-visible/);
});

