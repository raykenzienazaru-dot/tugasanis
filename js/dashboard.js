// ====================================================================
// DASHBOARD.JS — Logika utama dashboard kasir (Supabase)
// ====================================================================

let currentUser      = null;
let currentUserData  = null;
let allProduk        = [];
let allKategori      = [];
let cart             = [];
let allTransaksi     = [];
let allKasirAccounts = [];

// --------------------------------------------------------------------
// 1. AUTH GUARD
// --------------------------------------------------------------------
supabase.auth.onAuthStateChange(async (event, session) => {
  const user = session?.user;
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;

  try {
    // Ambil data profile dari public.profiles
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !profile || profile.status === 'nonaktif') {
      alert('Akun Anda tidak memiliki akses atau telah dinonaktifkan.');
      await supabase.auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    currentUserData = profile;
    localStorage.setItem('userRole', currentUserData.role);
    localStorage.setItem('userName', currentUserData.nama || currentUserData.email);

    initDashboard();

  } catch (err) {
    console.error('Gagal memuat data user:', err);
    alert('Terjadi kesalahan saat memuat data akun Anda.');
  }
});

// --------------------------------------------------------------------
// 2. INISIALISASI DASHBOARD
// --------------------------------------------------------------------
function initDashboard() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('appLayout').style.display     = 'flex';

  document.getElementById('sidebarUserName').textContent = currentUserData.nama || currentUserData.email;
  document.getElementById('sidebarRole').textContent     = currentUserData.role === 'admin' ? 'Admin' : 'Kasir';

  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  if (currentUserData.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.removeProperty('display'));
  }

  setupNavigation();
  loadKategori();
  loadProduk();
  loadRiwayatTransaksi();

  if (currentUserData.role === 'admin') {
    loadKasirAccounts();
  }

  // event listeners
  document.getElementById('searchProduk')?.addEventListener('input', renderProdukGrid);
  document.getElementById('filterKategori')?.addEventListener('change', renderProdukGrid);
  document.getElementById('btnBayar')?.addEventListener('click', prosesPembayaran);

  if (window.lucide) lucide.createIcons();
}

// --------------------------------------------------------------------
// 3. NAVIGASI
// --------------------------------------------------------------------
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const titles   = {
    kasir: 'Transaksi Kasir',
    riwayat: 'Riwayat Transaksi',
    produk: 'Kelola Produk',
    kategori: 'Kategori Produk',
    laporan: 'Laporan Penjualan',
    kasirManage: 'Kelola Akun'
  };

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const viewName = link.dataset.view;
      if (link.classList.contains('admin-only') && currentUserData.role !== 'admin') return;

      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + viewName).classList.add('active');
      document.getElementById('pageTitle').textContent = titles[viewName] || 'Dashboard';
      
      // Auto-close sidebar on mobile
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && sidebar.classList.contains('show')) {
        toggleSidebar();
      }

      if (window.lucide) lucide.createIcons();
    });
  });
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;
  const isOpen = sidebar.classList.toggle('show');
  if (isOpen) {
    overlay.style.display = 'block';
    setTimeout(() => overlay.classList.add('show'), 10);
  } else {
    overlay.classList.remove('show');
    setTimeout(() => {
      if (!sidebar.classList.contains('show')) {
        overlay.style.display = 'none';
      }
    }, 300);
  }
}

// --------------------------------------------------------------------
// 4. UTILITAS
// --------------------------------------------------------------------
function formatRupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ====================================================================
// 5. KATEGORI
// ====================================================================
function loadKategori() {
  fetchKategori();
  
  // Realtime listener
  supabase
    .channel('realtime-categories')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
      fetchKategori();
    })
    .subscribe();
}

async function fetchKategori() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('nama');
  
  if (error) {
    console.error('Gagal memuat kategori:', error);
    return;
  }
  
  allKategori = data;
  renderKategoriTable();
  renderKategoriDropdowns();
}

function renderKategoriTable() {
  const tbody = document.getElementById('kategoriTableBody');
  if (!tbody) return;
  if (!allKategori.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-state">Belum ada kategori</td></tr>';
    return;
  }
  tbody.innerHTML = allKategori.map(k => `
    <tr>
      <td>${escapeHtml(k.nama)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteKategori('${k.id}')">Hapus</button></td>
    </tr>
  `).join('');
}

function renderKategoriDropdowns() {
  const filterEl = document.getElementById('filterKategori');
  if (filterEl) {
    const cur = filterEl.value;
    filterEl.innerHTML = '<option value="">Semua Kategori</option>' +
      allKategori.map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join('');
    filterEl.value = cur;
  }
  const selEl = document.getElementById('produkKategori');
  if (selEl) {
    selEl.innerHTML = allKategori.map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join('');
  }
}

function openKategoriModal() {
  document.getElementById('kategoriNama').value = '';
  openModal('modalKategori');
}

async function saveKategori() {
  const nama = document.getElementById('kategoriNama').value.trim();
  if (!nama) { alert('Nama kategori tidak boleh kosong.'); return; }
  try {
    const { error } = await supabase
      .from('categories')
      .insert([{ nama }]);
    if (error) throw error;
    closeModal('modalKategori');
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function deleteKategori(id) {
  if (!confirm('Hapus kategori ini?')) return;
  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (err) { alert('Gagal: ' + err.message); }
}

// ====================================================================
// 6. PRODUK
// ====================================================================
let stockChartInstance = null;

function loadProduk() {
  fetchProduk();

  // Realtime listener
  supabase
    .channel('realtime-products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
      fetchProduk();
    })
    .subscribe();
}

async function fetchProduk() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('nama');
  
  if (error) {
    console.error('Gagal memuat produk:', error);
    return;
  }

  allProduk = data;
  renderProdukGrid();
  renderProdukTable();
  renderStockChart();
}

function renderStockChart() {
  const canvas = document.getElementById('stockChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (stockChartInstance) {
    stockChartInstance.destroy();
  }

  // Ambil maksimal 10 produk dengan stok paling sedikit (sebagai peringatan)
  const sorted = [...allProduk].sort((a, b) => a.stok - b.stok).slice(0, 10);

  const labels = sorted.map(p => p.nama);
  const data = sorted.map(p => p.stok);
  
  // Warna merah untuk stok <= 5, biru untuk stok aman
  const backgroundColors = sorted.map(p => p.stok <= 5 ? 'rgba(239, 68, 68, 0.75)' : 'rgba(79, 70, 229, 0.75)');
  const borderColors = sorted.map(p => p.stok <= 5 ? 'rgb(239, 68, 68)' : 'rgb(79, 70, 229)');

  stockChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Jumlah Stok',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: { stepSize: 5 }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function getKategoriNama(id) {
  const k = allKategori.find(k => k.id === id);
  return k ? k.nama : '-';
}

function renderProdukGrid() {
  const grid    = document.getElementById('productGrid');
  if (!grid) return;
  const keyword = (document.getElementById('searchProduk')?.value || '').toLowerCase();
  const kat     = document.getElementById('filterKategori')?.value || '';
  const list    = allProduk.filter(p =>
    p.nama.toLowerCase().includes(keyword) && (kat ? p.category_id === kat : true)
  );

  if (!list.length) { grid.innerHTML = '<div class="empty-state">Tidak ada produk ditemukan</div>'; return; }

  grid.innerHTML = list.map(p => `
    <div class="product-item ${p.stok <= 0 ? 'out-of-stock' : ''}" onclick="addToCart('${p.id}')">
      <div class="product-icon" style="display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
        <i data-lucide="shopping-bag" style="width: 24px; height: 24px; color: var(--primary);"></i>
      </div>
      <div class="name">${escapeHtml(p.nama)}</div>
      <div class="price">${formatRupiah(p.harga)}</div>
      <div class="stock">Stok: <strong>${p.stok}</strong></div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function renderProdukTable() {
  const tbody = document.getElementById('produkTableBody');
  if (!tbody) return;
  if (!allProduk.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada produk</td></tr>';
    return;
  }
  tbody.innerHTML = allProduk.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.nama)}</strong></td>
      <td>${escapeHtml(getKategoriNama(p.category_id))}</td>
      <td>${formatRupiah(p.harga)}</td>
      <td><span class="stock-badge ${p.stok <= 5 ? 'low' : ''}">${p.stok}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editProduk('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduk('${p.id}')">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function openProdukModal() {
  document.getElementById('produkModalTitle').textContent = 'Tambah Produk';
  document.getElementById('produkId').value               = '';
  document.getElementById('produkNama').value             = '';
  document.getElementById('produkHarga').value            = '';
  document.getElementById('produkStok').value             = '';
  renderKategoriDropdowns();
  openModal('modalProduk');
}

function editProduk(id) {
  const p = allProduk.find(x => x.id === id);
  if (!p) return;
  document.getElementById('produkModalTitle').textContent = 'Edit Produk';
  document.getElementById('produkId').value               = p.id;
  document.getElementById('produkNama').value             = p.nama;
  document.getElementById('produkHarga').value            = p.harga;
  document.getElementById('produkStok').value             = p.stok;
  renderKategoriDropdowns();
  document.getElementById('produkKategori').value = p.category_id || '';
  openModal('modalProduk');
}

async function saveProduk() {
  const id          = document.getElementById('produkId').value;
  const nama        = document.getElementById('produkNama').value.trim();
  const category_id = document.getElementById('produkKategori').value;
  const harga       = Number(document.getElementById('produkHarga').value);
  const stok        = Number(document.getElementById('produkStok').value);

  if (!nama || harga <= 0) { alert('Nama dan harga produk wajib diisi dengan benar.'); return; }

  const data = { nama, category_id: category_id || null, harga, stok: stok || 0 };
  try {
    if (id) {
      const { error } = await supabase
        .from('products')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('products')
        .insert([data]);
      if (error) throw error;
    }
    closeModal('modalProduk');
  } catch (err) { alert('Gagal menyimpan produk: ' + err.message); }
}

async function deleteProduk(id) {
  if (!confirm('Hapus produk ini?')) return;
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (err) { alert('Gagal menghapus produk: ' + err.message); }
}

// --------------------------------------------------------------------
// 7. KERANJANG & TRANSAKSI
// --------------------------------------------------------------------
function addToCart(produkId) {
  const produk = allProduk.find(p => p.id === produkId);
  if (!produk) return;
  if (produk.stok <= 0) { alert('Stok produk ini habis.'); return; }

  const existing = cart.find(c => c.produkId === produkId);
  if (existing) {
    if (existing.qty + 1 > produk.stok) { alert('Jumlah di keranjang sudah mencapai batas stok.'); return; }
    existing.qty += 1;
  } else {
    cart.push({ produkId: produk.id, nama: produk.nama, harga: produk.harga, qty: 1, stokTersedia: produk.stok });
  }
  renderCart();
}

function changeQty(produkId, delta) {
  const item = cart.find(c => c.produkId === produkId);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    cart = cart.filter(c => c.produkId !== produkId);
  } else if (newQty > item.stokTersedia) {
    alert('Jumlah melebihi stok tersedia.');
    return;
  } else {
    item.qty = newQty;
  }
  renderCart();
}

function renderCart() {
  const cartItemsEl = document.getElementById('cartItems');
  const btnBayar    = document.getElementById('btnBayar');

  const subtotalEl = document.getElementById('cartSubtotal');
  const rowDiskon  = document.getElementById('rowDiskon');
  const diskonEl   = document.getElementById('cartDiskon');
  const ppnEl      = document.getElementById('cartPpn');
  const totalEl    = document.getElementById('cartTotal');

  if (!cart.length) {
    cartItemsEl.innerHTML = '<div class="empty-state">Belum ada item di keranjang</div>';
    if (subtotalEl) subtotalEl.textContent = formatRupiah(0);
    if (rowDiskon) rowDiskon.style.display = 'none';
    if (ppnEl) ppnEl.textContent = formatRupiah(0);
    if (totalEl) totalEl.textContent = formatRupiah(0);
    btnBayar.disabled = true;
    return;
  }

  cartItemsEl.innerHTML = cart.map(item => `
    <div class="cart-row">
      <div class="info">
        <div class="nm">${escapeHtml(item.nama)}</div>
        <div class="pr">${formatRupiah(item.harga)} × ${item.qty}</div>
      </div>
      <div class="qty-control">
        <button onclick="changeQty('${item.produkId}', -1)">−</button>
        <span>${item.qty}</span>
        <button onclick="changeQty('${item.produkId}', 1)">+</button>
      </div>
    </div>
  `).join('');

  const subtotal = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const diskon = subtotal > 100000 ? Math.round(subtotal * 0.1) : 0;
  const setelahDiskon = subtotal - diskon;
  const ppn = Math.round(setelahDiskon * 0.11);
  const total = setelahDiskon + ppn;

  if (subtotalEl) subtotalEl.textContent = formatRupiah(subtotal);
  if (rowDiskon) {
    if (diskon > 0) {
      rowDiskon.style.display = 'flex';
      diskonEl.textContent = '-' + formatRupiah(diskon);
    } else {
      rowDiskon.style.display = 'none';
    }
  }
  if (ppnEl) ppnEl.textContent = formatRupiah(ppn);
  if (totalEl) totalEl.textContent = formatRupiah(total);
  btnBayar.disabled       = false;
}

async function prosesPembayaran() {
  if (!cart.length) return;

  const subtotal     = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const diskon       = subtotal > 100000 ? Math.round(subtotal * 0.1) : 0;
  const setelahDiskon = subtotal - diskon;
  const ppn          = Math.round(setelahDiskon * 0.11);
  const total        = setelahDiskon + ppn;

  const noTransaksi  = 'TRX-' + Date.now();
  const transaksiData = {
    no_transaksi: noTransaksi,
    subtotal,
    diskon,
    ppn,
    total,
    kasir_id:   currentUser.id,
    kasir_nama: currentUserData.nama || currentUserData.email
  };

  try {
    // 1. Simpan Transaksi Utama
    const { data: trx, error: trxError } = await supabase
      .from('transactions')
      .insert([transaksiData])
      .select()
      .single();

    if (trxError) throw trxError;

    // 2. Simpan Item Detail Transaksi
    const itemsData = cart.map(c => ({
      transaction_id: trx.id,
      product_id: c.produkId,
      nama: c.nama,
      harga: c.harga,
      qty: c.qty,
      subtotal: c.harga * c.qty
    }));

    const { error: itemsError } = await supabase
      .from('transaction_items')
      .insert(itemsData);

    if (itemsError) throw itemsError;

    // 3. Update Stok Produk (Satu per satu)
    for (const item of cart) {
      const p = allProduk.find(x => x.id === item.produkId);
      const stokBaru = Math.max(0, (p?.stok || 0) - item.qty);
      const { error: stockError } = await supabase
        .from('products')
        .update({ stok: stokBaru })
        .eq('id', item.produkId);
        
      if (stockError) console.error('Gagal update stok produk:', item.produkId, stockError);
    }

    // Tampilkan struk
    tampilkanStruk({ ...transaksiData, items: itemsData });
    cart = [];
    renderCart();
  } catch (err) {
    alert('Gagal memproses pembayaran: ' + err.message);
  }
}

function tampilkanStruk(transaksi) {
  const tanggal  = new Date().toLocaleString('id-ID');
  const itemsHtml = transaksi.items.map(item =>
    `<div class="row"><span>${escapeHtml(item.nama)} ×${item.qty}</span><span>${formatRupiah(item.subtotal)}</span></div>`
  ).join('');

  let diskonHtml = '';
  if (transaksi.diskon > 0) {
    diskonHtml = `<div class="row"><span>Diskon (10%)</span><span>-${formatRupiah(transaksi.diskon)}</span></div>`;
  }

  // Generate QR Code URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(transaksi.no_transaksi)}`;

  document.getElementById('strukContent').innerHTML = `
    <div class="center"><strong>KASIR APP</strong><br>${tanggal}<br>No: ${transaksi.no_transaksi}<br>Kasir: ${escapeHtml(transaksi.kasir_nama)}</div>
    <hr>${itemsHtml}<hr>
    <div class="row"><span>Subtotal</span><span>${formatRupiah(transaksi.subtotal)}</span></div>
    ${diskonHtml}
    <div class="row"><span>PPN (11%)</span><span>${formatRupiah(transaksi.ppn)}</span></div>
    <hr>
    <div class="row"><strong>TOTAL</strong><strong>${formatRupiah(transaksi.total)}</strong></div>
    <hr>
    <div class="center" style="margin-top:10px; margin-bottom:10px;">
      <img src="${qrCodeUrl}" alt="QR Code" style="width:120px; height:120px; border:1px solid var(--border); padding:4px; border-radius:4px; background:white;"/>
      <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Scan Transaksi</div>
    </div>
    <hr>
    <div class="center">Terima kasih atas pembelian Anda</div>
  `;
  openModal('modalStruk');
}

// --------------------------------------------------------------------
// 8. RIWAYAT TRANSAKSI
// --------------------------------------------------------------------
function loadRiwayatTransaksi() {
  fetchRiwayat();

  // Realtime listener
  supabase
    .channel('realtime-transactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
      fetchRiwayat();
    })
    .subscribe();
}

async function fetchRiwayat() {
  let query = supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (currentUserData.role !== 'admin') {
    query = query.eq('kasir_id', currentUser.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Gagal memuat riwayat transaksi:', error);
    return;
  }

  allTransaksi = data;
  renderRiwayatTable();
}

function renderRiwayatTable() {
  const tbody = document.getElementById('riwayatTableBody');
  if (!tbody) return;
  if (!allTransaksi.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada transaksi</td></tr>';
    return;
  }
  tbody.innerHTML = allTransaksi.map(t => {
    const tanggal = t.created_at ? new Date(t.created_at).toLocaleString('id-ID') : '-';
    return `
      <tr>
        <td>${tanggal}</td>
        <td><code>${escapeHtml(t.no_transaksi)}</code></td>
        <td>${escapeHtml(t.kasir_nama)}</td>
        <td>Detail di menu aksi</td>
        <td><strong>${formatRupiah(t.total)}</strong></td>
        <td><button class="btn btn-secondary btn-sm" onclick="lihatDetailTransaksi('${t.id}')">Detail</button></td>
      </tr>
    `;
  }).join('');
}

async function lihatDetailTransaksi(id) {
  const t = allTransaksi.find(x => x.id === id);
  if (!t) return;

  const { data: items, error } = await supabase
    .from('transaction_items')
    .select('*')
    .eq('transaction_id', id);

  if (error) {
    alert('Gagal memuat detail item transaksi: ' + error.message);
    return;
  }

  const tanggal  = t.created_at ? new Date(t.created_at).toLocaleString('id-ID') : '-';
  const itemsHtml = items.map(item => `
    <tr><td>${escapeHtml(item.nama)}</td><td>${item.qty}</td><td>${formatRupiah(item.harga)}</td><td>${formatRupiah(item.subtotal)}</td></tr>
  `).join('');

  let diskonRow = '';
  if (t.diskon > 0) {
    diskonRow = `<p style="text-align:right;font-size:13px;color:var(--success);margin-top:4px;">Diskon (10%): -${formatRupiah(t.diskon)}</p>`;
  }

  document.getElementById('detailTransaksiContent').innerHTML = `
    <p><strong>No. Transaksi:</strong> ${escapeHtml(t.no_transaksi)}</p>
    <p><strong>Tanggal:</strong> ${tanggal}</p>
    <p><strong>Kasir:</strong> ${escapeHtml(t.kasir_nama)}</p>
    <table style="margin-top:12px;margin-bottom:12px;">
      <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p style="text-align:right;font-size:13px;color:var(--text-muted);margin-top:8px;">Subtotal: ${formatRupiah(t.subtotal)}</p>
    ${diskonRow}
    <p style="text-align:right;font-size:13px;color:var(--text-muted);margin-top:4px;">PPN (11%): ${formatRupiah(t.ppn)}</p>
    <p style="margin-top:8px;text-align:right;font-weight:700;font-size:15px;border-top:1px dashed var(--border);padding-top:8px;">Total Akhir: ${formatRupiah(t.total)}</p>
  `;
  openModal('modalDetailTransaksi');
}

// --------------------------------------------------------------------
// 9. LAPORAN PENJUALAN (ADMIN)
// --------------------------------------------------------------------
async function generateLaporan() {
  const tglMulai = document.getElementById('laporanTanggalMulai').value;
  const tglAkhir = document.getElementById('laporanTanggalAkhir').value;
  if (!tglMulai || !tglAkhir) { alert('Pilih rentang tanggal terlebih dahulu.'); return; }

  const startDate = tglMulai + 'T00:00:00.000Z';
  const endDate   = tglAkhir + 'T23:59:59.999Z';

  try {
    const { data: transaksis, error } = await supabase
      .from('transactions')
      .select('*, transaction_items(*)')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) throw error;

    let totalPendapatan = 0, jumlahTransaksi = 0;
    const produkMap = {};

    transaksis.forEach(t => {
      totalPendapatan  += Number(t.total);
      jumlahTransaksi  += 1;
      
      t.transaction_items.forEach(item => {
        if (!produkMap[item.nama]) produkMap[item.nama] = { qty: 0, total: 0 };
        produkMap[item.nama].qty   += item.qty;
        produkMap[item.nama].total += Number(item.subtotal);
      });
    });

    const totalProduk = Object.values(produkMap).reduce((s, p) => s + p.qty, 0);
    document.getElementById('laporanTotalPendapatan').textContent  = formatRupiah(totalPendapatan);
    document.getElementById('laporanJumlahTransaksi').textContent  = jumlahTransaksi;
    document.getElementById('laporanProdukTerjual').textContent    = totalProduk;

    const sorted = Object.entries(produkMap).sort((a, b) => b[1].qty - a[1].qty);
    const tbody  = document.getElementById('laporanProdukTableBody');
    tbody.innerHTML = sorted.length
      ? sorted.map(([nama, d]) => `<tr><td>${escapeHtml(nama)}</td><td>${d.qty}</td><td>${formatRupiah(d.total)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty-state">Tidak ada transaksi pada rentang tanggal ini</td></tr>';

  } catch (err) { alert('Gagal memuat laporan: ' + err.message); }
}

// --------------------------------------------------------------------
// 10. KELOLA AKUN KASIR/ADMIN (HANYA ADMIN)
// --------------------------------------------------------------------
function loadKasirAccounts() {
  fetchKasirAccounts();

  // Realtime listener
  supabase
    .channel('realtime-profiles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      fetchKasirAccounts();
    })
    .subscribe();
}

async function fetchKasirAccounts() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('nama');

  if (error) {
    console.error('Gagal memuat akun:', error);
    return;
  }

  allKasirAccounts = data;
  renderKasirTable();
}

function renderKasirTable() {
  const tbody = document.getElementById('kasirTableBody');
  if (!tbody) return;
  if (!allKasirAccounts.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada akun</td></tr>';
    return;
  }
  tbody.innerHTML = allKasirAccounts.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.nama)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge-${u.role}">${u.role === 'admin' ? 'Admin' : 'Kasir'}</span></td>
      <td><span class="status-dot ${u.status === 'nonaktif' ? 'nonaktif' : 'aktif'}"></span> ${u.status === 'nonaktif' ? 'Nonaktif' : 'Aktif'}</td>
      <td>
        ${u.id !== currentUser.id
          ? `<button class="btn btn-secondary btn-sm" onclick="toggleStatusAkun('${u.id}', '${u.status || 'aktif'}')">
              ${u.status === 'nonaktif' ? 'Aktifkan' : 'Nonaktifkan'}
             </button>`
          : '<span style="color:var(--text-muted);font-size:12px;">(Akun Anda)</span>'
        }
      </td>
    </tr>
  `).join('');
}

function openKasirModal() {
  document.getElementById('kasirNama').value     = '';
  document.getElementById('kasirEmail').value    = '';
  document.getElementById('kasirPassword').value = '';
  document.getElementById('kasirRole').value     = 'kasir';
  document.getElementById('kasirModalAlert').classList.remove('show');
  openModal('modalKasir');
}

async function saveKasirAccount() {
  const nama     = document.getElementById('kasirNama').value.trim();
  const email    = document.getElementById('kasirEmail').value.trim();
  const password = document.getElementById('kasirPassword').value;
  const role     = document.getElementById('kasirRole').value;
  const alertEl  = document.getElementById('kasirModalAlert');
  const btnSave  = document.getElementById('btnSaveKasir');

  alertEl.classList.remove('show');

  if (!nama || !email || !password) {
    alertEl.textContent = 'Semua field wajib diisi.';
    alertEl.classList.add('show');
    return;
  }
  if (password.length < 6) {
    alertEl.textContent = 'Password minimal 6 karakter.';
    alertEl.classList.add('show');
    return;
  }

  btnSave.disabled    = true;
  btnSave.textContent = 'Menyimpan...';

  try {
    // Daftarkan auth user menggunakan secondary client
    const { data, error } = await secondarySupabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          nama: nama,
          role: role,
          status: 'aktif'
        }
      }
    });

    if (error) throw error;

    // Catatan: Karena kita menggunakan trigger di database PostgreSQL Supabase,
    // data profil di public.profiles otomatis terbuat dari backend secara definer.
    
    closeModal('modalKasir');

  } catch (err) {
    let msg = 'Gagal membuat akun: ' + err.message;
    if (err.code === 'auth/email-already-in-use' || err.message.includes('already registered')) {
      msg = 'Email ini sudah terdaftar.';
    }
    alertEl.textContent = msg;
    alertEl.classList.add('show');
  } finally {
    btnSave.disabled    = false;
    btnSave.textContent = 'Simpan';
  }
}

async function toggleStatusAkun(uid, statusSekarang) {
  if (uid === currentUser.id) { alert('Anda tidak bisa menonaktifkan akun Anda sendiri.'); return; }
  const statusBaru = statusSekarang === 'nonaktif' ? 'aktif' : 'nonaktif';
  if (!confirm(`Ubah status akun menjadi "${statusBaru}"?`)) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ status: statusBaru })
      .eq('id', uid);

    if (error) throw error;
  } catch (err) {
    alert('Gagal mengubah status: ' + err.message);
  }
}
