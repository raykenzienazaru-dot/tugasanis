-- ====================================================================
-- SUPABASE_SCHEMA.SQL v2 — Salin & jalankan di SQL Editor Supabase
-- ====================================================================

-- ----------------------------------------------------------------
-- 1. Hapus tabel lama jika ada (urutan harus benar karena foreign key)
-- ----------------------------------------------------------------
drop table if exists public.transaction_items cascade;
drop table if exists public.transactions      cascade;
drop table if exists public.products          cascade;
drop table if exists public.categories        cascade;
drop table if exists public.profiles          cascade;

-- ----------------------------------------------------------------
-- 2. Buat Tabel Profiles
-- ----------------------------------------------------------------
create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  email      text not null,
  nama       text,
  role       text default 'kasir' check (role in ('admin', 'kasir')),
  status     text default 'aktif' check (status in ('aktif', 'nonaktif')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------------
-- 3. Buat Tabel Kategori
-- ----------------------------------------------------------------
create table public.categories (
  id         uuid default gen_random_uuid() primary key,
  nama       text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------------
-- 4. Buat Tabel Produk
-- ----------------------------------------------------------------
create table public.products (
  id          uuid default gen_random_uuid() primary key,
  nama        text not null,
  harga       numeric not null check (harga >= 0),
  stok        integer default 0 check (stok >= 0),
  category_id uuid references public.categories(id) on delete set null,
  created_at  timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------------
-- 5. Buat Tabel Transaksi
-- ----------------------------------------------------------------
create table public.transactions (
  id           uuid default gen_random_uuid() primary key,
  no_transaksi text unique not null,
  subtotal     numeric not null,
  diskon       numeric default 0,
  ppn          numeric not null,
  total        numeric not null,
  kasir_id     uuid references auth.users(id),
  kasir_nama   text not null,
  created_at   timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ----------------------------------------------------------------
-- 6. Buat Tabel Item Transaksi
-- ----------------------------------------------------------------
create table public.transaction_items (
  id             uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(id) on delete cascade not null,
  product_id     uuid references public.products(id) on delete set null,
  nama           text not null,
  harga          numeric not null,
  qty            integer not null check (qty > 0),
  subtotal       numeric not null
);

-- ----------------------------------------------------------------
-- 7. Trigger: Otomatis buat profile saat user Auth baru dibuat
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nama, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'kasir'),
    'aktif'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------
-- 8. Enable Row Level Security
-- ----------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.transactions     enable row level security;
alter table public.transaction_items enable row level security;

-- ----------------------------------------------------------------
-- 9. RLS Policies — Profiles
-- ----------------------------------------------------------------
drop policy if exists "Baca profiles sendiri" on public.profiles;
drop policy if exists "Baca semua profiles" on public.profiles;
drop policy if exists "Admin kelola profiles" on public.profiles;
drop policy if exists "Dapat dibaca oleh user terautentikasi" on public.profiles;
drop policy if exists "Admin dapat mengubah profile" on public.profiles;

-- Semua user login bisa baca semua profile (untuk kelola akun)
create policy "Baca semua profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

-- User bisa update profile sendiri
create policy "Update profile sendiri" on public.profiles
  for update using (auth.uid() = id);

-- Admin bisa insert/update/delete semua profile
create policy "Admin kelola profiles" on public.profiles
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'aktif'
    )
  );

-- ----------------------------------------------------------------
-- 10. RLS Policies — Kategori
-- ----------------------------------------------------------------
drop policy if exists "Baca kategori" on public.categories;
drop policy if exists "Admin kelola kategori" on public.categories;
drop policy if exists "Dapat dibaca oleh semua user terautentikasi" on public.categories;
drop policy if exists "Admin dapat mengelola kategori" on public.categories;

create policy "Baca kategori" on public.categories
  for select using (auth.role() = 'authenticated');

create policy "Admin kelola kategori" on public.categories
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'aktif'
    )
  );

-- ----------------------------------------------------------------
-- 11. RLS Policies — Produk
-- ----------------------------------------------------------------
drop policy if exists "Baca produk" on public.products;
drop policy if exists "Update stok produk" on public.products;
drop policy if exists "Admin kelola produk" on public.products;
drop policy if exists "Dapat dibaca oleh semua user terautentikasi" on public.products;
drop policy if exists "Admin dan Kasir dapat mengupdate produk (untuk kurangi stok)" on public.products;
drop policy if exists "Admin dapat mengelola produk" on public.products;

create policy "Baca produk" on public.products
  for select using (auth.role() = 'authenticated');

create policy "Update stok produk" on public.products
  for update using (auth.role() = 'authenticated');

create policy "Admin kelola produk" on public.products
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'aktif'
    )
  );

-- ----------------------------------------------------------------
-- 12. RLS Policies — Transaksi
-- ----------------------------------------------------------------
drop policy if exists "Baca transaksi" on public.transactions;
drop policy if exists "Buat transaksi" on public.transactions;
drop policy if exists "Admin kelola transaksi" on public.transactions;
drop policy if exists "Dapat dibaca oleh semua user terautentikasi" on public.transactions;
drop policy if exists "Semua user terautentikasi dapat membuat transaksi" on public.transactions;
drop policy if exists "Admin dapat mengelola semua transaksi" on public.transactions;

create policy "Baca transaksi" on public.transactions
  for select using (auth.role() = 'authenticated');

create policy "Buat transaksi" on public.transactions
  for insert with check (auth.role() = 'authenticated');

create policy "Admin kelola transaksi" on public.transactions
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'aktif'
    )
  );

-- ----------------------------------------------------------------
-- 13. RLS Policies — Item Transaksi
-- ----------------------------------------------------------------
drop policy if exists "Baca item transaksi" on public.transaction_items;
drop policy if exists "Buat item transaksi" on public.transaction_items;
drop policy if exists "Admin kelola item transaksi" on public.transaction_items;
drop policy if exists "Dapat dibaca oleh semua user terautentikasi" on public.transaction_items;
drop policy if exists "Semua user terautentikasi dapat membuat item transaksi" on public.transaction_items;
drop policy if exists "Admin dapat mengelola item transaksi" on public.transaction_items;

create policy "Baca item transaksi" on public.transaction_items
  for select using (auth.role() = 'authenticated');

create policy "Buat item transaksi" on public.transaction_items
  for insert with check (auth.role() = 'authenticated');

create policy "Admin kelola item transaksi" on public.transaction_items
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin' and status = 'aktif'
    )
  );

-- ================================================================
-- 14. BUAT / PERBAIKI AKUN ADMIN
--
-- Akun admin:
--   Email    : nurulanissamusthapa@gmail.com
--   Password : admin123
--
-- LANGKAH:
--   1. Buka Supabase Dashboard → Authentication → Users → Add User
--   2. Isi Email: nurulanissamusthapa@gmail.com
--   3. Isi Password: admin123
--   4. Klik Save
--   5. Jalankan query di bawah ini di SQL Editor
-- ================================================================

INSERT INTO public.profiles (id, email, nama, role, status)
SELECT id, email, 'Admin', 'admin', 'aktif'
FROM auth.users
WHERE email = 'nurulanissamusthapa@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'admin', status = 'aktif', nama = 'Admin';

-- ================================================================
-- 15. VERIFIKASI — Jalankan ini untuk memastikan data sudah benar
-- ================================================================
-- SELECT au.id, au.email, p.nama, p.role, p.status
-- FROM auth.users au
-- LEFT JOIN public.profiles p ON p.id = au.id
-- WHERE au.email = 'nurulanissamusthapa@gmail.com';
