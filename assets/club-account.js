/* The server validates Telegram and supplies subscription dates and earned months.
   Reward content is not published yet. Do not place private reward URLs here. */
(() => {
  'use strict';
  const slot = document.getElementById('noya-account-slot');
  if (!slot) return;

  const LEVELS = [
    'Новичок', 'Свой человек', 'Напарник', 'Друг клуба',
    'Одна команда', 'Полгода вместе', 'Свой в клубе', 'В кругу своих',
    'Часть NOYA', 'Опора клуба', 'Почти год', 'Год с NOYA'
  ];
  const chevron = '<svg viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="m7 5 6 7-6 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const lock = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="2" stroke="currentColor"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor"/><path d="M8 10v1" stroke="currentColor" stroke-linecap="round"/></svg>';
  const paw = '<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M32 56c7-8 9-18 18-18s11 10 18 18c5 6 10 10 9 18-2 14-16 9-27 9s-25 5-27-9c-1-8 4-12 9-18Z" fill="currentColor"/><ellipse cx="24" cy="36" rx="9" ry="13" transform="rotate(-27 24 36)" fill="currentColor"/><ellipse cx="41" cy="22" rx="9" ry="14" transform="rotate(-8 41 22)" fill="currentColor"/><ellipse cx="61" cy="22" rx="9" ry="14" transform="rotate(8 61 22)" fill="currentColor"/><ellipse cx="78" cy="37" rx="9" ry="13" transform="rotate(27 78 37)" fill="currentColor"/></svg>';

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
    <button class="account-icon-button" id="account-close" type="button" aria-label="Закрыть профиль"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
  </header>
  <div class="account-dialog-content">
    <p class="account-kicker">Личный кабинет</p><h2 id="account-dialog-title">Моя подписка</h2>
    <section class="account-membership" aria-label="Подписка NOYA CLUB" aria-live="polite">
      <div class="account-membership-top"><span class="account-membership-brand">NOYA CLUB</span><span class="account-membership-status" id="account-subscription-status">Проверяем…</span></div>
      <p class="account-membership-message" id="account-membership-message">Загружаем подписку…</p>
      <p class="account-membership-note" id="account-membership-note">Здесь будет срок твоего доступа к клубу.</p>
      <dl class="account-dates" id="account-dates" hidden></dl>
      <a class="account-action" id="account-telegram-link" href="https://t.me/NoyaClubBrooksBot" target="_blank" rel="noopener noreferrer" hidden>Открыть в Telegram <span aria-hidden="true">↗</span></a>
      <button class="account-action" id="account-retry" type="button" hidden>Повторить загрузку</button>
    </section>
    <section class="account-rewards" aria-labelledby="account-rewards-title">
      <p class="account-kicker">Твой год в клубе</p><h2 id="account-rewards-title">Подарки за продление</h2>
      <p class="account-rewards-intro">Каждый полный месяц участия открывает новый уровень. Всего — 12.</p>
      <div class="account-progress-heading"><span>Прогресс по месяцам</span><span class="account-progress-count" id="account-progress-count">… / 12</span></div>
      <div class="account-progress" id="account-progress" role="progressbar" aria-label="Уровни участия в клубе" aria-valuemin="0" aria-valuemax="12"><div class="account-progress-fill" id="account-progress-fill"></div></div>
      <div class="account-rail-toolbar"><span class="account-rail-hint">Листай, чтобы увидеть все 12 месяцев</span><div class="account-rail-controls"><button class="account-icon-button" id="account-months-prev" type="button" aria-label="Предыдущие месяцы">${chevron.replace('<svg ', '<svg style="transform:rotate(180deg)" ')}</button><button class="account-icon-button" id="account-months-next" type="button" aria-label="Следующие месяцы">${chevron}</button></div></div>
      <div class="account-reward-rail" id="account-reward-rail" role="list" aria-label="12 месяцев участия" tabindex="0"></div>
      <p class="account-next-level" id="account-next-level">Первый подарок — после полного месяца в клубе. Второй — после двух, и так до двенадцатого.</p>
      <p class="account-reward-note">Подарки для уровней пока не опубликованы. Когда они появятся, их можно будет открыть здесь.</p>
    </section>
    <p class="account-footer">NOYA CLUB · BY BROOKS</p>
  </div>`;
  document.body.append(dialog);

  const byId = id => document.getElementById(id);
  const rail = byId('account-reward-rail');
  const cards = LEVELS.map((title, index) => {
    const month = index + 1;
    const card = document.createElement('article');
    card.className = 'account-reward-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${month}-й месяц: ${title}`);
    card.innerHTML = `<div class="account-reward-month">${month} ${month === 1 ? 'месяц' : month < 5 ? 'месяца' : 'месяцев'}</div><h3></h3><p class="account-reward-caption"></p><div class="account-reward-art" data-month="${String(month).padStart(2, '0')}" aria-hidden="true">${paw}</div><button class="account-reward-state" type="button" disabled>${lock}<span>Закрыто</span></button>`;
    card.querySelector('h3').textContent = title;
    rail.append(card);
    return card;
  });

  let phase = 'loading';
  let account = null;
  let requestId = 0;
  let lastLoadedAt = 0;
  let opener = null;
  let previousOverflow = '';
  let wasBackVisible = false;
  let backButton = null;
  let isOpen = false;
  let fallbackBackdrop = null;
  let backgroundState = [];
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
    setText('[data-account-level]', months ? LEVELS[months - 1] : ready ? 'Участник' : 'Аккаунт');
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
      const unlocked = ready && index < months;
      card.dataset.unlocked = String(unlocked);
      card.querySelector('.account-reward-caption').textContent = ready ? (unlocked ? 'Этот уровень уже открыт' : `После ${index + 1} ${index === 0 ? 'месяца' : 'месяцев'} в клубе`) : phase === 'loading' ? 'Проверяем твой прогресс…' : 'Прогресс пока недоступен';
      const button = card.querySelector('.account-reward-state');
      const stateLabel = ready ? (unlocked ? 'Уровень открыт' : 'Закрыто') : phase === 'loading' ? 'Проверяем…' : 'Нет данных';
      button.querySelector('span').textContent = stateLabel;
      button.querySelector('svg').style.display = ready && !unlocked ? '' : 'none';
      button.setAttribute('aria-label', ready ? (unlocked ? `${index + 1}-й уровень открыт. Подарок пока не опубликован` : `${index + 1}-й уровень закрыт`) : stateLabel);
    });
    const next = dateLabel(ready ? account.loyalty?.nextUnlockAt : null, true);
    byId('account-next-level').textContent = months === 12 ? 'Ты открыл все 12 уровней. Целый год вместе с NOYA!' : active && next ? `${months ? 'Следующий' : 'Первый'} подарок — ${next}, при действующей подписке.` : active && months ? 'Следующий подарок — после следующего полного месяца участия при действующей подписке.' : 'Первый подарок — после полного месяца в клубе. Второй — после двух, и так до двенадцатого.';
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
      account = data;phase = 'ready';lastLoadedAt = Date.now();setIdentity(data.user);
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
    document.body.style.overflow = previousOverflow;
    if (fallbackBackdrop) {fallbackBackdrop.remove();fallbackBackdrop = null;}
    backgroundState.forEach(({element,inert,ariaHidden}) => {
      if (!inert) element.removeAttribute('inert');
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden',ariaHidden);
      element.classList.remove('account-background-inert');
    });
    backgroundState = [];
    if (backButton) {
      try {backButton.offClick(closeAccount);if (!wasBackVisible) backButton.hide();} catch (_) {}
      backButton = null;
    }
    if (opener?.isConnected) opener.focus({preventScroll:true});
  }
  function closeAccount() {
    if (!isOpen) return;
    if (typeof dialog.close === 'function') dialog.close();
    else {dialog.removeAttribute('open');finishClose();}
  }
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
    const tg = window.Telegram?.WebApp;
    if (tg?.BackButton && (!tg.isVersionAtLeast || tg.isVersionAtLeast('6.1'))) {
      try {backButton = tg.BackButton;wasBackVisible = Boolean(backButton.isVisible);backButton.onClick(closeAccount);backButton.show();} catch (_) {backButton = null;}
    }
    if (phase !== 'loading' && (phase !== 'ready' || Date.now() - lastLoadedAt > 60000)) loadAccount();
    requestAnimationFrame(() => {
      const months = phase === 'ready' ? account.loyalty?.unlockedMonths || 0 : 0;
      rail.scrollLeft = Math.max(0, months - 1) * (cards[0].getBoundingClientRect().width + 12);
      updateRailButtons();
    });
  }
  byId('account-open').addEventListener('click', openAccount);
  document.querySelectorAll('[data-open-account]').forEach(button => button.addEventListener('click', openAccount));
  byId('account-close').addEventListener('click', closeAccount);
  byId('account-retry').addEventListener('click', loadAccount);
  dialog.addEventListener('close', finishClose);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeAccount();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && typeof dialog.close !== 'function') {event.preventDefault();closeAccount();}
    if (event.key === 'Tab' && typeof dialog.showModal !== 'function') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length);
      const first = focusable[0],last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }
  });
  function scrollMonths(direction) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({left:direction * (cards[0].getBoundingClientRect().width + 12), behavior:reduced ? 'auto' : 'smooth'});
  }
  byId('account-months-prev').addEventListener('click', () => scrollMonths(-1));
  byId('account-months-next').addEventListener('click', () => scrollMonths(1));
  rail.addEventListener('scroll', updateRailButtons, {passive:true});
  window.addEventListener('resize', updateRailButtons);
  try {window.Telegram?.WebApp?.ready?.();} catch (_) {}
  render();
  loadAccount();
})();
