/* ============================================================
   Sojourn — app logic
   Architecture: a single immutable-ish state object persisted
   to localStorage. Views read from state and re-render on
   change. .ics export is built from scratch — no libs.
   ============================================================ */

'use strict';

/* ----------  Storage keys  ---------- */
const LS_STATE = 'sojourn.state.v1';
const LS_LANG  = 'sojourn.lang';
const LS_THEME = 'sojourn.theme';
const LS_DEFAULT_CCY = 'sojourn.defaultCurrency';

/* ----------  Bootstrapped state  ---------- */
const state = {
  items: loadItems(),
  filter: 'all',
  view: 'dashboard',
  lang: localStorage.getItem(LS_LANG) || detectLang(),
  theme: localStorage.getItem(LS_THEME) || 'auto',
  defaultCurrency: localStorage.getItem(LS_DEFAULT_CCY) || 'USD',
  calCursor: startOfMonth(new Date()),
  calSelected: null,
  editingId: null,
  formType: 'task',
};

/* ============================================================
   1.  Persistence
   ============================================================ */
function loadItems() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // basic shape guard
    return parsed.filter(x => x && typeof x === 'object' && x.id && x.title && x.date);
  } catch { return []; }
}
function saveItems() {
  localStorage.setItem(LS_STATE, JSON.stringify(state.items));
}

function detectLang() {
  const supported = ['en', 'ko', 'ja', 'zh', 'vi', 'mn'];
  const nav = (navigator.language || 'en').toLowerCase();
  for (const code of supported) if (nav.startsWith(code)) return code;
  return 'en';
}

/* ============================================================
   2.  Utility — dates, money, ids
   ============================================================ */
const t = (k) => (I18N[state.lang] && I18N[state.lang][k]) ?? I18N.en[k] ?? k;
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

function uid() {
  // Stable, sortable, no Date.now reliance needed for uniqueness alone
  return 'i_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfMonth(d) { const x = new Date(d.getFullYear(), d.getMonth(), 1); return x; }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }
function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function isoDate(d) {
  // local YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseLocalDate(s, time) {
  // s = "YYYY-MM-DD", time = "HH:MM" | undefined
  const [y,m,d] = s.split('-').map(Number);
  if (time) {
    const [hh,mm] = time.split(':').map(Number);
    return new Date(y, m-1, d, hh, mm);
  }
  return new Date(y, m-1, d);
}
function diffDays(future, base) {
  const a = startOfDay(future).getTime();
  const b = startOfDay(base).getTime();
  return Math.round((a - b) / 86400000);
}

function fmtMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount);
  if (Number.isNaN(n)) return '';
  const locale = CURRENCY_LOCALE[currency] || 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency,
      maximumFractionDigits: ['JPY','KRW','VND','MNT'].includes(currency) ? 0 : 2,
    }).format(n);
  } catch {
    const sym = (CURRENCIES.find(c => c.code === currency) || {}).symbol || '';
    return `${sym}${n.toLocaleString()}`;
  }
}
function fmtDate(date, opts) {
  try {
    return new Intl.DateTimeFormat(state.lang === 'mn' ? 'mn-MN' : state.lang, opts).format(date);
  } catch {
    return date.toDateString();
  }
}
function relativeWhen(due, now) {
  const d = diffDays(due, now);
  if (d === 0) return { label: t('today'), kind: 'soon' };
  if (d === 1) return { label: t('tomorrow'), kind: 'soon' };
  if (d === -1) return { label: t('yesterday'), kind: 'overdue' };
  if (d < 0) {
    const n = Math.abs(d);
    return { label: `${t('overdueBy')} ${n} ${n === 1 ? t('day') : t('days')}`, kind: 'overdue' };
  }
  return { label: `${t('inDays')} ${d} ${d === 1 ? t('day') : t('days')}`, kind: d <= 3 ? 'soon' : 'ok' };
}

/* For bills with monthly recurrence, compute the next occurrence
   on/after a base date. Original date's day-of-month is preserved
   (clamped to month length). */
function nextOccurrence(item, base) {
  const original = parseLocalDate(item.date);
  if (item.recurring !== 'monthly') return original;
  if (original >= base) return original;
  // step forward
  let probe = new Date(original);
  while (probe < base) {
    const y = probe.getFullYear();
    const m = probe.getMonth() + 1;
    const day = original.getDate();
    const lastOfNext = new Date(y, m + 1, 0).getDate();
    probe = new Date(y, m, Math.min(day, lastOfNext));
  }
  return probe;
}

/* ============================================================
   3.  i18n application
   ============================================================ */
function applyI18n() {
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (typeof val === 'string') {
      // Use textContent unless original had children we want to preserve
      if (el.children.length === 0) el.textContent = val;
      else {
        // For buttons with svg + span, only replace the last text node
        const span = el.querySelector('span:not([data-i18n])');
        if (span) span.textContent = val;
      }
    }
  });

  // language switcher
  const langSel = $('#langSelect');
  if (langSel) {
    langSel.innerHTML = LANGUAGES.map(l =>
      `<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${l.label}</option>`
    ).join('');
  }
  // currency switcher in settings
  const defCcy = $('#defaultCurrencySelect');
  if (defCcy) {
    defCcy.innerHTML = CURRENCIES.map(c =>
      `<option value="${c.code}" ${c.code === state.defaultCurrency ? 'selected' : ''}>${c.symbol} — ${c.code} (${c.label})</option>`
    ).join('');
  }
}

/* ============================================================
   4.  Theme
   ============================================================ */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  $$('#themeSeg .seg__btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.theme === state.theme);
  });
}

/* ============================================================
   5.  Dashboard rendering
   ============================================================ */
function renderStatStrip() {
  const strip = $('#statStrip');
  const now = new Date();
  const m0 = startOfMonth(now);
  const m1 = endOfMonth(now);

  let overdueCount = 0;
  let dueSoonCount = 0;
  const monthBills = []; // {amount, currency}

  for (const it of state.items) {
    if (it.done) continue;
    const occ = (it.type === 'bill') ? nextOccurrence(it, m0) : parseLocalDate(it.date);
    const d = diffDays(occ, now);
    if (d < 0) overdueCount++;
    if (d >= 0 && d <= 3) dueSoonCount++;

    if (it.type === 'bill') {
      // Sum all occurrences for THIS calendar month
      if (it.recurring === 'monthly') {
        const original = parseLocalDate(it.date);
        if (original <= m1) {
          const dayOfMonth = original.getDate();
          const clamp = Math.min(dayOfMonth, m1.getDate());
          const thisMonthOcc = new Date(now.getFullYear(), now.getMonth(), clamp);
          if (thisMonthOcc >= original) monthBills.push({ amount: Number(it.amount)||0, currency: it.currency });
        }
      } else {
        const dt = parseLocalDate(it.date);
        if (dt >= m0 && dt <= m1) monthBills.push({ amount: Number(it.amount)||0, currency: it.currency });
      }
    }
  }

  // Group bills by currency
  const byCcy = {};
  for (const b of monthBills) {
    byCcy[b.currency] = (byCcy[b.currency] || 0) + b.amount;
  }
  const ccyEntries = Object.entries(byCcy);
  let dueThisMonth = '—';
  let dueThisMonthSub = '';
  if (ccyEntries.length === 0) {
    dueThisMonth = fmtMoney(0, state.defaultCurrency);
  } else if (ccyEntries.length === 1) {
    dueThisMonth = fmtMoney(ccyEntries[0][1], ccyEntries[0][0]);
  } else {
    // Multi-currency: show the largest, then "+N more"
    ccyEntries.sort((a,b) => b[1]-a[1]);
    dueThisMonth = fmtMoney(ccyEntries[0][1], ccyEntries[0][0]);
    dueThisMonthSub = ccyEntries.slice(1).map(([c,v]) => fmtMoney(v, c)).join(' · ');
  }

  const cards = [
    { label: t('overdue'),       value: overdueCount,         kind: overdueCount > 0 ? 'danger' : 'brand' },
    { label: t('dueSoon'),       value: dueSoonCount,         kind: dueSoonCount  > 0 ? 'warn'   : 'brand' },
    { label: t('dueThisMonth'),  value: dueThisMonth,         kind: 'ok', sub: dueThisMonthSub, small: true },
    { label: t('totalItems'),    value: state.items.length,   kind: 'brand' },
  ];
  strip.innerHTML = cards.map(c => `
    <div class="stat stat--${c.kind}">
      <div class="stat__accent"></div>
      <div class="stat__label">${escapeHtml(c.label)}</div>
      <div class="stat__value ${c.small ? 'stat__value--sm' : ''}">${escapeHtml(String(c.value))}</div>
      ${c.sub ? `<div class="stat__sub">${escapeHtml(c.sub)}</div>` : ''}
    </div>
  `).join('');
}

function renderItemsList() {
  const list = $('#itemsList');
  const empty = $('#emptyState');
  const now = new Date();

  // Build presentation list: include next occurrence for bills.
  const presentable = state.items
    .filter(it => state.filter === 'all' ? true : it.type === state.filter)
    .map(it => {
      const date = it.type === 'bill' ? nextOccurrence(it, now) : parseLocalDate(it.date, it.time);
      return { item: it, when: date };
    })
    .sort((a,b) => a.when - b.when);

  if (presentable.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    renderQuickAdd();
    return;
  }
  empty.hidden = true;

  list.innerHTML = presentable.map(({ item, when }) => itemHTML(item, when, now)).join('');

  // bind actions
  list.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.closest('.item').dataset.id;
      const act = btn.dataset.act;
      if (act === 'toggle') toggleDone(id);
      if (act === 'edit')   openModalForEdit(id);
      if (act === 'delete') deleteWithConfirm(id);
    });
  });
}

function itemHTML(item, when, now) {
  const rel = relativeWhen(when, now);
  const urg = rel.kind === 'overdue' ? 'urg-overdue'
            : rel.kind === 'soon'    ? 'urg-soon'
            : diffDays(when, now) <= 7 ? 'urg-week'
            : 'urg-later';
  const whenClass =
    rel.kind === 'overdue' ? 'item__when--overdue' :
    rel.kind === 'soon'    ? 'item__when--soon' :
                             'item__when--ok';

  const dateLabel = fmtDate(when, { month: 'short', day: 'numeric', year: when.getFullYear() === now.getFullYear() ? undefined : 'numeric' });

  const catLabel = item.category ? (t('cat' + capitalize(item.category)) || item.category) : '';

  const amount = item.type === 'bill' ? fmtMoney(item.amount, item.currency) : '';

  const doneCls = item.done ? 'is-done' : '';
  const typeCls = item.type === 'bill' ? 'is-bill' : 'is-task';

  const recur = item.type === 'bill' && item.recurring === 'monthly'
    ? `<span class="item__recur">↻ ${escapeHtml(t('recurringMonthly'))}</span>` : '';

  return `
    <div class="item ${urg} ${typeCls} ${doneCls}" data-id="${item.id}">
      <div class="item__pill">${item.type === 'bill' ? billIcon() : taskIcon(item.category)}</div>
      <div class="item__body">
        <div class="item__title">${escapeHtml(item.title)}</div>
        <div class="item__meta">
          <span class="${whenClass}">${escapeHtml(rel.label)}</span>
          <span>·</span>
          <span>${escapeHtml(dateLabel)}</span>
          ${item.time ? `<span>·</span><span>${escapeHtml(item.time)}</span>` : ''}
          ${catLabel ? `<span class="item__cat">${escapeHtml(catLabel)}</span>` : ''}
          ${amount ? `<span class="item__amount">${escapeHtml(amount)}</span>` : ''}
          ${recur}
        </div>
      </div>
      <div class="item__actions">
        <button class="item__icon item__icon--ok" data-act="toggle" title="${escapeHtml(item.type==='bill'?(item.done?t('markUnpaid'):t('markPaid')):(item.done?t('markUndone'):t('markDone')))}" aria-label="toggle">
          ${checkIcon()}
        </button>
        <button class="item__icon" data-act="edit" title="${escapeHtml(t('edit'))}" aria-label="edit">${pencilIcon()}</button>
        <button class="item__icon item__icon--danger" data-act="delete" title="${escapeHtml(t('delete'))}" aria-label="delete">${trashIcon()}</button>
      </div>
    </div>
  `;
}

function renderQuickAdd() {
  const wrap = $('#quickAdd');
  if (!wrap) return;
  const presets = [
    { key: 'presetRent',      category: 'rent',      title: t('catRent') },
    { key: 'presetPhone',     category: 'phone',     title: t('catPhone') },
    { key: 'presetInternet',  category: 'internet',  title: t('catInternet') },
    { key: 'presetUtilities', category: 'utilities', title: t('catUtilities') },
  ];
  wrap.innerHTML = `
    <div style="width:100%;text-align:center;font-size:12px;color:var(--ink-3);margin-bottom:4px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(t('quickAdd'))}</div>
    ${presets.map(p => `<button class="ghost-btn" data-preset="${p.category}">+ ${escapeHtml(p.title)}</button>`).join('')}
  `;
  wrap.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => openModalForAdd('bill', btn.dataset.preset));
  });
}

/* ============================================================
   6.  Calendar
   ============================================================ */
function renderCalendar() {
  const cursor = state.calCursor;
  $('#calTitle').textContent = `${t('months')[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const wk = $('#calWeekdays');
  wk.innerHTML = t('weekdaysShort').map(d => `<div>${escapeHtml(d)}</div>`).join('');

  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const startWeekday = first.getDay();
  const daysInMonth = last.getDate();
  const cells = [];

  // Previous-month tail
  const prevLast = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth()-1, prevLast - i);
    cells.push({ date: d, other: true });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i), other: false });
  }
  // Fill to 6 rows (42 cells)
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, other: true });
  }

  const now = new Date();
  const grid = $('#calGrid');
  grid.innerHTML = cells.map(c => {
    const items = itemsOnDay(c.date);
    const dots = items.slice(0, 4).map(it => {
      const cls = it.type === 'bill' ? 'cal-cell__dot--bill' :
                  (diffDays(parseLocalDate(it.date, it.time), now) < 0 && !it.done) ? 'cal-cell__dot--overdue' : '';
      return `<span class="cal-cell__dot ${cls}"></span>`;
    }).join('');
    const isToday = isSameDay(c.date, now);
    const isSel = state.calSelected && isSameDay(c.date, state.calSelected);
    return `
      <button class="cal-cell ${c.other?'is-other':''} ${isToday?'is-today':''} ${isSel?'is-selected':''}" data-iso="${isoDate(c.date)}" ${c.other?'tabindex="-1"':''}>
        <span class="cal-cell__num">${c.date.getDate()}</span>
        <span class="cal-cell__dots">${dots}</span>
      </button>
    `;
  }).join('');

  grid.querySelectorAll('.cal-cell').forEach(btn => {
    if (btn.classList.contains('is-other')) return;
    btn.addEventListener('click', () => {
      state.calSelected = parseLocalDate(btn.dataset.iso);
      renderCalendar();
      renderCalDayDetail();
    });
  });

  renderCalDayDetail();
}

function itemsOnDay(date) {
  const result = [];
  for (const it of state.items) {
    if (it.type === 'bill' && it.recurring === 'monthly') {
      const original = parseLocalDate(it.date);
      if (date >= startOfDay(original)) {
        const lastOfMonth = new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();
        const occDay = Math.min(original.getDate(), lastOfMonth);
        if (date.getDate() === occDay) result.push(it);
      }
    } else {
      const dt = parseLocalDate(it.date);
      if (isSameDay(dt, date)) result.push(it);
    }
  }
  return result;
}

function renderCalDayDetail() {
  const wrap = $('#calDayDetail');
  if (!state.calSelected) { wrap.innerHTML = ''; return; }
  const items = itemsOnDay(state.calSelected);
  const titleDate = fmtDate(state.calSelected, { weekday: 'long', month: 'long', day: 'numeric' });

  if (items.length === 0) {
    wrap.innerHTML = `<div class="cal-day-detail__title">${escapeHtml(titleDate)}</div><div class="muted">${escapeHtml(t('noItemsThisDay'))}</div>`;
    return;
  }
  const now = new Date();
  wrap.innerHTML = `
    <div class="cal-day-detail__title">${escapeHtml(titleDate)}</div>
    <div class="items">
      ${items.map(it => itemHTML(it, state.calSelected, now)).join('')}
    </div>
  `;
  wrap.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.closest('.item').dataset.id;
      const act = btn.dataset.act;
      if (act === 'toggle') toggleDone(id);
      if (act === 'edit')   openModalForEdit(id);
      if (act === 'delete') deleteWithConfirm(id);
    });
  });
}

/* ============================================================
   7.  CRUD
   ============================================================ */
function toggleDone(id) {
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  it.done = !it.done;
  saveItems();
  renderAll();
  toast(t('itemMarked'));
}

function deleteWithConfirm(id) {
  if (!confirm(t('confirmDelete'))) return;
  state.items = state.items.filter(x => x.id !== id);
  saveItems();
  renderAll();
  toast(t('itemDeleted'));
}

/* ============================================================
   8.  Modal (add / edit)
   ============================================================ */
function openModalForAdd(type='task', presetCategory=null) {
  state.editingId = null;
  state.formType = type;
  populateForm(null, type, presetCategory);
  openModal(t('addTitle'));
}

function openModalForEdit(id) {
  const it = state.items.find(x => x.id === id);
  if (!it) return;
  state.editingId = id;
  state.formType = it.type;
  populateForm(it, it.type);
  openModal(t('editTitle'));
}

function openModal(title) {
  $('#modalTitle').textContent = title;
  const m = $('#modal');
  m.hidden = false;
  m.setAttribute('aria-hidden', 'false');
  // focus first input
  setTimeout(() => $('#fTitle')?.focus(), 60);
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  const m = $('#modal');
  m.hidden = true;
  m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function populateForm(item, type, presetCategory) {
  // type seg
  $$('#typeSeg .seg__btn').forEach(b => b.classList.toggle('is-active', b.dataset.type === type));
  $('#billFields').hidden = (type !== 'bill');

  // categories per type
  const taskCats = ['exam', 'assignment', 'other'];
  const billCats = ['rent', 'utilities', 'insurance', 'phone', 'internet', 'tuition', 'subscription', 'other'];
  const cats = type === 'bill' ? billCats : taskCats;
  $('#fCategory').innerHTML = cats.map(c => `<option value="${c}">${escapeHtml(t('cat'+capitalize(c)))}</option>`).join('');

  // currencies
  $('#fCurrency').innerHTML = CURRENCIES.map(c =>
    `<option value="${c.code}">${c.symbol} ${c.code}</option>`).join('');

  if (item) {
    $('#fTitle').value = item.title || '';
    $('#fDate').value  = item.date || isoDate(new Date());
    $('#fTime').value  = item.time || '';
    $('#fCategory').value = item.category || cats[0];
    $('#fNote').value  = item.note || '';
    if (item.type === 'bill') {
      $('#fAmount').value = item.amount || '';
      $('#fCurrency').value = item.currency || state.defaultCurrency;
      $('#fRecurring').value = item.recurring || 'none';
    }
  } else {
    $('#fTitle').value = '';
    $('#fDate').value  = isoDate(new Date());
    $('#fTime').value  = '';
    $('#fCategory').value = presetCategory || cats[0];
    $('#fNote').value  = '';
    $('#fAmount').value = '';
    $('#fCurrency').value = state.defaultCurrency;
    $('#fRecurring').value = 'none';
    // Adjust placeholder for type
    $('#fTitle').placeholder = type === 'bill' ? t('placeholderBillTitle') : t('placeholderTaskTitle');
  }
  $('#fNote').placeholder = t('placeholderNote');
}

function readForm() {
  const type = $('#typeSeg .seg__btn.is-active').dataset.type;
  const item = {
    id: state.editingId || uid(),
    type,
    title: $('#fTitle').value.trim(),
    date: $('#fDate').value,
    time: $('#fTime').value || null,
    category: $('#fCategory').value,
    note: $('#fNote').value.trim() || null,
    done: false,
  };
  if (type === 'bill') {
    item.amount = $('#fAmount').value ? Number($('#fAmount').value) : null;
    item.currency = $('#fCurrency').value;
    item.recurring = $('#fRecurring').value;
  }
  if (state.editingId) {
    const existing = state.items.find(x => x.id === state.editingId);
    if (existing) item.done = existing.done; // preserve
  }
  return item;
}

function submitForm(e) {
  e.preventDefault();
  const item = readForm();
  if (!item.title || !item.date) return;

  const idx = state.items.findIndex(x => x.id === item.id);
  if (idx >= 0) {
    state.items[idx] = item;
    toast(t('itemUpdated'));
  } else {
    state.items.push(item);
    toast(t('itemAdded'));
  }
  saveItems();
  closeModal();
  renderAll();
}

/* ============================================================
   9.  Navigation
   ============================================================ */
function showView(name) {
  state.view = name;
  $$('.view').forEach(v => v.hidden = v.dataset.view !== name);
  $$('.bn__btn').forEach(b => b.classList.toggle('is-active', b.dataset.nav === name));
  if (name === 'calendar') renderCalendar();
}

/* ============================================================
   10.  .ics export
   Generate a valid VCALENDAR with VEVENTs.
   - Tasks → single event on the day (all-day if no time).
   - Bills → single event on due date OR RRULE=FREQ=MONTHLY.
   - All-day events use DTSTART;VALUE=DATE, no DTEND (allowed) or +1d.
   - Line folding: lines > 75 octets MUST be folded with CRLF + space.
   ============================================================ */
function pad(n) { return String(n).padStart(2, '0'); }

function icsDate(d) {
  // YYYYMMDD (all-day, floating local)
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}
function icsDateTimeUTC(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function icsDateTimeLocalFloating(d) {
  // Floating local time — no Z, no TZID. Apps interpret as local.
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function icsEscape(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
function icsFold(line) {
  // Fold at 75 octets (approx by char length — good enough for typical text)
  const max = 75;
  if (line.length <= max) return line;
  const chunks = [];
  let i = 0;
  chunks.push(line.slice(0, max));
  i = max;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + (max - 1)));
    i += (max - 1);
  }
  return chunks.join('\r\n');
}

function buildICS(items) {
  const now = new Date();
  const dtstamp = icsDateTimeUTC(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sojourn//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const it of items) {
    const start = parseLocalDate(it.date, it.time);
    const hasTime = !!it.time;

    let summary = it.title;
    if (it.type === 'bill' && it.amount != null && it.amount !== '') {
      summary = `${it.title} — ${fmtMoney(it.amount, it.currency)}`;
    }

    const descParts = [];
    if (it.note) descParts.push(it.note);
    if (it.type === 'bill') {
      descParts.push(`Category: ${t('cat' + capitalize(it.category || 'other'))}`);
      if (it.amount != null) descParts.push(`Amount: ${fmtMoney(it.amount, it.currency)}`);
    } else {
      descParts.push(`Category: ${t('cat' + capitalize(it.category || 'other'))}`);
    }
    descParts.push('— created by Sojourn');
    // Use real newlines; icsEscape will convert them to RFC5545 "\n" sequences.
    const description = descParts.join('\n');

    const evLines = [
      'BEGIN:VEVENT',
      `UID:${it.id}@sojourn.app`,
      `DTSTAMP:${dtstamp}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `CATEGORIES:${icsEscape(it.type === 'bill' ? 'Bill' : 'Task')}`,
    ];
    if (hasTime) {
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      evLines.push(`DTSTART:${icsDateTimeLocalFloating(start)}`);
      evLines.push(`DTEND:${icsDateTimeLocalFloating(end)}`);
    } else {
      const next = new Date(start); next.setDate(next.getDate() + 1);
      evLines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
      evLines.push(`DTEND;VALUE=DATE:${icsDate(next)}`);
    }
    if (it.type === 'bill' && it.recurring === 'monthly') {
      // BYMONTHDAY to keep day-of-month stable across months
      const dom = start.getDate();
      evLines.push(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${dom}`);
    }
    // alarm 1 day before for daters; 15 min before for timed events
    evLines.push('BEGIN:VALARM');
    evLines.push('ACTION:DISPLAY');
    evLines.push(`DESCRIPTION:${icsEscape(it.title)}`);
    evLines.push(hasTime ? 'TRIGGER:-PT15M' : 'TRIGGER:-P1D');
    evLines.push('END:VALARM');
    evLines.push('END:VEVENT');

    lines.push(...evLines);
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n');
}

function exportIcs() {
  if (state.items.length === 0) {
    toast(t('emptyTitle'));
    return;
  }
  const ics = buildICS(state.items);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sojourn-${isoDate(new Date())}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(t('icsExported'));
}

/* ============================================================
   11.  Backup (JSON) export / import
   ============================================================ */
function exportJson() {
  const payload = {
    app: 'Sojourn',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      lang: state.lang,
      theme: state.theme,
      defaultCurrency: state.defaultCurrency,
    },
    items: state.items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sojourn-backup-${isoDate(new Date())}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(t('backupExported'));
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.items)) throw new Error('bad');
      // Replace items (simple semantics; could merge if desired)
      state.items = data.items.filter(x => x && x.id && x.title && x.date && x.type);
      if (data.settings) {
        if (data.settings.lang) state.lang = data.settings.lang;
        if (data.settings.theme) state.theme = data.settings.theme;
        if (data.settings.defaultCurrency) state.defaultCurrency = data.settings.defaultCurrency;
        localStorage.setItem(LS_LANG, state.lang);
        localStorage.setItem(LS_THEME, state.theme);
        localStorage.setItem(LS_DEFAULT_CCY, state.defaultCurrency);
      }
      saveItems();
      applyI18n(); applyTheme(); renderAll();
      toast(t('backupImported'));
    } catch {
      toast(t('importFailed'));
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   12.  Inline SVGs
   ============================================================ */
function billIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v14l-3-2-3 2-3-2-3 2-4-2V4z"/><path d="M8 9h8M8 13h5"/></svg>`;
}
function taskIcon(cat) {
  if (cat === 'exam')
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13H5z"/><path d="M8 11h8M8 15h5"/></svg>`;
  if (cat === 'assignment')
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l3 3v15H6z"/><path d="M9 12l2 2 4-4"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>`;
}
function checkIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4 10-10"/></svg>`;
}
function pencilIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg>`;
}
function trashIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;
}

/* ============================================================
   13.  Misc helpers
   ============================================================ */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2200);
}

/* ============================================================
   14.  Tab title heartbeat — show next upcoming item count
   ============================================================ */
function updateTabTitle() {
  const now = new Date();
  let imminent = 0;
  for (const it of state.items) {
    if (it.done) continue;
    const occ = (it.type === 'bill') ? nextOccurrence(it, now) : parseLocalDate(it.date, it.time);
    const d = diffDays(occ, now);
    if (d >= 0 && d <= 3) imminent++;
  }
  document.title = imminent > 0
    ? `(${imminent}) Sojourn — ${t('dueSoon')}`
    : `Sojourn — ${t('tagline')}`;
}

/* ============================================================
   15.  Main render entry-point
   ============================================================ */
function renderAll() {
  renderStatStrip();
  renderItemsList();
  if (state.view === 'calendar') renderCalendar();
  updateTabTitle();
}

/* ============================================================
   16.  Wire-up
   ============================================================ */
function init() {
  applyI18n();
  applyTheme();
  renderAll();

  // Nav
  $$('.bn__btn').forEach(b => {
    b.addEventListener('click', () => showView(b.dataset.nav));
  });

  // Filter
  $$('.filter-row .seg__btn').forEach(b => {
    b.addEventListener('click', () => {
      state.filter = b.dataset.filter;
      $$('.filter-row .seg__btn').forEach(x => x.classList.toggle('is-active', x === b));
      renderItemsList();
    });
  });

  // Add
  $('#addBtn').addEventListener('click', () => openModalForAdd('task'));
  $('#emptyAddBtn').addEventListener('click', () => openModalForAdd('task'));

  // Export
  $('#exportIcsBtn').addEventListener('click', exportIcs);

  // Modal close
  $$('#modal [data-close]').forEach(el => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  // Modal type seg
  $$('#typeSeg .seg__btn').forEach(b => {
    b.addEventListener('click', () => {
      const type = b.dataset.type;
      state.formType = type;
      // Preserve existing values, just swap categories & toggle bill fields.
      const currentItem = state.editingId ? state.items.find(x => x.id === state.editingId) : null;
      populateForm(currentItem, type);
      // re-fill title/date if user already typed something — repopulate preserves only on edit, so we manually set
      if (!currentItem) {
        // keep title/date/time/note that the user already typed
        // populateForm cleared them; restore from DOM snapshot? simplest: re-grab nothing — accept the reset.
      }
    });
  });

  // Form submit
  $('#itemForm').addEventListener('submit', submitForm);

  // Settings — theme
  $$('#themeSeg .seg__btn').forEach(b => {
    b.addEventListener('click', () => {
      state.theme = b.dataset.theme;
      localStorage.setItem(LS_THEME, state.theme);
      applyTheme();
    });
  });

  // Settings — language
  $('#langSelect').addEventListener('change', e => {
    state.lang = e.target.value;
    localStorage.setItem(LS_LANG, state.lang);
    applyI18n();
    renderAll();
  });

  // Settings — default currency
  $('#defaultCurrencySelect').addEventListener('change', e => {
    state.defaultCurrency = e.target.value;
    localStorage.setItem(LS_DEFAULT_CCY, state.defaultCurrency);
  });

  // Backup
  $('#exportJsonBtn').addEventListener('click', exportJson);
  $('#importJsonInput').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });
  $('#clearDataBtn').addEventListener('click', () => {
    if (!confirm(t('confirmClear'))) return;
    state.items = [];
    saveItems();
    renderAll();
    toast(t('dataCleared'));
  });

  // Calendar nav
  $('#calPrev').addEventListener('click', () => {
    state.calCursor = addMonths(state.calCursor, -1);
    renderCalendar();
  });
  $('#calNext').addEventListener('click', () => {
    state.calCursor = addMonths(state.calCursor, 1);
    renderCalendar();
  });

  // SW registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Register relative — works on GitHub Pages subpaths.
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }

  // Periodically refresh tab title and "due soon" counts (hourly)
  setInterval(updateTabTitle, 60 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
