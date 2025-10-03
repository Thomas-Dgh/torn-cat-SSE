import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// CORS headers for all Edge Functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Create Supabase client with service role
export function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

// Get Torn API key from environment
export function getTornApiKey() {
  const apiKey = Deno.env.get('TORN_FULL_ACCESS_API_KEY');
  if (!apiKey) {
    throw new Error('Server configuration error: missing Torn API key');
  }
  return apiKey;
}