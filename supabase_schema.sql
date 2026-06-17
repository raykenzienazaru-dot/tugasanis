-- ====================================================================
-- SUPABASE_SCHEMA.SQL — Silakan salin dan jalankan ini di SQL Editor Supabase
-- ====================================================================

-- 1. Buat Tabel Profiles (Data User)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  nama text,
  role text default 'kasir' check (role in ('admin', 'kasir')),
  status text default 'aktif' check (status in ('aktif', 'nonaktif')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Buat Tabel Kategori (Categories)
create table public.categories (
  id uuid default gen_random_uuid() primary key,
  nama text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Buat Tabel Produk (Products)
create table public.products (
  id uuid default gen_random_uuid() primary key,
  nama text not null,
  harga numeric not null check (harga >= 0),
  stok integer default 0 check (stok >= 0),
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Buat Tabel Transaksi (Transactions)
create table public.transactions (
  id uuid default gen_random_uuid() primary key,
  no_transaksi text unique not null,
  subtotal numeric not null,
  diskon numeric default 0,
  ppn numeric not null,
  total numeric not null,
  kasir_id uuid references auth.users(id),
  kasir_nama text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Buat Tabel Item Transaksi (Transaction Items)
create table public.transaction_items (
  id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete set null,
  nama text not null,
  harga numeric not null,
  qty integer not null check (qty > 0),
  subtotal numeric not null
);

-- 6. Trigger untuk otomatis membuat profiles setelah auth.users dibuat
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nama, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nama', ''),
    coalesce(new.raw_user_meta_data->>'role', 'kasir'),
    coalesce(new.raw_user_meta_data->>'status', 'aktif')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Hapus trigger jika sudah ada sebelumnya
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. Enable RLS (Row Level Security) pada semua tabel
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;

-- 8. Buat Kebijakan RLS (RLS Policies)

-- Kebijakan untuk Profiles
create policy "Dapat dibaca oleh user terautentikasi" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Admin dapat mengubah profile" on public.profiles
  for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Kebijakan untuk Kategori
create policy "Dapat dibaca oleh semua user terautentikasi" on public.categories
  for select using (auth.role() = 'authenticated');

create policy "Admin dapat mengelola kategori" on public.categories
  for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Kebijakan untuk Produk
create policy "Dapat dibaca oleh semua user terautentikasi" on public.products
  for select using (auth.role() = 'authenticated');

create policy "Admin dan Kasir dapat mengupdate produk (untuk kurangi stok)" on public.products
  for update using (auth.role() = 'authenticated');

create policy "Admin dapat mengelola produk" on public.products
  for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Kebijakan untuk Transaksi
create policy "Dapat dibaca oleh semua user terautentikasi" on public.transactions
  for select using (auth.role() = 'authenticated');

create policy "Semua user terautentikasi dapat membuat transaksi" on public.transactions
  for insert with check (auth.role() = 'authenticated');

create policy "Admin dapat mengelola semua transaksi" on public.transactions
  for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Kebijakan untuk Item Transaksi
create policy "Dapat dibaca oleh semua user terautentikasi" on public.transaction_items
  for select using (auth.role() = 'authenticated');

create policy "Semua user terautentikasi dapat membuat item transaksi" on public.transaction_items
  for insert with check (auth.role() = 'authenticated');

create policy "Admin dapat mengelola item transaksi" on public.transaction_items
  for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
