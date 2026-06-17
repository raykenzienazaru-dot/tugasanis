# Panduan Setup — Kasir App (Supabase)

## Struktur File

```
kasiranis/
├── login.html              ← Halaman login (admin & kasir)
├── dashboard.html          ← Dashboard utama (satu file dinamis)
├── tulis.md                ← Panduan setup ini
├── supabase_schema.sql     ← Salin ini ke SQL Editor di Supabase
├── css/
│   └── style.css           ← Semua styling (Inter font, dark sidebar, responsive)
└── js/
    ├── supabase-config.js  ← Berisi kredensial Supabase Anda
    ├── auth.js             ← Logika login / logout / auth guard
    └── dashboard.js        ← Logika seluruh dashboard (produk, transaksi, laporan, dll)
```

---

## Langkah 1 — Setup Database di Supabase

1. Buka **[Supabase Dashboard](https://supabase.com/)** dan buat proyek baru.
2. Tunggu hingga proyek selesai dibuat.
3. Di panel sebelah kiri, pilih menu **SQL Editor** ➔ Klik **New Query**.
4. Salin seluruh isi dari file **`supabase_schema.sql`** yang ada di folder proyek ini dan tempel (paste) ke SQL Editor Supabase tersebut.
5. Klik **Run** (atau tekan `Ctrl + Enter`). Ini akan otomatis membuat seluruh tabel (`profiles`, `categories`, `products`, `transactions`, `transaction_items`), relasi kunci asing, trigger pembuatan profil otomatis, dan Row Level Security (RLS) policies.

---

## Langkah 2 — Aktifkan Email Auth Provider di Supabase

1. Di Supabase Dashboard, masuk ke menu **Authentication > Providers**.
2. Pastikan provider **Email** dalam status **Enabled**.
3. Matikan opsi **Confirm email** (agar user/kasir baru bisa langsung login tanpa perlu verifikasi email di inbox mereka).
4. Klik **Save**.

---

## Langkah 3 — Buat Akun Admin Pertama

1. Di Supabase Dashboard, masuk ke menu **Authentication > Users**.
2. Klik **Add User** ➔ pilih **Create User**.
3. Isi **Email** dan **Password** admin pertama Anda.
4. Klik **Create User**.
5. Karena trigger PostgreSQL yang kita buat di SQL Editor otomatis berjalan, akun ini sekarang sudah memiliki profile di tabel `profiles` dengan role default `kasir` dan status `aktif`.
6. Untuk mengubahnya menjadi **`admin`**:
   * Pergi ke menu **Table Editor** ➔ pilih tabel **`profiles`**.
   * Klik dua kali pada kolom `role` untuk akun admin Anda, ubah nilainya dari `kasir` menjadi **`admin`**.
   * Tekan Enter atau klik **Save** untuk menyimpan perubahan.

---

## Langkah 4 — Jalankan Aplikasi

Cukup jalankan local server di folder proyek Anda:

```bash
cd kasiranis
python3 -m http.server 8000
```

Buka `http://localhost:8000/login.html` di browser Anda.



## Fitur per Role

| Fitur                   | Kasir | Admin |
|-------------------------|:-----:|:-----:|
| Transaksi Kasir (POS)   |  ✅  |  ✅  |
| Riwayat Transaksi       |  Milik sendiri | Semua |
| Kelola Produk           |  ❌  |  ✅  |
| Kelola Kategori         |  ❌  |  ✅  |
| Laporan Penjualan       |  ❌  |  ✅  |
| Kelola Akun Kasir       |  ❌  |  ✅  |