import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Fonction pour récupérer les factions actives depuis la base de données
async function getActiveFactions(supabaseClient) {
  try {
    const { data: factions, error } = await supabaseClient.from('factions').select('faction_id, faction_name, torn_api_key, last_xanax_check').eq('script_active', true).not('torn_api_key', 'is', null).neq('torn_api_key', ''); // Exclure aussi les clés vides
    if (error) {
      console.error('❌ Error fetching active factions:', error);
      return [];
    }
    console.log(`📊 Found ${factions?.length || 0} active factions in database`);
    return factions || [];
  } catch (error) {
    console.error('❌ Error in getActiveFactions:', error);
    return [];
  }
}
async function callXanaxChecker(supabaseClient, faction) {
  try {
    console.log(`🔍 Checking faction ${faction.faction_id}...`);
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/xanax-checker`, {
      method: 'POST',
      headers: {
        'apikey': Deno.env.get('SUPABASE_ANON_KEY'),
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        faction_id: faction.faction_id,
        torn_api_key: faction.torn_api_key
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const result = await response.json();
    if (result.success && result.new_payments > 0) {
      console.log(`💊 Faction ${faction.faction_id}: ${result.new_payments} new payments, ${result.total_xanax_processed} xanax processed`);
    } else {
      console.log(`✅ Faction ${faction.faction_id}: No new payments`);
    }
    return result;
  } catch (error) {
    console.error(`❌ Error checking faction ${faction.faction_id}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('🚀 Starting xanax cron job...');
    console.log(`📅 ${new Date().toISOString()}`);
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    // Récupérer les factions actives depuis la base de données
    const factions = await getActiveFactions(supabaseClient);
    if (factions.length === 0) {
      console.log('⚠️ No active factions found in database');
      return new Response(JSON.stringify({
        success: true,
        message: 'No active factions to monitor',
        summary: {
          timestamp: new Date().toISOString(),
          factions_checked: 0,
          successful: 0,
          errors: 0,
          total_new_payments: 0,
          results: []
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    console.log(`📊 Monitoring ${factions.length} factions...`);
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let totalNewPayments = 0;
    // Traiter chaque faction
    for (const faction of factions){
      const result = await callXanaxChecker(supabaseClient, faction);
      results.push({
        faction_id: faction.faction_id,
        result: result
      });
      if (result.success) {
        successCount++;
        totalNewPayments += result.new_payments || 0;
      } else {
        errorCount++;
      }
      // Petit délai pour éviter de spam l'API Torn
      await new Promise((resolve)=>setTimeout(resolve, 1000));
    }
    const summary = {
      timestamp: new Date().toISOString(),
      factions_checked: factions.length,
      successful: successCount,
      errors: errorCount,
      total_new_payments: totalNewPayments,
      results: results
    };
    console.log(`✅ Cron job completed: ${successCount} successful, ${errorCount} errors, ${totalNewPayments} new payments`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Xanax cron job completed',
      summary: summary
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('❌ Cron job error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
