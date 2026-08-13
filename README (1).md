# 房間使用狀態 Web App（A200 / A201 / A301）

純前端 + Supabase，適合部署到 GitHub Pages。

## 功能

- **三個房間分頁**：A200 / A201 / A301 各自獨立頁面
- **週曆視圖**（週一開始），每天時間軸 09:00–22:00
- **新增預約**：可選「由～至」日期區間，每天產生相同時段；時間為 24 小時制
- **顏色**：灰色 = 已預約尚未使用；綠色 = 有在使用
- **需要使用 / 留言**：頁面上方按鈕，輸入日期與時間後，必須落在既有預約範圍內，會自動標記為有在使用
- **點擊時段**：顯示完整詳情（預約人、時間、留言等），可切換使用狀態或刪除
- **操作紀錄（Logsheet）**：記錄誰做了什麼操作
- 簡單暱稱登入

---

## 1. 建立 Supabase 專案

1. 前往 [https://supabase.com](https://supabase.com) 建立專案
2. **Project Settings → API**
   - 複製 `Project URL` → 貼到 `app.js` 的 `SUPABASE_URL`
   - 複製 `anon` `public` key → 貼到 `SUPABASE_ANON_KEY`

---

## 2. 建立資料表（SQL Editor 一次執行）

```sql
-- 預約表
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room in ('A200', 'A201', 'A301')),
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  booked_by text not null,
  is_in_use boolean not null default false,
  created_at timestamptz not null default now()
);

-- 需要使用 / 留言表
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  room text not null,
  claim_date date not null,
  start_time time not null,
  end_time time not null,
  claimed_by text not null,
  remark text,
  created_at timestamptz not null default now()
);

-- 操作紀錄表
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  room text,
  action text not null,
  actor text not null,
  details jsonb default '{}',
  created_at timestamptz not null default now()
);

-- 索引
create index bookings_date_room_idx on public.bookings (booking_date, room);
create index claims_booking_id_idx on public.claims (booking_id);
create index logs_created_at_idx on public.logs (created_at desc);

-- RLS
alter table public.bookings enable row level security;
alter table public.claims enable row level security;
alter table public.logs enable row level security;

create policy "Allow all on bookings" on public.bookings
  for all using (true) with check (true);

create policy "Allow all on claims" on public.claims
  for all using (true) with check (true);

create policy "Allow all on logs" on public.logs
  for all using (true) with check (true);
```

> 若你之前已經建立過 `bookings` 與 `claims`，只需另外執行建立 `logs` 的部分即可。

---

## 3. 填入金鑰

打開 `app.js` 最上方：

```js
const SUPABASE_URL = 'https://你的專案.supabase.co';
const SUPABASE_ANON_KEY = '你的 anon public key';
```

---

## 4. 本地預覽與部署

直接開啟 `index.html`，或：

```bash
python -m http.server 5500
```

部署到 GitHub Pages：把整個資料夾推上 GitHub，到 Settings → Pages 啟用即可。

---

## 操作說明

| 操作 | 說明 |
|------|------|
| 切換房間 | 上方 A200 / A201 / A301 分頁 |
| 切換週 | 左右箭頭或「今天」 |
| 新增預約 | 上方藍色按鈕 → 選日期區間 + 時間 |
| 需要使用 | 上方綠色按鈕 → 填日期時間與留言（須在既有預約內） |
| 查看詳情 | 點擊日曆上的灰色或綠色色塊 |
| 操作紀錄 | 上方「操作紀錄」按鈕 |

有問題再告訴我。
