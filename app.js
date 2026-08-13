// ============================================
// 設定區：請替換成你的 Supabase 專案資訊
// ============================================
const SUPABASE_URL = 'https://hsfcgtktagvuqsdaadjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZmNndGt0YWd2dXFzZGFhZGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1ODAyMzEsImV4cCI6MjEwMjE1NjIzMX0.IqCx1qkaMKcyZqm8IBhYbfEcyWsZrvqlpfB9ZH6BWFI';

const ROOMS = ['A200', 'A201', 'A301'];
const DAY_START = 9;   // 09:00
const DAY_END = 22;    // 22:00
const HOUR_HEIGHT = 36; // px per hour（每小時一格，較清楚）

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// 狀態
// ============================================
let currentUser = localStorage.getItem('room_status_nickname') || '';
let currentRoom = 'A200';
let weekStart = getMonday(new Date()); // Date object, Monday 00:00
let currentBookings = [];
let selectedBookingId = null;

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

function timeToDb(t) {
  if (!t) return null;
  return t.length === 5 ? t + ':00' : t;
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
  const end = addDays(weekStart, 6);
  const opts = { month: 'numeric', day: 'numeric' };
  weekLabel.textContent = `${weekStart.toLocaleDateString('zh-TW', opts)} – ${end.toLocaleDateString('zh-TW', opts)}`;
}

document.getElementById('prev-week').addEventListener('click', () => {
  weekStart = addDays(weekStart, -7);
  updateWeekLabel();
  loadWeekData();
});

document.getElementById('next-week').addEventListener('click', () => {
  weekStart = addDays(weekStart, 7);
  updateWeekLabel();
  loadWeekData();
});

document.getElementById('today-btn').addEventListener('click', () => {
  weekStart = getMonday(new Date());
  updateWeekLabel();
  loadWeekData();
});

// ============================================
// 資料載入
// ============================================
async function loadWeekData() {
  const from = toDateStr(weekStart);
  const to = toDateStr(addDays(weekStart, 6));

  calendarEl.innerHTML = `<div class="p-12 text-center text-slate-400 text-sm">載入中...</div>`;

  try {
    const { data, error } = await supabaseClient
      .from('bookings')
      .select(`
        id, room, booking_date, start_time, end_time, booked_by, is_in_use, created_at,
        claims ( id, claimed_by, start_time, end_time, remark, created_at )
      `)
      .eq('room', currentRoom)
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('start_time', { ascending: true });

    if (error) throw error;
    currentBookings = data || [];
    renderCalendar();
  } catch (err) {
    console.error(err);
    calendarEl.innerHTML = `<div class="p-12 text-center text-red-500 text-sm">載入失敗：${escapeHtml(err.message)}</div>`;
  }
}

// ============================================
// 渲染週曆
// ============================================
function renderCalendar() {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

  const hours = [];
  for (let h = DAY_START; h < DAY_END; h++) hours.push(h);

  const totalHeight = hours.length * HOUR_HEIGHT;
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

  let html = `<div class="calendar-grid">`;
  // Header
  html += `<div class="day-header"></div>`;
  days.forEach((d, i) => {
    const ds = toDateStr(d);
    const cls = isToday(ds) ? 'day-header today' : 'day-header';
    html += `<div class="${cls}">
      <div class="text-xs text-slate-500">週${weekdays[i]}</div>
      <div class="text-sm font-medium">${d.getMonth() + 1}/${d.getDate()}</div>
    </div>`;
  });

  // Time rows
  hours.forEach((h) => {
    html += `<div class="time-label">${String(h).padStart(2, '0')}:00</div>`;
    days.forEach(() => {
      html += `<div class="slot-cell" style="height:${HOUR_HEIGHT}px"></div>`;
    });
  });
  html += `</div>`;

  // Overlay layer for events
  html += `<div style="position:relative; margin-top:-${totalHeight}px; height:${totalHeight}px; pointer-events:none">`;
  html += `<div class="calendar-grid" style="height:${totalHeight}px; pointer-events:none">`;
  html += `<div></div>`;
  days.forEach((d) => {
    const ds = toDateStr(d);
    html += `<div class="day-overlay" data-date="${ds}" style="position:relative; height:${totalHeight}px; pointer-events:none"></div>`;
  });
  html += `</div></div>`;

  calendarEl.innerHTML = html;

  // Place events
  days.forEach((d) => {
    const ds = toDateStr(d);
    const overlay = calendarEl.querySelector(`.day-overlay[data-date="${ds}"]`);
    if (!overlay) return;

    const dayBookings = currentBookings.filter((b) => b.booking_date === ds);
    dayBookings.forEach((b) => {
      const startM = parseTimeToMinutes(b.start_time);
      const endM = parseTimeToMinutes(b.end_time);
      const visStart = Math.max(startM, DAY_START * 60);
      const visEnd = Math.min(endM, DAY_END * 60);
      if (visEnd <= visStart) return;

      const top = minutesToTop(visStart);
      const height = Math.max(heightFromDuration(visStart, visEnd), 16);

      const el = document.createElement('div');
      el.className = `event-block ${b.is_in_use ? 'event-green' : 'event-gray'}`;
      el.style.top = `${top}px`;
      el.style.height = `${height}px`;
      el.style.pointerEvents = 'auto';
      el.dataset.id = b.id;
      el.innerHTML = `
        <div class="font-medium truncate">${formatTime(b.start_time)}–${formatTime(b.end_time)}</div>
        <div class="truncate opacity-80 text-[10px]">${escapeHtml(b.booked_by)}</div>
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetail(b.id);
      });
      overlay.appendChild(el);
    });
  });
}

// ============================================
// 新增預約
// ============================================
document.getElementById('btn-add-booking').addEventListener('click', () => {
  bookingModalRoom.textContent = currentRoom;
  const today = toDateStr(new Date());
  bookingDateFrom.value = today;
  bookingDateTo.value = today;
  bookingStart.value = '09:00';
  bookingEnd.value = '10:00';
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
  const start = bookingStart.value;
  const end = bookingEnd.value;

  if (!from || !to || !start || !end) return showToast('請填寫完整日期與時間');
  if (from > to) return showToast('結束日期不能早於開始日期');
  if (start >= end) return showToast('結束時間必須晚於開始時間');

  const dates = [];
  let cur = new Date(from + 'T00:00:00');
  const endDate = new Date(to + 'T00:00:00');
  while (cur <= endDate) {
    dates.push(toDateStr(cur));
    cur = addDays(cur, 1);
  }

  try {
    const rows = dates.map((d) => ({
      room: currentRoom,
      booking_date: d,
      start_time: timeToDb(start),
      end_time: timeToDb(end),
      booked_by: currentUser,
      is_in_use: false,
    }));

    const { error } = await supabaseClient.from('bookings').insert(rows);
    if (error) throw error;

    await writeLog('create_booking', {
      room: currentRoom,
      dates,
      start,
      end,
      count: dates.length,
    });

    showToast(`已輸入 ${dates.length} 筆預約紀錄`);
    bookingModal.classList.add('hidden');
    loadWeekData();
  } catch (err) {
    console.error(err);
    showToast('新增失敗：' + (err.message || ''));
  }
});

// ============================================
// 新增預約（須落在既有灰色預約紀錄內）
// ============================================
document.getElementById('btn-add-claim').addEventListener('click', () => {
  claimModalRoom.textContent = currentRoom;
  claimDate.value = toDateStr(new Date());
  claimStart.value = '';
  claimEnd.value = '';
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
  const start = claimStart.value;
  const end = claimEnd.value;
  const remark = claimRemark.value.trim();

  if (!date || !start || !end) return showToast('請填寫日期與時間');
  if (start >= end) return showToast('結束時間必須晚於開始時間');

  const startM = parseTimeToMinutes(start);
  const endM = parseTimeToMinutes(end);

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

  // 若該預約已標記為有在使用，不可再新增
  if (booking.is_in_use) {
    return showToast('此時段已標記為「有在使用」，無法再預約');
  }

  try {
    const { error: claimErr } = await supabaseClient.from('claims').insert({
      booking_id: booking.id,
      room: currentRoom,
      claim_date: date,
      start_time: timeToDb(start),
      end_time: timeToDb(end),
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
      start,
      end,
      remark,
      booking_id: booking.id,
    });

    showToast('已新增預約，並標記為有在使用');
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
  detailContent.innerHTML = `
    <div class="flex justify-between"><span class="text-slate-500">房間</span><span class="font-medium">${escapeHtml(b.room)}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">日期</span><span class="font-medium">${escapeHtml(b.booking_date)}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">時段</span><span class="font-medium">${formatTime(b.start_time)} – ${formatTime(b.end_time)}</span></div>
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
            <div class="text-slate-500 mb-2">留言 / 需要使用紀錄</div>
            ${claims
              .map((c) => {
                const canEdit = c.claimed_by === currentUser;
                return `
              <div class="bg-slate-50 rounded-lg px-3 py-2 mb-2" data-claim-id="${c.id}">
                <div class="flex justify-between text-xs text-slate-400 mb-0.5">
                  <span>${escapeHtml(c.claimed_by)}</span>
                  <span>${formatTime(c.start_time)}–${formatTime(c.end_time)}</span>
                </div>
                <div class="claim-remark-text">${c.remark ? escapeHtml(c.remark) : '<span class="text-slate-400">（無留言）</span>'}</div>
                ${
                  canEdit
                    ? `<button type="button" class="edit-claim-btn mt-1.5 text-xs text-blue-600 hover:text-blue-800" data-id="${c.id}" data-remark="${escapeHtml(c.remark || '')}">編輯留言</button>`
                    : ''
                }
              </div>`;
              })
              .join('')}
          </div>`
        : ''
    }
  `;

  // 綁定編輯留言
  detailContent.querySelectorAll('.edit-claim-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const claimId = btn.dataset.id;
      const oldRemark = btn.dataset.remark || '';
      const newRemark = prompt('修改留言：', oldRemark);
      if (newRemark === null) return;
      try {
        const { error } = await supabaseClient
          .from('claims')
          .update({ remark: newRemark.trim() || null })
          .eq('id', claimId)
          .eq('claimed_by', currentUser); // 再保險：只能改自己的
        if (error) throw error;
        await writeLog('edit_claim', { claim_id: claimId, room: currentRoom });
        showToast('留言已更新');
        detailModal.classList.add('hidden');
        loadWeekData();
      } catch (err) {
        console.error(err);
        showToast('更新失敗');
      }
    });
  });

  detailToggleUse.textContent = b.is_in_use ? '改為「沒有在使用」' : '改為「有在使用」';
  detailToggleUse.className = b.is_in_use
    ? 'flex-1 border border-slate-200 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50'
    : 'flex-1 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-100';

  detailModal.classList.remove('hidden');
}

detailClose.addEventListener('click', () => detailModal.classList.add('hidden'));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) detailModal.classList.add('hidden');
});

detailToggleUse.addEventListener('click', async () => {
  if (!selectedBookingId) return;
  const b = currentBookings.find((x) => x.id === selectedBookingId);
  const currently = b ? !!b.is_in_use : false;
  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ is_in_use: !currently })
      .eq('id', selectedBookingId);
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
  if (!confirm('確定刪除這筆預約？相關留言也會一併刪除。')) return;
  try {
    const { error } = await supabaseClient.from('bookings').delete().eq('id', selectedBookingId);
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
    default:
      return '';
  }
}

const ACTION_LABEL = {
  create_booking: '輸入預約紀錄',
  add_claim: '新增預約',
  toggle_use: '切換使用狀態',
  delete_booking: '刪除預約',
  edit_claim: '修改留言',
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
// 啟動
// ============================================
checkLogin();
