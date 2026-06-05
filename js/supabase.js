/* ─── Supabase client ─── */
const SUPA_URL = 'https://ijwcigmxcevgrhauvnyk.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqd2NpZ214Y2V2Z3JoYXV2bnlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NzAyNzIsImV4cCI6MjA5NTE0NjI3Mn0.HNtY-_MYcB8zNWIOz1DIDaKbCAJwCuxgLc-Bn-EiQOM';

// supabase global est injecté par le CDN avant ce fichier
const supa = supabase.createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
