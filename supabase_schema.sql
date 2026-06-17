-- ====================================================================
-- SUPABASE_SCHEMA.SQL - Setup lengkap: tabel, RLS, RPC transaksi & admin
-- Salin SELURUH file ini ke SQL Editor Supabase, lalu RUN.
--
-- Admin awal:
--   Email   : nurulanissamusthapa@gmail.com
--   Password: admin123
--
-- Catatan: file setup ini menghapus tabel public lama. Backup data dulu
-- jika database sudah berisi transaksi/produk yang penting.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Extension
-- --------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------
-- 2. Hapus objek lama
-- --------------------------------------------------------------------
drop table if exists public.transaction_items cascade;
drop table if exists public.transactions      cascade;
drop table if exists public.coupons           cascade;
drop table if exists public.products          cascade;
drop table if exists public.categories        cascade;
drop table if exists public.profiles          cascade;

-- --------------------------------------------------------------------
-- 3. Tabel
-- --------------------------------------------------------------------
create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  email      text not null unique,
  nama       text not null default '',
  role       text not null default 'kasir' check (role in ('admin', 'kasir')),
  status     text not null default 'aktif' check (status in ('aktif', 'nonaktif')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create table public.categories (
  id         uuid primary key default extensions.gen_random_uuid(),
  nama       text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index categories_nama_lower_key
  on public.categories (lower(nama));

create table public.products (
  id          uuid primary key default extensions.gen_random_uuid(),
  nama        text not null,
  barcode     text unique,
  harga       numeric(14, 2) not null check (harga >= 0),
  harga_beli  numeric(14, 2) not null default 0 check (harga_beli >= 0),
  stok        integer not null default 0 check (stok >= 0),
  category_id uuid references public.categories(id) on delete set null,
  created_at  timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at  timestamp with time zone not null default timezone('utc'::text, now())
);

create unique index products_nama_lower_key
  on public.products (lower(nama));

create index products_category_id_idx on public.products(category_id);
create index products_barcode_idx on public.products(barcode);

-- Coupons Table
create table public.coupons (
  id             uuid primary key default extensions.gen_random_uuid(),
  kode           text not null unique,
  potongan       numeric(14, 2) not null check (potongan >= 0),
  min_transaksi  numeric(14, 2) not null default 0 check (min_transaksi >= 0),
  kuota          integer not null default 10 check (kuota >= 0),
  terpakai       integer not null default 0 check (terpakai >= 0),
  is_aktif       boolean not null default true,
  created_at     timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at     timestamp with time zone not null default timezone('utc'::text, now())
);

create index coupons_kode_idx on public.coupons(kode);

create table public.transactions (
  id                 uuid primary key default extensions.gen_random_uuid(),
  no_transaksi       text not null unique,
  subtotal           numeric(14, 2) not null check (subtotal >= 0),
  diskon             numeric(14, 2) not null default 0 check (diskon >= 0),
  ppn                numeric(14, 2) not null default 0 check (ppn >= 0),
  total              numeric(14, 2) not null check (total >= 0),
  kasir_id           uuid references auth.users(id) on delete set null,
  kasir_nama         text not null,
  metode_pembayaran  text not null default 'Tunai',
  nominal_bayar      numeric(14, 2) not null default 0 check (nominal_bayar >= 0),
  kembalian          numeric(14, 2) not null default 0 check (kembalian >= 0),
  coupon_id          uuid references public.coupons(id) on delete set null,
  keuntungan         numeric(14, 2) not null default 0 check (keuntungan >= 0),
  created_at         timestamp with time zone not null default timezone('utc'::text, now())
);

create index transactions_kasir_id_idx on public.transactions(kasir_id);
create index transactions_created_at_idx on public.transactions(created_at desc);

create table public.transaction_items (
  id             uuid primary key default extensions.gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  nama           text not null,
  harga          numeric(14, 2) not null check (harga >= 0),
  harga_beli     numeric(14, 2) not null default 0 check (harga_beli >= 0),
  qty            integer not null check (qty > 0),
  subtotal       numeric(14, 2) not null check (subtotal >= 0)
);

create index transaction_items_transaction_id_idx on public.transaction_items(transaction_id);
create index transaction_items_product_id_idx on public.transaction_items(product_id);

-- --------------------------------------------------------------------
-- 4. Trigger utilitas
-- --------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------
-- 5. Trigger Auth -> Profile
--    Role dari metadata signup sengaja TIDAK dipercaya. Semua self-signup
--    masuk sebagai kasir; admin bisa menaikkan role lewat policy admin.
-- --------------------------------------------------------------------
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
    coalesce(nullif(new.raw_user_meta_data->>'nama', ''), split_part(new.email, '@', 1)),
    'kasir',
    'aktif'
  )
  on conflict (id) do update
    set email = excluded.email,
        nama = coalesce(nullif(public.profiles.nama, ''), excluded.nama);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------
-- 6. Helper RLS
-- --------------------------------------------------------------------
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'aktif';
$$;

create or replace function public.is_active_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'aktif'
  );
$$;

create or replace function public.can_read_transaction(p_transaction_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.transactions t
    where t.id = p_transaction_id
      and (
        public.get_my_role() = 'admin'
        or t.kasir_id = auth.uid()
      )
  );
$$;

-- --------------------------------------------------------------------
-- 7. RPC transaksi atomik
--    Menyimpan transaksi, item, dan update stok dalam satu transaksi DB.
--    Harga/nama/subtotal dihitung dari tabel products, bukan dari client.
-- --------------------------------------------------------------------
create or replace function public.process_transaction(
  p_items jsonb,
  p_no_transaksi text default null,
  p_metode_pembayaran text default 'Tunai',
  p_nominal_bayar numeric default 0,
  p_kembalian numeric default 0,
  p_coupon_code text default null
)
returns table (
  id uuid,
  no_transaksi text,
  subtotal numeric,
  diskon numeric,
  ppn numeric,
  total numeric,
  kasir_id uuid,
  kasir_nama text,
  metode_pembayaran text,
  nominal_bayar numeric,
  kembalian numeric,
  coupon_id uuid,
  created_at timestamp with time zone,
  items jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user         public.profiles%rowtype;
  v_trx_id       uuid;
  v_no_transaksi text;
  v_product      record;
  v_item         record;
  v_subtotal     numeric(14, 2) := 0;
  v_diskon       numeric(14, 2) := 0;
  v_auto_diskon  numeric(14, 2) := 0;
  v_coupon_diskon numeric(14, 2) := 0;
  v_ppn          numeric(14, 2) := 0;
  v_total        numeric(14, 2) := 0;
  v_keuntungan   numeric(14, 2) := 0;
  v_items        jsonb := '[]'::jsonb;
  v_coupon       record;
begin
  if auth.uid() is null then
    raise exception 'Login diperlukan.';
  end if;

  select *
  into v_user
  from public.profiles
  where profiles.id = auth.uid()
    and profiles.status = 'aktif';

  if not found then
    raise exception 'Akun tidak aktif atau profil tidak ditemukan.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id uuid, qty integer)
    where x.product_id is null
       or x.qty is null
       or x.qty <= 0
  ) then
    raise exception 'Item transaksi tidak valid.';
  end if;

  v_no_transaksi := coalesce(
    nullif(btrim(p_no_transaksi), ''),
    'TRX-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' ||
    substr(extensions.gen_random_uuid()::text, 1, 8)
  );

  for v_item in
    select x.product_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x(product_id uuid, qty integer)
    group by x.product_id
  loop
    select p.id, p.nama, p.harga, p.harga_beli, p.stok
    into v_product
    from public.products p
    where p.id = v_item.product_id
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if v_product.stok < v_item.qty then
      raise exception 'Stok % tidak cukup. Sisa stok: %.', v_product.nama, v_product.stok;
    end if;

    v_subtotal := v_subtotal + (v_product.harga * v_item.qty);
    v_keuntungan := v_keuntungan + ((v_product.harga - v_product.harga_beli) * v_item.qty);

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'nama', v_product.nama,
      'harga', v_product.harga,
      'harga_beli', v_product.harga_beli,
      'qty', v_item.qty,
      'subtotal', v_product.harga * v_item.qty
    ));
  end loop;

  -- 1. Automatic discount (Rp 10k flat if subtotal > 100k)
  v_auto_diskon := case when v_subtotal > 100000 then 10000.00 else 0.00 end;

  -- 2. Coupon discount
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon
    from public.coupons
    where lower(kode) = lower(btrim(p_coupon_code))
      and is_aktif = true;

    if not found then
      raise exception 'Kupon tidak valid atau tidak aktif.';
    end if;

    if v_coupon.terpakai >= v_coupon.kuota then
      raise exception 'Kuota kupon sudah habis.';
    end if;

    if v_subtotal < v_coupon.min_transaksi then
      raise exception 'Transaksi minimum untuk kupon ini adalah %.', v_coupon.min_transaksi;
    end if;

    v_coupon_diskon := v_coupon.potongan;
  end if;

  v_diskon := v_auto_diskon + v_coupon_diskon;
  
  -- Diskon tidak boleh melebihi subtotal
  if v_diskon > v_subtotal then
    v_diskon := v_subtotal;
  end if;

  -- Keuntungan dikurangi diskon
  v_keuntungan := v_keuntungan - v_diskon;
  if v_keuntungan < 0 then
    v_keuntungan := 0;
  end if;

  v_ppn    := round((v_subtotal - v_diskon) * 0.11);
  v_total  := v_subtotal - v_diskon + v_ppn;

  -- Verifikasi nominal bayar
  if p_metode_pembayaran = 'Tunai' and p_nominal_bayar < v_total then
    raise exception 'Uang pembayaran kurang. Total bayar: %.', v_total;
  end if;

  insert into public.transactions (
    no_transaksi, subtotal, diskon, ppn, total, kasir_id, kasir_nama,
    metode_pembayaran, nominal_bayar, kembalian, coupon_id, keuntungan
  )
  values (
    v_no_transaksi,
    v_subtotal,
    v_diskon,
    v_ppn,
    v_total,
    auth.uid(),
    coalesce(nullif(v_user.nama, ''), v_user.email),
    p_metode_pembayaran,
    case when p_metode_pembayaran = 'Tunai' then p_nominal_bayar else v_total end,
    case when p_metode_pembayaran = 'Tunai' then p_kembalian else 0.00 end,
    case when v_coupon.id is not null then v_coupon.id else null end,
    v_keuntungan
  )
  returning transactions.id into v_trx_id;

  -- Update kupon terpakai
  if v_coupon.id is not null then
    update public.coupons
    set terpakai = terpakai + 1
    where id = v_coupon.id;
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(v_items) as x(
      product_id uuid,
      nama text,
      harga numeric,
      harga_beli numeric,
      qty integer,
      subtotal numeric
    )
  loop
    insert into public.transaction_items (
      transaction_id, product_id, nama, harga, harga_beli, qty, subtotal
    )
    values (
      v_trx_id,
      v_item.product_id,
      v_item.nama,
      v_item.harga,
      v_item.harga_beli,
      v_item.qty,
      v_item.subtotal
    );

    update public.products
    set stok = stok - v_item.qty
    where products.id = v_item.product_id;
  end loop;

  return query
  select
    t.id,
    t.no_transaksi,
    t.subtotal,
    t.diskon,
    t.ppn,
    t.total,
    t.kasir_id,
    t.kasir_nama,
    t.metode_pembayaran,
    t.nominal_bayar,
    t.kembalian,
    t.coupon_id,
    t.created_at,
    v_items as items
  from public.transactions t
  where t.id = v_trx_id;
end;
$$;

revoke all on function public.process_transaction(jsonb, text, text, numeric, numeric, text) from public;
grant execute on function public.process_transaction(jsonb, text, text, numeric, numeric, text) to authenticated;

-- --------------------------------------------------------------------
-- 8. Row Level Security
-- --------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.coupons           enable row level security;
alter table public.transactions      enable row level security;
alter table public.transaction_items enable row level security;

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'categories',
        'products',
        'coupons',
        'transactions',
        'transaction_items'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.get_my_role()) = 'admin');

create policy "profiles_insert_self_kasir"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = (select auth.uid())
    and email = ((select auth.jwt()) ->> 'email')
    and role = 'kasir'
    and status = 'aktif'
  );

create policy "profiles_update_self_basic"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and email = ((select auth.jwt()) ->> 'email')
    and role = 'kasir'
    and status = 'aktif'
  );

create policy "profiles_admin_all"
  on public.profiles
  for all
  to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');

create policy "categories_select_active"
  on public.categories
  for select
  to authenticated
  using ((select public.is_active_user()));

create policy "categories_admin_all"
  on public.categories
  for all
  to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');

create policy "products_select_active"
  on public.products
  for select
  to authenticated
  using ((select public.is_active_user()));

create policy "products_admin_all"
  on public.products
  for all
  to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');

create policy "coupons_select_active"
  on public.coupons
  for select
  to authenticated
  using ((select public.is_active_user()));

create policy "coupons_admin_all"
  on public.coupons
  for all
  to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');

create policy "transactions_select_own_or_admin"
  on public.transactions
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'admin'
    or ((select public.is_active_user()) and kasir_id = (select auth.uid()))
  );

create policy "transactions_insert_own"
  on public.transactions
  for insert
  to authenticated
  with check (
    (select public.is_active_user())
    and kasir_id = (select auth.uid())
  );

create policy "transactions_admin_all"
  on public.transactions
  for all
  to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');

create policy "transaction_items_select_readable"
  on public.transaction_items
  for select
  to authenticated
  using (public.can_read_transaction(transaction_id));

create policy "transaction_items_insert_own_transaction"
  on public.transaction_items
  for insert
  to authenticated
  with check (public.can_read_transaction(transaction_id));

create policy "transaction_items_admin_all"
  on public.transaction_items
  for all
  to authenticated
  using ((select public.get_my_role()) = 'admin')
  with check ((select public.get_my_role()) = 'admin');

-- --------------------------------------------------------------------
-- 9. Admin awal
--    Tidak menghapus user lama agar data transaksi tidak ikut rusak.
-- --------------------------------------------------------------------
do $$
declare
  v_uid uuid;
begin
  select id
  into v_uid
  from auth.users
  where email = 'nurulanissamusthapa@gmail.com'
  order by created_at
  limit 1;

  if v_uid is null then
    v_uid := extensions.gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      'nurulanissamusthapa@gmail.com',
      extensions.crypt('admin123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nama":"Admin","role":"admin","status":"aktif"}'::jsonb,
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt('admin123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          '{"nama":"Admin","role":"admin","status":"aktif"}'::jsonb,
        updated_at = now()
    where id = v_uid;
  end if;

  insert into public.profiles (id, email, nama, role, status)
  values (
    v_uid,
    'nurulanissamusthapa@gmail.com',
    'Admin',
    'admin',
    'aktif'
  )
  on conflict (id) do update
    set email = excluded.email,
        nama = excluded.nama,
        role = 'admin',
        status = 'aktif';
end $$;

-- --------------------------------------------------------------------
-- 9a. Fungsi Reset Password Langsung (Bypass Verifikasi Email)
-- --------------------------------------------------------------------
create or replace function public.reset_user_password_direct(p_email text, p_new_password text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email;
  
  if v_user_id is null then
    return false;
  end if;
  
  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;
  
  return true;
end;
$$;

-- --------------------------------------------------------------------
-- 9b. Kategori & Produk Awal
-- --------------------------------------------------------------------
insert into public.categories (nama)
values ('Makanan'), ('Minuman'), ('Snack'), ('Lain-lain')
on conflict (lower(nama)) do nothing;

insert into public.products (nama, harga, stok, category_id)
select 'Indomie Goreng', 3500.00, 50, id from public.categories where nama = 'Makanan'
on conflict (lower(nama)) do nothing;

insert into public.products (nama, harga, stok, category_id)
select 'Es Teh Manis', 5000.00, 100, id from public.categories where nama = 'Minuman'
on conflict (lower(nama)) do nothing;

insert into public.products (nama, harga, stok, category_id)
select 'Kopi Susu', 12000.00, 30, id from public.categories where nama = 'Minuman'
on conflict (lower(nama)) do nothing;

insert into public.products (nama, harga, stok, category_id)
select 'Chiki Taro', 4000.00, 25, id from public.categories where nama = 'Snack'
on conflict (lower(nama)) do nothing;

-- --------------------------------------------------------------------
-- 10. Verifikasi
-- --------------------------------------------------------------------
select
  au.id,
  au.email,
  au.email_confirmed_at is not null as email_verified,
  p.nama,
  p.role,
  p.status
from auth.users au
join public.profiles p on p.id = au.id
where au.email = 'nurulanissamusthapa@gmail.com';
