// ====================================================================
// SUPABASE-CONFIG.JS — Inisialisasi Supabase Client
// ====================================================================

const supabaseUrl = "https://zeuxdjuaajzqcrdoaqhg.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpldXhkanVhYWp6cWNyZG9hcWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Nzc5MjcsImV4cCI6MjA5NzI1MzkyN30.YxKcQjLHpCU7SEzGw6HggsysdmL6mFO5DkcL3BXnAE8";

// Inisialisasi Client Utama
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Inisialisasi Client Sekunder (untuk registrasi tanpa logout admin)
const secondarySupabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
