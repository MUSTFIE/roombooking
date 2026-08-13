// ============================================
// 設定區：請替換成你的 Supabase 專案資訊
// ============================================
const SUPABASE_URL = 'https://hsfcgtktagvuqsdaadjk.supabase.co/rest/v1';          // 例如 https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzZmNndGt0YWd2dXFzZGFhZGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1ODAyMzEsImV4cCI6MjEwMjE1NjIzMX0.IqCx1qkaMKcyZqm8IBhYbfEcyWsZrvqlpfB9ZH6BWFI'; // Settings → API → anon public

const ROOMS = ['A200', 'A201', 'A301'];

// 初始化 Supabase（請確認已替換上方兩個常數）
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// 狀態
// ============================================
let currentUser = localStorage.getItem('room_status_nickname') || '';
let selectedDate = new Date().toISOString().slice(0, 10);

let pendingBookingRoom = null;
let pendingClaimBookingId = null;
let pendingClaimRoom = null;

// ============================================
// DOM
// ============================================
const loginModal = document.getElementById('login-modal');
const appEl = document.getElementById('app');
const nicknameInput = document.getElementById('nickname-input');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserEl = document.getElementById('current-user');
const datePicker = document.getElementById('date-picker');
const roomsContainer = document.getElementById('rooms-container');
const toastEl = document.getElementById('toast');

const bookingModal = document.getElementById('booking-modal');
const bookingModalRoom = document.getElementById('booking-modal-room');
const bookingStart = document.getElementById('booking-start');
const bookingEnd = document.getElementById('booking-end');
const bookingCancel = document.getElementById('booking-cancel');
const bookingSubmit = document.getElementById('booking-submit');

const claimModal = document.getElementById('claim-modal');
const claimStart = document.getElementById('claim-start');
const claimEnd = document.getElementById('claim-end');
const claimRemark = document.getElementById('claim-remark');
const claimCancel = document.getElementById('claim-cancel');
const claimSubmit = document.getElementById('claim-submit');

// ============================================
// 工具
// ============================================
function showToast(msg, duration = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.remove('opacity-0');
  toastEl.classList.add('opacity-100');
  setTimeout(() => {
    toastEl.classList.remove('opacity-100');
    toastEl.classList.add('opacity-0');
  }, duration);
}

function formatTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeToDb(timeStr) {
  // <input type="time"> 回傳 "09:00" → 存成 "09:00:00"
  if (!timeStr) return null;
  return timeStr.length === 5 ? timeStr + ':00' : timeStr;
}

// ============================================
// 登入 / 登出
// ============================================
function checkLogin() {
  if (currentUser) {
    loginModal.classList.add('hidden');
    appEl.classList.remove('hidden');
    currentUserEl.textContent = currentUser;
    datePicker.value = selectedDate;
    loadAllRooms();
  } else {
    loginModal.classList.remove('hidden');
    appEl.classList.add('hidden');
    nicknameInput.focus();
  }
}

loginBtn.addEventListener('click', () => {
  const name = nicknameInput.value.trim();
  if (!name) {
    showToast('請輸入暱稱');
    return;
  }
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
// 日期
// ============================================
datePicker.addEventListener('change', (e) => {
  selectedDate = e.target.value;
  loadAllRooms();
});

// ============================================
// 載入資料
// ============================================
async function loadAllRooms() {
  roomsContainer.innerHTML = `
    <div class="text-center py-16 text-slate-400 text-sm">
      載入中...
    </div>
  `;

  try {
    const { data: bookings, error } = await supabaseClient
      .from('bookings')
      .select(`
        id,
        room,
        booking_date,
        start_time,
        end_time,
        booked_by,
        is_in_use,
        created_at,
        claims (
          id,
          claimed_by,
          start_time,
          end_time,
          remark,
          created_at
        )
      `)
      .eq('booking_date', selectedDate)
      .order('start_time', { ascending: true });

    if (error) throw error;
    renderRooms(bookings || []);
  } catch (err) {
    console.error(err);
    roomsContainer.innerHTML = `
      <div class="text-center py-16 text-red-500 text-sm">
        載入失敗：${escapeHtml(err.message || '請檢查 Supabase URL / Key 與表格是否已建立')}
      </div>
    `;
  }
}

// ============================================
// 渲染
// ============================================
function renderRooms(bookings) {
  roomsContainer.innerHTML = '';

  ROOMS.forEach((room) => {
    const roomBookings = bookings.filter((b) => b.room === room);
    const card = document.createElement('div');
    card.className = 'card bg-white rounded-xl border border-slate-200 overflow-hidden';

    card.innerHTML = `
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h2 class="text-lg font-semibold tracking-tight">${room}</h2>
        <button data-room="${room}"
                class="add-booking-btn text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3.5 py-1.5 rounded-lg transition">
          + 新增預約
        </button>
      </div>
      <div class="p-4 sm:p-5 space-y-3">
        ${
          roomBookings.length === 0
            ? `<p class="text-sm text-slate-400 text-center py-6">此日期尚無預約紀錄</p>`
            : roomBookings.map((b) => renderBookingCard(b)).join('')
        }
      </div>
    `;
    roomsContainer.appendChild(card);
  });

  // 事件綁定
  document.querySelectorAll('.add-booking-btn').forEach((btn) => {
    btn.addEventListener('click', () => openBookingModal(btn.dataset.room));
  });
  document.querySelectorAll('.toggle-use-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isCurrentlyInUse = btn.dataset.current === 'true';
      toggleInUse(btn.dataset.id, isCurrentlyInUse);
    });
  });
  document.querySelectorAll('.add-claim-btn').forEach((btn) => {
    btn.addEventListener('click', () => openClaimModal(btn.dataset.id, btn.dataset.room));
  });
  document.querySelectorAll('.delete-booking-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteBooking(btn.dataset.id));
  });
}

function renderBookingCard(b) {
  const isInUse = !!b.is_in_use;
  const claims = b.claims || [];

  return `
    <div class="rounded-lg border p-4 ${
      isInUse ? 'bg-emerald-50/60 border-emerald-100' : 'bg-slate-50/70 border-slate-100'
    }">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <span class="status-dot mt-1.5 ${isInUse ? 'status-in-use' : 'status-not-used'}"></span>
          <div class="min-w-0">
            <div class="font-medium text-slate-800">
              ${formatTime(b.start_time)} – ${formatTime(b.end_time)}
            </div>
            <div class="text-sm text-slate-500 mt-0.5 truncate">
              預約人：${escapeHtml(b.booked_by)}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button data-id="${b.id}" data-current="${isInUse}"
                  class="toggle-use-btn text-xs font-medium px-2.5 py-1 rounded-md border transition
                         ${
                           isInUse
                             ? 'border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                             : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                         }">
            ${isInUse ? '有在使用' : '沒有在使用'}
          </button>
          <button data-id="${b.id}" data-room="${b.room}"
                  class="add-claim-btn text-xs font-medium px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
            需要使用 / 留言
          </button>
          <button data-id="${b.id}"
                  class="delete-booking-btn text-xs font-medium px-2.5 py-1 rounded-md border border-red-100 text-red-500 hover:bg-red-50 transition">
            刪除
          </button>
        </div>
      </div>

      ${
        claims.length > 0
          ? `
        <div class="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
          ${claims
            .map(
              (c) => `
            <div class="text-sm bg-white/80 rounded-md px-3 py-2 border border-slate-100">
              <div class="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <span class="font-medium text-slate-700">${escapeHtml(c.claimed_by)}</span>
                <span class="text-slate-400 text-xs">${formatTime(c.start_time)} – ${formatTime(c.end_time)}</span>
              </div>
              ${c.remark ? `<p class="text-slate-600 mt-1 leading-snug">${escapeHtml(c.remark)}</p>` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    </div>
  `;
}

// ============================================
// Modal 控制
// ============================================
function openBookingModal(room) {
  pendingBookingRoom = room;
  bookingModalRoom.textContent = room;
  bookingStart.value = '';
  bookingEnd.value = '';
  bookingModal.classList.remove('hidden');
  bookingStart.focus();
}

function closeBookingModal() {
  bookingModal.classList.add('hidden');
  pendingBookingRoom = null;
}

bookingCancel.addEventListener('click', closeBookingModal);
bookingModal.addEventListener('click', (e) => {
  if (e.target === bookingModal) closeBookingModal();
});

bookingSubmit.addEventListener('click', async () => {
  const start = bookingStart.value;
  const end = bookingEnd.value;
  if (!start || !end) {
    showToast('請填寫開始與結束時間');
    return;
  }
  if (start >= end) {
    showToast('結束時間必須晚於開始時間');
    return;
  }
  await addBooking(pendingBookingRoom, timeToDb(start), timeToDb(end));
  closeBookingModal();
});

function openClaimModal(bookingId, room) {
  pendingClaimBookingId = bookingId;
  pendingClaimRoom = room;
  claimStart.value = '';
  claimEnd.value = '';
  claimRemark.value = '';
  claimModal.classList.remove('hidden');
  claimStart.focus();
}

function closeClaimModal() {
  claimModal.classList.add('hidden');
  pendingClaimBookingId = null;
  pendingClaimRoom = null;
}

claimCancel.addEventListener('click', closeClaimModal);
claimModal.addEventListener('click', (e) => {
  if (e.target === claimModal) closeClaimModal();
});

claimSubmit.addEventListener('click', async () => {
  const start = claimStart.value;
  const end = claimEnd.value;
  const remark = claimRemark.value.trim();
  if (!start || !end) {
    showToast('請填寫開始與結束時間');
    return;
  }
  if (start >= end) {
    showToast('結束時間必須晚於開始時間');
    return;
  }
  await addClaim(
    pendingClaimBookingId,
    pendingClaimRoom,
    timeToDb(start),
    timeToDb(end),
    remark
  );
  closeClaimModal();
});

// ============================================
// CRUD
// ============================================
async function addBooking(room, startTime, endTime) {
  try {
    const { error } = await supabaseClient.from('bookings').insert({
      room,
      booking_date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      booked_by: currentUser,
      is_in_use: false,
    });
    if (error) throw error;
    showToast('已新增預約');
    loadAllRooms();
  } catch (err) {
    console.error(err);
    showToast('新增失敗：' + (err.message || '未知錯誤'));
  }
}

async function toggleInUse(id, currentlyInUse) {
  try {
    const { error } = await supabaseClient
      .from('bookings')
      .update({ is_in_use: !currentlyInUse })
      .eq('id', id);
    if (error) throw error;
    showToast(currentlyInUse ? '已標記為「沒有在使用」' : '已標記為「有在使用」');
    loadAllRooms();
  } catch (err) {
    console.error(err);
    showToast('更新失敗');
  }
}

async function addClaim(bookingId, room, startTime, endTime, remark) {
  try {
    // 新增 claim
    const { error: claimError } = await supabaseClient.from('claims').insert({
      booking_id: bookingId,
      room,
      claim_date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      claimed_by: currentUser,
      remark: remark || null,
    });
    if (claimError) throw claimError;

    // 自動設為有在使用
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({ is_in_use: true })
      .eq('id', bookingId);
    if (updateError) throw updateError;

    showToast('已新增需要使用紀錄，並標記為有在使用');
    loadAllRooms();
  } catch (err) {
    console.error(err);
    showToast('新增失敗：' + (err.message || '未知錯誤'));
  }
}

async function deleteBooking(id) {
  if (!confirm('確定要刪除這筆預約嗎？相關留言也會一併刪除。')) return;
  try {
    const { error } = await supabaseClient.from('bookings').delete().eq('id', id);
    if (error) throw error;
    showToast('已刪除');
    loadAllRooms();
  } catch (err) {
    console.error(err);
    showToast('刪除失敗');
  }
}

// ============================================
// 啟動
// ============================================
checkLogin();
