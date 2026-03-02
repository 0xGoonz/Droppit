import { createClient } from '@supabase/supabase-js';

// Access Environment Variables securely
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.");
}

// Client for public standard queries
export const supabase = createClient(supabaseUrl, supabaseKey);

// Server-only Admin Client for bypassing RLS / accessing Vault
export function getServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
