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
let dashboardInitialized = false;
let isProcessingPayment = false;
let authCheckStarted = false;
let dashboardBooting = false;

// --------------------------------------------------------------------
// 1. AUTH GUARD
// --------------------------------------------------------------------
async function redirectToLogin(reason = 'no-session') {
  localStorage.removeItem('userRole');
  localStorage.removeItem('userName');
  window.location.href = `login.html?reason=${encodeURIComponent(reason)}`;
}

async function bootDashboard(user) {
  if (!user) {
    redirectToLogin('no-session');
    return;
  }

  if (dashboardInitialized || dashboardBooting) return;
  dashboardBooting = true;

  currentUser = user;

  try {
    // Ambil data profile dari public.profiles
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Gagal memuat profile:', error);
      alert('Gagal memuat data akun. Pastikan database sudah memakai schema terbaru.');
      return;
    }

    if (!profile) {
      alert('Profile akun tidak ditemukan. Silakan login ulang atau hubungi administrator.');
      await supabase.auth.signOut();
      redirectToLogin('profile-missing');
      return;
    }

    if (profile.status === 'nonaktif') {
      alert('Akun Anda telah dinonaktifkan.');
      await supabase.auth.signOut();
      redirectToLogin('inactive');
      return;
    }

    currentUserData = profile;
    localStorage.setItem('userRole', currentUserData.role);
    localStorage.setItem('userName', currentUserData.nama || currentUserData.email);

    if (!dashboardInitialized) {
      initDashboard();
    }

  } catch (err) {
    console.error('Gagal memuat data user:', err);
    alert('Terjadi kesalahan saat memuat data akun Anda.');
  } finally {
    if (!dashboardInitialized) {
      dashboardBooting = false;
    }
  }
}

async function initAuthGuard() {
  if (authCheckStarted) return;
  authCheckStarted = true;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Gagal membaca sesi:', error);
    redirectToLogin('session-error');
    return;
  }

  if (!data.session?.user) {
    redirectToLogin('no-session');
    return;
  }

  bootDashboard(data.session.user);
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    redirectToLogin('signed-out');
    return;
  }

  if (session?.user && !dashboardInitialized) {
    bootDashboard(session.user);
  }
});

initAuthGuard();

// --------------------------------------------------------------------
// 2. INISIALISASI DASHBOARD
// --------------------------------------------------------------------
function initDashboard() {
  dashboardInitialized = true;

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('appLayout').style.display     = 'flex';

  document.getElementById('sidebarUserName').textContent = currentUserData.nama || currentUserData.email;
  document.getElementById('sidebarRole').textContent     = currentUserData.role === 'admin' ? 'Admin' : 'Kasir';

  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  if (currentUserData.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.removeProperty('display'));
    document.querySelectorAll('.kasir-only').forEach(el => el.style.display = 'none');
    switchView('laporan');
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.kasir-only').forEach(el => el.style.removeProperty('display'));
    switchView('kasir');
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
  
  // Barcode quick scan Enter key listener
  document.getElementById('searchProduk')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const keyword = (e.target.value || '').trim();
      if (!keyword) return;
      const matched = allProduk.find(p => p.barcode && p.barcode.toLowerCase() === keyword.toLowerCase());
      if (matched) {
        addToCart(matched.id);
        e.target.value = '';
        renderProdukGrid();
        e.preventDefault();
      }
    }
  });

  document.getElementById('btnBayar')?.addEventListener('click', openPembayaranModal);

  if (window.lucide) lucide.createIcons();
}

// --------------------------------------------------------------------
// 3. NAVIGASI & SWITCH VIEW
// --------------------------------------------------------------------
function switchView(viewName) {
  const navLinks = document.querySelectorAll('.nav-link');
  const titles   = {
    kasir: 'Transaksi Kasir',
    riwayat: 'Riwayat Transaksi',
    produk: 'Kelola Produk',
    kategori: 'Kategori Produk',
    kupon: 'Kelola Kupon',
    laporan: 'Laporan Penjualan',
    kasirManage: 'Kelola Akun'
  };

  navLinks.forEach(link => {
    if (link.dataset.view === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  document.querySelectorAll('.view').forEach(v => {
    if (v.id === 'view-' + viewName) {
      v.classList.add('active');
    } else {
      v.classList.remove('active');
    }
  });

  document.getElementById('pageTitle').textContent = titles[viewName] || 'Dashboard';

  if (viewName === 'laporan') {
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const tStart = document.getElementById('laporanTanggalMulai');
    const tEnd = document.getElementById('laporanTanggalAkhir');
    if (tStart && !tStart.value) tStart.value = start;
    if (tEnd && !tEnd.value) tEnd.value = today;
    generateLaporan();
  } else if (viewName === 'kupon') {
    loadKupon();
  }

  if (window.lucide) lucide.createIcons();
}

function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const viewName = link.dataset.view;
      if (link.classList.contains('admin-only') && currentUserData.role !== 'admin') return;
      if (link.classList.contains('kasir-only') && currentUserData.role === 'admin') return;

      switchView(viewName);
      
      // Auto-close sidebar on mobile
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && sidebar.classList.contains('show')) {
        toggleSidebar();
      }
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

function getLocalDateRangeIso(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
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
  
  allKategori = data || [];
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
    selEl.innerHTML = '<option value="">Tanpa Kategori</option>' +
      allKategori.map(k => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join('');
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

async function quickAddCategory() {
  const nama = prompt('Masukkan nama kategori baru:');
  if (!nama) return;
  const trimmed = nama.trim();
  if (!trimmed) return;
  
  try {
    const existing = allKategori.find(k => k.nama.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      alert('Kategori tersebut sudah ada.');
      document.getElementById('produkKategori').value = existing.id;
      return;
    }
    
    const { data, error } = await supabase
      .from('categories')
      .insert([{ nama: trimmed }])
      .select()
      .single();
      
    if (error) throw error;
    
    alert('Kategori "' + trimmed + '" berhasil ditambahkan.');
    
    const dropdown = document.getElementById('produkKategori');
    if (dropdown && data) {
      const opt = document.createElement('option');
      opt.value = data.id;
      opt.textContent = data.nama;
      dropdown.appendChild(opt);
      dropdown.value = data.id;
    }
  } catch (err) {
    alert('Gagal menambahkan kategori: ' + err.message);
  }
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

  allProduk = data || [];
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
  const backgroundColors = sorted.map(p => p.stok <= 5 ? 'rgba(244, 63, 94, 0.75)' : 'rgba(99, 102, 241, 0.75)');
  const borderColors = sorted.map(p => p.stok <= 5 ? 'rgb(244, 63, 94)' : 'rgb(99, 102, 241)');

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
          grid: { color: '#f1f5f9' },
          ticks: { stepSize: 5, color: '#475569' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#475569' }
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
    (p.nama.toLowerCase().includes(keyword) || (p.barcode && p.barcode.toLowerCase().includes(keyword))) && 
    (kat ? p.category_id === kat : true)
  );

  if (!list.length) { grid.innerHTML = '<div class="empty-state">Tidak ada produk ditemukan</div>'; return; }

  grid.innerHTML = list.map(p => `
    <div class="product-item ${p.stok <= 0 ? 'out-of-stock' : ''}" onclick="addToCart('${p.id}')">
      <span class="cat-badge">${escapeHtml(getKategoriNama(p.category_id))}</span>
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
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada produk</td></tr>';
    return;
  }
  tbody.innerHTML = allProduk.map(p => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: monospace; font-size: 13px;">${escapeHtml(p.barcode || '-')}</span>
          ${p.barcode ? `
            <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; min-width: auto; height: auto;" onclick="showBarcodeModal('${escapeHtml(p.barcode)}', '${escapeHtml(p.nama)}')">
              <i data-lucide="qr-code" style="width: 12px; height: 12px; vertical-align: middle;"></i>
            </button>
          ` : ''}
        </div>
      </td>
            <td><strong>${escapeHtml(p.nama)}</strong></td>
            <td>${escapeHtml(getKategoriNama(p.category_id))}</td>
            <td>${formatRupiah(p.harga_beli || 0)}</td>
            <td>${formatRupiah(p.harga)}</td>
            <td><span class="stock-badge ${p.stok <= 5 ? 'low' : ''}">${p.stok}</span></td>
            <td>
        ${
          currentUserData.role === 'admin'
            ? `
              <button class="btn btn-secondary btn-sm" onclick="editProduk('${p.id}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProduk('${p.id}')">Hapus</button>
            `
            : `
              <span style="color:var(--text-muted);font-size:12px;">
                Read Only
              </span>
            `
        }
      </td>
    </tr>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

function showBarcodeModal(barcode, nama) {
  if (!barcode) {
    alert('Produk ini tidak memiliki barcode/kode.');
    return;
  }
  const url = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(barcode)}&scale=3&rotate=N&includetext`;
  
  document.getElementById('detailTransaksiContent').innerHTML = `
    <div style="text-align: center; padding: 16px;">
      <div style="font-size: 16px; font-weight: 700; color: var(--primary); margin-bottom: 8px;">${escapeHtml(nama)}</div>
      <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 20px;">Code: ${escapeHtml(barcode)}</div>
      <div style="background: white; padding: 16px; border-radius: 8px; display: inline-block;">
        <img src="${url}" alt="Barcode ${escapeHtml(barcode)}" style="max-width: 100%; display: block; margin: 0 auto;">
      </div>
      <div style="margin-top: 20px;">
        <button class="btn btn-primary btn-sm" onclick="window.print()" style="width: auto;">Cetak Barcode</button>
      </div>
    </div>
  `;
  document.querySelector('#modalDetailTransaksi .modal-header').textContent = 'Barcode Produk';
  openModal('modalDetailTransaksi');
}

function generateRandomBarcode() {
  const code = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  document.getElementById('produkBarcode').value = code;
}

function openProdukModal() {
  document.getElementById('produkModalTitle').textContent = 'Tambah Produk';
  document.getElementById('produkId').value               = '';
  document.getElementById('produkNama').value             = '';
  document.getElementById('produkBarcode').value          = '';
  document.getElementById('produkHargaBeli').value        = '';
  document.getElementById('produkHarga').value            = '';
  document.getElementById('produkStok').value             = '';
  renderKategoriDropdowns();
  document.getElementById('produkNama').disabled = false;
document.getElementById('produkBarcode').disabled = false;
document.getElementById('produkKategori').disabled = false;

  openModal('modalProduk');
}

function editProduk(id) {
  const p = allProduk.find(x => x.id === id);
  if (!p) return;
  document.getElementById('produkModalTitle').textContent = 'Edit Produk';
  document.getElementById('produkId').value               = p.id;
  document.getElementById('produkNama').value             = p.nama;
  document.getElementById('produkBarcode').value          = p.barcode || '';
  document.getElementById('produkHargaBeli').value        = p.harga_beli || 0;
  document.getElementById('produkHarga').value            = p.harga;
  document.getElementById('produkStok').value             = p.stok;
  renderKategoriDropdowns();
  document.getElementById('produkKategori').value = p.category_id || '';
  document.getElementById('produkNama').disabled = true;
  document.getElementById('produkBarcode').disabled = true;
  document.getElementById('produkKategori').disabled = true;
  console.log('MODE EDIT AKTIF');  
  openModal('modalProduk');
}

async function saveProduk() {
  const id          = document.getElementById('produkId').value;
  const nama        = document.getElementById('produkNama').value.trim();
  const category_id = document.getElementById('produkKategori').value;
  const barcode     = document.getElementById('produkBarcode').value.trim() || null;
  const harga_beli  = Number(document.getElementById('produkHargaBeli').value) || 0;
  const harga       = Number(document.getElementById('produkHarga').value);
  const stok        = Number(document.getElementById('produkStok').value);

  // Cek nama produk duplikat
const existingProduct = allProduk.find(
  p =>
    p.nama.toLowerCase() === nama.toLowerCase() &&
    p.id !== id
);

if (existingProduct) {
  alert('Produk dengan nama tersebut sudah tersedia.');
  return;
}

// Cek barcode duplikat
if (barcode) {
  const existingBarcode = allProduk.find(
    p =>
      p.barcode === barcode &&
      p.id !== id
  );

  if (existingBarcode) {
    alert('Barcode sudah digunakan produk lain.');
    return;
  }
}

  if (!nama || harga <= 0) {
    alert('Nama dan harga produk wajib diisi.');
    return;
  }

  const data = {
    nama,
    category_id: category_id || null,
    barcode,
    harga_beli,
    harga,
    stok: stok || 0
  };

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

    // refresh langsung
    await fetchProduk();

    closeModal('modalProduk');

  } catch (err) {
    alert('Gagal menyimpan produk: ' + err.message);
  }
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
    if (btnBayar) btnBayar.disabled = true;
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
  const diskon = subtotal > 100000 ? 10000 : 0;
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
  if (btnBayar) btnBayar.disabled = isProcessingPayment;
}

let currentCouponApplied = null;

function openPembayaranModal() {
  if (!cart.length || isProcessingPayment) return;
  
  currentCouponApplied = null;
  document.getElementById('pembayaranKuponKode').value = '';
  document.getElementById('kuponFeedback').innerHTML = '';
  document.getElementById('pembayaranUangBayar').value = '';
  document.getElementById('pembayaranMetode').value = 'Tunai';
  
  updatePembayaranSummary();
  changePaymentMethod();
  openModal('modalPembayaran');
}

function updatePembayaranSummary() {
  const subtotal = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const autoDiskon = subtotal > 100000 ? 10000 : 0;
  
  let couponDiskon = 0;
  if (currentCouponApplied) {
    if (subtotal >= currentCouponApplied.min_transaksi) {
      couponDiskon = currentCouponApplied.potongan;
    } else {
      currentCouponApplied = null;
      document.getElementById('pembayaranKuponKode').value = '';
      document.getElementById('kuponFeedback').innerHTML = '<span style="color:var(--danger);">Kupon dibatalkan karena total belanja tidak memenuhi syarat.</span>';
    }
  }
  
  const totalDiskon = Math.min(subtotal, autoDiskon + couponDiskon);
  const setelahDiskon = subtotal - totalDiskon;
  const ppn = Math.round(setelahDiskon * 0.11);
  const totalTagihan = setelahDiskon + ppn;
  
  document.getElementById('pembayaranTotalTagihan').textContent = formatRupiah(totalTagihan);
  document.getElementById('pembayaranRincianAuto').innerHTML = `
    Subtotal: <strong>${formatRupiah(subtotal)}</strong> | 
    Auto Diskon: <strong>-${formatRupiah(autoDiskon)}</strong>` + 
    (couponDiskon > 0 ? ` | Kupon: <strong>-${formatRupiah(couponDiskon)}</strong>` : '');
    
  calculateChange();
  setupQuickCash(totalTagihan);
}

async function checkAndApplyCoupon() {
  const code = document.getElementById('pembayaranKuponKode').value.trim();
  const feedback = document.getElementById('kuponFeedback');
  
  if (!code) {
    currentCouponApplied = null;
    feedback.innerHTML = '';
    updatePembayaranSummary();
    return;
  }
  
  feedback.innerHTML = '<span style="color:var(--text-secondary);">Memeriksa kupon...</span>';
  
  try {
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('kode', code.toUpperCase())
      .single();
      
    if (error || !coupon) {
      feedback.innerHTML = '<span style="color:var(--danger);">Kupon tidak ditemukan atau tidak valid.</span>';
      currentCouponApplied = null;
      updatePembayaranSummary();
      return;
    }
    
    if (!coupon.is_aktif) {
      feedback.innerHTML = '<span style="color:var(--danger);">Kupon sudah tidak aktif.</span>';
      currentCouponApplied = null;
      updatePembayaranSummary();
      return;
    }
    
    if (coupon.terpakai >= coupon.kuota) {
      feedback.innerHTML = '<span style="color:var(--danger);">Kuota penggunaan kupon sudah habis.</span>';
      currentCouponApplied = null;
      updatePembayaranSummary();
      return;
    }
    
    const subtotal = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
    if (subtotal < coupon.min_transaksi) {
      feedback.innerHTML = `<span style="color:var(--danger);">Minimal belanja untuk kupon ini adalah ${formatRupiah(coupon.min_transaksi)}.</span>`;
      currentCouponApplied = null;
      updatePembayaranSummary();
      return;
    }
    
    feedback.innerHTML = `<span style="color:var(--success);">Kupon berhasil diterapkan! Potongan: ${formatRupiah(coupon.potongan)}</span>`;
    currentCouponApplied = coupon;
    updatePembayaranSummary();
    
  } catch (err) {
    feedback.innerHTML = `<span style="color:var(--danger);">Gagal memeriksa kupon: ${err.message}</span>`;
    currentCouponApplied = null;
    updatePembayaranSummary();
  }
}

function changePaymentMethod() {
  const metode = document.getElementById('pembayaranMetode').value;
  const tunaiGroup = document.getElementById('paymentTunaiGroup');
  const nonTunaiGroup = document.getElementById('paymentNonTunaiGroup');
  const title = document.getElementById('paymentMethodTitle');
  const container = document.getElementById('nonTunaiContainer');
  
  const subtotal = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const autoDiskon = subtotal > 100000 ? 10000 : 0;
  const couponDiskon = currentCouponApplied ? currentCouponApplied.potongan : 0;
  const totalDiskon = Math.min(subtotal, autoDiskon + couponDiskon);
  const setelahDiskon = subtotal - totalDiskon;
  const ppn = Math.round(setelahDiskon * 0.11);
  const totalTagihan = setelahDiskon + ppn;

  if (metode === 'Tunai') {
    tunaiGroup.style.display = 'block';
    nonTunaiGroup.style.display = 'none';
  } else {
    tunaiGroup.style.display = 'none';
    nonTunaiGroup.style.display = 'block';
    title.textContent = `Instruksi Pembayaran ${metode}`;
    
    if (metode === 'QRIS') {
      container.innerHTML = `
        <div style="background: white; padding: 12px; border-radius: 8px; margin: 10px 0;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('KASIR-APP-TRX-' + totalTagihan)}" alt="QRIS QR Code" style="width:150px; height:150px; display:block;">
        </div>
        <div style="font-size: 13px; color: var(--text-secondary);">Pindai kode QR di atas dengan aplikasi e-wallet (GoPay, OVO, Dana, LinkAja, BCA, dll).</div>
      `;
    } else {
      const norek = {
        'Transfer BCA': '829 3910 392',
        'Transfer Mandiri': '137 0023 9210',
        'Transfer BNI': '093 1182 3902'
      };
      container.innerHTML = `
        <div style="font-size: 20px; font-weight: 700; color: #fff; margin: 15px 0;">No. Rekening: ${norek[metode]}</div>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
          Atas Nama: <strong>CV KASIR SEJAHTERA</strong><br>
          Silakan transfer sebesar <strong>${formatRupiah(totalTagihan)}</strong> ke rekening di atas.<br>
          Transaksi akan diverifikasi otomatis setelah dana diterima.
        </div>
      `;
    }
  }
}

function calculateChange() {
  const subtotal = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const autoDiskon = subtotal > 100000 ? 10000 : 0;
  const couponDiskon = currentCouponApplied ? currentCouponApplied.potongan : 0;
  const totalDiskon = Math.min(subtotal, autoDiskon + couponDiskon);
  const setelahDiskon = subtotal - totalDiskon;
  const ppn = Math.round(setelahDiskon * 0.11);
  const totalTagihan = setelahDiskon + ppn;

  const uangBayar = Number(document.getElementById('pembayaranUangBayar').value) || 0;
  const kembalian = uangBayar - totalTagihan;
  
  const labelKembalian = document.getElementById('pembayaranKembalian');
  if (uangBayar <= 0) {
    labelKembalian.value = 'Rp 0';
    labelKembalian.style.color = 'var(--text-secondary)';
  } else if (kembalian < 0) {
    labelKembalian.value = 'Kurang ' + formatRupiah(Math.abs(kembalian));
    labelKembalian.style.color = 'var(--danger)';
  } else {
    labelKembalian.value = formatRupiah(kembalian);
    labelKembalian.style.color = 'var(--success)';
  }
}

function setupQuickCash(totalTagihan) {
  const container = document.getElementById('quickCashButtons');
  if (!container) return;
  
  const options = new Set();
  options.add(totalTagihan);
  
  const nominals = [10000, 20000, 50000, 100000, 200000];
  nominals.forEach(n => {
    if (n > totalTagihan) {
      options.add(n);
    }
  });
  
  const sorted = Array.from(options).sort((a, b) => a - b).slice(0, 5);
  
  container.innerHTML = sorted.map(val => {
    const isPas = val === totalTagihan;
    const label = isPas ? 'Uang Pas' : formatRupiah(val);
    return `<button type="button" class="btn btn-secondary btn-sm" onclick="setQuickCashValue(${val})" style="padding: 4px 8px; font-size:12px; width:auto;">${label}</button>`;
  }).join('');
}

function setQuickCashValue(val) {
  document.getElementById('pembayaranUangBayar').value = val;
  calculateChange();
}

async function submitPembayaran() {
  if (!cart.length || isProcessingPayment) return;

  const metode = document.getElementById('pembayaranMetode').value;
  const uangBayar = Number(document.getElementById('pembayaranUangBayar').value) || 0;
  
  const subtotal = cart.reduce((sum, i) => sum + i.harga * i.qty, 0);
  const autoDiskon = subtotal > 100000 ? 10000 : 0;
  const couponDiskon = currentCouponApplied ? currentCouponApplied.potongan : 0;
  const totalDiskon = Math.min(subtotal, autoDiskon + couponDiskon);
  const setelahDiskon = subtotal - totalDiskon;
  const ppn = Math.round(setelahDiskon * 0.11);
  const totalTagihan = setelahDiskon + ppn;

  if (metode === 'Tunai' && uangBayar < totalTagihan) {
    alert('Uang pembayaran kurang.');
    return;
  }

  const btnConfirm = document.getElementById('btnKonfirmasiBayar');
  const origText = btnConfirm.textContent;
  isProcessingPayment = true;
  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Memproses Transaksi...';

  try {
    const rpcItems = cart.map(item => ({
      product_id: item.produkId,
      qty: item.qty
    }));

    const kembalian = metode === 'Tunai' ? (uangBayar - totalTagihan) : 0;
    const couponCode = currentCouponApplied ? currentCouponApplied.kode : null;

    const { data: trxArr, error } = await supabase
      .rpc('process_transaction', {
        p_items: rpcItems,
        p_no_transaksi: null,
        p_metode_pembayaran: metode,
        p_nominal_bayar: metode === 'Tunai' ? uangBayar : totalTagihan,
        p_kembalian: kembalian,
        p_coupon_code: couponCode
      });

    if (error) throw error;
    
    const trx = (Array.isArray(trxArr) ? trxArr[0] : trxArr) || trxArr;
    if (!trx) throw new Error('Transaksi tidak mengembalikan data.');

    closeModal('modalPembayaran');
    
    const trxItems = normalizeJsonArray(trx.items);
    tampilkanStruk({ ...trx, items: trxItems });
    
    cart = [];
    currentCouponApplied = null;
    renderCart();
    fetchProduk();
    fetchRiwayat();
  } catch (err) {
    alert('Gagal memproses pembayaran: ' + err.message);
  } finally {
    isProcessingPayment = false;
    btnConfirm.disabled = false;
    btnConfirm.textContent = origText;
  }
}

function tampilkanStruk(transaksi) {
  const tanggal  = new Date().toLocaleString('id-ID');
  const itemsHtml = transaksi.items.map(item =>
    `<div class="row"><span>${escapeHtml(item.nama)} ×${item.qty}</span><span>${formatRupiah(item.subtotal)}</span></div>`
  ).join('');

  let diskonHtml = '';
  if (transaksi.diskon > 0) {
    diskonHtml = `<div class="row"><span>Diskon Promo</span><span>-${formatRupiah(transaksi.diskon)}</span></div>`;
  }

  // Generate QR Code URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(transaksi.no_transaksi)}`;

  document.getElementById('strukContent').innerHTML = `
    <div class="center"><strong>POINT KASIR</strong><br>${tanggal}<br>No: ${transaksi.no_transaksi}<br>Kasir: ${escapeHtml(transaksi.kasir_nama)}</div>
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

  allTransaksi = data || [];
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
    diskonRow = `<p style="text-align:right;font-size:13px;color:var(--success);margin-top:4px;">Diskon Promo: -${formatRupiah(t.diskon)}</p>`;
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
    <p style="text-align:right;font-size:13px;color:var(--text-muted);margin-top:4px;">Metode: <strong>${escapeHtml(t.metode_pembayaran || 'Tunai')}</strong></p>
    ${(t.metode_pembayaran || 'Tunai') === 'Tunai' ? `
      <p style="text-align:right;font-size:13px;color:var(--text-muted);margin-top:4px;">Bayar: ${formatRupiah(t.nominal_bayar)}</p>
      <p style="text-align:right;font-size:13px;color:var(--success);margin-top:4px;">Kembali: ${formatRupiah(t.kembalian)}</p>
    ` : ''}
  `;
  openModal('modalDetailTransaksi');
}

// --------------------------------------------------------------------
// 9. LAPORAN PENJUALAN (ADMIN)
// --------------------------------------------------------------------
let chartRevenueInstance = null;
let chartCategoryInstance = null;

function renderLaporanCharts(dailyRevenueData, categoryData) {
  const ctxRev = document.getElementById('chartLaporanRevenue')?.getContext('2d');
  if (ctxRev) {
    if (chartRevenueInstance) chartRevenueInstance.destroy();
    
    const sortedDays = Object.entries(dailyRevenueData).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sortedDays.map(d => {
      const parts = d[0].split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d[0];
    });
    const revenues = sortedDays.map(d => d[1]);
    
    chartRevenueInstance = new Chart(ctxRev, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Pendapatan (Rp)',
          data: revenues,
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderColor: 'rgb(99, 102, 241)',
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
            grid: { color: '#f1f5f9' },
            ticks: { color: '#475569' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#475569' }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
  
  const ctxCat = document.getElementById('chartLaporanCategory')?.getContext('2d');
  if (ctxCat) {
    if (chartCategoryInstance) chartCategoryInstance.destroy();
    
    const labels = Object.keys(categoryData);
    const qtys = Object.values(categoryData);
    
    const colors = [
      'rgba(99, 102, 241, 0.75)',
      'rgba(244, 63, 94, 0.75)',
      'rgba(16, 185, 129, 0.75)',
      'rgba(245, 158, 11, 0.75)',
      'rgba(139, 92, 246, 0.75)',
      'rgba(6, 182, 212, 0.75)'
    ];
    const borderColors = [
      'rgb(99, 102, 241)',
      'rgb(244, 63, 94)',
      'rgb(16, 185, 129)',
      'rgb(245, 158, 11)',
      'rgb(139, 92, 246)',
      'rgb(6, 182, 212)'
    ];
    
    chartCategoryInstance = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: qtys,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: borderColors.slice(0, labels.length),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#e5e7eb', boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }
}

async function generateLaporan() {
  const tglMulai = document.getElementById('laporanTanggalMulai').value;
  const tglAkhir = document.getElementById('laporanTanggalAkhir').value;
  if (!tglMulai || !tglAkhir) { alert('Pilih rentang tanggal terlebih dahulu.'); return; }

  const startDate = getLocalDateRangeIso(tglMulai).start;
  const endDate   = getLocalDateRangeIso(tglAkhir).end;

  try {
    const { data: transaksis, error } = await supabase
      .from('transactions')
      .select('*, transaction_items(*)')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) throw error;

    let totalPendapatan = 0, totalKeuntungan = 0, jumlahTransaksi = 0;
    const produkMap = {};
    const dailyRevenueMap = {};
    const categoryQtyMap = {};

    (transaksis || []).forEach(t => {
      totalPendapatan  += Number(t.total);
      totalKeuntungan  += Number(t.keuntungan || 0);
      jumlahTransaksi  += 1;
      
      const dateStr = new Date(t.created_at).toISOString().split('T')[0];
      dailyRevenueMap[dateStr] = (dailyRevenueMap[dateStr] || 0) + Number(t.total);

      (t.transaction_items || []).forEach(item => {
        if (!produkMap[item.nama]) produkMap[item.nama] = { qty: 0, total: 0 };
        produkMap[item.nama].qty   += item.qty;
        produkMap[item.nama].total += Number(item.subtotal);
        
        const prod = allProduk.find(p => p.id === item.product_id);
        const catName = prod ? getKategoriNama(prod.category_id) : 'Lain-lain';
        categoryQtyMap[catName] = (categoryQtyMap[catName] || 0) + item.qty;
      });
    });

    const totalProduk = Object.values(produkMap).reduce((s, p) => s + p.qty, 0);
    document.getElementById('laporanTotalPendapatan').textContent  = formatRupiah(totalPendapatan);
    document.getElementById('laporanTotalKeuntungan').textContent  = formatRupiah(totalKeuntungan);
    document.getElementById('laporanJumlahTransaksi').textContent  = jumlahTransaksi;
    document.getElementById('laporanProdukTerjual').textContent    = totalProduk;

    renderLaporanCharts(dailyRevenueMap, categoryQtyMap);

    const sorted = Object.entries(produkMap).sort((a, b) => b[1].qty - a[1].qty);
    const tbody  = document.getElementById('laporanProdukTableBody');
    tbody.innerHTML = sorted.length
      ? sorted.map(([nama, d]) => `<tr><td>${escapeHtml(nama)}</td><td>${d.qty}</td><td>${formatRupiah(d.total)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty-state">Tidak ada transaksi pada rentang tanggal ini</td></tr>';

  } catch (err) { alert('Gagal memuat laporan: ' + err.message); }
}

// --------------------------------------------------------------------
// 9b. KELOLA KUPON DISKON (HANYA ADMIN)
// --------------------------------------------------------------------
let allKupon = [];

function loadKupon() {
  fetchKupon();

  supabase
    .channel('realtime-coupons')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coupons' }, () => {
      fetchKupon();
    })
    .subscribe();
}

async function fetchKupon() {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Gagal memuat kupon:', error);
    return;
  }

  allKupon = data || [];
  renderKuponTable();
}

function renderKuponTable() {
  const tbody = document.getElementById('kuponTableBody');
  if (!tbody) return;
  if (!allKupon.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada kupon diskon</td></tr>';
    return;
  }
  tbody.innerHTML = allKupon.map(k => `
    <tr>
      <td><strong style="color:var(--primary); font-family: monospace; font-size: 14px;">${escapeHtml(k.kode)}</strong></td>
      <td>${formatRupiah(k.potongan)}</td>
      <td>${formatRupiah(k.min_transaksi)}</td>
      <td>${k.kuota}</td>
      <td>${k.terpakai}</td>
      <td>
        <span class="status-dot ${k.is_aktif ? 'aktif' : 'nonaktif'}"></span>
        ${k.is_aktif ? 'Aktif' : 'Nonaktif'}
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="editKupon('${k.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteKupon('${k.id}')">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function openKuponModal() {
  document.getElementById('kuponKode').value = '';
  document.getElementById('kuponPotongan').value = '';
  document.getElementById('kuponMinTransaksi').value = '0';
  document.getElementById('kuponKuota').value = '10';
  document.getElementById('kuponIsAktif').value = 'true';
  window.currentEditingKuponId = null;
  openModal('modalKupon');
}

function editKupon(id) {
  const k = allKupon.find(x => x.id === id);
  if (!k) return;
  
  document.getElementById('kuponKode').value = k.kode;
  document.getElementById('kuponPotongan').value = k.potongan;
  document.getElementById('kuponMinTransaksi').value = k.min_transaksi;
  document.getElementById('kuponKuota').value = k.kuota;
  document.getElementById('kuponIsAktif').value = k.is_aktif ? 'true' : 'false';
  
  window.currentEditingKuponId = k.id;
  openModal('modalKupon');
}

async function saveKupon() {
  const code = document.getElementById('kuponKode').value.trim().toUpperCase();
  const potongan = Number(document.getElementById('kuponPotongan').value) || 0;
  const minTrx = Number(document.getElementById('kuponMinTransaksi').value) || 0;
  const kuota = Number(document.getElementById('kuponKuota').value) || 0;
  const isAktif = document.getElementById('kuponIsAktif').value === 'true';

  if (!code || potongan <= 0 || kuota <= 0) {
    alert('Kode, potongan diskon, dan kuota wajib diisi dengan benar.');
    return;
  }

  const data = {
    kode: code,
    potongan: potongan,
    min_transaksi: minTrx,
    kuota: kuota,
    is_aktif: isAktif
  };

  try {
    if (window.currentEditingKuponId) {
      const { error } = await supabase
        .from('coupons')
        .update(data)
        .eq('id', window.currentEditingKuponId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('coupons')
        .insert([data]);
      if (error) throw error;
    }
    closeModal('modalKupon');
  } catch (err) {
    alert('Gagal menyimpan kupon: ' + err.message);
  }
}

async function deleteKupon(id) {
  if (!confirm('Hapus kupon ini?')) return;
  try {
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (err) {
    alert('Gagal menghapus kupon: ' + err.message);
  }
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

  allKasirAccounts = data || [];
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
      ? `
        <button class="btn btn-secondary btn-sm" onclick="toggleStatusAkun('${u.id}', '${u.status || 'aktif'}')">
          ${u.status === 'nonaktif' ? 'Aktifkan' : 'Nonaktifkan'}
        </button>

        <button class="btn btn-danger btn-sm"
          onclick="deleteKasirAccount('${u.id}','${escapeHtml(u.nama)}')">
          Hapus
        </button>
      `
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
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('Email ini sudah terdaftar.');
    }
    if (!data.user?.id) {
      throw new Error('Akun berhasil dibuat, tetapi ID user tidak diterima.');
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        email,
        nama,
        role,
        status: 'aktif'
      }, { onConflict: 'id' });

    if (profileError) throw profileError;
    
    closeModal('modalKasir');
    fetchKasirAccounts();

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
