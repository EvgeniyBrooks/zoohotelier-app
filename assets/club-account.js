/* The server validates Telegram and supplies subscription dates and earned months.
   Only public gift descriptions belong here; the API protects the full materials. */
(() => {
  'use strict';
  const slot = document.getElementById('noya-account-slot');
  if (!slot) return;

  const REWARDS = window.NOYA_REWARD_CATALOG || [];
  const LEVELS = REWARDS.map(reward => reward.level);
  const chevron = '<svg viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="m7 5 6 7-6 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const lock = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="2" stroke="currentColor"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor"/><path d="M8 10v1" stroke="currentColor" stroke-linecap="round"/></svg>';

  slot.innerHTML = `<button class="account-card" id="account-open" type="button" aria-haspopup="dialog" aria-controls="account-dialog" aria-label="Открыть профиль и подписку">
    <span class="account-avatar" data-account-avatar aria-hidden="true"><span>N</span></span>
    <span class="account-identity"><span class="account-name" data-account-name>Твой профиль</span><span class="account-meta"><span class="account-level" data-account-level>Аккаунт</span><span class="account-summary" data-account-summary>Загружаем подписку…</span></span></span>
    <span class="account-chevron">${chevron}</span>
  </button>`;

  const dialog = document.createElement('dialog');
  dialog.id = 'account-dialog';
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'account-dialog-title');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = `<header class="account-dialog-header">
    <div class="account-avatar" data-account-avatar aria-hidden="true"><span>N</span></div>
    <div class="account-identity"><span class="account-name" data-account-name>Твой профиль</span><div class="account-meta"><span class="account-level" data-account-level>Аккаунт</span><span class="account-summary" data-account-summary>Загружаем подписку…</span></div></div>
    <button class="account-icon-button noya-legacy-return" id="account-close" type="button" aria-label="Закрыть профиль"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
  </header>
  <div class="account-dialog-content"><div id="account-overview">
    <h2 id="account-dialog-title" class="account-visually-hidden">Профиль и подарки NOYA CLUB</h2>
    <button class="button secondary" id="account-edit-profile" type="button">Редактировать профиль</button>
    <details class="account-membership-details" id="account-membership-details"><summary><span>Моя подписка</span><span>Срок и доступ +</span></summary>
    <section class="account-membership" aria-label="Подписка NOYA CLUB" aria-live="polite">
      <div class="account-membership-top"><span class="account-membership-brand">NOYA CLUB</span><span class="account-membership-status" id="account-subscription-status">Проверяем…</span></div>
      <p class="account-membership-message" id="account-membership-message">Загружаем подписку…</p>
      <p class="account-membership-note" id="account-membership-note">Здесь будет срок твоего доступа к клубу.</p>
      <dl class="account-dates" id="account-dates" hidden></dl>
      <a class="account-action" id="account-telegram-link" href="https://t.me/NoyaClubBrooksBot" target="_blank" rel="noopener noreferrer" hidden>Открыть в Telegram <span aria-hidden="true">↗</span></a>
      <button class="account-action" id="account-retry" type="button" hidden>Повторить загрузку</button>
    </section></details>
    <section class="account-rewards" aria-labelledby="account-rewards-title">
      <p class="account-kicker">Твой год в клубе</p><h2 id="account-rewards-title">Подарки за продление</h2>
      <p class="account-rewards-intro">Игры, практикумы и личные проекты для вашей команды. Подарок «101 трюк» — после оплаты второго месяца.</p>
      <div class="account-progress-heading"><span>Прогресс по месяцам</span><span class="account-progress-count" id="account-progress-count">… / 12</span></div>
      <div class="account-progress" id="account-progress" role="progressbar" aria-label="Уровни участия в клубе" aria-valuemin="0" aria-valuemax="12"><div class="account-progress-fill" id="account-progress-fill"></div></div>
      <div class="account-rail-toolbar"><span class="account-rail-hint">Листай, чтобы увидеть все 12 месяцев</span><div class="account-rail-controls"><button class="account-icon-button" id="account-months-prev" type="button" aria-label="Предыдущие месяцы">${chevron.replace('<svg ', '<svg style="transform:rotate(180deg)" ')}</button><button class="account-icon-button" id="account-months-next" type="button" aria-label="Следующие месяцы">${chevron}</button></div></div>
      <div class="account-reward-rail" id="account-reward-rail" role="list" aria-label="12 месяцев участия" tabindex="0"></div>
      <p class="account-next-level" id="account-next-level">Первый подарок открывается после подтверждённой оплаты второго месяца.</p>
      <a class="account-route-link" id="account-route-link" href="./club.html#route" hidden>Продолжить свой маршрут →</a>
      <details class="account-reward-rules"><summary>Как открываются подарки</summary><p>Уровни начисляются за полные календарные месяцы непрерывной подписки. При вступлении — 0 из 12. Оплата за год не открывает все подарки сразу.</p><p>Читать подарки в клубе можно при активной подписке. После перерыва отсчёт начинается заново. Полученные материалы можно скачать и оставить себе.</p><p>Все подарки цифровые. Предметы на картинках — иллюстрации. «Кинолог» и «Суперкинолог» — названия клубных уровней, а не профессиональная квалификация.</p></details>
    </section>
    <p class="account-footer">NOYA CLUB · BY BROOKS</p>
  </div></div>`;
  document.body.append(dialog);

  const byId = id => document.getElementById(id);
  const rail = byId('account-reward-rail');
  const cards = REWARDS.map((reward, index) => {
    const month = index + 1;
    const secret = month >= 7;
    const card = document.createElement('article');
    card.className = 'account-reward-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', secret ? `${month}-й месяц: ${reward.level}. Секретный подарок` : `${month}-й месяц: ${reward.level}. ${reward.title}`);
    card.innerHTML = `<div class="account-reward-month">${month} ${month === 1 ? 'месяц' : month < 5 ? 'месяца' : 'месяцев'}</div><h3></h3><p class="account-reward-title"></p><div class="account-reward-art" aria-hidden="true"><img width="300" height="300" alt="" loading="lazy" decoding="async"></div><button class="account-reward-state" type="button" disabled>${lock}<span>Закрыто</span></button><button class="account-reward-preview" type="button">Что внутри ↗</button>`;
    card.querySelector('h3').textContent = reward.level;
    card.querySelector('.account-reward-title').textContent = secret ? 'Пока в секрете' : (reward.cardLabel || reward.title);
    if (secret) {
      card.dataset.secret = 'true';
      card.querySelector('.account-reward-art').innerHTML = `<span class="account-secret-lock" aria-hidden="true">🔒</span>`;
    } else card.querySelector('img').src = reward.image;
    card.querySelector('.account-reward-state').addEventListener('click', event => reader?.open(month,true,event.currentTarget));
    card.querySelector('.account-reward-preview').addEventListener('click', event => reader?.open(month,false,event.currentTarget));
    rail.append(card);
    return card;
  });

  let phase = 'loading';
  let account = null;
  let requestId = 0;
  let lastLoadedAt = 0;
  let opener = null;
  let previousOverflow = '';
  let isOpen = false;
  let fallbackBackdrop = null;
  let backgroundState = [];
  const reader = typeof window.NoyaRewardReader === 'function' ? window.NoyaRewardReader({dialog,overview:byId('account-overview'),catalog:REWARDS,getAccount:() => account,getPhase:() => phase,refreshAccount:loadAccount}) : null;
  const shortDate = new Intl.DateTimeFormat('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
  const longDate = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long', year:'numeric'});
  function dateLabel(value, long = false) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? (long ? longDate : shortDate).format(date) : '';
  }
  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  }
  function setIdentity(user) {
    const name = typeof user?.displayName === 'string' && user.displayName.trim() ? user.displayName.trim() : 'Твой профиль';
    setText('[data-account-name]', name);
    const initials = user ? name.replace(/^@/, '').split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toLocaleUpperCase('ru-RU') : 'N';
    let photoUrl = null;
    if (typeof user?.photoUrl === 'string') {
      try { const url = new URL(user.photoUrl); if (url.protocol === 'https:' && !url.username && !url.password) photoUrl = url.href; } catch (_) {}
    }
    document.querySelectorAll('[data-account-avatar]').forEach(avatar => {
      avatar.replaceChildren();
      const fallback = document.createElement('span');
      fallback.textContent = initials || 'N';
      avatar.append(fallback);
      if (photoUrl) {
        const img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.remove(), {once:true});
        img.src = photoUrl;
        avatar.append(img);
      }
    });
  }
  function renderDates(subscription) {
    const dates = byId('account-dates');
    dates.replaceChildren();
    const rows = [
      ['Начало подписки', subscription?.startDate],
      [subscription?.status === 'expired' ? 'Доступ завершился' : 'Доступ до', subscription?.endDate]
    ];
    if (subscription?.status === 'active' && Date.parse(subscription.nextPaymentDate) > Date.now()) rows.push(['Следующий платёж', subscription.nextPaymentDate]);
    rows.forEach(([label, value]) => {
      const text = dateLabel(value);
      if (!text) return;
      const row = document.createElement('div');
      const dt = document.createElement('dt');dt.textContent = label;
      const dd = document.createElement('dd');dd.textContent = text;
      row.append(dt, dd);dates.append(row);
    });
    dates.hidden = !dates.childElementCount;
  }
  function render() {
    const ready = phase === 'ready';
    const subscription = ready ? account.subscription : null;
    const active = subscription?.status === 'active';
    const months = ready && Number.isInteger(account.loyalty?.unlockedMonths) ? Math.min(12, Math.max(0, account.loyalty.unlockedMonths)) : 0;
    // Rank month begins at 1 for a new paid member. Reward progress stays at 0
    // until the first full membership month has finished.
    const rankMonth = active ? (
      Number.isInteger(account.loyalty?.membershipMonth)
        ? Math.min(12, Math.max(1, account.loyalty.membershipMonth))
        : Math.min(12, months + 1)
    ) : 0;
    let label = 'Проверяем…';
    let summary = 'Загружаем подписку…';
    let message = summary;
    let note = 'Здесь будет срок твоего доступа к клубу.';
    if (phase === 'telegram') {
      label = 'Вход через Telegram';summary = 'Открой в Telegram';message = 'Твой аккаунт в NOYA CLUB';note = 'Открой клуб кнопкой приложения в боте, чтобы увидеть свою подписку и прогресс.';
    } else if (phase === 'auth') {
      label = 'Нужно войти снова';summary = 'Открой клуб заново';message = 'Войди через Telegram';note = 'Закрой мини-приложение и снова открой его в @NoyaClubBrooksBot.';
    } else if (phase === 'error') {
      label = 'Не удалось загрузить';summary = 'Подписка не загрузилась';message = 'Не удалось проверить подписку';note = 'Проверь соединение и попробуй ещё раз.';
    } else if (ready) {
      const end = dateLabel(subscription?.endDate);
      const start = dateLabel(subscription?.startDate);
      if (active) {
        label = 'Активна';summary = end ? `до ${end}` : 'Подписка активна';message = 'Ты в NOYA CLUB';note = 'Подписка привязана к твоему аккаунту Telegram.';
      } else if (subscription?.status === 'expired') {
        label = 'Завершилась';summary = 'Подписка завершилась';message = 'Срок подписки закончился';note = 'После продления здесь появится новый срок доступа к клубу.';
      } else if (subscription?.status === 'cancelled') {
        label = 'Отменена';summary = 'Подписка отменена';message = 'Подписка отменена';note = 'Сведения о следующем периоде появятся после оформления подписки.';
      } else if (subscription?.status === 'scheduled') {
        label = 'Ожидает начала';summary = start ? `с ${start}` : 'Ожидает начала';message = 'Подписка скоро начнётся';note = 'Первый подарок откроется после полного месяца участия.';
      } else if (subscription?.status === 'inactive') {
        label = 'Неактивна';summary = 'Подписка неактивна';message = 'Подписка пока неактивна';note = 'Когда подписка станет активной, здесь появятся срок доступа и твой прогресс.';
      } else {
        label = 'Не оформлена';summary = 'Без подписки';message = 'Подписка ещё не оформлена';note = 'После оформления здесь появятся срок доступа и твой прогресс в клубе.';
      }
    }
    setText('[data-account-level]', rankMonth ? LEVELS[rankMonth - 1] : ready && subscription?.status === 'trial' ? 'Пробный доступ' : ready ? 'Участник' : 'Аккаунт');
    document.querySelectorAll('[data-account-level]').forEach(el => {
      el.title = rankMonth ? 'Месяц участия: ' + rankMonth + ' из 12' : '';
    });
    setText('[data-account-summary]', summary);
    byId('account-subscription-status').textContent = label;
    byId('account-subscription-status').dataset.active = String(active);
    byId('account-membership-message').textContent = message;
    byId('account-membership-note').textContent = note;
    renderDates(subscription);
    byId('account-telegram-link').hidden = !['telegram','auth'].includes(phase);
    byId('account-retry').hidden = phase !== 'error';
    byId('account-retry').disabled = phase === 'loading';
    dialog.dataset.loading = String(phase === 'loading');
    dialog.setAttribute('aria-busy', String(phase === 'loading'));
    byId('account-progress-count').textContent = `${ready ? months : phase === 'loading' ? '…' : '—'} / 12`;
    byId('account-progress-fill').style.width = `${months / 12 * 100}%`;
    if (ready) byId('account-progress').setAttribute('aria-valuenow', String(months));
    else byId('account-progress').removeAttribute('aria-valuenow');
    cards.forEach((card, index) => {
      const unlocked = ready && (index === 0 ? account.firstPdfEligible === true : index < months);
      const revealed = unlocked && active;
      if (index >= 6) {
        card.dataset.secret = String(!revealed);
        card.querySelector('.account-reward-title').textContent = revealed ? (REWARDS[index].cardLabel || REWARDS[index].title) : 'Пока в секрете';
        const art = card.querySelector('.account-reward-art');
        if (revealed && !art.querySelector('img')) {
          art.replaceChildren(); const img = document.createElement('img'); img.src = REWARDS[index].image; img.alt = ''; img.width = 300; img.height = 300; img.loading = 'lazy'; art.append(img);
        } else if (!revealed && !art.querySelector('.account-secret-lock')) {
          art.replaceChildren(); const symbol = document.createElement('span'); symbol.className = 'account-secret-lock'; symbol.setAttribute('aria-hidden','true'); symbol.textContent = '🔒'; art.append(symbol);
        }
        card.setAttribute('aria-label', `${index + 1}-й месяц: ${REWARDS[index].level}. ${revealed ? REWARDS[index].title : 'Секретный подарок'}`);
      }
      card.dataset.unlocked = String(unlocked);
      const button = card.querySelector('.account-reward-state');
      const stateLabel = ready ? (unlocked && active ? 'Забрать →' : 'Пока закрыто') : phase === 'loading' ? 'Проверяем…' : ['telegram','auth'].includes(phase) ? 'Вход через Telegram' : 'Нет данных';
      button.querySelector('span').textContent = stateLabel;
      button.querySelector('svg').style.display = ready && !unlocked ? '' : 'none';
      button.disabled = !reader || !unlocked || !active;
      card.querySelector('.account-reward-preview').disabled = !reader || (index >= 6 && !revealed);
      card.querySelector('.account-reward-preview').hidden = index >= 6 && !revealed;
      button.setAttribute('aria-label', ready ? (unlocked && active ? `Забрать подарок: ${REWARDS[index].title}` : index === 0 ? 'Методичка откроется после подтверждённой оплаты второго месяца' : `Подарок откроется после ${index + 1} полных месяцев участия`) : stateLabel);
    });
    const next = dateLabel(ready ? account.loyalty?.nextUnlockAt : null, true);
    const nextTitle = months >= 6 ? 'секретный подарок' : REWARDS[months]?.title;
    byId('account-next-level').textContent = months === 12 ? 'Все 12 подарков открыты. Целый год вместе с NOYA! Продолжай работу по своему маршруту.' : active && next && nextTitle ? `Следующий подарок — «${nextTitle}». Откроется ${next} при действующей подписке.` : active && nextTitle ? `Впереди — «${nextTitle}». Подарок откроется после следующего полного месяца непрерывного участия при активной подписке.` : 'Первый подарок — после оплаты второго месяца.';
    byId('account-route-link').hidden = months !== 12;
    reader?.refresh();
    updateRailButtons();
  }
  async function loadAccount() {
    const currentRequest = ++requestId;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {phase = 'telegram';account = null;setIdentity(null);render();return;}
    phase = 'loading';render();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/club-diagnostic?account=1', {headers:{'x-telegram-init-data':initData}, cache:'no-store', signal:controller.signal});
      const data = await response.json();
      if (currentRequest !== requestId) return;
      if (response.status === 401) {phase = 'auth';account = null;setIdentity(null);return;}
      if (!response.ok || data.ok !== true || !data.user || !data.subscription || !data.loyalty) throw new Error('Account unavailable');
      account = data;
      account.firstPdfEligible = false;
      try {
        const pdfStatus = await fetch('/api/club-reward-pdf?check=1', {
          headers:{'x-telegram-init-data':initData}, cache:'no-store', signal:controller.signal
        });
        const pdfData = await pdfStatus.json();
        if(currentRequest !== requestId) return;
        if(pdfStatus.ok && pdfData?.ok === true) account.firstPdfEligible = pdfData.eligible === true;
      } catch (_) { account.firstPdfEligible = false; }
      phase = 'ready';lastLoadedAt = Date.now();setIdentity(data.user);
    } catch (_) {
      if (currentRequest === requestId) phase = 'error';
    } finally {
      clearTimeout(timeout);
      if (currentRequest === requestId) render();
    }
  }
  function updateRailButtons() {
    byId('account-months-prev').disabled = rail.scrollLeft <= 2;
    byId('account-months-next').disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2;
  }
  function finishClose() {
    if (!isOpen) return;
    isOpen = false;
    reader?.close();
    document.body.style.overflow = previousOverflow;
    if (fallbackBackdrop) {fallbackBackdrop.remove();fallbackBackdrop = null;}
    backgroundState.forEach(({element,inert,ariaHidden}) => {
      if (!inert) element.removeAttribute('inert');
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden',ariaHidden);
      element.classList.remove('account-background-inert');
    });
    backgroundState = [];
    window.NOYABack?.sync();
    if (!document.querySelector('.noya-member-dialog[open]') && opener?.isConnected) opener.focus({preventScroll:true});
  }
  function closeAccount() {
    if (!isOpen) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {dialog.removeAttribute('open');finishClose();}
  }
  function backAccount() { if (!reader?.close()) closeAccount(); }
  dialog.noyaGoBack = backAccount;
  function openAccount(event) {
    if (isOpen) return;
    opener = event?.currentTarget || document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';isOpen = true;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else {
      dialog.setAttribute('open', '');
      backgroundState = [...document.body.children].filter(element => element !== dialog && !['SCRIPT','STYLE'].includes(element.tagName)).map(element => ({element,inert:element.hasAttribute('inert'),ariaHidden:element.getAttribute('aria-hidden')}));
      backgroundState.forEach(({element}) => {element.setAttribute('inert','');element.setAttribute('aria-hidden','true');element.classList.add('account-background-inert');});
      fallbackBackdrop = document.createElement('div');fallbackBackdrop.className = 'account-fallback-backdrop';fallbackBackdrop.setAttribute('aria-hidden','true');fallbackBackdrop.addEventListener('click',closeAccount);document.body.append(fallbackBackdrop);
    }
    dialog.scrollTop = 0;
    byId('account-close').focus({preventScroll:true});
    window.NOYABack?.sync();
    if (phase !== 'loading' && (phase !== 'ready' || Date.now() - lastLoadedAt > 60000)) loadAccount();
    requestAnimationFrame(() => {
      const months = phase === 'ready' ? account.loyalty?.unlockedMonths || 0 : 0;
      rail.scrollLeft = Math.max(0, months - 1) * ((cards[0]?.getBoundingClientRect().width || 200) + 12);
      updateRailButtons();
    });
  }
  byId('account-open').addEventListener('click', openAccount);
  document.querySelectorAll('[data-open-account]').forEach(button => button.addEventListener('click', openAccount));
  byId('account-close').addEventListener('click', closeAccount);
  byId('account-edit-profile').addEventListener('click',()=>{
    closeAccount();
    window.NOYAMembers?.edit();
  });
  byId('account-retry').addEventListener('click', loadAccount);
  byId('account-route-link').addEventListener('click', event => {
    if (document.getElementById('route') && typeof window.showScreen === 'function') {
      event.preventDefault();closeAccount();window.showScreen('route');
    }
  });
  dialog.addEventListener('close', finishClose);
  dialog.addEventListener('cancel', event => { if (reader?.isOpen()) {event.preventDefault();reader.close();} });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeAccount();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && typeof dialog.close !== 'function') {event.preventDefault();backAccount();}
    if (event.key === 'Tab' && typeof dialog.showModal !== 'function') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(element => element.getClientRects().length);
      const first = focusable[0],last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }
  });
  function scrollMonths(direction) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({left:direction * ((cards[0]?.getBoundingClientRect().width || 200) + 12), behavior:reduced ? 'auto' : 'smooth'});
  }
  byId('account-months-prev').addEventListener('click', () => scrollMonths(-1));
  byId('account-months-next').addEventListener('click', () => scrollMonths(1));
  rail.addEventListener('scroll', updateRailButtons, {passive:true});
  window.addEventListener('resize', updateRailButtons);
  try {window.Telegram?.WebApp?.ready?.();} catch (_) {}
  render();
  loadAccount();
})();
