// ====================================================================
// AUTH.JS — Logika login & pengecekan sesi (Supabase)
// ====================================================================

const loginForm = document.getElementById('loginForm');
const alertBox  = document.getElementById('alertBox');
const loginBtn  = document.getElementById('loginBtn');

function showAlert(message, type = 'error') {
  alertBox.textContent = message;
  alertBox.className   = `alert alert-${type} show`;
}

function hideAlert() {
  alertBox.classList.remove('show');
}

// Cek status sesi saat ini
supabase.auth.onAuthStateChange(async (event, session) => {
  const user = session?.user;
  if (user && window.location.pathname.includes('login.html')) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile && profile.status !== 'nonaktif') {
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      console.error(err);
    }
  }
});

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    loginBtn.disabled    = true;
    loginBtn.textContent = 'Memproses...';

    try {
      // 1. Sign in menggunakan Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      const user = data.user;

      // 2. Dapatkan data profile user dari public.profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        showAlert('Akun ini belum memiliki profile terdaftar. Hubungi administrator.');
        await supabase.auth.signOut();
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Masuk';
        return;
      }

      if (profile.status === 'nonaktif') {
        showAlert('Akun Anda telah dinonaktifkan. Hubungi administrator.');
        await supabase.auth.signOut();
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Masuk';
        return;
      }

      // Validasi kecocokan role dengan tab login yang aktif
      const activeTab = document.querySelector('.role-tab.active');
      const selectedRole = activeTab ? (activeTab.id === 'tabAdmin' ? 'admin' : 'kasir') : 'admin';

      if (profile.role !== selectedRole) {
        showAlert(`Akun ini tidak terdaftar sebagai ${selectedRole === 'admin' ? 'Admin' : 'Kasir'}.`);
        await supabase.auth.signOut();
        loginBtn.disabled    = false;
        loginBtn.textContent = 'Masuk';
        return;
      }

      // 3. Simpan info ke localStorage untuk keperluan antarmuka (UI)
      localStorage.setItem('userRole', profile.role);
      localStorage.setItem('userName', profile.nama || profile.email);

      // 4. Pengalihan halaman ke dashboard
      window.location.href = 'dashboard.html';

    } catch (error) {
      loginBtn.disabled    = false;
      loginBtn.textContent = 'Masuk';
      
      let msg = error.message;
      if (msg === 'Invalid login credentials') {
        msg = 'Email atau password salah.';
      }
      showAlert('Gagal login: ' + msg);
    }
  });
}

// Fungsi logout
async function logoutUser() {
  await supabase.auth.signOut();
  localStorage.removeItem('userRole');
  localStorage.removeItem('userName');
  window.location.href = 'login.html';
}
