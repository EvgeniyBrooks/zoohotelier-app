/* Public descriptions are supplied by the account view. Full gifts are fetched
   only from the authenticated API; local notes never grant access. */
(() => {
  'use strict';
  window.NoyaRewardReader = function ({dialog, overview, catalog, getAccount, getPhase, refreshAccount}) {
    const panel = document.createElement('section');
    panel.className = 'reward-reader';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'reward-reader-title');
    panel.innerHTML = `<button class="reward-back" type="button">← Все подарки</button>
      <div class="reward-reader-cover"><img alt="" width="300" height="300"><div><p class="account-kicker" data-reward-month></p><h2 id="reward-reader-title" tabindex="-1"></h2><p class="reward-reader-format"></p></div></div>
      <p class="reward-reader-description"></p>
      <p class="reward-reader-access" role="status" aria-live="polite"></p>
      <button class="account-action reward-reader-claim" type="button">Забрать подарок →</button>
      <a class="account-action reward-reader-telegram" href="https://t.me/NoyaClubBrooksBot" target="_blank" rel="noopener noreferrer" hidden>Открыть в Telegram ↗</a>
      <div class="reward-reader-body" hidden></div>`;
    dialog.querySelector('.account-dialog-content').append(panel);
    const $ = selector => panel.querySelector(selector);
    const body = $('.reward-reader-body');
    const status = $('.reward-reader-access');
    const claim = $('.reward-reader-claim');
    const telegramLink = $('.reward-reader-telegram');
    let selected = null, material = null, origin = null, previousScroll = 0;
    let controller = null, requestNumber = 0, ownerId = null, storageKey = null;
    let draft = {fields:{},completed:[]};
    let fields = [], checks = [], savingStatus = null;

    const el = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    function cancelRequest() { requestNumber++; controller?.abort(); controller = null; panel.removeAttribute('aria-busy'); }
    function canOpen() {
      const account = getAccount();
      return getPhase() === 'ready' && account?.subscription?.status === 'active' && Number.isInteger(account?.loyalty?.unlockedMonths) && account.loyalty.unlockedMonths >= selected.month;
    }
    function eligibility() {
      if (!selected || material) return;
      const phase = getPhase();
      claim.hidden = true;
      telegramLink.hidden = true;
      claim.disabled = false;
      if (phase === 'telegram' || phase === 'auth') {
        status.textContent = phase === 'auth' ? 'Сессия Telegram закончилась. Открой мини-приложение заново.' : `Подарок откроется после ${selected.month} ${selected.month === 1 ? 'полного месяца' : 'полных месяцев'} участия. Войди через Telegram, чтобы увидеть свой прогресс.`;
        telegramLink.hidden = false;
      } else if (phase === 'loading') {
        status.textContent = 'Проверяем твою подписку…';
        claim.hidden = false; claim.disabled = true; claim.textContent = 'Проверяем…';
      } else if (phase === 'error') {
        status.textContent = 'Не удалось проверить доступ. Попробуй загрузить подписку ещё раз.';
        claim.hidden = false; claim.textContent = 'Повторить проверку';
      } else if (canOpen()) {
        status.textContent = 'Твой подарок уже доступен. Открой его и выбери первое задание.';
        claim.hidden = false; claim.textContent = 'Забрать подарок →';
      } else {
        status.textContent = `Откроется после ${selected.month} ${selected.month === 1 ? 'полного месяца' : 'полных месяцев'} непрерывного участия при активной подписке.`;
        claim.hidden = false; claim.disabled = true; claim.textContent = 'Пока закрыто';
      }
    }
    function refresh() {
      const phase = getPhase(), account = getAccount();
      const changedOwner = phase === 'ready' && String(account?.user?.id) !== ownerId;
      const lostAccess = phase === 'ready' && (account?.subscription?.status !== 'active' || account?.loyalty?.unlockedMonths < selected?.month);
      if (material && (changedOwner || lostAccess || phase === 'auth' || phase === 'telegram')) {
        cancelRequest(); material = null; ownerId = null; storageKey = null;
        body.replaceChildren(); body.hidden = true; fields = []; checks = [];
        draft = {fields:{},completed:[]};
      }
      eligibility();
    }
    function close() {
      if (panel.hidden) return false;
      cancelRequest();
      panel.hidden = true;
      overview.hidden = false;
      dialog.scrollTop = previousScroll;
      origin?.isConnected && origin.focus({preventScroll:true});
      return true;
    }
    function open(month, takeGift = false, trigger = null) {
      const entry = catalog.find(item => item.month === month);
      if (!entry) return;
      cancelRequest();
      if (panel.hidden) previousScroll = dialog.scrollTop;
      selected = entry; material = null; origin = trigger;
      body.replaceChildren(); body.hidden = true;
      fields = []; checks = []; storageKey = null; ownerId = null;
      $('.reward-reader-cover img').src = entry.image;
      $('[data-reward-month]').textContent = `${month}-й месяц · ${entry.level}`;
      $('#reward-reader-title').textContent = entry.title;
      $('.reward-reader-format').textContent = `${entry.format} · Цифровой подарок`;
      $('.reward-reader-description').textContent = entry.description;
      overview.hidden = true; panel.hidden = false;
      dialog.scrollTop = 0;
      $('#reward-reader-title').focus({preventScroll:true});
      eligibility();
      if (takeGift && canOpen()) loadGift();
    }
    async function loadGift() {
      if (!selected || controller) return;
      const currentAccount = getAccount();
      const initData = window.Telegram?.WebApp?.initData;
      if (!canOpen() || !initData || !/^\d+$/.test(String(currentAccount?.user?.id || ''))) { eligibility(); return; }
      const month = selected.month;
      const requestOwner = String(currentAccount.user.id);
      const currentRequest = ++requestNumber;
      controller = new AbortController();
      const requestController = controller;
      const timeout = setTimeout(() => requestController.abort(), 12000);
      claim.disabled = true; claim.textContent = 'Открываем…'; status.textContent = 'Проверяем доступ к подарку…';
      panel.setAttribute('aria-busy','true');
      try {
        const response = await fetch(`/api/club-diagnostic?reward=${month}`, {headers:{'x-telegram-init-data':initData}, cache:'no-store', signal:requestController.signal});
        const data = await response.json();
        if (currentRequest !== requestNumber || panel.hidden) return;
        if (response.status === 401) {
          status.textContent = 'Сессия Telegram закончилась. Открой мини-приложение заново.';
          claim.hidden = true; telegramLink.hidden = false; return;
        }
        if (response.status === 403) {
          status.textContent = 'Этот подарок пока закрыт. Проверь срок участия в профиле.';
          claim.textContent = 'Пока закрыто'; claim.disabled = true;
          await refreshAccount(); return;
        }
        if (!response.ok || data.ok !== true || data.reward?.month !== month || !Array.isArray(data.reward.sections)) throw new Error('Gift unavailable');
        if (!canOpen() || String(getAccount()?.user?.id) !== requestOwner) {eligibility();return;}
        material = data.reward; ownerId = requestOwner;
        renderGift();
        claim.hidden = true;
        status.textContent = 'Подарок открыт. Сохрани материал вместе со своими заметками.';
      } catch (error) {
        if (currentRequest !== requestNumber || panel.hidden) return;
        status.textContent = 'Не удалось открыть подарок. Проверь соединение и попробуй ещё раз.';
        claim.hidden = false; claim.disabled = false; claim.textContent = 'Попробовать ещё раз';
      } finally {
        clearTimeout(timeout);
        if (currentRequest === requestNumber) {controller = null;panel.removeAttribute('aria-busy');}
      }
    }
    function readDraft() {
      storageKey = `noya.reward.notes.v1.${ownerId}.${material.month}`;
      draft = {fields:{},completed:[]};
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
          if (saved.fields && typeof saved.fields === 'object' && !Array.isArray(saved.fields)) draft.fields = saved.fields;
          if (Array.isArray(saved.completed)) draft.completed = saved.completed.filter(value => typeof value === 'string');
          if (material.month === 12 && validCover(saved.cover)) draft.cover = saved.cover;
        }
      } catch (_) {}
    }
    function collectDraft() {
      return {fields:Object.fromEntries(fields.map(input => [input.dataset.field,input.value.slice(0,4000)])), completed:checks.filter(input => input.checked).map(input => input.value), cover:validCover(draft.cover) ? draft.cover : null};
    }
    function saveDraft() {
      draft = collectDraft();
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
        savingStatus.textContent = 'Сохранено на этом устройстве. Скачай копию, чтобы забрать свои заметки с собой.';
      } catch (_) {
        savingStatus.textContent = 'Браузер не сохранил заметки. Скачай материал с заполненными полями перед закрытием.';
      }
      updatePracticeCount();
    }
    function updatePracticeCount() {
      const counter = $('.reward-practice-count');
      if (counter) counter.textContent = `Отмечено: ${checks.filter(input => input.checked).length} из ${checks.length}`;
    }
    function renderGift() {
      readDraft(); body.replaceChildren(); body.hidden = false;
      fields = []; checks = [];
      body.append(el('p', material.intro, 'reward-intro'));
      const toolbar = el('div', undefined, 'reward-export-bar');
      const download = el('button', 'Скачать HTML', 'reward-secondary'); download.type = 'button'; download.addEventListener('click',downloadGift);
      const print = el('button', 'Печать / сохранить PDF', 'reward-secondary'); print.type = 'button'; print.addEventListener('click',printGift);
      toolbar.append(download,print);body.append(toolbar);
      body.append(el('p', 'Отмечай то, что попробовали. Эти отметки — для тебя; подарки открываются по сроку участия.', 'reward-helper'));
      body.append(el('p', '', 'reward-practice-count'));
      material.sections.forEach((section, sectionIndex) => {
        const group = el('details', undefined, 'reward-section');
        group.open = sectionIndex === 0;
        const summary = el('summary'); summary.append(el('span',section.title),el('span','+', 'reward-section-symbol'));group.append(summary);
        (section.items || []).forEach((item,itemIndex) => {
          const article = el('article',undefined,'reward-item');
          article.append(el('h3',item.title));
          if (item.text) article.append(el('p',item.text));
          if (Array.isArray(item.steps)) {
            const list=el('ol'); item.steps.forEach(step => list.append(el('li',step))); article.append(list);
          }
          const label=el('label',undefined,'reward-check');
          const check=el('input');check.type='checkbox';check.value=`${sectionIndex}.${itemIndex}`;check.checked=draft.completed.includes(check.value);check.addEventListener('change',saveDraft);checks.push(check);
          label.append(check,el('span','Попробовали / обсудили'));article.append(label);group.append(article);
        });
        body.append(group);
      });
      const worksheet=el('section',undefined,'reward-worksheet');
      worksheet.append(el('h3',material.worksheet?.title || 'Мои заметки'));
      if (material.month === 12) addCoverField(worksheet);
      (material.worksheet?.fields || []).forEach(field => {
        if (!/^[a-z0-9_-]+$/i.test(field.id)) return;
        const label=el('label',undefined,'reward-field');
        const input=el(field.multiline ? 'textarea' : 'input');
        if (!field.multiline) input.type='text'; else input.rows=3;
        input.dataset.field=field.id;input.maxLength=4000;
        input.placeholder=field.placeholder || '';
        input.value=typeof draft.fields[field.id] === 'string' ? draft.fields[field.id].slice(0,4000) : '';
        input.addEventListener('input',saveDraft);fields.push(input);
        label.append(el('span',field.label),input);worksheet.append(label);
      });
      savingStatus=el('p','Заметки и отметки сохраняются только на этом устройстве.','reward-helper');
      savingStatus.setAttribute('role','status');worksheet.append(savingStatus);body.append(worksheet);
      const secondDownload=el('button','Скачать подарок с моими заметками ↓','account-action');secondDownload.type='button';secondDownload.addEventListener('click',downloadGift);body.append(secondDownload);
      updatePracticeCount();
    }
    function validCover(value) {return typeof value === 'string' && value.length < 1200000 && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(value);}
    function addCoverField(worksheet) {
      const label=el('label',undefined,'reward-field');label.append(el('span','Фото на обложку — по желанию'));
      const picker=el('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp';label.append(picker);worksheet.append(label);
      const preview=el('img');preview.className='reward-cover-preview';preview.alt='Фотография на обложке моей книги';preview.hidden=!validCover(draft.cover);if(!preview.hidden)preview.src=draft.cover;worksheet.append(preview);
      const remove=el('button','Убрать фото','reward-secondary');remove.type='button';remove.hidden=preview.hidden;worksheet.append(remove);
      worksheet.append(el('p','Фото остаётся на этом устройстве и попадёт в скачанную книгу. На сервер оно не отправляется.','reward-helper'));
      remove.addEventListener('click',() => {draft.cover=null;preview.removeAttribute('src');preview.hidden=true;remove.hidden=true;picker.value='';saveDraft();});
      picker.addEventListener('change',() => {
        const file=picker.files?.[0];if(!file)return;
        if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10000000){savingStatus.textContent='Выбери JPG, PNG или WebP размером до 10 МБ.';picker.value='';return;}
        const requestKey=storageKey,url=URL.createObjectURL(file),picture=new Image();
        picture.onload=() => {
          try {
            if(!picker.isConnected || panel.hidden || storageKey!==requestKey)return;
            const ratio=Math.min(1,1000/Math.max(picture.naturalWidth,picture.naturalHeight));
            const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(picture.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(picture.naturalHeight*ratio));
            const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(picture,0,0,canvas.width,canvas.height);
            const data=canvas.toDataURL('image/jpeg',.8);if(!validCover(data))throw new Error('Image too large');
            draft.cover=data;preview.src=data;preview.hidden=false;remove.hidden=false;saveDraft();
          } catch (_) {if(picker.isConnected)savingStatus.textContent='Не удалось подготовить фото. Попробуй другой снимок.';}
          finally {URL.revokeObjectURL(url);}
        };
        picture.onerror=() => {URL.revokeObjectURL(url);if(picker.isConnected)savingStatus.textContent='Этот файл не удалось открыть как изображение.';};
        picture.src=url;
      });
    }
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    function exportHtml() {
      const saved=collectDraft();
      const sectionHtml=material.sections.map((section,si) => `<section><h2>${escapeHtml(section.title)}</h2>${(section.items || []).map((item,ii) => `<article><h3>${saved.completed.includes(`${si}.${ii}`) ? '✓ ' : ''}${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p>${Array.isArray(item.steps) ? `<ol>${item.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : ''}</article>`).join('')}</section>`).join('');
      const notes=(material.worksheet?.fields || []).map(field => `<article class="${material.month===12?'book-page':''}"><h3>${escapeHtml(field.label)}</h3><p class="note">${escapeHtml(saved.fields[field.id] || '—')}</p></article>`).join('');
      const cover=material.month===12&&validCover(saved.cover)?`<img class="book-cover" src="${saved.cover}" alt="Фотография нашей команды">`:'';
      const certificate=material.month===11?`<section class="certificate"><p class="brand">NOYA CLUB · НАШ МИНИ-ФЕСТИВАЛЬ</p><h2>Диплом участия</h2><h3>${escapeHtml(saved.fields.team_name || 'Наша команда')}</h3><p>Собака: ${escapeHtml(saved.fields.dog_name || '________________')}</p><p>Вместе с: ${escapeHtml(saved.fields.human_names || '________________')}</p><p>${escapeHtml(saved.fields.kind_words || 'Спасибо за время, внимание и добрые совместные игры!')}</p><p>${escapeHtml(saved.fields.festival_date || '')}</p><small>Память об участии в игре NOYA CLUB.</small></section>`:'';
      return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(material.title)} · NOYA CLUB</title><style>*{box-sizing:border-box}body{max-width:840px;margin:0 auto;padding:40px 24px;background:#fafaf5;color:#20211b;font:16px/1.65 system-ui,sans-serif}header{border-bottom:4px solid #d8df20;padding-bottom:20px;margin-bottom:28px}.brand{font-size:12px;letter-spacing:2px}h1{font-size:36px;line-height:1.15}h2{font-size:25px;margin-top:36px}h3{font-size:18px;line-height:1.4}article{padding:16px 0;border-bottom:1px solid #d9ddcc;break-inside:avoid}p{white-space:pre-wrap}li{margin:8px 0}.note{min-height:40px;background:#f0f2e7;padding:14px}.book-cover{display:block;max-width:100%;max-height:650px;margin:20px auto;border-radius:18px}.book-page{min-height:180px}.certificate{margin-top:40px;border:3px solid #a7af31;padding:40px 25px;text-align:center;break-inside:avoid}footer{margin-top:40px;color:#606451;font-size:12px}@media print{body{padding:0;background:white;font-size:11pt}h1{font-size:25pt}h2{font-size:18pt}h3{font-size:13pt}.note{background:white;border:1px solid #ddd}section{break-before:auto}.book-page{break-before:page}.certificate{break-before:page}@page{margin:18mm}}</style></head><body><header><p class="brand">NOYA CLUB · ЦИФРОВОЙ ПОДАРОК</p><h1>${escapeHtml(material.title)}</h1><p>${material.month}-й месяц · Клубный уровень «${escapeHtml(material.level)}»</p>${cover}</header><p>${escapeHtml(material.intro)}</p>${material.month===12?`<section><h2>${escapeHtml(material.worksheet?.title || 'Мои заметки')}</h2>${notes}</section>${sectionHtml}`:`${sectionHtml}<section><h2>${escapeHtml(material.worksheet?.title || 'Мои заметки')}</h2>${notes}</section>`}${certificate}<footer>Сохранено из NOYA CLUB. Клубный уровень отражает срок участия. Материал и заполненные заметки доступны в этом файле без входа в клуб.</footer></body></html>`;
    }
    function downloadGift() {
      if (!material) return;
      const blob=new Blob([exportHtml()],{type:'text/html;charset=utf-8'});
      const url=URL.createObjectURL(blob);
      const link=el('a');link.href=url;link.download=`NOYA-CLUB-${String(material.month).padStart(2,'0')}.html`;document.body.append(link);link.click();link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      status.textContent='Если файл не сохранился, попробуй «Печать / сохранить PDF». Скачанный HTML можно открыть в браузере без входа в клуб.';
    }
    function printGift() {
      if (!material) return;
      const frame=el('iframe');frame.className='reward-print-frame';frame.title='Печать подарка NOYA CLUB';
      frame.addEventListener('load', () => {
        try {frame.contentWindow.focus();frame.contentWindow.print();}
        catch (_) {status.textContent='Печать недоступна в этом браузере. Скачай HTML и открой файл в браузере.';}
        setTimeout(() => frame.remove(),60000);
      },{once:true});
      frame.srcdoc=exportHtml();document.body.append(frame);
    }
    claim.addEventListener('click', async () => {
      if (getPhase() === 'error') {claim.disabled=true;await refreshAccount();eligibility();}
      else loadGift();
    });
    $('.reward-back').addEventListener('click',close);
    return {open,close,isOpen:() => !panel.hidden,refresh};
  };
})();
