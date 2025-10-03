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
// Fonction pour traiter toutes les factions en checkant tes événements personnels
async function processAllFactions(supabaseClient, factions, tornApiKey) {
  console.log(`🔍 Starting xanax check for all factions by checking personal events...`);
  try {
    // 1. Obtenir TES événements personnels via l'API Torn (au lieu des événements de faction)
    const JESUUS_USER_ID = 2353554;
    const eventsResponse = await fetch(`https://api.torn.com/user/${JESUUS_USER_ID}?selections=events&key=${tornApiKey}`);
    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error(`❌ Torn API error for user events: ${eventsResponse.status} - ${errorText}`);
      throw new Error(`Torn API error: ${eventsResponse.status} - ${errorText}`);
    }
    const userData = await eventsResponse.json();
    if (userData.error) {
      console.error(`❌ Torn API response error for user events:`, userData.error);
      throw new Error(`Torn API error: ${userData.error.error || JSON.stringify(userData.error)}`);
    }
    const events = userData.events || {};
    const results = [];
    let totalNewPayments = 0;
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
      // Obtenir la faction de l'expéditeur via l'API Torn
      const senderFaction = await getFactionFromTornAPI(senderId, tornApiKey);
      if (!senderFaction) {
        console.log(`⚠️ Could not determine faction for user ${senderId} (${senderName})`);
        continue;
      }
      const senderFactionId = senderFaction.faction_id;
      // 3. Vérifier que la faction existe dans la table factions
      const { data: factionExists, error: factionCheckError } = await supabaseClient.from('factions').select('faction_id').eq('faction_id', senderFactionId).single();
      if (factionCheckError && factionCheckError.code !== 'PGRST116') {
        console.error(`❌ Error checking faction ${senderFactionId}:`, factionCheckError);
        continue;
      }
      if (!factionExists) {
        console.log(`📝 Faction ${senderFactionId} (${senderFaction.faction_name}) not found in database - creating it automatically`);
        // Créer automatiquement la faction
        const { data: newFaction, error: createError } = await supabaseClient.from('factions').insert({
          faction_id: senderFactionId,
          faction_name: senderFaction.faction_name,
          script_active: true,
          torn_api_key: null,
          last_xanax_check: new Date().toISOString()
        }).select().single();
        if (createError) {
          console.error(`❌ Error creating faction ${senderFactionId}:`, createError);
          console.log(`⚠️ Skipping payment from ${senderName} - could not auto-create faction`);
          continue;
        }
        console.log(`✅ Successfully created faction ${senderFactionId} (${senderFaction.faction_name}) automatically`);
      }
      // 4. Traiter le paiement via la fonction PostgreSQL
      const { data: paymentResult, error: paymentError } = await supabaseClient.rpc('process_xanax_payment', {
        p_faction_id: senderFactionId,
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
        totalNewPayments++;
        totalXanaxProcessed += xanaxAmount;
        console.log(`💊 Processed ${xanaxAmount} xanax from ${senderName} (faction ${senderFactionId}) - ${paymentResult.wars_activated} wars activated`);
        // Ajouter aux résultats
        const existingResult = results.find((r)=>r.faction_id === senderFactionId);
        if (existingResult) {
          existingResult.new_payments++;
          existingResult.total_xanax_processed += xanaxAmount;
        } else {
          results.push({
            faction_id: senderFactionId,
            new_payments: 1,
            total_xanax_processed: xanaxAmount,
            success: true
          });
        }
      } else {
        console.log(`ℹ️ Payment already processed: ${paymentResult.error}`);
      }
    }
    console.log(`✅ Personal events check completed`);
    console.log(`📊 Results: ${totalNewPayments} new payments total, ${totalXanaxProcessed} total xanax processed`);
    return {
      success: true,
      total_new_payments: totalNewPayments,
      total_xanax_processed: totalXanaxProcessed,
      results: results
    };
  } catch (error) {
    console.error(`❌ Error processing personal events:`, error);
    return {
      success: false,
      error: error.message || 'Internal server error',
      results: []
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
    // Créer le client Supabase avec les variables d'environnement
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    // Utiliser la clé API full access stockée sur le serveur comme variable d'environnement
    const tornApiKey = Deno.env.get('TORN_FULL_ACCESS_API_KEY');
    if (!tornApiKey) {
      throw new Error('Server configuration error: missing Torn API key');
    }
    // Récupérer les factions actives depuis la base de données
    const { data: factions, error } = await supabaseClient.from('factions').select('faction_id, faction_name, torn_api_key, last_xanax_check').eq('script_active', true).not('torn_api_key', 'is', null).neq('torn_api_key', '');
    if (error) {
      console.error('❌ Error fetching active factions:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Database error: ' + error.message
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    if (!factions || factions.length === 0) {
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
    console.log(`📊 Found ${factions.length} active factions`);
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    let totalNewPayments = 0;
    // Traiter toutes les factions en une fois en checkant tes événements personnels
    console.log(`🔍 Checking personal events for xanax payments from all factions...`);
    const personalEventsResult = await processAllFactions(supabaseClient, factions, tornApiKey);
    if (personalEventsResult.success) {
      totalNewPayments = personalEventsResult.total_new_payments || 0;
      // Créer des résultats pour chaque faction (même celles sans paiements)
      for (const faction of factions){
        const factionResult = personalEventsResult.results.find((r)=>r.faction_id === faction.faction_id);
        if (factionResult) {
          results.push({
            faction_id: faction.faction_id,
            result: {
              success: true,
              new_payments: factionResult.new_payments,
              total_xanax_processed: factionResult.total_xanax_processed
            }
          });
          successCount++;
          if (factionResult.new_payments > 0) {
            console.log(`💊 Faction ${faction.faction_id}: ${factionResult.new_payments} new payments`);
          }
        } else {
          results.push({
            faction_id: faction.faction_id,
            result: {
              success: true,
              new_payments: 0,
              total_xanax_processed: 0
            }
          });
          successCount++;
        }
      }
    } else {
      errorCount = 1;
      results.push({
        faction_id: 'all',
        result: {
          success: false,
          error: personalEventsResult.error
        }
      });
      console.error(`❌ Error checking personal events: ${personalEventsResult.error}`);
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
