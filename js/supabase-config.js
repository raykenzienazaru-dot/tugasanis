// ====================================================================
// SUPABASE-CONFIG.JS — Inisialisasi Supabase Client
// ====================================================================

const supabaseUrl = "https://szfbtyvwerhdzzhkrcep.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6ZmJ0eXZ3ZXJoZHp6aGtyY2VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzQ4MzYsImV4cCI6MjA5NzI1MDgzNn0.kjYauSHSnGOoYONKvGlPjhDD3DkENZneOOPdRqkRGKM";

// Inisialisasi Client Utama
const client = window.supabase.createClient(supabaseUrl, supabaseKey);

// Inisialisasi Client Sekunder (untuk registrasi tanpa logout admin)
const secondaryClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Overwrite global window variables agar skrip lain bisa langsung menggunakan 'supabase'
window.supabase = client;
window.secondarySupabase = secondaryClient;
