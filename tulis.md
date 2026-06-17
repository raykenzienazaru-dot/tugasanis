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
5. Klik **Run** (atau tekan `Ctrl + Enter`). Ini akan otomatis membuat seluruh tabel (`profiles`, `categories`, `products`, `transactions`, `transaction_items`), relasi kunci asing, trigger pembuatan profil otomatis, Row Level Security (RLS) policies, fungsi transaksi atomik `process_transaction`, dan akun admin awal.

> Catatan: file schema setup menghapus tabel `public` lama. Backup data dulu jika database sudah berisi produk atau transaksi penting.

---

## Langkah 2 — Aktifkan Email Auth Provider di Supabase

1. Di Supabase Dashboard, masuk ke menu **Authentication > Providers**.
2. Pastikan provider **Email** dalam status **Enabled**.
3. Matikan opsi **Confirm email** (agar user/kasir baru bisa langsung login tanpa perlu verifikasi email di inbox mereka).
4. Klik **Save**.

---

## Langkah 3 — Login Admin Pertama

Schema sudah membuat akun admin awal secara otomatis:

```text
Email    : nurulanissamusthapa@gmail.com
Password : admin123
```

Setelah login, ganti password admin dari Supabase Dashboard atau gunakan fitur lupa password agar tidak memakai password default terlalu lama.

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
| Kelola Kupon            |  ❌  |  ✅  |
| Laporan Penjualan & Laba|  ❌  |  ✅  |
| Kelola Akun Kasir       |  ❌  |  ✅  |

---

## Logika Bisnis & Transaksi Baru

1. **Diskon Otomatis**: Jika subtotal belanja melebihi **Rp 100.000**, sistem otomatis memotong **Rp 10.000** pada transaksi tersebut.
2. **Kupon Terbatas**: Admin dapat membuat kupon diskon dengan minimal belanja dan batas kuota tertentu. Kasir dapat memasukkan kode kupon saat proses pembayaran.
3. **Pembayaran Multi-Metode**: Transaksi POS kasir mendukung pembayaran via **Tunai** (menampilkan kembalian real-time + uang pas), **QRIS** (menampilkan QR code dinamis), dan **Transfer Bank** (BCA, Mandiri, BNI).
4. **Keuntungan & Barcode**:
   - Sistem merekam **Harga Beli** produk dan menghitung total keuntungan per transaksi pada diagram monitoring admin.
   - Kolom **Barcode** mendukung input barcode fisik/pindai langsung dengan tombol Enter di kasir, lengkap dengan generator barcode acak untuk produk baru.
