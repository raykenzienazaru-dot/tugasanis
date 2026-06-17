// ====================================================================
// AUTH.JS — Logika login, register, logout (Supabase)
// ====================================================================

// ─── Halaman Login ───────────────────────────────────────────────
const loginForm = document.getElementById('loginForm');
const alertBox  = document.getElementById('alertBox');
const loginBtn  = document.getElementById('loginBtn');

function showAlert(message, type = 'error') {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className   = `alert alert-${type} show`;
}

function hideAlert() {
  if (!alertBox) return;
  alertBox.classList.remove('show');
}

// Cek sesi aktif hanya di halaman login/index -> langsung redirect dashboard.
// Dashboard punya guard sendiri, jadi auth.js tidak ikut campur di sana.
const currentPath = window.location.pathname;
const isEntryPage = currentPath.includes('login.html') || currentPath.endsWith('/') || currentPath.includes('index.html');

if (isEntryPage && !currentPath.includes('reset-password.html')) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single();

      if (profile && profile.status === 'aktif') {
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      console.error('[AUTH] Error cek sesi:', err);
    }
  });
}

// ─── Form Login ──────────────────────────────────────────────────
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showAlert('Email dan password wajib diisi.');
      return;
    }

    loginBtn.disabled    = true;
    loginBtn.textContent = 'Memproses...';

    try {
      // 1. Login via Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message === 'Invalid login credentials') {
          throw new Error('Email atau password salah. Pastikan email sudah diverifikasi.');
        }
        if (error.message.includes('Email not confirmed')) {
          throw new Error('Email belum diverifikasi. Cek inbox/spam email Anda.');
        }
        throw error;
      }

      const user = data.user;

      // 2. Ambil data profile
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        // Profile belum ada -> buat fallback aman sebagai kasir aktif.
        const fallbackProfile = {
          id:     user.id,
          email:  user.email,
          nama:   user.user_metadata?.nama || user.email.split('@')[0],
          role:   'kasir',
          status: 'aktif'
        };

        const { error: insertErr } = await supabase.from('profiles').insert({
          id:     fallbackProfile.id,
          email:  fallbackProfile.email,
          nama:   fallbackProfile.nama,
          role:   fallbackProfile.role,
          status: fallbackProfile.status
        });
        if (insertErr) {
          await supabase.auth.signOut();
          throw new Error('Gagal membuat profil akun. Hubungi administrator.');
        }
        profile = fallbackProfile;
      }

      if (profile.status === 'nonaktif') {
        await supabase.auth.signOut();
        throw new Error('Akun Anda telah dinonaktifkan. Hubungi administrator.');
      }

      // 3. Validasi tab role
      const activeTab = document.querySelector('.role-tab.active');
      const selectedRole = activeTab
        ? (activeTab.id === 'tabAdmin' ? 'admin' : 'kasir')
        : 'admin';

      if (profile.role !== selectedRole) {
        console.info(
          `[AUTH] Tab login "${selectedRole}" tidak sama dengan role akun "${profile.role}". ` +
          'Login tetap dilanjutkan sesuai role dari database.'
        );
      }

      // 4. Simpan ke localStorage & redirect
      localStorage.setItem('userRole', profile.role);
      localStorage.setItem('userName', profile.nama || profile.email);
      window.location.href = 'dashboard.html';

    } catch (err) {
      showAlert(err.message || 'Terjadi kesalahan. Coba lagi.');
    } finally {
      if (loginBtn) {
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Masuk';
      }
    }
  });
}

// ─── Fungsi Logout ───────────────────────────────────────────────
async function logoutUser() {
  await supabase.auth.signOut();
  localStorage.removeItem('userRole');
  localStorage.removeItem('userName');
  window.location.href = 'login.html';
}

// ─── Fungsi Switch Tab ──────────────────────────────────────────
function switchTab(role) {
  const tabAdmin = document.getElementById('tabAdmin');
  const tabKasir = document.getElementById('tabKasir');
  if (tabAdmin) tabAdmin.classList.toggle('active', role === 'admin');
  if (tabKasir) tabKasir.classList.toggle('active', role === 'kasir');
}
