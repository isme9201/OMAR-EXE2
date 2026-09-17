// Public Supabase configuration. The anon key is safe for client applications when RLS is enabled.
// Never put SUPABASE_SERVICE_ROLE_KEY or Cloudinary secrets here.
export const PUBLIC_SUPABASE_URL = 'https://tgufcpgrbsaxccbkmvhx.supabase.co';
export const PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWZjcGdyYnNheGNjYmttdmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczODU4MDcsImV4cCI6MjEwMjk2MTgwN30.2WlPv_c3Y99n0rd5sFOn0B0xIVI2jxoRFA26gKunmMs';

export function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY,
  };
}
