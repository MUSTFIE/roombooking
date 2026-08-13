# 房間使用狀態 Web App（A200 / A201 / A301）

純前端 + Supabase，適合部署到 GitHub Pages。

同事可在此系統：
- 輸入公司預約系統已預約的日期與時間
- 手動標記「有在使用 / 沒有在使用」
- 留下「需要使用」時間與留言（一輸入就自動標記為有在使用）
- 查看歷史日期紀錄

---

## 1. 建立 Supabase 專案

1. 前往 [https://supabase.com](https://supabase.com) 註冊 / 登入
2. 建立新專案（選離台灣較近的 region 即可）
3. 專案建立完成後，到 **Project Settings → API**
   - 複製 `Project URL` → 等下貼到 `app.js` 的 `SUPABASE_URL`
   - 複製 `anon public` key → 貼到 `SUPABASE_ANON_KEY`

---

## 2. 建立資料表（在 Supabase SQL Editor 執行）

把下面整段貼到 **SQL Editor** 執行一次即可：

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

-- 索引（加速依日期查詢）
create index bookings_date_idx on public.bookings (booking_date);
create index claims_booking_id_idx on public.claims (booking_id);

-- 開啟 RLS
alter table public.bookings enable row level security;
alter table public.claims enable row level security;

-- 允許任何人讀寫（公司內部工具，簡單暱稱登入即可）
-- 若之後要更嚴格，可再改成需登入才能寫入
create policy "Allow all on bookings" on public.bookings
  for all using (true) with check (true);

create policy "Allow all on claims" on public.claims
  for all using (true) with check (true);
```

---

## 3. 填入 Supabase 金鑰

打開 `app.js`，找到最上方：

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

改成你自己的值，例如：

```js
const SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## 4. 本地預覽

直接用瀏覽器開啟 `index.html`，或用簡單 server：

```bash
# 若有 Python
python -m http.server 5500

# 或 VS Code 的 Live Server
```

打開 http://localhost:5500

---

## 5. 部署到 GitHub Pages

1. 在 GitHub 建立新 repository（例如 `room-status-app`）
2. 把本資料夾所有檔案推上去
3. 到 repo → **Settings → Pages**
4. Source 選 `Deploy from a branch`，Branch 選 `main`（或 `master`），資料夾選 `/ (root)`
5. 儲存後等待 1～2 分鐘，就會得到網址：
   `https://你的帳號.github.io/room-status-app/`

**注意：**  
因為 `app.js` 裡有寫死 Supabase Key，請確認 repo 設為 **Private**（如果公司不想公開），或接受 anon key 本來就可以公開（搭配 RLS）。

---

## 功能說明

| 功能 | 說明 |
|------|------|
| 暱稱登入 | 存在瀏覽器 localStorage，關閉後仍會記住 |
| 日期選擇 | 可切換任意日期查看 / 新增，包含歷史紀錄 |
| 新增預約 | 輸入開始時間 + 結束時間 |
| 標記使用狀態 | 一鍵切換「有在使用 / 沒有在使用」 |
| 需要使用 / 留言 | 輸入時間與留言後，自動把該預約標記為有在使用 |
| 刪除 | 可刪除整筆預約（相關留言會一併刪除） |

---

## 之後可優化方向（選做）

- 加上真正的公司 SSO / Google 登入
- 限制只有特定網域才能存取
- 即時同步（Supabase Realtime）
- 把 modal 再美化或加上時段衝突檢查

有問題再告訴我即可。
