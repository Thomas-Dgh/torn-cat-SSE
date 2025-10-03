import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Fonction pour détecter les paiements xanax dans le texte d'événement
function detectXanaxPayment(eventText) {
  if (!eventText) return 0;
  // Détecter les patterns comme "5x xanax", "some xanax", ou "xanax" simple
  const multipleMatch = eventText.match(/(\d+)\s*x?\s*xanax/i);
  if (multipleMatch) {
    return parseInt(multipleMatch[1]);
  }
  // Détecter "some xanax" ou variations
  if (eventText.match(/some\s+xanax|several\s+xanax/i)) {
    return 5; // Assume "some" = 5 xanax
  }
  // Détecter un seul xanax
  if (eventText.match(/\bxanax\b/i)) {
    return 1;
  }
  return 0;
}
// Fonction pour extraire l'ID utilisateur depuis un lien Torn
function extractUserIdFromLink(eventText) {
  const userIdMatch = eventText.match(/profiles\.php\?XID=(\d+)/);
  return userIdMatch ? parseInt(userIdMatch[1]) : null;
}
// Fonction pour extraire le nom d'utilisateur depuis un lien
function extractUsernameFromLink(eventText) {
  const usernameMatch = eventText.match(/>([^<]+)<\/a>/);
  return usernameMatch ? usernameMatch[1].trim() : 'Unknown';
}
// Fonction pour obtenir la faction d'un utilisateur via l'API Torn
async function getFactionFromTornAPI(userId, apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/user/${userId}?selections=profile&key=${apiKey}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.faction && data.faction.faction_id > 0) {
      return {
        faction_id: data.faction.faction_id,
        faction_name: data.faction.faction_name || 'Unknown Faction'
      };
    }
    return null;
  } catch (error) {
    console.error('❌ Error fetching faction from Torn API:', error);
    return null;
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
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    const { faction_id } = await req.json();
    if (!faction_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing faction_id'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // Utiliser la clé API full access stockée sur le serveur comme variable d'environnement
    const torn_api_key = Deno.env.get('TORN_FULL_ACCESS_API_KEY');
    if (!torn_api_key) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Server configuration error: missing Torn API key'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    console.log(`🔍 Starting xanax check for faction ${faction_id}...`);
    // 1. Obtenir les événements récents de la faction via l'API Torn
    const eventsResponse = await fetch(`https://api.torn.com/faction/${faction_id}?selections=basic,crimes,events&key=${torn_api_key}`);
    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error(`❌ Torn API error: ${eventsResponse.status} - ${errorText}`);
      throw new Error(`Torn API error: ${eventsResponse.status} - ${errorText}`);
    }
    const factionData = await eventsResponse.json();
    if (factionData.error) {
      console.error(`❌ Torn API response error:`, factionData.error);
      throw new Error(`Torn API error: ${factionData.error.error || JSON.stringify(factionData.error)}`);
    }
    const events = factionData.events || {};
    let newPayments = 0;
    let totalXanaxProcessed = 0;
    // 2. Traiter chaque événement pour détecter les paiements xanax
    for (const [eventId, event] of Object.entries(events)){
      const eventData = event;
      const eventText = eventData.event || '';
      // Vérifier si l'événement contient un paiement xanax
      const xanaxAmount = detectXanaxPayment(eventText);
      if (xanaxAmount === 0) continue;
      // Extraire les informations de l'expéditeur
      const senderId = extractUserIdFromLink(eventText);
      if (!senderId) continue;
      const senderName = extractUsernameFromLink(eventText);
      // Obtenir la faction de l'expéditeur pour vérification
      const senderFaction = await getFactionFromTornAPI(senderId, torn_api_key);
      if (!senderFaction || senderFaction.faction_id !== faction_id) {
        console.log(`⚠️ Skipping payment from user ${senderId} (different faction)`);
        continue;
      }
      // 3. Traiter le paiement via la fonction PostgreSQL
      const { data: paymentResult, error: paymentError } = await supabaseClient.rpc('process_xanax_payment', {
        p_faction_id: faction_id,
        p_sender_id: senderId,
        p_sender_name: senderName,
        p_xanax_amount: xanaxAmount,
        p_event_id: eventId,
        p_event_text: eventText
      });
      if (paymentError) {
        console.error(`❌ Error processing payment for event ${eventId}:`, paymentError);
        continue;
      }
      if (paymentResult.success) {
        newPayments++;
        totalXanaxProcessed += xanaxAmount;
        console.log(`💊 Processed ${xanaxAmount} xanax from ${senderName} (${paymentResult.wars_activated} wars activated)`);
      } else {
        console.log(`ℹ️ Payment already processed: ${paymentResult.error}`);
      }
    }
    // 4. Obtenir les statistiques actuelles de la faction
    const { data: factionLicense, error: licenseError } = await supabaseClient.rpc('get_or_create_faction_license', {
      p_faction_id: faction_id
    });
    if (licenseError) {
      throw new Error(`Error getting faction license: ${licenseError.message}`);
    }
    const license = factionLicense[0];
    // 5. Obtenir l'historique récent des paiements
    const { data: recentPayments, error: paymentsError } = await supabaseClient.from('faction_xanax_payments').select('*').eq('faction_id', faction_id).order('created_at', {
      ascending: false
    }).limit(20);
    if (paymentsError) {
      console.error('❌ Error fetching recent payments:', paymentsError);
    }
    console.log(`✅ Xanax check completed for faction ${faction_id}`);
    console.log(`📊 Results: ${newPayments} new payments, ${totalXanaxProcessed} total xanax processed`);
    console.log(`🏆 Faction status: ${license.total_xanax_received} total xanax, ${license.wars_paid} wars available`);
    return new Response(JSON.stringify({
      success: true,
      faction_id: faction_id,
      new_payments: newPayments,
      total_xanax_processed: totalXanaxProcessed,
      faction_stats: {
        total_xanax_received: license.total_xanax_received,
        wars_paid: license.wars_paid,
        license_type: license.license_type,
        script_enabled_for_wars: license.script_enabled_for_wars
      },
      recent_payments: recentPayments || []
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('❌ Xanax checker error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
