import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ========================================
// FUNCTION: War Detection & Management
// ========================================
export async function warDetection(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { faction_id, api_key } = await req.json();
    if (!faction_id || !api_key) {
      return new Response(JSON.stringify({
        error: 'Missing faction_id or api_key'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get user info from Torn API to get faction details
    const userResponse = await fetch(`https://api.torn.com/user/?selections=basic,profile&key=${api_key}`);
    if (!userResponse.ok) {
      throw new Error('Failed to fetch from Torn API');
    }
    const userData = await userResponse.json();
    if (userData.error) {
      return new Response(JSON.stringify({
        error: userData.error.error
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const userFactionId = userData.faction?.faction_id;
    if (userFactionId !== faction_id) {
      return new Response(JSON.stringify({
        error: 'API key does not belong to this faction'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get TornStats data for war information
    const tornStatsResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/spy/faction/${faction_id}`);
    if (!tornStatsResponse.ok) {
      throw new Error('Failed to fetch from TornStats API');
    }
    const statsData = await tornStatsResponse.json();
    const warId = statsData.war?.war_id;
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Ensure faction exists
    await supabase.rpc('get_or_create_faction', {
      p_faction_id: faction_id,
      p_faction_name: userData.faction.faction_name
    });
    // Ensure user exists
    await supabase.rpc('get_or_create_user', {
      p_user_id: userData.player_id,
      p_user_name: userData.name,
      p_faction_id: faction_id,
      p_role: userData.faction.position
    });
    if (warId) {
      // Get detailed war info
      const warDetailsResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/wars/${warId}`);
      if (!warDetailsResponse.ok) {
        throw new Error('Failed to fetch war details from TornStats');
      }
      const warDetails = await warDetailsResponse.json();
      // Check if war exists in database
      const { data: existingWar } = await supabase.from('wars').select('*').eq('war_id', warId).single();
      if (!existingWar) {
        // Create new war
        const attackerId = warDetails.attacker.faction_id;
        const defenderId = warDetails.defender.faction_id;
        const { data: newWar, error: warError } = await supabase.from('wars').insert({
          war_id: warId,
          attacker_faction_id: attackerId,
          defender_faction_id: defenderId,
          started_at: new Date(warDetails.start * 1000).toISOString()
        }).select().single();
        if (warError) throw warError;
        // Log sync update
        await supabase.from('sync_updates').insert({
          faction_id: faction_id,
          update_type: 'war_start',
          metadata: {
            war_id: warId,
            enemy_faction_id: attackerId === faction_id ? defenderId : attackerId
          }
        });
        return new Response(JSON.stringify({
          status: 'new_war_detected',
          war: newWar,
          war_details: warDetails
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      return new Response(JSON.stringify({
        status: 'war_active',
        war: existingWar,
        war_details: warDetails
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      // No active war - mark any existing wars as ended
      const { data: endedWars } = await supabase.from('wars').update({
        is_active: false,
        ended_at: new Date().toISOString()
      }).or(`attacker_faction_id.eq.${faction_id},defender_faction_id.eq.${faction_id}`).eq('is_active', true).select();
      if (endedWars && endedWars.length > 0) {
        // Log sync updates for war end
        for (const war of endedWars){
          await supabase.from('sync_updates').insert({
            faction_id: faction_id,
            update_type: 'war_end',
            metadata: {
              war_id: war.war_id
            }
          });
        }
      }
      return new Response(JSON.stringify({
        status: 'no_active_war',
        ended_wars: endedWars || []
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error: any) {
    console.error('War detection error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

// ========================================
// FUNCTION: Call/Uncall Targets
// ========================================
export async function callManagement(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { action, war_id, faction_id, target_id, target_name, target_level, target_faction_id, caller_id, caller_name } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    switch(action){
      case 'call':
        {
          if (!war_id || !faction_id || !target_id || !caller_id) {
            return new Response(JSON.stringify({
              error: 'Missing required parameters for call'
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
          const { data: result, error } = await supabase.rpc('call_target', {
            p_war_id: war_id,
            p_faction_id: faction_id,
            p_target_id: target_id,
            p_target_name: target_name || '',
            p_target_level: target_level || 0,
            p_target_faction_id: target_faction_id,
            p_caller_id: caller_id,
            p_caller_name: caller_name || ''
          });
          if (error) throw error;
          return new Response(JSON.stringify(result), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      case 'uncall':
        {
          if (!war_id || !faction_id || !target_id || !caller_id) {
            return new Response(JSON.stringify({
              error: 'Missing required parameters for uncall'
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
          const { data: result, error } = await supabase.rpc('uncall_target', {
            p_war_id: war_id,
            p_faction_id: faction_id,
            p_target_id: target_id,
            p_caller_id: caller_id
          });
          if (error) throw error;
          return new Response(JSON.stringify(result), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      case 'get_calls':
        {
          if (!war_id || !faction_id) {
            return new Response(JSON.stringify({
              error: 'Missing war_id or faction_id'
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
          const { data: calls, error } = await supabase.rpc('get_active_calls', {
            p_war_id: war_id,
            p_faction_id: faction_id
          });
          if (error) throw error;
          return new Response(JSON.stringify({
            calls: calls || []
          }), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      default:
        return new Response(JSON.stringify({
          error: 'Invalid action'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
    }
  } catch (error: any) {
    console.error('Call management error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

// ========================================
// FUNCTION: Real-time Sync
// ========================================
export async function syncUpdates(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { faction_id, since_timestamp } = await req.json();
    if (!faction_id) {
      return new Response(JSON.stringify({
        error: 'Missing faction_id'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const sinceTime = since_timestamp || new Date(Date.now() - 60000).toISOString(); // Default to last minute
    const { data: updates, error } = await supabase.rpc('get_sync_updates', {
      p_faction_id: faction_id,
      p_since: sinceTime
    });
    if (error) throw error;
    return new Response(JSON.stringify({
      updates: updates || [],
      server_timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Sync updates error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

// ========================================
// FUNCTION: Get War Targets
// ========================================
export async function getWarTargets(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { war_id, faction_id, api_key } = await req.json();
    if (!war_id || !faction_id || !api_key) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get detailed war info with targets from TornStats
    const warDetailsResponse = await fetch(`https://www.tornstats.com/api/v2/${api_key}/wars/${war_id}`);
    if (!warDetailsResponse.ok) {
      throw new Error('Failed to fetch war details from TornStats');
    }
    const warDetails = await warDetailsResponse.json();
    // Get active calls to filter out already called targets
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: activeCalls } = await supabase.rpc('get_active_calls', {
      p_war_id: war_id,
      p_faction_id: faction_id
    });
    const calledTargetIds = new Set(activeCalls?.map((call: any)=>call.target_id) || []);
    // Get enemy faction members
    const enemyFactionId = warDetails.attacker.faction_id === faction_id ? warDetails.defender.faction_id : warDetails.attacker.faction_id;
    const enemyMembers = warDetails.members?.filter((member: any)=>member.faction_id === enemyFactionId && !calledTargetIds.has(member.user_id)) || [];
    return new Response(JSON.stringify({
      war_details: warDetails,
      available_targets: enemyMembers,
      active_calls_count: calledTargetIds.size
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Get war targets error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}

// ========================================
// FUNCTION: Get Unified War Data
// ========================================
export async function getUnifiedWarData(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { faction_id, api_key } = await req.json();
    if (!faction_id || !api_key) {
      return new Response(JSON.stringify({
        error: 'Missing faction_id or api_key'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    // Get war detection data
    const warDetectionReq = new Request('', {
      method: 'POST',
      body: JSON.stringify({ faction_id, api_key })
    });
    const warDetectionRes = await warDetection(warDetectionReq);
    const warData = await warDetectionRes.json();
    
    // If there's an active war, get targets and calls
    let targets = null;
    let calls = null;
    
    if (warData.status === 'war_active' || warData.status === 'new_war_detected') {
      const warId = warData.war?.war_id || warData.war_details?.war_id;
      
      if (warId) {
        // Get war targets
        const targetsReq = new Request('', {
          method: 'POST',
          body: JSON.stringify({ war_id: warId, faction_id, api_key })
        });
        const targetsRes = await getWarTargets(targetsReq);
        targets = await targetsRes.json();
        
        // Get active calls
        const callsReq = new Request('', {
          method: 'POST',
          body: JSON.stringify({ action: 'get_calls', war_id: warId, faction_id })
        });
        const callsRes = await callManagement(callsReq);
        calls = await callsRes.json();
      }
    }
    
    return new Response(JSON.stringify({
      war: warData,
      targets: targets,
      calls: calls,
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    console.error('Unified war data error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}