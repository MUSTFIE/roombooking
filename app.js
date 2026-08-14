// ============================================
// 設定區：請替換成你的 Supabase 專案資訊
// ============================================
const SUPABASE_URL = 'https://hsfcgtktagvuqsdaadjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZmNndGt0YWd2dXFzZGFhZGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1ODAyMzEsImV4cCI6MjEwMjE1NjIzMX0.IqCx1qkaMKcyZqm8IBhYbfEcyWsZrvqlpfB9ZH6BWFI';

const ROOMS = ['A200', 'A201', 'A301'];
const DAY_START = 9;   // 09:00
const DAY_END = 22;    // 22:00
const HOUR_HEIGHT = 61; // px per hour（再 +30%）

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// 狀態
// ============================================
let currentUser = localStorage.getItem('room_status_nickname') || '';
let currentRoom = 'A200';
let weekStart = getMonday(new Date()); // Date object, Monday 00:00
let currentBookings = [];
let currentClaims = []; // flat claims for calendar green blocks
let selectedBookingId = null;
let viewMode = window.innerWidth < 768 ? 'day' : 'week'; // week | day | month
let dayCursor = new Date(); // for day view
dayCursor.setHours(0,0,0,0);
let monthCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), 1);
let dpCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), 1); // date picker month
let loadTimer = null;
let pendingPrefill = null; // { date, start, end } from cell click

// ============================================
// DOM
// ============================================
const loginModal = document.getElementById('login-modal');
const appEl = document.getElementById('app');
const nicknameInput = document.getElementById('nickname-input');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserEl = document.getElementById('current-user');
const weekLabel = document.getElementById('week-label');
const calendarEl = document.getElementById('calendar');
const toastEl = document.getElementById('toast');

const bookingModal = document.getElementById('booking-modal');
const bookingModalRoom = document.getElementById('booking-modal-room');
const bookingDateFrom = document.getElementById('booking-date-from');
const bookingDateTo = document.getElementById('booking-date-to');
const bookingStart = document.getElementById('booking-start');
const bookingEnd = document.getElementById('booking-end');

const claimModal = document.getElementById('claim-modal');
const claimModalRoom = document.getElementById('claim-modal-room');
const claimDate = document.getElementById('claim-date');
const claimStart = document.getElementById('claim-start');
const claimEnd = document.getElementById('claim-end');
const claimRemark = document.getElementById('claim-remark');

const detailModal = document.getElementById('detail-modal');
const detailContent = document.getElementById('detail-content');
const detailToggleUse = document.getElementById('detail-toggle-use');
const detailDelete = document.getElementById('detail-delete');
const detailClose = document.getElementById('detail-close');
const detailAddClaim = document.getElementById('detail-add-claim');

const logsModal = document.getElementById('logs-modal');
const logsContent = document.getElementById('logs-content');

// ============================================
// 工具函式
// ============================================
function showToast(msg, duration = 2800) {
  toastEl.textContent = msg;
  toastEl.classList.remove('opacity-0');
  toastEl.classList.add('opacity-100');
  setTimeout(() => {
    toastEl.classList.remove('opacity-100');
    toastEl.classList.add('opacity-0');
  }, duration);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

/** 驗證並正規化 24 小時時間，回傳 "HH:MM" 或 null */
function parseTimeInput(str) {
  if (!str) return null;
  const cleaned = String(str).trim().replace('：', ':');
  const m = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function timeToDb(t) {
  if (!t) return null;
  const p = parseTimeInput(t);
  return p ? p + ':00' : null;
}

/** 兩時段是否重疊 */
function timesOverlap(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseTimeToMinutes(t) {
  const parts = String(t).split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
}

function minutesToTop(mins) {
  return ((mins - DAY_START * 60) / 60) * HOUR_HEIGHT;
}

function heightFromDuration(startMins, endMins) {
  return ((endMins - startMins) / 60) * HOUR_HEIGHT;
}

function isToday(dateStr) {
  return dateStr === toDateStr(new Date());
}

// ============================================
// 登入
// ============================================
function checkLogin() {
  if (currentUser) {
    loginModal.classList.add('hidden');
    appEl.classList.remove('hidden');
    currentUserEl.textContent = currentUser;
    updateWeekLabel();
    loadWeekData();
  } else {
    loginModal.classList.remove('hidden');
    appEl.classList.add('hidden');
    nicknameInput.focus();
  }
}

loginBtn.addEventListener('click', () => {
  const name = nicknameInput.value.trim();
  if (!name) return showToast('請輸入暱稱');
  currentUser = name;
  localStorage.setItem('room_status_nickname', name);
  checkLogin();
});

nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

logoutBtn.addEventListener('click', () => {
  currentUser = '';
  localStorage.removeItem('room_status_nickname');
  checkLogin();
});

// ============================================
// 房間分頁
// ============================================
document.querySelectorAll('.room-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentRoom = btn.dataset.room;
    document.querySelectorAll('.room-tab').forEach((b) => {
      b.classList.remove('bg-white', 'shadow', 'text-slate-800');
      b.classList.add('text-slate-600');
    });
    btn.classList.add('bg-white', 'shadow', 'text-slate-800');
    btn.classList.remove('text-slate-600');
    loadWeekData();
  });
});

// ============================================
// 週切換
// ============================================
function updateWeekLabel() {
  const opts = { month: 'numeric', day: 'numeric' };
  if (viewMode === 'day') {
    const wd = ['日','一','二','三','四','五','六'][dayCursor.getDay()];
    weekLabel.textContent = `${dayCursor.toLocaleDateString('zh-TW', opts)}（週${wd}）`;
  } else if (viewMode === 'month') {
    weekLabel.textContent = `${monthCursor.getFullYear()}年 ${monthCursor.getMonth() + 1}月`;
  } else {
    const end = addDays(weekStart, 6);
    weekLabel.textContent = `${weekStart.toLocaleDateString('zh-TW', opts)} – ${end.toLocaleDateString('zh-TW', opts)}`;
  }
}

document.getElementById('prev-week').addEventListener('click', () => {
  if (viewMode === 'day') {
    dayCursor = addDays(dayCursor, -1);
  } else if (viewMode === 'month') {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
  } else {
    weekStart = addDays(weekStart, -7);
  }
  updateWeekLabel();
  loadWeekData();
});

document.getElementById('next-week').addEventListener('click', () => {
  if (viewMode === 'day') {
    dayCursor = addDays(dayCursor, 1);
  } else if (viewMode === 'month') {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
  } else {
    weekStart = addDays(weekStart, 7);
  }
  updateWeekLabel();
  loadWeekData();
});

document.getElementById('today-btn').addEventListener('click', () => {
  const now = new Date();
  now.setHours(0,0,0,0);
  dayCursor = now;
  weekStart = getMonday(now);
  monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  updateWeekLabel();
  loadWeekData();
});

function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.view-mode-btn').forEach((b) => {
    b.classList.remove('bg-white', 'shadow');
    b.classList.add('text-slate-600');
  });
  const idMap = { day: 'view-mode-day', week: 'view-mode-week', month: 'view-mode-month' };
  const active = document.getElementById(idMap[mode]);
  if (active) {
    active.classList.add('bg-white', 'shadow');
    active.classList.remove('text-slate-600');
  }
  if (mode === 'day') {
    dayCursor = new Date(dayCursor);
  } else if (mode === 'month') {
    monthCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), 1);
  } else {
    weekStart = getMonday(dayCursor);
  }
  updateWeekLabel();
  loadWeekData();
}

const vmWeek = document.getElementById('view-mode-week');
const vmDay = document.getElementById('view-mode-day');
const vmMonth = document.getElementById('view-mode-month');
if (vmWeek) vmWeek.addEventListener('click', () => setViewMode('week'));
if (vmDay) vmDay.addEventListener('click', () => setViewMode('day'));
if (vmMonth) vmMonth.addEventListener('click', () => setViewMode('month'));
// init button style for day default on mobile
if (viewMode === 'day' && vmDay) {
  vmWeek && vmWeek.classList.remove('bg-white', 'shadow');
  vmDay.classList.add('bg-white', 'shadow');
  vmDay.classList.remove('text-slate-600');
}

// ============================================
// 資料載入
// ============================================
function scheduleReload() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => loadWeekData(), 400);
}

async function loadWeekData() {
  let from, to;
  if (viewMode === 'day') {
    from = to = toDateStr(dayCursor);
  } else if (viewMode === 'month') {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    from = toDateStr(new Date(y, m, 1));
    to = toDateStr(new Date(y, m + 1, 0));
  } else {
    from = toDateStr(weekStart);
    to = toDateStr(addDays(weekStart, 6));
  }

  calendarEl.innerHTML = `<div class="p-12 text-center text-slate-400 text-sm">載入中...</div>`;

  try {
    const { data, error } = await supabaseClient
      .from('bookings')
      .select(`
        id, room, booking_date, start_time, end_time, booked_by, is_in_use, created_at,
        claims ( id, claimed_by, start_time, end_time, remark, created_at, claim_date )
      `)
      .eq('room', currentRoom)
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('start_time', { ascending: true });

    if (error) throw error;
    currentBookings = data || [];
    // flatten claims for green blocks
    currentClaims = [];
    currentBookings.forEach((b) => {
      (b.claims || []).forEach((c) => {
        currentClaims.push({ ...c, booking_id: b.id, room: b.room, claim_date: c.claim_date || b.booking_date });
      });
    });
    renderCalendar();
  } catch (err) {
    console.error(err);
    calendarEl.innerHTML = `<div class="p-12 text-center text-red-500 text-sm">載入失敗：${escapeHtml(err.message)}</div>`;
  }
}

// ============================================
// 渲染週曆
// ============================================
function renderMonthView() {
  const y = monthCursor.getFullYear();
  const m = monthCursor.getMonth();
  const first = new Date(y, m, 1);
  // Monday-first: offset
  let startPad = first.getDay(); // 0=Sun
  startPad = startPad === 0 ? 6 : startPad - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const bookingsByDate = {};
  currentBookings.forEach((b) => {
    if (!bookingsByDate[b.booking_date]) bookingsByDate[b.booking_date] = [];
    bookingsByDate[b.booking_date].push(b);
  });
  const claimsByDate = {};
  currentClaims.forEach((c) => {
    const ds = c.claim_date || c.booking_date;
    if (!claimsByDate[ds]) claimsByDate[ds] = [];
    claimsByDate[ds].push(c);
  });

  let html = `<div class="p-3">
    <div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-2">
      <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
    </div>
    <div class="grid grid-cols-7 gap-1.5">`;

  cells.forEach((d) => {
    if (!d) {
      html += `<div class="min-h-[72px] rounded-lg bg-slate-50"></div>`;
      return;
    }
    const ds = toDateStr(d);
    const isTod = isToday(ds);
    const bs = bookingsByDate[ds] || [];
    const cs = claimsByDate[ds] || [];
    html += `<button type="button" data-date="${ds}" class="month-day min-h-[72px] rounded-lg border p-1.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50 ${isTod ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white'}">
      <div class="text-sm font-medium ${isTod ? 'text-blue-700' : 'text-slate-700'}">${d.getDate()}</div>
      <div class="mt-1 space-y-0.5">`;
    bs.slice(0, 2).forEach((b) => {
      html += `<div class="text-[10px] truncate rounded px-1 py-0.5 bg-slate-200 text-slate-600">${formatTime(b.start_time)} ${escapeHtml(b.room || '')}</div>`;
    });
    cs.slice(0, 2).forEach((c) => {
      html += `<div class="text-[10px] truncate rounded px-1 py-0.5 bg-emerald-200 text-emerald-800">${formatTime(c.start_time)} ${escapeHtml(c.claimed_by)}</div>`;
    });
    const more = bs.length + cs.length - 4;
    if (more > 0) html += `<div class="text-[10px] text-slate-400">+${more}</div>`;
    html += `</div></button>`;
  });
  html += `</div></div>`;
  calendarEl.innerHTML = html;

  calendarEl.querySelectorAll('.month-day').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ds = btn.dataset.date;
      const [yy, mm, dd] = ds.split('-').map(Number);
      dayCursor = new Date(yy, mm - 1, dd);
      weekStart = getMonday(dayCursor);
      setViewMode('week');
    });
  });
}

function renderCalendar() {
  if (viewMode === 'month') {
    renderMonthView();
    return;
  }

  const hours = [];
  for (let h = DAY_START; h < DAY_END; h++) hours.push(h);

  let days = [];
  if (viewMode === 'day') {
    days = [new Date(dayCursor)];
  } else {
    for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
  }

  const colCount = days.length;
  const totalHeight = hours.length * HOUR_HEIGHT;
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  // dynamic grid columns
  const gridStyle = `display:grid;grid-template-columns:56px repeat(${colCount}, 1fr);`;

  let html = `<div style="${gridStyle}">`;
  html += `<div class="day-header"></div>`;
  days.forEach((d) => {
    const ds = toDateStr(d);
    const cls = isToday(ds) ? 'day-header today' : 'day-header';
    const wd = weekdays[d.getDay()];
    html += `<div class="${cls}">
      <div class="text-xs text-slate-500">週${wd}</div>
      <div class="text-sm font-medium">${d.getMonth() + 1}/${d.getDate()}</div>
    </div>`;
  });

  hours.forEach((h) => {
    html += `<div class="time-label">${String(h).padStart(2, '0')}:00</div>`;
    days.forEach((d) => {
      const ds = toDateStr(d);
      html += `<div class="slot-cell empty-slot" data-date="${ds}" data-hour="${h}" style="height:${HOUR_HEIGHT}px"></div>`;
    });
  });
  html += `</div>`;

  // overlay
  html += `<div style="position:relative; margin-top:-${totalHeight}px; height:${totalHeight}px; pointer-events:none">`;
  html += `<div style="${gridStyle}height:${totalHeight}px;pointer-events:none">`;
  html += `<div></div>`;
  days.forEach((d) => {
    const ds = toDateStr(d);
    html += `<div class="day-overlay" data-date="${ds}" style="position:relative; height:${totalHeight}px; pointer-events:none"></div>`;
  });
  html += `</div></div>`;

  calendarEl.innerHTML = html;

  // place gray bookings
  days.forEach((d) => {
    const ds = toDateStr(d);
    const overlay = calendarEl.querySelector(`.day-overlay[data-date="${ds}"]`);
    if (!overlay) return;

    currentBookings
      .filter((b) => b.booking_date === ds)
      .forEach((b) => {
        const startM = parseTimeToMinutes(b.start_time);
        const endM = parseTimeToMinutes(b.end_time);
        const visStart = Math.max(startM, DAY_START * 60);
        const visEnd = Math.min(endM, DAY_END * 60);
        if (visEnd <= visStart) return;
        const top = minutesToTop(visStart);
        const height = Math.max(heightFromDuration(visStart, visEnd), 16);
        const el = document.createElement('div');
        el.className = 'event-block event-gray';
        el.style.top = `${top}px`;
        el.style.height = `${height}px`;
        el.style.pointerEvents = 'auto';
        el.dataset.id = b.id;
        el.innerHTML = `
          <div class="font-medium truncate">${formatTime(b.start_time)}–${formatTime(b.end_time)}</div>
          <div class="truncate opacity-80 text-[10px]">系統 · ${escapeHtml(b.booked_by)}</div>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openDetail(b.id);
        });
        overlay.appendChild(el);
      });

    // green claims on top
    currentClaims
      .filter((c) => (c.claim_date || c.booking_date) === ds)
      .forEach((c) => {
        const startM = parseTimeToMinutes(c.start_time);
        const endM = parseTimeToMinutes(c.end_time);
        const visStart = Math.max(startM, DAY_START * 60);
        const visEnd = Math.min(endM, DAY_END * 60);
        if (visEnd <= visStart) return;
        const top = minutesToTop(visStart);
        const height = Math.max(heightFromDuration(visStart, visEnd), 16);
        const el = document.createElement('div');
        el.className = 'event-block event-green';
        el.style.top = `${top}px`;
        el.style.height = `${height}px`;
        el.style.pointerEvents = 'auto';
        el.style.zIndex = '15';
        el.dataset.bookingId = c.booking_id;
        el.innerHTML = `
          <div class="font-medium truncate">${formatTime(c.start_time)}–${formatTime(c.end_time)}</div>
          <div class="truncate opacity-80 text-[10px]">使用 · ${escapeHtml(c.claimed_by)}</div>
        `;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          openDetail(c.booking_id);
        });
        overlay.appendChild(el);
      });
  });

}


// ============================================
// 登記系統預約
// ============================================
document.getElementById('btn-add-booking').addEventListener('click', () => {
  bookingModalRoom.textContent = currentRoom;
  const today = toDateStr(new Date());
  if (pendingPrefill) {
    bookingDateFrom.value = pendingPrefill.date;
    bookingDateTo.value = pendingPrefill.date;
    bookingStart.value = pendingPrefill.start;
    bookingEnd.value = pendingPrefill.end;
    pendingPrefill = null;
  } else {
    bookingDateFrom.value = today;
    bookingDateTo.value = today;
    bookingStart.value = '09:00';
    bookingEnd.value = '10:00';
  }
  bookingModal.classList.remove('hidden');
});

document.getElementById('booking-cancel').addEventListener('click', () => {
  bookingModal.classList.add('hidden');
});
bookingModal.addEventListener('click', (e) => {
  if (e.target === bookingModal) bookingModal.classList.add('hidden');
});

document.getElementById('booking-submit').addEventListener('click', async () => {
  const from = bookingDateFrom.value;
  const to = bookingDateTo.value;
  const startNorm = parseTimeInput(bookingStart.value);
  const endNorm = parseTimeInput(bookingEnd.value);

  if (!from || !to) return showToast('請填寫完整日期');
  if (!startNorm || !endNorm) return showToast('時間格式錯誤，請使用 24 小時制，例如 09:00 或 13:30');
  if (from > to) return showToast('結束日期不能早於開始日期');
  if (startNorm >= endNorm) return showToast('結束時間必須晚於開始時間');

  const workdaysOnly = document.getElementById('booking-workdays-only')?.checked;
  const dates = [];
  let cur = new Date(from + 'T00:00:00');
  const endDate = new Date(to + 'T00:00:00');
  while (cur <= endDate) {
    const dow = cur.getDay(); // 0=Sun ... 6=Sat
    if (!workdaysOnly || (dow >= 1 && dow <= 5)) {
      dates.push(toDateStr(cur));
    }
    cur = addDays(cur, 1);
  }
  if (dates.length === 0) {
    return showToast('所選區間沒有工作日（週一至週五）');
  }

  const startM = parseTimeToMinutes(startNorm);
  const endM = parseTimeToMinutes(endNorm);

  // 檢查與既有時段是否重疊
  try {
    const { data: existing, error: qErr } = await supabaseClient
      .from('bookings')
      .select('id, booking_date, start_time, end_time, is_in_use, booked_by')
      .eq('room', currentRoom)
      .in('booking_date', dates);
    if (qErr) throw qErr;

    const conflicts = (existing || []).filter((b) => {
      const bStart = parseTimeToMinutes(b.start_time);
      const bEnd = parseTimeToMinutes(b.end_time);
      return timesOverlap(startM, endM, bStart, bEnd);
    });

    if (conflicts.length > 0) {
      const summary = conflicts
        .slice(0, 5)
        .map((b) => `${b.booking_date} ${formatTime(b.start_time)}–${formatTime(b.end_time)}`)
        .join('\n');
      const more = conflicts.length > 5 ? `\n…共 ${conflicts.length} 筆衝突` : '';
      alert(`以下時段與既有系統預約重疊，無法新增：\n\n${summary}${more}`);
      return;
    }
  } catch (err) {
    console.error(err);
    // 查詢失敗仍允許繼續，但提示
    showToast('無法檢查衝突，仍會嘗試新增');
  }

  try {
    const rows = dates.map((d) => ({
      room: currentRoom,
      booking_date: d,
      start_time: timeToDb(startNorm),
      end_time: timeToDb(endNorm),
      booked_by: currentUser,
      is_in_use: false,
    }));

    const { error } = await supabaseClient.from('bookings').insert(rows);
    if (error) throw error;

    await writeLog('create_booking', {
      room: currentRoom,
      dates,
      start: startNorm,
      end: endNorm,
      count: dates.length,
    });

    showToast(`已登記 ${dates.length} 筆系統預約`);
    bookingModal.classList.add('hidden');
    loadWeekData();
  } catch (err) {
    console.error(err);
    showToast('新增失敗：' + (err.message || ''));
  }
});

// ============================================
// 登記實際使用（須落在既有系統預約範圍內）
// ============================================
document.getElementById('btn-add-claim').addEventListener('click', () => {
  claimModalRoom.textContent = currentRoom;
  if (pendingPrefill) {
    claimDate.value = pendingPrefill.date;
    claimStart.value = pendingPrefill.start;
    claimEnd.value = pendingPrefill.end;
    pendingPrefill = null;
  } else {
    claimDate.value = toDateStr(new Date());
    claimStart.value = '';
    claimEnd.value = '';
  }
  claimRemark.value = '';
  claimModal.classList.remove('hidden');
});

document.getElementById('claim-cancel').addEventListener('click', () => {
  claimModal.classList.add('hidden');
});
claimModal.addEventListener('click', (e) => {
  if (e.target === claimModal) claimModal.classList.add('hidden');
});

document.getElementById('claim-submit').addEventListener('click', async () => {
  const date = claimDate.value;
  const startNorm = parseTimeInput(claimStart.value);
  const endNorm = parseTimeInput(claimEnd.value);
  const remark = claimRemark.value.trim();

  if (!date) return showToast('請填寫日期');
  if (!startNorm || !endNorm) return showToast('時間格式錯誤，請使用 24 小時制，例如 09:00 或 13:30');
  if (startNorm >= endNorm) return showToast('結束時間必須晚於開始時間');

  const startM = parseTimeToMinutes(startNorm);
  const endM = parseTimeToMinutes(endNorm);

  let booking = currentBookings.find((b) => {
    if (b.booking_date !== date) return false;
    const bStart = parseTimeToMinutes(b.start_time);
    const bEnd = parseTimeToMinutes(b.end_time);
    return startM >= bStart && endM <= bEnd;
  });

  if (!booking) {
    try {
      const { data, error } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('room', currentRoom)
        .eq('booking_date', date);
      if (error) throw error;
      booking = (data || []).find((b) => {
        const bStart = parseTimeToMinutes(b.start_time);
        const bEnd = parseTimeToMinutes(b.end_time);
        return startM >= bStart && endM <= bEnd;
      });
    } catch (err) {
      console.error(err);
      return showToast('查詢預約失敗');
    }
  }

  if (!booking) {
    return showToast('找不到涵蓋此時段的預約紀錄，請確認時間是否在已輸入的預約範圍內');
  }

  // 檢查是否與同日同房既有「新增預約」時段重疊
  try {
    const { data: existingClaims, error: cErr } = await supabaseClient
      .from('claims')
      .select('id, start_time, end_time, claimed_by')
      .eq('room', currentRoom)
      .eq('claim_date', date);
    if (cErr) throw cErr;

    const overlapClaim = (existingClaims || []).find((oc) =>
      timesOverlap(startM, endM, parseTimeToMinutes(oc.start_time), parseTimeToMinutes(oc.end_time))
    );
    if (overlapClaim) {
      return showToast(
        `與已預約時段重疊（${formatTime(overlapClaim.start_time)}–${formatTime(overlapClaim.end_time)}，${overlapClaim.claimed_by}），無法新增`
      );
    }
  } catch (err) {
    console.error(err);
    return showToast('檢查重疊時發生錯誤');
  }

  try {
    const { error: claimErr } = await supabaseClient.from('claims').insert({
      booking_id: booking.id,
      room: currentRoom,
      claim_date: date,
      start_time: timeToDb(startNorm),
      end_time: timeToDb(endNorm),
      claimed_by: currentUser,
      remark: remark || null,
    });
    if (claimErr) throw claimErr;

    const { error: updErr } = await supabaseClient
      .from('bookings')
      .update({ is_in_use: true })
      .eq('id', booking.id);
    if (updErr) throw updErr;

    await writeLog('add_claim', {
      room: currentRoom,
      date,
      start: startNorm,
      end: endNorm,
      remark,
      booking_id: booking.id,
    });

    showToast('已登記實際使用');
    claimModal.classList.add('hidden');
    loadWeekData();
  } catch (err) {
    console.error(err);
    showToast('新增失敗：' + (err.message || ''));
  }
});

// ============================================
// 詳情 Modal
// ============================================
async function openDetail(bookingId) {
  selectedBookingId = bookingId;
  let b = currentBookings.find((x) => x.id === bookingId);

  if (!b) {
    try {
      const { data, error } = await supabaseClient
        .from('bookings')
        .select(`*, claims (*)`)
        .eq('id', bookingId)
        .single();
      if (error) throw error;
      b = data;
    } catch (err) {
      return showToast('無法載入詳情');
    }
  }

  const claims = b.claims || [];
  const isOwner = b.booked_by === currentUser;

  detailContent.innerHTML = `
    <div class="flex justify-between"><span class="text-slate-500">房間</span><span class="font-medium">${escapeHtml(b.room)}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">日期</span><span class="font-medium">${escapeHtml(b.booking_date)}</span></div>
    <div class="flex justify-between items-center gap-2">
      <span class="text-slate-500">時段</span>
      <span class="font-medium" id="detail-time-display">${formatTime(b.start_time)} – ${formatTime(b.end_time)}</span>
    </div>
    ${
      isOwner
        ? `<div class="mt-1">
            <button type="button" id="toggle-booking-time-edit" class="text-xs text-blue-600 hover:text-blue-800 font-medium">編輯時間</button>
            <div id="booking-time-edit-form" class="hidden grid grid-cols-2 gap-2 mt-1.5">
              <input id="detail-edit-start" type="text" value="${formatTime(b.start_time)}" placeholder="09:00" maxlength="5"
                     class="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input id="detail-edit-end" type="text" value="${formatTime(b.end_time)}" placeholder="10:00" maxlength="5"
                     class="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" id="detail-save-time" class="col-span-2 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg py-1.5 font-medium">儲存時間</button>
            </div>
          </div>`
        : ''
    }
    <div class="flex justify-between"><span class="text-slate-500">預約人</span><span class="font-medium">${escapeHtml(b.booked_by)}</span></div>
    <div class="flex justify-between">
      <span class="text-slate-500">狀態</span>
      <span class="font-medium ${b.is_in_use ? 'text-emerald-600' : 'text-slate-600'}">
        ${b.is_in_use ? '有在使用' : '尚未使用 / 沒有在使用'}
      </span>
    </div>
    ${
      claims.length
        ? `<div class="pt-3 border-t border-slate-100">
            <div class="text-slate-500 mb-2">實際使用紀錄</div>
            ${[...claims]
              .sort((a, c) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(c.start_time))
              .map((c) => {
                const canEdit = c.claimed_by === currentUser;
                return `
              <div class="bg-slate-50 rounded-lg px-3 py-2 mb-2" data-claim-id="${c.id}">
                <div class="flex justify-between items-start gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap justify-between gap-x-2 text-xs text-slate-400 mb-0.5">
                      <span>${escapeHtml(c.claimed_by)}</span>
                      <span class="claim-time-label">${formatTime(c.start_time)}–${formatTime(c.end_time)}</span>
                    </div>
                    <div class="claim-view">${c.remark ? escapeHtml(c.remark) : '<span class="text-slate-400">（無留言）</span>'}</div>
                    <div class="claim-edit-form hidden mt-2 space-y-1.5 border-t border-slate-200/60 pt-2">
                      <div class="grid grid-cols-2 gap-1.5">
                        <input type="text" class="claim-edit-start border border-slate-200 rounded px-2 py-1 text-xs" value="${formatTime(c.start_time)}" placeholder="13:00" maxlength="5" />
                        <input type="text" class="claim-edit-end border border-slate-200 rounded px-2 py-1 text-xs" value="${formatTime(c.end_time)}" placeholder="15:00" maxlength="5" />
                      </div>
                      <input type="text" class="claim-edit-remark w-full border border-slate-200 rounded px-2 py-1 text-xs" value="${escapeHtml(c.remark || '')}" placeholder="留言（選填）" />
                      <div class="flex gap-1.5">
                        <button type="button" class="save-claim-btn flex-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded py-1.5 font-medium"
                          data-id="${c.id}"
                          data-booking-start="${formatTime(b.start_time)}"
                          data-booking-end="${formatTime(b.end_time)}">儲存</button>
                        <button type="button" class="cancel-claim-edit flex-1 text-xs border border-slate-200 rounded py-1.5">取消</button>
                      </div>
                    </div>
                  </div>
                  ${
                    canEdit
                      ? `<div class="flex flex-col gap-1 shrink-0">
                          <button type="button" class="toggle-claim-edit text-xs text-blue-600 hover:text-blue-800 font-medium px-1">編輯</button>
                          <button type="button" class="delete-claim-btn text-xs text-red-500 hover:text-red-700 font-medium px-1" data-id="${c.id}">刪除</button>
                        </div>`
                      : ''
                  }
                </div>
              </div>`;
              })
              .join('')}
          </div>`
        : ''
    }
  `;

  // 點「編輯」展開表單
  detailContent.querySelectorAll('.toggle-claim-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const box = btn.closest('[data-claim-id]');
      const form = box.querySelector('.claim-edit-form');
      const view = box.querySelector('.claim-view');
      const open = !form.classList.contains('hidden');
      form.classList.toggle('hidden', open);
      view.classList.toggle('hidden', !open);
      btn.textContent = open ? '編輯' : '收起';
    });
  });

  detailContent.querySelectorAll('.cancel-claim-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const box = btn.closest('[data-claim-id]');
      box.querySelector('.claim-edit-form').classList.add('hidden');
      box.querySelector('.claim-view').classList.remove('hidden');
      const toggleBtn = box.querySelector('.toggle-claim-edit');
      if (toggleBtn) toggleBtn.textContent = '編輯';
    });
  });

  // 儲存自己的時間 + 留言
  detailContent.querySelectorAll('.save-claim-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const claimId = btn.dataset.id;
      const box = btn.closest('[data-claim-id]');
      const startVal = parseTimeInput(box.querySelector('.claim-edit-start').value);
      const endVal = parseTimeInput(box.querySelector('.claim-edit-end').value);
      const remarkVal = box.querySelector('.claim-edit-remark').value.trim();
      const parentStart = parseTimeToMinutes(btn.dataset.bookingStart);
      const parentEnd = parseTimeToMinutes(btn.dataset.bookingEnd);

      if (!startVal || !endVal) return showToast('時間格式錯誤，例如 13:00');
      if (startVal >= endVal) return showToast('結束時間必須晚於開始時間');

      const sM = parseTimeToMinutes(startVal);
      const eM = parseTimeToMinutes(endVal);
      if (sM < parentStart || eM > parentEnd) {
        return showToast('時間必須落在原預約紀錄範圍內');
      }

      try {
        const { data: otherClaims, error: qErr } = await supabaseClient
          .from('claims')
          .select('id, start_time, end_time')
          .eq('room', currentRoom)
          .eq('claim_date', b.booking_date)
          .neq('id', claimId);
        if (qErr) throw qErr;
        const overlap = (otherClaims || []).some((oc) =>
          timesOverlap(sM, eM, parseTimeToMinutes(oc.start_time), parseTimeToMinutes(oc.end_time))
        );
        if (overlap) return showToast('與其他已預約時段重疊，請調整時間');

        const { error } = await supabaseClient
          .from('claims')
          .update({
            start_time: timeToDb(startVal),
            end_time: timeToDb(endVal),
            remark: remarkVal || null,
          })
          .eq('id', claimId)
          .eq('claimed_by', currentUser);
        if (error) throw error;

        await writeLog('edit_claim', {
          claim_id: claimId,
          room: currentRoom,
          start: startVal,
          end: endVal,
        });
        showToast('已更新');
        detailModal.classList.add('hidden');
        loadWeekData();
      } catch (err) {
        console.error(err);
        showToast('更新失敗');
      }
    });
  });

  // 刪除自己的實際使用紀錄
  detailContent.querySelectorAll('.delete-claim-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const claimId = btn.dataset.id;
      if (!confirm('確定刪除這筆實際使用紀錄？')) return;
      try {
        const { error } = await supabaseClient
          .from('claims')
          .delete()
          .eq('id', claimId)
          .eq('claimed_by', currentUser);
        if (error) throw error;

        // 若該 booking 已無任何 claim，取消 is_in_use
        if (selectedBookingId) {
          const { data: remain } = await supabaseClient
            .from('claims')
            .select('id')
            .eq('booking_id', selectedBookingId);
          if (!remain || remain.length === 0) {
            await supabaseClient
              .from('bookings')
              .update({ is_in_use: false })
              .eq('id', selectedBookingId);
          }
        }

        await writeLog('delete_claim', { claim_id: claimId, room: currentRoom });
        showToast('已刪除');
        detailModal.classList.add('hidden');
        loadWeekData();
      } catch (err) {
        console.error(err);
        showToast('刪除失敗');
      }
    });
  });

  const toggleBookingTime = document.getElementById('toggle-booking-time-edit');
  if (toggleBookingTime) {
    toggleBookingTime.addEventListener('click', () => {
      const form = document.getElementById('booking-time-edit-form');
      const open = !form.classList.contains('hidden');
      form.classList.toggle('hidden', open);
      toggleBookingTime.textContent = open ? '編輯時間' : '收起';
    });
  }

  // 建立者可改時間
  const saveTimeBtn = document.getElementById('detail-save-time');

  if (saveTimeBtn) {
    saveTimeBtn.addEventListener('click', async () => {
      const ns = parseTimeInput(document.getElementById('detail-edit-start').value);
      const ne = parseTimeInput(document.getElementById('detail-edit-end').value);
      if (!ns || !ne) return showToast('時間格式錯誤，例如 09:00');
      if (ns >= ne) return showToast('結束時間必須晚於開始時間');
      try {
        const { error } = await supabaseClient
          .from('bookings')
          .update({ start_time: timeToDb(ns), end_time: timeToDb(ne) })
          .eq('id', selectedBookingId)
          .eq('booked_by', currentUser);
        if (error) throw error;
        await writeLog('edit_booking_time', { booking_id: selectedBookingId, room: currentRoom, start: ns, end: ne });
        showToast('時間已更新');
        detailModal.classList.add('hidden');
        loadWeekData();
      } catch (err) {
        console.error(err);
        showToast('更新失敗');
      }
    });
  }

  // 只有建立者可切換狀態、刪除
  if (isOwner) {
    detailToggleUse.classList.remove('hidden');
    detailDelete.classList.remove('hidden');
    detailToggleUse.textContent = b.is_in_use ? '改為「沒有在使用」' : '改為「有在使用」';
    detailToggleUse.className = b.is_in_use
      ? 'flex-1 border border-slate-200 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50'
      : 'flex-1 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-100';
  } else {
    detailToggleUse.classList.add('hidden');
    detailDelete.classList.add('hidden');
  }

  detailModal.classList.remove('hidden');
}


detailAddClaim.addEventListener('click', () => {
  if (!selectedBookingId) return;
  const b = currentBookings.find((x) => x.id === selectedBookingId);
  detailModal.classList.add('hidden');
  claimModalRoom.textContent = currentRoom;
  if (b) {
    claimDate.value = b.booking_date;
    claimStart.value = formatTime(b.start_time);
    claimEnd.value = formatTime(b.end_time);
  } else {
    claimDate.value = toDateStr(new Date());
    claimStart.value = '';
    claimEnd.value = '';
  }
  claimRemark.value = '';
  claimModal.classList.remove('hidden');
});

detailClose.addEventListener('click', () => detailModal.classList.add('hidden'));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) detailModal.classList.add('hidden');
});

detailToggleUse.addEventListener('click', async () => {
  if (!selectedBookingId) return;
  const b = currentBookings.find((x) => x.id === selectedBookingId);
  if (!b || b.booked_by !== currentUser) {
    return showToast('只有建立者可以切換使用狀態');
  }
  const currently = !!b.is_in_use;
  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ is_in_use: !currently })
      .eq('id', selectedBookingId)
      .eq('booked_by', currentUser);
    if (error) throw error;
    await writeLog('toggle_use', {
      booking_id: selectedBookingId,
      room: currentRoom,
      new_status: !currently,
    });
    showToast(currently ? '已改為沒有在使用' : '已改為有在使用');
    detailModal.classList.add('hidden');
    loadWeekData();
  } catch (err) {
    showToast('更新失敗');
  }
});

detailDelete.addEventListener('click', async () => {
  if (!selectedBookingId) return;
  const b = currentBookings.find((x) => x.id === selectedBookingId);
  if (!b || b.booked_by !== currentUser) {
    return showToast('只有建立者可以刪除');
  }
  if (!confirm('確定刪除這筆預約？相關留言也會一併刪除。')) return;
  try {
    const { error } = await supabaseClient
      .from('bookings')
      .delete()
      .eq('id', selectedBookingId)
      .eq('booked_by', currentUser);
    if (error) throw error;
    await writeLog('delete_booking', {
      booking_id: selectedBookingId,
      room: currentRoom,
    });
    showToast('已刪除');
    detailModal.classList.add('hidden');
    loadWeekData();
  } catch (err) {
    showToast('刪除失敗');
  }
});

// ============================================
// Log
// ============================================
async function writeLog(action, details) {
  try {
    await supabaseClient.from('logs').insert({
      room: currentRoom,
      action,
      actor: currentUser,
      details: details || {},
    });
  } catch (err) {
    console.warn('log write failed', err);
  }
}

let cachedLogs = [];

function formatLogDetails(action, details) {
  if (!details) return '';
  const d = details;
  switch (action) {
    case 'create_booking':
      return [
        d.dates ? `日期：${Array.isArray(d.dates) ? d.dates.join('、') : d.dates}` : '',
        d.start && d.end ? `時段：${d.start}–${d.end}` : '',
        d.count ? `共 ${d.count} 筆` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'add_claim':
      return [
        d.date ? `日期：${d.date}` : '',
        d.start && d.end ? `時段：${d.start}–${d.end}` : '',
        d.remark ? `留言：${d.remark}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    case 'toggle_use':
      return d.new_status === true || d.new_status === false
        ? `改為「${d.new_status ? '有在使用' : '沒有在使用'}」`
        : '';
    case 'delete_booking':
      return '已刪除該筆預約';
    case 'edit_claim':
      return '修改了留言';
    case 'edit_booking_time':
      return d.start && d.end ? `改為 ${d.start}–${d.end}` : '修改了時間';
    case 'delete_claim':
      return '刪除了實際使用紀錄';
    default:
      return '';
  }
}

const ACTION_LABEL = {
  create_booking: '登記系統預約',
  add_claim: '登記實際使用',
  toggle_use: '切換使用狀態',
  delete_booking: '刪除預約',
  edit_claim: '修改留言',
  edit_booking_time: '修改預約時間',
  delete_claim: '刪除實際使用紀錄',
};

document.getElementById('btn-show-logs').addEventListener('click', async () => {
  logsContent.innerHTML = `<div class="text-slate-400 py-6 text-center">載入中...</div>`;
  logsModal.classList.remove('hidden');
  try {
    const { data, error } = await supabaseClient
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    cachedLogs = data || [];

    if (cachedLogs.length === 0) {
      logsContent.innerHTML = `<div class="text-slate-400 py-6 text-center">尚無操作紀錄</div>`;
      return;
    }

    logsContent.innerHTML = cachedLogs
      .map((log) => {
        const time = new Date(log.created_at).toLocaleString('zh-TW');
        const label = ACTION_LABEL[log.action] || log.action;
        const detailStr = formatLogDetails(log.action, log.details);
        return `
          <div class="border border-slate-100 rounded-lg px-3 py-2.5">
            <div class="flex flex-wrap justify-between gap-2">
              <span class="font-medium">${escapeHtml(log.actor)}</span>
              <span class="text-xs text-slate-400">${time}</span>
            </div>
            <div class="text-slate-600 mt-0.5">
              <span class="inline-block bg-slate-100 rounded px-1.5 py-0.5 text-xs mr-1">${escapeHtml(log.room || '')}</span>
              ${escapeHtml(label)}
            </div>
            ${detailStr ? `<div class="text-xs text-slate-500 mt-1">${escapeHtml(detailStr)}</div>` : ''}
          </div>
        `;
      })
      .join('');
  } catch (err) {
    logsContent.innerHTML = `<div class="text-red-500 py-6 text-center">載入失敗：${escapeHtml(err.message)}</div>`;
  }
});

document.getElementById('logs-export').addEventListener('click', () => {
  if (!cachedLogs.length) {
    showToast('目前沒有可匯出的紀錄');
    return;
  }
  const headers = ['時間', '操作人', '房間', '操作', '說明'];
  const rows = cachedLogs.map((log) => {
    const time = new Date(log.created_at).toLocaleString('zh-TW');
    const label = ACTION_LABEL[log.action] || log.action;
    const detail = formatLogDetails(log.action, log.details);
    return [time, log.actor || '', log.room || '', label, detail];
  });

  const csvContent =
    '\uFEFF' +
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? '');
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(',')
      )
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `操作紀錄_${toDateStr(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已匯出 CSV');
});

document.getElementById('logs-close').addEventListener('click', () => {
  logsModal.classList.add('hidden');
});
logsModal.addEventListener('click', (e) => {
  if (e.target === logsModal) logsModal.classList.add('hidden');
});


// ============================================
// 日期選擇器（點日期範圍 → 選日後跳到該週）
// ============================================
const datePickerModal = document.getElementById('date-picker-modal');
const dpTitle = document.getElementById('dp-title');
const dpGrid = document.getElementById('dp-grid');

function renderDatePicker() {
  if (!dpGrid) return;
  const y = dpCursor.getFullYear();
  const m = dpCursor.getMonth();
  dpTitle.textContent = `${y}年 ${m + 1}月`;

  const first = new Date(y, m, 1);
  let startPad = first.getDay();
  startPad = startPad === 0 ? 6 : startPad - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < startPad; i++) html += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const ds = toDateStr(date);
    const isTod = isToday(ds);
    // highlight if in current week view range
    let inFocus = false;
    if (viewMode === 'week') {
      const from = weekStart;
      const to = addDays(weekStart, 6);
      inFocus = date >= from && date <= to;
    } else if (viewMode === 'day') {
      inFocus = ds === toDateStr(dayCursor);
    }
    html += `<button type="button" data-date="${ds}" class="dp-day aspect-square rounded-lg text-sm font-medium transition
      ${isTod ? 'ring-2 ring-blue-500' : ''}
      ${inFocus ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-slate-100 text-slate-700'}">${d}</button>`;
  }
  dpGrid.innerHTML = html;
  dpGrid.querySelectorAll('.dp-day').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ds = btn.dataset.date;
      const [yy, mm, dd] = ds.split('-').map(Number);
      dayCursor = new Date(yy, mm - 1, dd);
      weekStart = getMonday(dayCursor);
      monthCursor = new Date(yy, mm - 1, 1);
      datePickerModal.classList.add('hidden');
      // always jump to week view of that date
      setViewMode('week');
    });
  });
}

if (weekLabel) {
  weekLabel.addEventListener('click', () => {
    if (viewMode === 'month') {
      dpCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    } else if (viewMode === 'day') {
      dpCursor = new Date(dayCursor.getFullYear(), dayCursor.getMonth(), 1);
    } else {
      dpCursor = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    }
    renderDatePicker();
    datePickerModal.classList.remove('hidden');
  });
}

document.getElementById('dp-prev')?.addEventListener('click', () => {
  dpCursor = new Date(dpCursor.getFullYear(), dpCursor.getMonth() - 1, 1);
  renderDatePicker();
});
document.getElementById('dp-next')?.addEventListener('click', () => {
  dpCursor = new Date(dpCursor.getFullYear(), dpCursor.getMonth() + 1, 1);
  renderDatePicker();
});
document.getElementById('dp-close')?.addEventListener('click', () => {
  datePickerModal.classList.add('hidden');
});
datePickerModal?.addEventListener('click', (e) => {
  if (e.target === datePickerModal) datePickerModal.classList.add('hidden');
});

// ============================================
// Realtime：其他人新增／修改後自動更新
// ============================================
function setupRealtime() {
  try {
    supabaseClient
      .channel('room-status-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          scheduleReload();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'claims' },
        () => {
          scheduleReload();
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Realtime 訂閱失敗', err);
  }
}

// ============================================
// 啟動
// ============================================
checkLogin();
setupRealtime();
