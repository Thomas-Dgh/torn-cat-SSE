// ==UserScript==
// @name         C.A.T - Combat Assistance Toolkit
// @namespace    http://tampermonkey.net/
// @version      4.3.4
// @description  Target calling system for faction wars - Fluffy Kittens Development
// @author       JESUUS [2353554]
// @copyright    2025, JESUUS - All rights reserved
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @icon         https://www.google.com/s2/favicons?domain=torn.com`
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @license      Proprietary - No modifications allowed
// @grant        unsafeWindow
// @connect      *.supabase.co
// @connect      wdgvdggkhxeugyusaymo.supabase.co
// @connect      api.torn.com
// @connect      tornstats.com
// @connect      www.lol-manager.com
// @run-at       document-start
// ==/UserScript==

/*
 * IMPORTANT NOTICE - PROPRIETARY SOFTWARE
 *
 * This script is the property of JESUUS [2353554] and Fluffy Kittens Development.
 * Unauthorized modification, distribution, or reverse engineering of this code
 * is strictly prohibited.
 *
 * While this script is distributed under MIT license for use, any modifications
 * must be approved by the original author.
 *
 * For permissions or inquiries, contact JESUUS [2353554] in-game.
 */

(function () {
  "use strict";

  // ========================================
  // HOSPITAL DATA INTERCEPTORS
  // ========================================
  const hospTime = {}; // Store hospital timestamps by user ID

  // Store additional user data
  const userData = {}; // Store additional user info by ID
  const warData = {}; // Store complete war data

  // Make data accessible globally for the WarCallingSystem
  unsafeWindow.CATUserData = userData;
  unsafeWindow.CATWarData = warData;

  // Intercept Fetch API for war data
  const originalFetch = unsafeWindow.fetch;
  unsafeWindow.fetch = async (...args) => {
    const url = args[0]?.url || args[0];
    const response = await originalFetch(...args);

    // Check if this is a war-related request
    if (url && typeof url === 'string' &&
        (url.includes('step=getwarusers') ||
         url.includes('step=getProcessBarRefreshData') ||
         url.includes('factions.php') && url.includes('war') ||
         url.includes('loader.php?sid=getInformation'))) {


      const clone = response.clone();
      clone.json().then((json) => {

        // Process warDesc data - this is the full war data
        if (json.warDesc && json.warDesc.members) {

          // Store war metadata
          warData.currentFaction = json.warDesc.currentFaction;
          warData.opponentFaction = json.warDesc.opponentFaction;
          warData.graph = json.warDesc.graph;
          
   
          // Process all members
          json.warDesc.members.forEach((member) => {
            const userId = member.userID.toString();

            // Store complete user data
            userData[userId] = {
              userID: member.userID,
              name: member.playername,
              level: member.level,
              factionId: member.factionId,
              warFactionId: member.warFactionId,
              score: member.score,
              lastaction: member.lastaction,
              factionTag: member.factionTag,
              factionRank: member.factionRank,
              honorID: member.honorID,
              onlineStatus: member.onlineStatus,
              status: member.status,
              area: member.status?.area
            };

            // Store hospital end timestamp (when user will leave hospital)
            if (member.status && (member.status.text === "Hospital" || member.status.state === "Hospital")) {
              hospTime[userId] = member.status.updateAt || member.status.until;
            } else {
              delete hospTime[userId];
            }
          });

          // Notify that new war data is available
          window.dispatchEvent(new CustomEvent('warDataUpdated', { detail: { userData, warData } }));
        }

        // Also handle other response formats
        let members = null;
        if (json.userStatuses) members = json.userStatuses;
        else if (json.members) members = json.members;

        if (members && !json.warDesc) {
          Object.keys(members).forEach((id) => {
            const member = members[id];
            const status = member.status || member;
            const userId = (member.userID || id).toString();


            // Update existing user data
            if (userData[userId]) {
              userData[userId].status = status;

              if (status.text === "Hospital" || status.state === "Hospital") {
                hospTime[userId] = status.updateAt || status.until;
              } else {
                delete hospTime[userId];
              }
            }
          });
        }
      }).catch(() => {}); // Ignore JSON parse errors
    }

    return response;
  };

  // Intercept WebSocket for real-time updates
  const OriginalWebSocket = unsafeWindow.WebSocket;
  unsafeWindow.WebSocket = function(...args) {
    const socket = new OriginalWebSocket(...args);


    socket.addEventListener("message", (event) => {
      try {
        // Skip non-JSON messages (like "2", "PONG", "MESG" prefixed messages)
        const data = event.data;
        if (typeof data === 'string' && (data === '2' || data.startsWith('PONG') || data.startsWith('MESG'))) {
          return; // Skip these messages
        }
        
        const json = JSON.parse(event.data);
        
        // Also check for any message containing war/chain in the data
        const dataStr = JSON.stringify(json);


        // Debug: Log interesting WebSocket data
        if (json?.push?.pub?.data?.message) {
          const message = json.push.pub.data.message;

        

          // Log chain data specifically
          if (message.namespaces?.chain) {
            
            // Update chain info from WebSocket in real-time
            if (window.warCallingSystemInstance && message.namespaces.chain.actions) {
              const chainActions = message.namespaces.chain.actions;
              
              // Check for chain updates
              if (chainActions.updateChain) {
                const chainUpdate = chainActions.updateChain;
                
                // Update chain counts if available
                if (chainUpdate.current !== undefined) {
                  window.warCallingSystemInstance.chainInfo.my_chain = chainUpdate.current;
                }
                
                // Handle timeout updates with proper timestamp conversion
                if (chainUpdate.timeout !== undefined) {
                  if (chainUpdate.timeout > 0) {
                    // Convert seconds remaining to unix timestamp
                    const currentTime = Math.floor(Date.now() / 1000);
                    window.warCallingSystemInstance.chainInfo.chain_timeout = currentTime + chainUpdate.timeout;
                    window.warCallingSystemInstance.chainInfo.last_chain_hit = currentTime + chainUpdate.timeout - 300;
                    window.warCallingSystemInstance.chainInfo.lastWebSocketUpdate = Date.now();
                    window.warCallingSystemInstance.chainInfo.dataSource = 'websocket';
                
                    
                    // Start/restart the chain timer with WebSocket data
                    window.warCallingSystemInstance.startChainTimer();
                  } else {
                    // No timeout or 0 means no active chain
                    window.warCallingSystemInstance.chainInfo.chain_timeout = null;
                    window.warCallingSystemInstance.chainInfo.last_chain_hit = null;
                    window.warCallingSystemInstance.chainInfo.lastWebSocketUpdate = Date.now();
                    window.warCallingSystemInstance.chainInfo.dataSource = 'websocket';
                  }
                }
                
                // Trigger UI update
                if (window.warCallingSystemInstance.updateCompactInfo) {
                  window.warCallingSystemInstance.updateCompactInfo();
                }
              }
            }
          }

          // Check for user updates
          if (message.namespaces?.users) {
            const users = message.namespaces.users;

            // Status updates
            if (users.actions?.updateStatus) {
              const statusUpdate = users.actions.updateStatus;
              const userId = statusUpdate.userId.toString();
              const status = statusUpdate.status;

              // Update user data with new status from WebSocket (high priority)
              if (!userData[userId]) {
                userData[userId] = {};
              }
              userData[userId].status = status;
              userData[userId].lastStatusUpdate = Date.now();
              userData[userId].statusSource = 'websocket';
              
              
              // Force UI update for this user if visible in targets
              if (window.warCallingSystemInstance) {
                window.warCallingSystemInstance.updateTargetStatusInUI(userId, status);
              }

              // Update hospital time
              if (status.text === "Hospital" || status.state === "Hospital") {
                hospTime[userId] = status.updateAt || status.until;
              } else {
                delete hospTime[userId];
              }
            }

            // Other user actions
            if (users.actions) {
              const actions = Object.keys(users.actions);
              if (actions.length > 0 && actions[0] !== 'updateStatus') {
              }
            }
          }

          // Check for attack data
          if (message.namespaces?.attack) {
          }
          
          // Check for war data in different namespaces
          if (message.namespaces?.war) {
            
            // Handle war chain updates
            if (message.namespaces.war.actions && window.warCallingSystemInstance) {
              const warActions = message.namespaces.war.actions;
              
              // Look for chain updates in war actions
              if (warActions.updateChain || warActions.chainUpdate) {
                const update = warActions.updateChain || warActions.chainUpdate;
                
                // Update chain data
                if (update.faction_a_chain !== undefined || update.faction_b_chain !== undefined) {
                  window.warCallingSystemInstance.updateChainInfo({
                    factions: [
                      { id: update.faction_a_id, chain: update.faction_a_chain },
                      { id: update.faction_b_id, chain: update.faction_b_chain }
                    ]
                  });
                }
              }
            }
          }
        }

        // Also check for chain/war updates in different format
        if (json?.data?.chain || json?.data?.war) {
          
          // Handle direct chain data if available
          if (json.data.chain && window.warCallingSystemInstance) {
            const chainData = json.data.chain;
            if (chainData.current !== undefined) {
              window.warCallingSystemInstance.chainInfo.my_chain = chainData.current;
            }
            if (chainData.timeout !== undefined) {
              if (chainData.timeout > 0) {
                // Convert seconds remaining to unix timestamp if needed
                const currentTime = Math.floor(Date.now() / 1000);
                // Check if timeout is already a timestamp or seconds remaining
                const timeoutValue = chainData.timeout > currentTime ? chainData.timeout : currentTime + chainData.timeout;
                window.warCallingSystemInstance.chainInfo.chain_timeout = timeoutValue;
                window.warCallingSystemInstance.chainInfo.last_chain_hit = timeoutValue - 300;
                window.warCallingSystemInstance.chainInfo.lastWebSocketUpdate = Date.now();
                window.warCallingSystemInstance.chainInfo.dataSource = 'websocket';
                
                
                // Start/restart the chain timer
                window.warCallingSystemInstance.startChainTimer();
              } else {
                window.warCallingSystemInstance.chainInfo.chain_timeout = null;
                window.warCallingSystemInstance.chainInfo.last_chain_hit = null;
                window.warCallingSystemInstance.chainInfo.lastWebSocketUpdate = Date.now();
                window.warCallingSystemInstance.chainInfo.dataSource = 'websocket';
              }
            }
            
            // Trigger UI update
            if (window.warCallingSystemInstance.updateCompactInfo) {
              window.warCallingSystemInstance.updateCompactInfo();
            }
          }
        }
        
        // Check for any data property that might contain chain info
        if (json?.data) {
        }
        
        // Log specific channel types to find chain updates
        if (json?.push?.channel) {
          const channel = json.push.channel;
          if (channel.includes('chain') || channel.includes('faction-war')) {
          }
          
          // Check faction-war-boxes channel for chain data
          if (channel.includes('faction-war-boxes') && json.push.pub?.data) {
            
            // Try to extract chain updates from this channel
            if (json.push.pub.data.message && window.warCallingSystemInstance) {
              const message = json.push.pub.data.message;
              
              // Look for chain data in the message
              if (message.chain || message.chains || message.faction_chains) {
             
              }
            }
          }
        }
      } catch (e) {
        // Not JSON or not the right format, ignore
      }
    });

    return socket;
  };

  // ========================================
  // VERSION MANAGEMENT
  // ========================================
  const compareVersions = (version1, version2) => {
    const v1parts = version1.split(".").map(Number);
    const v2parts = version2.split(".").map(Number);
    const maxLength = Math.max(v1parts.length, v2parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;

      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    return 0;
  };

  const getCurrentScriptVersion = () => {
    try {
      if (
        typeof GM_info !== "undefined" &&
        GM_info.script &&
        GM_info.script.version
      ) {
        return GM_info.script.version;
      }
      if (
        typeof window.GM_info !== "undefined" &&
        window.GM_info.script &&
        window.GM_info.script.version
      ) {
        return window.GM_info.script.version;
      }
      // Fallback: extract from userscript header
      const scriptElements = document.querySelectorAll("script");
      for (let script of scriptElements) {
        if (script.textContent && script.textContent.includes("@version")) {
          const match = script.textContent.match(/@version\s+(.+)/);
          if (match) return match[1].trim();
        }
      }
      return "4.3.4"; // Default fallback
    } catch (error) {
      console.error("Error getting script version:", error);
      return "4.3.4";
    }
  };

  // ========================================
  // CONFIGURATION
  // ========================================
  const CONFIG = {
    supabase: {
      url: "https://wdgvdggkhxeugyusaymo.supabase.co", // Replace with actual Supabase URL
      anonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZ3ZkZ2draHhldWd5dXNheW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzOTk3NDEsImV4cCI6MjA3Mzk3NTc0MX0.OR5W5YVqWvbZLQ4pK6j-DAiK6_GiEKM4gJfl7MBDaT0", // Replace with actual anon key
    },
    syncInterval: 500, // 0.5 seconds for enemy faction updates (faster WebSocket sync)
    warCheckInterval: 30000, // 30 seconds (increased for mobile stability)
    targetStatusRefreshInterval: 1000, // 1 second for call status updates
    ownFactionRefreshInterval: 5000, // 5 seconds for own faction updates
    hospitalTimerInterval: 1000, // 1 second for hospital timers
    criticalStatusCheckInterval: 10000, // 10 seconds for critical status changes
    apiKeyStorageKey: "torn_war_api_key",
    tornStatsKeyStorageKey: "tornstats_api_key",
    userIdStorageKey: "torn_war_user_id",
    factionIdStorageKey: "torn_war_faction_id",
    userNameStorageKey: "torn_war_user_name",
    playerBattleStatsKey: "torn_player_battle_stats",
    isShowingBattleStatsScoreKey: "torn_showing_battle_stats_score",
    targetsStorageKey: "torn_war_targets",
    targetsCacheTimeKey: "torn_war_targets_cache_time",
    warStatusStorageKey: "torn_war_status",
    warStatusCacheTimeKey: "torn_war_status_cache_time",
    sortConfigStorageKey: "torn_war_sort_config",
    factionSortConfigStorageKey: "torn_war_faction_sort_config",
    warFiltersStorageKey: "torn_war_filters_config",
    minimizedStateStorageKey: "torn_war_minimized_state",
    activeTabStorageKey: "torn_war_active_tab",
    factionDataStorageKey: "torn_faction_data",
    factionDataCacheTimeKey: "torn_faction_data_cache_time",
    cacheExpiryHours: 24, // Cache user info for 24 hours
    targetsCacheExpiryMinutes: 90, // Cache targets for 90 minutes (longer cache for better performance)
    warStatusCacheExpiryMinutes: 45, // Cache war status for 45 minutes
    factionDataCacheExpiryMinutes: 5, // Cache faction data for 5 minutes
    showMyChainStorageKey: "torn_war_show_my_chain",
    showEnemyChainStorageKey: "torn_war_show_enemy_chain",
    showBSPColumnStorageKey: "torn_war_show_bsp_column",
    showFactionTableStorageKey: "torn_war_show_faction_table",
    hospitalAlertsStorageKey: "torn_war_hospital_alerts",
    hospitalTimersStorageKey: "torn_war_hospital_timers",
    enableHospitalAlertsStorageKey: "torn_war_enable_hospital_alerts",
  };

  // ========================================
  // BSP UTILITY FUNCTIONS
  // ========================================
  const StorageKey = {
    PlayerBattleStats: "PlayerBattleStats",
  };

  // BSP Server and API functions (adapted from BSP script)
  function GetBSPServer() {
    return "http://www.lol-manager.com/api";
  }

  function GetBSPAPIKey() {
    // Try to get BSP API key from localStorage
    return localStorage["tdup.battleStatsPredictor.PrimaryAPIKey"] || null;
  }

  function SetPredictionInCache(playerId, prediction) {
    // Don't cache FAIL (0) or MODEL_ERROR (4), but cache everything else including FFATTACKS (6)
    if (prediction.Result == 0 || prediction.Result == 4) {
      // FAIL or MODEL_ERROR
      return;
    }
    const key = `tdup.battleStatsPredictor.cache.prediction.${playerId}`;
    try {
      localStorage[key] = JSON.stringify(prediction);
    } catch (e) {
      // Silently handle cache storage errors
    }
  }

  // Fetch BSP data from server (adapted from BSP script)
  function FetchScoreAndTBS(targetId) {
    const primaryAPIKey = GetBSPAPIKey();
    if (!primaryAPIKey) {
      return Promise.resolve(null);
    }

    const url = `${GetBSPServer()}/battlestats/${primaryAPIKey}/${targetId}/4.3.4`;

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: url,
        headers: {
          "Content-Type": "application/json",
        },
        onload: (response) => {
          try {
            const result = JSON.parse(response.responseText);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
        onerror: (err) => {
          reject(err);
        },
      });
    });
  }

  // Enhanced function to get BSP data with fallback to server fetch
  async function GetPlayerBSPData(playerId, forceFetch = false) {
    try {
      // If not forcing fetch, try cached data first
      if (!forceFetch) {
        // Try BSP prediction cache first (most accurate)
        const predictionKey = `tdup.battleStatsPredictor.cache.prediction.${playerId}`;
        let data = localStorage[predictionKey];
        if (data) {
          const prediction = JSON.parse(data);
          if (prediction && (prediction.TBS || prediction.Score)) {
            // Check if prediction is not too old (5 days validity as per BSP script)
            const predictionDate = new Date(
              prediction.DateFetched || prediction.PredictionDate
            );
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() - 5);

            if (predictionDate > expirationDate) {
              return {
                TBS: prediction.TBS || prediction.TBS_Raw,
                Str: prediction.Str || 0,
                Def: prediction.Def || 0,
                Spd: prediction.Spd || 0,
                Dex: prediction.Dex || 0,
                Score: prediction.Score,
                Source: "BSP_Prediction",
              };
            } else {
              // Prediction is too old, remove it
              localStorage.removeItem(predictionKey);
            }
          }
        }

        // Try TornStats spy cache
        const tornStatsKey = `tdup.battleStatsPredictor.cache.spy_v2.tornstats_${playerId}`;
        data = localStorage[tornStatsKey];
        if (data) {
          const spy = JSON.parse(data);
          if (spy && spy.total) {
            return {
              TBS: spy.total,
              Str: spy.str,
              Def: spy.def,
              Spd: spy.spd,
              Dex: spy.dex,
              Score:
                spy.str && spy.def && spy.spd && spy.dex
                  ? Math.sqrt(spy.str) +
                    Math.sqrt(spy.def) +
                    Math.sqrt(spy.spd) +
                    Math.sqrt(spy.dex)
                  : 0,
              Source: "TornStats_Spy",
            };
          }
        }

        // Try YATA spy cache
        const yataKey = `tdup.battleStatsPredictor.cache.spy_v2.yata_${playerId}`;
        data = localStorage[yataKey];
        if (data) {
          const spy = JSON.parse(data);
          if (spy && spy.total) {
            return {
              TBS: spy.total,
              Str: spy.str,
              Def: spy.def,
              Spd: spy.spd,
              Dex: spy.dex,
              Score:
                spy.str && spy.def && spy.spd && spy.dex
                  ? Math.sqrt(spy.str) +
                    Math.sqrt(spy.def) +
                    Math.sqrt(spy.spd) +
                    Math.sqrt(spy.dex)
                  : 0,
              Source: "YATA_Spy",
            };
          }
        }
      }

      // No cached data found or forced fetch, try to fetch from BSP server
      const bspAPIKey = GetBSPAPIKey();
      if (bspAPIKey) {
        const prediction = await FetchScoreAndTBS(playerId);
        if (prediction && prediction.Result !== 0 && prediction.Result !== 4) {
          // Not FAIL or MODEL_ERROR
          // Store in cache with current date
          prediction.DateFetched = new Date();
          SetPredictionInCache(playerId, prediction);

          // Return formatted data
          return {
            TBS: prediction.TBS || prediction.TBS_Raw,
            Str: prediction.Str || 0,
            Def: prediction.Def || 0,
            Spd: prediction.Spd || 0,
            Dex: prediction.Dex || 0,
            Score: prediction.Score,
            Source: "BSP_Server_Fetch",
          };
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // Test BSP connectivity (for debugging)
  async function TestBSPConnection() {
    const bspAPIKey = GetBSPAPIKey();
    if (!bspAPIKey) {
      return false;
    }

    try {
      // Use a common test user ID (e.g., Duke [2])
      const testResult = await FetchScoreAndTBS(2);
      return testResult !== null;
    } catch (error) {
      return false;
    }
  }

  // Check if we have BSP data available
  function HasBSPData() {
    // Check if we have any BSP data in localStorage
    for (let key in localStorage) {
      if (
        key.startsWith("tdup.battleStatsPredictor.cache.prediction.") ||
        key.startsWith("tdup.battleStatsPredictor.cache.spy_v2.tornstats_") ||
        key.startsWith("tdup.battleStatsPredictor.cache.spy_v2.yata_") ||
        key === "tdup.battleStatsPredictor.playerBattleStats"
      ) {
        return true;
      }
    }
    return false;
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================
  const isTornPDA = () => {
    return typeof window.flutter_inappwebview !== "undefined";
  };

  const customFetch = async (url, options = {}) => {
    if (isTornPDA()) {
      return pdaFetch(url, options);
    }

    // Check circuit breaker for Supabase URLs
    if (url.includes("supabase.co") && window.warCallingSystemInstance) {
      const instance = window.warCallingSystemInstance;

      // Check if circuit breaker is open
      if (instance.circuitBreakerOpen) {
        // Check if it's time to reset
        if (
          instance.circuitBreakerResetTime &&
          Date.now() > instance.circuitBreakerResetTime
        ) {
          instance.circuitBreakerOpen = false;
          instance.failedRequestCount = 0;
          instance.circuitBreakerResetTime = null;
        } else {
          // Circuit breaker is still open
          return Promise.reject(new Error(
            "Circuit breaker is open - too many failed requests. Will retry in 30 seconds."
          ));
        }
      }
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url: url,
        headers: {
          "Content-Type": "application/json",
          "Connection": "keep-alive", // Reuse connections
          "Accept-Encoding": "gzip, br", // Enable compression
          ...options.headers,
        },
        data: options.body,
        timeout: 30000, // 30 second timeout
        responseType: "text",
        onload: (response) => {
          // Reset circuit breaker on successful request for Supabase URLs
          if (url.includes("supabase.co") && window.warCallingSystemInstance) {
            const instance = window.warCallingSystemInstance;
            if (response.status >= 200 && response.status < 300) {
              instance.failedRequestCount = 0;
              if (instance.circuitBreakerOpen) {
                instance.circuitBreakerOpen = false;
                instance.circuitBreakerResetTime = null;
              }
            }
          }

          resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            json: () => Promise.resolve(JSON.parse(response.responseText)),
            text: () => Promise.resolve(response.responseText),
          });
        },
        onerror: (error) => {
          console.error("[GM_XHR] Request error:", error, "URL:", url.substring(0, 80));

          // Update circuit breaker for Supabase URLs
          if (url.includes("supabase.co") && window.warCallingSystemInstance) {
            const instance = window.warCallingSystemInstance;
            instance.failedRequestCount++;

            if (instance.failedRequestCount >= instance.maxFailedRequests) {
              instance.circuitBreakerOpen = true;
              instance.circuitBreakerResetTime = Date.now() + 30000; // 30 seconds
              console.warn(
                "[War Calling] Circuit breaker opened due to too many failures"
              );
            }
          }

          // Convert GM_xmlhttpRequest error to a more standard format
          if (error && error.status === 408) {
            reject(
              new Error("Request timeout - the server took too long to respond")
            );
          } else if (error && error.status === 0) {
            reject(new Error("Network error - could not connect to server"));
          } else {
            reject(
              new Error(
                `Network error: ${error?.statusText || "Unknown error"}`
              )
            );
          }
        },
        ontimeout: () => {
          console.error("[GM_XHR] Request timeout after 30s, URL:", url.substring(0, 80));
          reject(new Error("Request timeout"));
        },
        onabort: () => {
          console.error("[War Calling] GM_xmlhttpRequest aborted");
          reject(new Error("Request aborted"));
        },
      });
    });
  };

  const pdaFetch = async (url, options = {}) => {
    const method =
      typeof options.method === "string" ? options.method.toUpperCase() : "GET";

    if (!["GET", "POST", "DELETE", "PATCH"].includes(method)) {
      console.error("❌ Invalid HTTP method:", method);
      throw new Error("Invalid HTTP method");
    }

    let headers = options.headers || {};
    if (url.includes("supabase.co")) {
      headers["apikey"] = CONFIG.supabase.anonKey;
      headers["Authorization"] = `Bearer ${CONFIG.supabase.anonKey}`;
      headers["Content-Type"] = "application/json";
    } else if (url.includes("api.torn.com")) {
      headers = {
        "User-Agent": "Mozilla/5.0 (compatible; WarCallingSystem/1.0)",
        Accept: "application/json",
        ...headers,
      };
    }

    const body = options.body || null;

    return new Promise((resolve, reject) => {
      const handlePDAResponse = (result) => {
        try {
          let data;

          // Handle different response formats from TornPDA
          if (result && typeof result === "object" && result.responseText) {
            // TornPDA format: { status: 200, responseText: "{...}" }
            data = JSON.parse(result.responseText);
          } else if (typeof result === "string") {
            // Direct JSON string
            data = JSON.parse(result);
          } else {
            // Already an object
            data = result;
          }

          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(data),
            text: () =>
              Promise.resolve(
                typeof data === "string" ? data : JSON.stringify(data)
              ),
          });
        } catch (parseError) {
          reject(parseError);
        }
      };

      const handlePDAError = (error) => {
        resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: error }),
          text: () => Promise.resolve(JSON.stringify({ error: error })),
        });
      };

      try {
        if (method === "GET") {
          window.flutter_inappwebview
            .callHandler("PDA_httpGet", url, headers)
            .then(handlePDAResponse)
            .catch(handlePDAError);
        } else if (method === "POST") {
          window.flutter_inappwebview
            .callHandler("PDA_httpPost", url, headers, body)
            .then(handlePDAResponse)
            .catch(handlePDAError);
        } else if (method === "DELETE") {
          headers["X-HTTP-Method-Override"] = "DELETE";
          window.flutter_inappwebview
            .callHandler("PDA_httpPost", url, headers, body)
            .then(handlePDAResponse)
            .catch(handlePDAError);
        } else if (method === "PATCH") {
          headers["X-HTTP-Method-Override"] = "PATCH";
          window.flutter_inappwebview
            .callHandler("PDA_httpPost", url, headers, body)
            .then(handlePDAResponse)
            .catch(handlePDAError);
        }
      } catch (syncError) {
        handlePDAError(syncError.message);
      }
    });
  };

  // ========================================
  // STATE MANAGEMENT
  // ========================================
  class WarCallingSystem {
    constructor() {
      this.apiKey = localStorage.getItem(CONFIG.apiKeyStorageKey) || "";
      this.tornStatsKey =
        localStorage.getItem(CONFIG.tornStatsKeyStorageKey) || this.apiKey || "";
      this.factionId = localStorage.getItem(CONFIG.factionIdStorageKey)
        ? parseInt(localStorage.getItem(CONFIG.factionIdStorageKey))
        : null;
      this.currentWar = null;
      this.activeCalls = new Map();
      this.isMinimized =
        localStorage.getItem(CONFIG.minimizedStateStorageKey) === "true";

      // Queue for modals that were requested while minimized
      this.pendingModals = [];

      // Track modal requests that should persist across warListItem open/close cycles
      this.persistentModalRequests = new Set();

      // Initialize script user sets - will be updated by Supabase later
      this.scriptUsers = new Set();
      this.activeScriptUsers = new Set();

      // Call/uncall request cache to prevent duplicate requests
      this.pendingCallRequests = new Map(); // targetId -> Promise
      this.lastCallTime = new Map(); // targetId -> timestamp

      // DOM element cache for faster UI updates
      this.targetRowCache = new Map(); // targetId -> {row, button}
      // Hospital timer tracking
      this.hospNodes = new Map(); // userId -> DOM node
      this.hospTimerInterval = null;
      this.hospLoopCounter = 0;

      // Reduced frequency cache cleanup for better performance
      this.cacheCleanupInterval = setInterval(() => {
        // Clean cache every 60 seconds to prevent memory leaks
        this.targetRowCache.clear();
      }, 60000); // Reduced frequency for faster refresh

      // Pre-create optimized style strings for instant updates
      this.buttonStyles = {
        call: 'background: #4a90e2 !important; cursor: pointer !important; color: white !important; border: 1px solid #2196F3 !important;',
        uncall: 'background: #d9534f !important; cursor: pointer !important; color: white !important; border: 1px solid #c62828 !important;',
        called: 'background: #666 !important; cursor: not-allowed !important; color: white !important; border: 1px solid #444 !important;'
      };

      // Load script users from cache if available
      this.loadScriptUsersFromCache();

      // Try to load player battle stats if we have an API key
      this.autoLoadPlayerBattleStats();

      // Version check cache
      this.versionCheckCache = null;
      this.versionCheckPromise = null;

      // Load cached user info
      this.loadCachedUserInfo();

      // Circuit breaker for failed requests
      this.failedRequestCount = 0;
      this.maxFailedRequests = 5;
      this.circuitBreakerOpen = false;
      this.circuitBreakerResetTime = null;

      // Initialize lastSync to 5 minutes ago to avoid fetching too much history on startup
      this.lastSync = new Date(Date.now() - 5 * 60 * 1000);
      this.syncTimer = null;
      this.warCheckTimer = null;
      this.targetRefreshTimer = null;
      this.fullRefreshTimer = null;

      // Hospital alerts system
      this.hospitalTimers = new Map(); // user_id -> {timer: seconds, timestamp: when_recorded}
      this.hospitalAlerts = this.loadHospitalAlerts();
      this.hospitalTimer = null;
      this.isInitialized = false;
      this.currentTargets = new Map(); // Store current targets for smart updates
      this.allTargetsUnfiltered = []; // Store all targets before filtering
      this.isDisplayingTargets = false; // Prevent multiple simultaneous displays

      // Attack tracking system
      this.currentAttackTarget = null; // ID of target being attacked
      this.attackStatusTimer = null; // Timer for status updates during attack
      this.isAttacking = false; // Flag to track attack state

      // Chain information
      this.chainInfo = {
        faction_a_chain: 0,
        faction_b_chain: 0,
        faction_a_name: "",
        faction_b_name: "",
        faction_a_id: null,
        faction_b_id: null,
        my_chain: 0,
        enemy_chain: 0,
        chain_timeout: null,
        last_chain_hit: null,
        last_update: null,
      };

      // Faction names for table headers
      this.myFactionName = "";
      this.enemyFactionName = "";

      // Timer for chain countdown
      this.chainTimerInterval = null;
    }

    loadCachedUserInfo() {
      const cachedData = {
        userId: localStorage.getItem(CONFIG.userIdStorageKey),
        factionId: localStorage.getItem(CONFIG.factionIdStorageKey),
        userName: localStorage.getItem(CONFIG.userNameStorageKey),
        cacheTime: localStorage.getItem("torn_war_cache_time"),
      };

      // Check if cache is still valid (24 hours)
      if (cachedData.cacheTime) {
        const cacheAge = Date.now() - parseInt(cachedData.cacheTime);
        const maxAge = CONFIG.cacheExpiryHours * 60 * 60 * 1000;

        if (cacheAge < maxAge) {
          // Use cached data
          this.userId = cachedData.userId ? parseInt(cachedData.userId) : null;

          // Immediately add current user to script users for instant logo display
          if (this.userId) {
            this.scriptUsers.add(this.userId);
            this.activeScriptUsers.add(this.userId);
          }
          this.factionId = cachedData.factionId
            ? parseInt(cachedData.factionId)
            : null;
          this.userName = cachedData.userName || null;

          if (this.userId && this.factionId) {
            return;
          }
        }
      }

      // Cache is expired or invalid
      this.userId = null;
      this.factionId = null;
      this.userName = null;
    }

    loadScriptUsersFromCache() {
      try {
        const cachedData = localStorage.getItem("cat_script_users_cache");
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          // Check if cache is not too old (12 hours)
          if (
            parsed.timestamp &&
            Date.now() - parsed.timestamp < 12 * 60 * 60 * 1000
          ) {
            if (parsed.scriptUsers) {
              this.scriptUsers = new Set(parsed.scriptUsers);
            }
            if (parsed.activeScriptUsers) {
              this.activeScriptUsers = new Set(parsed.activeScriptUsers);
            }
          }
        }
      } catch (error) {}

      // Always ensure current user is in the set
    }

    // Auto-load player battle stats from Torn API if available
    async autoLoadPlayerBattleStats() {
      const localStats = this.getLocalBattleStats();
      // If we already have stats and they're not too old, don't fetch again
      const lastUpdate = localStorage.getItem('torn_battle_stats_last_update');
      if (localStats.TBS > 0 && lastUpdate) {
        const timeSinceUpdate = Date.now() - parseInt(lastUpdate);
        // Don't update more than once per day
        if (timeSinceUpdate < 24 * 60 * 60 * 1000) {
          return;
        }
      }

      if (this.apiKey) {
        try {
          const response = await fetch(
            `https://api.torn.com/user/?selections=battlestats&key=${this.apiKey}&comment=WarCalling_BattleStats`
          );
          const data = await response.json();

          if (data.error) {
            return;
          }

          if (data.strength && data.defense && data.speed && data.dexterity) {
            const stats = {
              Str: parseInt(data.strength),
              Def: parseInt(data.defense),
              Spd: parseInt(data.speed),
              Dex: parseInt(data.dexterity),
              TBS: parseInt(data.strength) + parseInt(data.defense) + parseInt(data.speed) + parseInt(data.dexterity),
              Score: Math.round(Math.sqrt(data.strength) + Math.sqrt(data.defense) + Math.sqrt(data.speed) + Math.sqrt(data.dexterity))
            };

            this.setLocalBattleStats(stats);
            localStorage.setItem('torn_battle_stats_last_update', Date.now().toString());
          }
        } catch (error) {
        }
      }
      if (this.userId) {
        this.scriptUsers.add(this.userId);
        this.activeScriptUsers.add(this.userId);
      }
    }

    saveUserInfoToCache() {
      if (this.userId) {
        localStorage.setItem(CONFIG.userIdStorageKey, this.userId.toString());
      }
      if (this.factionId) {
        localStorage.setItem(
          CONFIG.factionIdStorageKey,
          this.factionId.toString()
        );
      }
      if (this.userName) {
        localStorage.setItem(CONFIG.userNameStorageKey, this.userName);
      }
      localStorage.setItem("torn_war_cache_time", Date.now().toString());
    }

    loadSortConfig() {
      const saved = localStorage.getItem(CONFIG.sortConfigStorageKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return { column: "status", direction: "asc" };
        }
      }
      return { column: "status", direction: "asc" };
    }

    saveSortConfig(column, direction) {
      localStorage.setItem(
        CONFIG.sortConfigStorageKey,
        JSON.stringify({ column, direction })
      );
    }
    loadFactionSortConfig() {
      const saved = localStorage.getItem(CONFIG.factionSortConfigStorageKey);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return { column: "level", direction: "desc" };
        }
      }
      return { column: "level", direction: "desc" };
    }
    saveFactionSortConfig(column, direction) {
      localStorage.setItem(
        CONFIG.factionSortConfigStorageKey,
        JSON.stringify({ column, direction })
      );
    }
    loadWarFilters() {
      const saved = localStorage.getItem(CONFIG.warFiltersStorageKey);
      if (saved) {
        try {
          const filters = JSON.parse(saved);
          return filters;
        } catch (e) {
          return this.getDefaultFilters();
        }
      }
      const defaultFilters = this.getDefaultFilters();
      return defaultFilters;
    }
    getDefaultFilters() {
      return {
        activity: {
          online: true,
          idle: true,
          offline: true
        },
        status: {
          okay: true,
          hospital: true,
          abroad: true,
          traveling: true,
          jail: true,
          federal: true
        },
        level: {
          min: 1,
          max: 100
        },
        isOpen: false
      };
    }
    saveWarFilters(filters) {
      localStorage.setItem(CONFIG.warFiltersStorageKey, JSON.stringify(filters));
    }

    updateTableTitles() {
      const enemyTitle = document.getElementById('enemy-faction-title');
      const myTitle = document.getElementById('my-faction-title');

      if (enemyTitle && this.enemyFactionName) {
        enemyTitle.textContent = this.enemyFactionName;
        enemyTitle.style.color = '#e74c3c'; // Red for enemy faction
        enemyTitle.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)'; // Text shadow effect
      }

      if (myTitle && this.myFactionName) {
        myTitle.textContent = this.myFactionName;
        myTitle.style.color = '#4a90e2'; // Blue for our faction
        myTitle.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)'; // Text shadow effect
      }
    }

    initializeWarFilters() {
      // Set up filter toggle
      const filterHeader = document.getElementById('war-filters-header');
      const filterContent = document.getElementById('war-filters-content');
      const filterIcon = document.getElementById('filter-toggle-icon');

      if (!filterHeader || !filterContent || !filterIcon) return;

      // Load saved filter state
      this.updateFilterUI();

      // Toggle functionality
      filterHeader.onclick = () => {
        const isOpen = filterContent.style.display !== 'none';
        filterContent.style.display = isOpen ? 'none' : 'block';
        filterIcon.textContent = isOpen ? '▼' : '▲';
        this.warFilters.isOpen = !isOpen;
        this.saveWarFilters(this.warFilters);
      };

      // Set initial state
      if (this.warFilters.isOpen) {
        filterContent.style.display = 'block';
        filterIcon.textContent = '▲';
      }

      // Auto-apply filter events for checkboxes
      const checkboxIds = [
        'filter-online', 'filter-idle', 'filter-offline',
        'filter-okay', 'filter-hospital', 'filter-abroad',
        'filter-traveling', 'filter-jail', 'filter-federal'
      ];

      checkboxIds.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
          checkbox.addEventListener('change', () => {
            this.applyWarFilters();
          });
        }
      });

      // Auto-apply filter events for level inputs
      const levelInputs = ['filter-level-min', 'filter-level-max'];
      levelInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('input', () => {
            this.applyWarFilters();
          });
        }
      });

      // Reset button event
      const resetBtn = document.getElementById('reset-filters-btn');
      if (resetBtn) {
        resetBtn.onclick = () => {
          this.resetWarFilters();
        };
      }
    }

    updateFilterUI() {
      // Update checkboxes
      const checkboxes = {
        'filter-online': this.warFilters.activity.online,
        'filter-idle': this.warFilters.activity.idle,
        'filter-offline': this.warFilters.activity.offline,
        'filter-okay': this.warFilters.status.okay,
        'filter-hospital': this.warFilters.status.hospital,
        'filter-abroad': this.warFilters.status.abroad,
        'filter-traveling': this.warFilters.status.traveling,
        'filter-jail': this.warFilters.status.jail,
        'filter-federal': this.warFilters.status.federal
      };

      Object.entries(checkboxes).forEach(([id, checked]) => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = checked;
      });

      // Update level inputs
      const minLevel = document.getElementById('filter-level-min');
      const maxLevel = document.getElementById('filter-level-max');
      if (minLevel) minLevel.value = this.warFilters.level.min;
      if (maxLevel) maxLevel.value = this.warFilters.level.max;
    }

    applyWarFilters() {
      // Collect current filter values
      this.warFilters.activity.online = document.getElementById('filter-online')?.checked || false;
      this.warFilters.activity.idle = document.getElementById('filter-idle')?.checked || false;
      this.warFilters.activity.offline = document.getElementById('filter-offline')?.checked || false;

      this.warFilters.status.okay = document.getElementById('filter-okay')?.checked || false;
      this.warFilters.status.hospital = document.getElementById('filter-hospital')?.checked || false;
      this.warFilters.status.abroad = document.getElementById('filter-abroad')?.checked || false;
      this.warFilters.status.traveling = document.getElementById('filter-traveling')?.checked || false;
      this.warFilters.status.jail = document.getElementById('filter-jail')?.checked || false;
      this.warFilters.status.federal = document.getElementById('filter-federal')?.checked || false;

      this.warFilters.level.min = parseInt(document.getElementById('filter-level-min')?.value) || 1;
      this.warFilters.level.max = parseInt(document.getElementById('filter-level-max')?.value) || 100;

      // Save filters
      this.saveWarFilters(this.warFilters);

      // Re-display both tables with filters applied
      this.applyFiltersToTables();
    }

    resetWarFilters() {
      this.warFilters = this.getDefaultFilters();
      this.saveWarFilters(this.warFilters);
      this.updateFilterUI();
      this.applyFiltersToTables();
    }

    applyFiltersToTables() {
      // Force re-render because filters have changed
      this.isForceRenderFilters = true;

      // Re-display targets table if we have targets
      // First check if we have unfiltered targets stored
      if (this.allTargetsUnfiltered && this.allTargetsUnfiltered.length > 0) {
        this.displayTargets(this.allTargetsUnfiltered);
      } else if (this.currentTargets && this.currentTargets.size > 0) {
        // Fallback: if no unfiltered targets but we have current targets, use them
        // This ensures the filter works even if allTargetsUnfiltered wasn't initialized
        const targetsArray = Array.from(this.currentTargets.values());
        this.displayTargets(targetsArray);
      }

      // Re-display faction table if we have faction data
      if (this.cachedFactionData) {
        this.displayWarFactionMembers(this.cachedFactionData);
      }
    }

    passesFilters(member) {
      // Check if warFilters is properly initialized
      if (!this.warFilters || !this.warFilters.level) {
        return true;
      }

      // Debug first member only to avoid spam
      if (!this._debuggedFirstMember) {
      
        this._debuggedFirstMember = true;
      }

      // Level filter
      const level = member.level || 0;
      if (level < this.warFilters.level.min || level > this.warFilters.level.max) {
        return false;
      }

      // Status filter - handle both string and object status
      let statusString = "";
      if (typeof member.status === 'string') {
        statusString = member.status;
      } else if (member.status && member.status.text) {
        statusString = member.status.text;
      } else if (member.status && member.status.state) {
        statusString = member.status.state;
      } else if (member.status && member.status.description) {
        statusString = member.status.description;
      } else {
        statusString = "Unknown";
      }

      const statusLower = statusString.toLowerCase();

      let statusMatches = false;
      if ((statusLower === "okay" || statusLower.includes("okay")) && this.warFilters.status.okay) statusMatches = true;
      if (statusLower.includes("hospital") && this.warFilters.status.hospital) statusMatches = true;
      if (statusLower.includes("abroad") && this.warFilters.status.abroad) statusMatches = true;
      if (statusLower.includes("traveling") && this.warFilters.status.traveling) statusMatches = true;
      if (statusLower.includes("jail") && this.warFilters.status.jail) statusMatches = true;
      if (statusLower.includes("federal") && this.warFilters.status.federal) statusMatches = true;

      // If status is unknown or doesn't match any filter, check if any status filter is enabled
      if (!statusMatches) {
        // Check if all status filters are disabled (would block everything)
        const anyStatusEnabled = Object.values(this.warFilters.status).some(v => v);
        if (!anyStatusEnabled) {
          statusMatches = true; // If no status filters active, allow all
        } else {
          return false;
        }
      }

      // Activity filter (based on last_action.status)
      const anyActivityEnabled = Object.values(this.warFilters.activity).some(v => v);
      if (anyActivityEnabled) {
        // Only check activity if at least one activity filter is enabled
        const lastAction = member.last_action;
        if (lastAction && typeof lastAction === 'object') {
          let activityMatches = false;

          // Use the actual status from last_action
          const activityStatus = lastAction.status?.toLowerCase() || 'offline';

          if (activityStatus === 'online' && this.warFilters.activity.online) {
            activityMatches = true;
          } else if (activityStatus === 'idle' && this.warFilters.activity.idle) {
            activityMatches = true;
          } else if (activityStatus === 'offline' && this.warFilters.activity.offline) {
            activityMatches = true;
          }

          if (!activityMatches) {
            return false;
          }
        } else {
          // If no last_action data, assume offline
          if (!this.warFilters.activity.offline) return false;
        }
      }
      // If no activity filters are enabled, don't filter by activity

      const result = true;
      return result;
    }

    loadCachedTargets(warId) {
      const cachedTargets = localStorage.getItem(
        `${CONFIG.targetsStorageKey}_${warId}`
      );
      const cacheTime = localStorage.getItem(
        `${CONFIG.targetsCacheTimeKey}_${warId}`
      );

      if (cachedTargets && cacheTime) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        const maxAge = CONFIG.targetsCacheExpiryMinutes * 60 * 1000;

        if (cacheAge < maxAge) {
          try {
            const targets = JSON.parse(cachedTargets);
            return targets;
          } catch (error) {
            console.error(
              "[War Calling] Failed to parse cached targets:",
              error
            );
          }
        }
      }

      return null;
    }

    saveTargetsToCache(warId, targets) {
      if (warId && targets) {
        localStorage.setItem(
          `${CONFIG.targetsStorageKey}_${warId}`,
          JSON.stringify(targets)
        );
        localStorage.setItem(
          `${CONFIG.targetsCacheTimeKey}_${warId}`,
          Date.now().toString()
        );

        // Performance optimization: Pre-warm BSP data cache in background
        this.preloadBSPDataForTargets(targets);
      }
    }

    // Pre-load BSP data for targets to improve performance
    async preloadBSPDataForTargets(targets) {
      if (!targets || targets.length === 0) return;

      // Only preload for targets that don't have cached BSP data
      const uncachedTargets = targets.filter(target => {
        const cachedData = this.getBSPDataFromCache(target.user_id);
        return !cachedData;
      });

      if (uncachedTargets.length === 0) return;

      // Preload BSP data in background with delay to not impact UI performance
      setTimeout(() => {
        this.updateBSPDataAsync(uncachedTargets.slice(0, 5)); // Only first 5 targets
      }, 2000); // 2 second delay
    }

    // Alias for consistency
    cacheTargets(warId, targets) {
      this.saveTargetsToCache(warId, targets);
    }


    loadCachedWarStatus() {
      const cachedStatus = GM_getValue(CONFIG.warStatusStorageKey);
      const cacheTime = GM_getValue(CONFIG.warStatusCacheTimeKey);

      if (cachedStatus && cacheTime) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        const maxAge = CONFIG.warStatusCacheExpiryMinutes * 60 * 1000;

        if (cacheAge < maxAge) {
          try {
            const warStatus =
              typeof cachedStatus === "string"
                ? JSON.parse(cachedStatus)
                : cachedStatus;
            return warStatus;
          } catch (error) {
            console.error(
              "[War Calling] Failed to parse cached war status:",
              error
            );
          }
        } else {
        }
      } else {
      }

      return null;
    }

    saveWarStatusToCache(warStatus) {
      if (warStatus) {
        GM_setValue(CONFIG.warStatusStorageKey, JSON.stringify(warStatus));
        GM_setValue(CONFIG.warStatusCacheTimeKey, Date.now().toString());
      }
    }

    cacheWarStatus(warStatus) {
      // Alias method for consistency
      this.saveWarStatusToCache(warStatus);
    }

    // Check for updates from Supabase
    async checkUpdateFromSupabase() {
      try {
        const url = `${CONFIG.supabase.url}/rest/v1/war_script_version?select=version&order=created_at.desc&limit=1`;

        const headers = {
          apikey: CONFIG.supabase.anonKey,
          Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          "Accept-Profile": "public",
        };

        const response = await customFetch(url, {
          method: "GET",
          headers: headers,
        });

        if (response.ok) {
          const responseText = await response.text();

          if (!responseText) {
            return false;
          }

          const result = JSON.parse(responseText);

          if (result && result[0] && result[0].version) {
            const latestVersion = result[0].version;
            const currentVersion = getCurrentScriptVersion();

            if (latestVersion && currentVersion) {
              const comparison = compareVersions(latestVersion, currentVersion);
              const updateRequired = comparison > 0;
              return updateRequired;
            }
          }
        } else {
          console.error(
            "[Version Check] Request failed:",
            response.status,
            response.statusText
          );
        }
        return false;
      } catch (error) {
        console.error("[Version Check] Error checking for updates:", error);
        return false;
      }
    }

    // Check if update is required with caching
    async isUpdateRequired() {
      if (this.versionCheckCache !== null) {
        return this.versionCheckCache;
      }

      if (this.versionCheckPromise) {
        return await this.versionCheckPromise;
      }

      this.versionCheckPromise = this.checkUpdateFromSupabase().then(
        (result) => {
          this.versionCheckCache = result;
          this.versionCheckPromise = null;
          return result;
        }
      );

      return await this.versionCheckPromise;
    }

    // Initialize version check at startup
    async initializeVersionCheck() {
      try {
        const updateRequired = await this.isUpdateRequired();
        this.isUpdateRequired = updateRequired;
        if (updateRequired) {
          this.createUpdateInterface();
          return true; // Signal that update interface was created
        } else {
        }
      } catch (error) {
        console.error("[Version Check] Error checking for updates:", error);
        this.isUpdateRequired = false;
      }
      return false;
    }

    // Create update interface when script is outdated
    createUpdateInterface() {
      // Use the same logic as the normal interface to find target location
      let targetLocation = this.findTargetLocation();

      // Fallback if we can't find the specific location
      if (!targetLocation) {
        targetLocation = document.querySelector("#faction-main");
        if (!targetLocation) {
          targetLocation = document.querySelector("body");
        }
      }
      if (!targetLocation) return;

      const container = document.createElement("div");
      container.id = "war-calling-update-container";
      container.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
                    border: 2px solid #444;
                    border-radius: 10px;
                    padding: 0;
                    margin: 10px 0;
                    font-family: 'Arial', sans-serif;
                    color: white;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                    position: relative;
                    overflow: hidden;
                ">
                    <!-- Header with blinking update tab -->
                    <div style="
                        display: flex;
                        border-bottom: 1px solid #222222;
                        background: #2a2a2a;
                        border-radius: 5px 5px 0 0;
                    ">
                        <button id="tab-update" class="war-tab update-tab" style="
                            padding: 0;
                            height: 36px;
                            background: linear-gradient(135deg, #ff4444, #cc0000);
                            color: white;
                            border: none;
                            border-radius: 5px 5px 0 0;
                            cursor: pointer;
                            font-size: 14px;
                            width: 100%;
                            font-weight: bold;
                            animation: updatePulse 1.5s ease-in-out infinite;
                            box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">⚠️ Update Script</button>
                    </div>

                    <!-- Update content -->
                    <div id="tab-content-update" style="
                        display: block;
                        padding: 15px;
                        text-align: center;
                    ">

                            <button id="download-update-btn" style="
                                padding: 12px 24px;
                                background: white;
                                color: #cc0000;
                                border: none;
                                border-radius: 6px;
                                font-size: 14px;
                                font-weight: bold;
                                cursor: pointer;
                                transition: all 0.3s ease;
                                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                Download Update
                            </button>

                        <div style="
                            background: rgba(74, 144, 226, 0.1);
                            border-left: 4px solid #4a90e2;
                            border-radius: 0 5px 5px 0;
                            padding: 10px;
                            margin-top: 15px;
                        ">
                            <div style="font-size: 12px; color: #ccc; line-height: 1.4;">
                                <strong>Current Version:</strong> ${getCurrentScriptVersion()} •
                                <strong>Author:</strong>
                                <a href="https://www.torn.com/profiles.php?XID=2353554" target="_blank" style="color: #4a90e2; text-decoration: none; font-weight: bold;" onmouseover="this.style.color='#6cb0ff'" onmouseout="this.style.color='#4a90e2'">JESUUS [2353554]</a>
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    @keyframes updatePulse {
                        0% {
                            background: linear-gradient(135deg, #ff4444, #cc0000);
                            box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
                        }
                        50% {
                            background: linear-gradient(135deg, #ff6666, #ff4444);
                            box-shadow: 0 0 20px rgba(255, 68, 68, 0.8);
                        }
                        100% {
                            background: linear-gradient(135deg, #ff4444, #cc0000);
                            box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
                        }
                    }
                </style>
            `;

      // Insert the container using the same logic as the normal interface
      if (targetLocation.classList && (targetLocation.classList.contains("desc-wrap") || targetLocation.classList.contains("faction-war-info") || targetLocation.classList.contains("descriptions"))) {
        // Insert at the beginning of war description area or descriptions li
        targetLocation.insertAdjacentElement("afterbegin", container);
      } else if (
        targetLocation.parentNode &&
        targetLocation.parentNode.id === "faction-main"
      ) {
        targetLocation.parentNode.insertBefore(container, targetLocation);
      } else if (targetLocation.id === "faction-main") {
        targetLocation.insertAdjacentElement("afterbegin", container);
      } else {
        targetLocation.insertAdjacentElement("afterbegin", container);
      }

      // Add click handler for download button
      document
        .getElementById("download-update-btn")
        ?.addEventListener("click", () => {
          window.open(
            "https://greasyfork.org/en/scripts/540527-c-a-t-combat-assistance-toolkit",
            "_blank"
          );
        });
    }

    // ========================================
    // INITIALIZATION
    // ========================================
    async init() {

      // Check page location first - if not valid, exit immediately
      const pageLocationValid = this.checkPageLocation();
      if (!pageLocationValid) {
        return;
      }

      // Get basic user info from DOM immediately (no async calls)
      this.getBasicUserInfo();

      // Load instant cache before UI injection
      this.loadInstantCache();

      // Inject UI IMMEDIATELY without waiting for anything
      this.injectUI();

      // Do all heavy lifting in background after UI is injected
      this.initializeBackground();
    }

    // Load essential cache synchronously for instant display
    loadInstantCache() {
      try {
        // Load API keys immediately (no async needed)
        this.apiKey = localStorage.getItem(CONFIG.apiKeyStorageKey) || "";
        this.tornStatsKey = localStorage.getItem(CONFIG.tornStatsKeyStorageKey) || this.apiKey || "";

        // Load war status from cache immediately
        const cachedWarStatus = this.loadCachedWarStatus();
        if (cachedWarStatus) {
          this.currentWar = cachedWarStatus.war;
          this.warActive = cachedWarStatus.active;
        }

        // Load sort configs (sync operations)
        this.sortConfig = this.loadSortConfig();
        this.factionSortConfig = this.loadFactionSortConfig();
        this.warFilters = this.loadWarFilters();


      } catch (error) {
        // Silent fail to not block startup
      }
    }

    // Synchronous user info extraction from DOM only
    getBasicUserInfo() {
      try {
        // Get user ID from settings menu
        const settingsMenu = document.querySelector(
          '#sidebarroot a[href^="/profiles.php?XID="]'
        );
        if (settingsMenu) {
          const userMatch = settingsMenu.href.match(/XID=(\d+)/);
          if (userMatch) {
            this.userId = parseInt(userMatch[1]);
          }
        }

        // Alternative: get from window.userdata if available
        if (!this.userId && window.userdata) {
          this.userId = window.userdata.player_id;
        }

        // Get faction ID from DOM
        const factionInfoWrap = document.querySelector(".faction-info-wrap");
        if (factionInfoWrap) {
          const factionIdMatch =
            factionInfoWrap.textContent.match(/Faction\s*#(\d+)/);
          if (factionIdMatch) {
            this.factionId = parseInt(factionIdMatch[1]);
          }
        }

        // Method 2: From faction title
        if (!this.factionId) {
          const factionTitle = document.querySelector(
            ".faction-title, .title-black"
          );
          if (factionTitle) {
            const match = factionTitle.textContent.match(/#(\d+)/);
            if (match) {
              this.factionId = parseInt(match[1]);
            }
          }
        }

        // Method 3: From any element containing faction ID
        if (!this.factionId) {
          const allText = document.body.innerText;
          const factionMatch = allText.match(/Your faction[^#]*#(\d+)/i);
          if (factionMatch) {
            this.factionId = parseInt(factionMatch[1]);
          }
        }
      } catch (error) {
        console.error("[C.A.T] Failed to get basic user info:", error);
      }
    }

    // All async/heavy operations moved here - runs after UI injection
    async initializeBackground() {
      try {

        // API keys already loaded in loadInstantCache()

        // Only do expensive operations if we have user info
        if (this.userId && this.factionId) {
          // Background operations - non-blocking
          this.registerUserInDatabase().catch(error => {
          });

          this.registerFactionForXanaxMonitoring().catch(error => {
          });

          this.loadScriptUsers(); // Don't await
        }

        // Skip preload on fast refresh
        setTimeout(() => {
          if (!document.hidden && performance.now() > 8000) {
            this.preloadCache();
          }
        }, 5000);

        // Defer version check to not block startup
        setTimeout(() => {
          this.initializeVersionCheck().then(updateRequired => {
            if (updateRequired) {
              // Update interface will be handled by the version check function
            }
          }).catch(error => {});
        }, 10000);

        // Sort configs already loaded in loadInstantCache()

        // Defer war status check completely
        setTimeout(() => {
          this.checkWarStatus().catch(error => {});
        }, 3000);

        // Start sync monitoring after longer delay
        setTimeout(() => {
          this.startSyncMonitoring();
          this.initializeWarFilters();
        }, 5000);

        this.setupAttackTracking();
        this.isInitialized = true;

      } catch (error) {
        console.error("[C.A.T] Background initialization failed:", error);
      }
    }

    checkPageLocation() {
      const url = window.location.href;
      return (
        url.includes("factions.php?step=your") ||
        url.includes("factions.php?step=profile") ||
        url.includes("factions.php#/tab=info") ||
        url.includes("factions.php#/")
      );
    }

    getInitialWarStatus() {
      // Check if API key is configured
      if (!this.apiKey) {
        return `
          <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255, 102, 102, 0.1); border-left: 4px solid #ff6666; border-radius: 5px;">
            <span style="font-size: 24px;">🔑</span>
            <div>
              <div style="color: #ff6666; font-weight: bold; margin-bottom: 3px;">No API Key</div>
              <div style="font-size: 11px; color: #888;">Please add your Torn API key in Settings to enable war detection</div>
            </div>
          </div>
        `;
      }

      // Check if we have cached war status
      const cachedWarStatus = this.loadCachedWarStatus();

      // If we have cache and a war is active, don't show loading message
      if (cachedWarStatus && cachedWarStatus.war) {
        return ''; // Empty - will be updated by checkWarStatus with actual data
      }

      // Don't show "Ready for War" prematurely - wait for real war check
      return `
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(74, 144, 226, 0.1); border-left: 4px solid #4a90e2; border-radius: 5px;">
          <span style="font-size: 24px;">⚔️</span>
          <div>
            <div style="color: #4a90e2; font-weight: bold; margin-bottom: 3px;">C.A.T Loading</div>
            <div style="font-size: 11px; color: #888;">Checking for active wars...</div>
          </div>
        </div>
      `;
    }

    getCompactInitialStatus() {
      // Check if API key is configured
      if (!this.apiKey) {
        return `<span style="color: #ff6666;">🔑 No API Key - Add in Settings</span>`;
      }

      // Check if we have cached war status
      const cachedWarStatus = this.loadCachedWarStatus();

      // If we have cache and a war is active, show the actual war info immediately
      if (cachedWarStatus && cachedWarStatus.war && cachedWarStatus.war_details) {
        let warDescription = "Active War";

        if (cachedWarStatus.war_details.factions) {
          const factionNames = Object.values(cachedWarStatus.war_details.factions).map(f => f.name);
          if (factionNames.length >= 2) {
            // Store faction names for table titles
            const factionIds = Object.keys(cachedWarStatus.war_details.factions).map(id => parseInt(id));
            const myFactionIndex = factionIds.findIndex(id => id === this.factionId);
            const enemyFactionIndex = myFactionIndex === 0 ? 1 : 0;

            this.myFactionName = factionNames[myFactionIndex] || factionNames[0];
            this.enemyFactionName = factionNames[enemyFactionIndex] || factionNames[1];

            // Return inline format
            warDescription = `
              <div style="text-align: center;">
                <span style="color: #4a90e2; font-size: 13px;">${this.myFactionName}</span>
                <span style="color: #ccc; font-size: 13px; margin: 0 4px;">vs</span>
                <span style="color: #e74c3c; font-size: 13px;">${this.enemyFactionName}</span>
              </div>
            `;
          }
        } else if (cachedWarStatus.war_details.attacker && cachedWarStatus.war_details.defender) {
          // Store faction names for table titles
          if (cachedWarStatus.war_details.attacker.faction_id === this.factionId) {
            this.myFactionName = cachedWarStatus.war_details.attacker.name;
            this.enemyFactionName = cachedWarStatus.war_details.defender.name;
          } else {
            this.myFactionName = cachedWarStatus.war_details.defender.name;
            this.enemyFactionName = cachedWarStatus.war_details.attacker.name;
          }

          // Return inline format
          warDescription = `
            <div style="text-align: center;">
              <span style="color: #4a90e2; font-size: 13px;">${this.myFactionName}</span>
              <span style="color: #ccc; font-size: 13px; margin: 0 4px;">vs</span>
              <span style="color: #e74c3c; font-size: 13px;">${this.enemyFactionName}</span>
            </div>
          `;
        }

        return warDescription;
      }

      // Don't show premature status - wait for real check
      return '<span style="color: #888;">Loading...</span>';
    }

    getInitialTargetsDisplay() {
      const cachedWarStatus = this.loadCachedWarStatus();
      if (cachedWarStatus && cachedWarStatus.war) {
        const cachedTargets = this.loadCachedTargets(cachedWarStatus.war.war_id);
        if (cachedTargets && cachedTargets.length > 0) {
          return `display: inline;`; // Show targets count immediately
        }
      }
      return 'display: none;';
    }

    getInitialCallsDisplay() {
      const cachedWarStatus = this.loadCachedWarStatus();
      if (cachedWarStatus && cachedWarStatus.war) {
        return `display: inline;`; // Show calls count (even if 0)
      }
      return 'display: none;';
    }

    getInitialTargetsCount() {
      const cachedWarStatus = this.loadCachedWarStatus();
      if (cachedWarStatus && cachedWarStatus.war) {
        const cachedTargets = this.loadCachedTargets(cachedWarStatus.war.war_id);
        if (cachedTargets && cachedTargets.length > 0) {
          return `${cachedTargets.length} targets`;
        }
      }
      return '0 targets';
    }

    getInitialCallsCount() {
      // For now, return 0 calls - will be updated by sync
      return '0 calls';
    }

    async preloadCache() {
      // Only preload if we have API keys and enough time has passed
      if (!this.apiKey || !this.tornStatsKey || document.hidden) {
        return;
      }

      try {
        // Check war status in background
        const cachedWarStatus = this.loadCachedWarStatus();
        if (
          !cachedWarStatus ||
          this.isCacheExpired(
            cachedWarStatus.cacheTime,
            CONFIG.warStatusCacheExpiryMinutes
          )
        ) {
          // Fetch fresh war status
          const response = await customFetch(
            `${CONFIG.supabase.url}/functions/v1/war-detection`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: CONFIG.supabase.anonKey,
                Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              },
              body: JSON.stringify({
                faction_id: this.factionId,
                api_key: this.apiKey,
              }),
            }
          );

          const result = await response.json();
          
          if (result.war_active && result.war_id) {
            // Cache war status
            this.cacheWarStatus({
              war: result,
              war_details: null,
            });

            // Preload targets for this war if not already cached
            const cachedTargets = this.loadCachedTargets(result.war_id);
            if (!cachedTargets) {
              this.preloadWarTargets(result.war_id);
            }
          }
        } else if (
          cachedWarStatus &&
          cachedWarStatus.war &&
          cachedWarStatus.war.war_id
        ) {
          // Check if targets need refresh
          const cachedTargets = this.loadCachedTargets(
            cachedWarStatus.war.war_id
          );
          if (!cachedTargets) {
            this.preloadWarTargets(cachedWarStatus.war.war_id);
          }
        }
      } catch (error) {}
    }

    async preloadWarTargets(warId) {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/functions/v1/get-war-targets`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              war_id: warId,
              api_key: this.apiKey,
              tornstats_key: this.tornStatsKey,
            }),
          }
        );

        const data = await response.json();

        // Check if script is disabled
        if (data.script_disabled) {
          this.displayScriptDisabledMessage(data.message);
          return;
        }

        if (data.success && data.targets) {
          // Cache targets
          this.cacheTargets(warId, data.targets);
        }
      } catch (error) {}
    }

    isCacheExpired(cacheTime, expiryMinutes) {
      if (!cacheTime) return true;
      const cacheAge = Date.now() - parseInt(cacheTime);
      return cacheAge > expiryMinutes * 60 * 1000;
    }

    async checkFactionScriptStatus() {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/factions?faction_id=eq.${this.factionId}&select=hasscriptfactionenabled`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
          }
        );

        if (!response.ok) {
          console.error("[War Calling] Failed to check faction script status");
          return { enabled: true }; // Default to enabled on error
        }

        const data = await response.json();
        if (data && data.length > 0) {
          return { enabled: data[0].hasscriptfactionenabled !== false };
        }

        return { enabled: true }; // Default to enabled if no data
      } catch (error) {
        console.error(
          "[War Calling] Error checking faction script status:",
          error
        );
        return { enabled: true };
      }
    }

    async checkFactionLicense() {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/faction_licenses?faction_id=eq.${this.factionId}&select=*`,
          {
            method: "GET",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          console.error("[War Calling] Failed to check faction license");
          return {
            wars_paid: 0,
            total_xanax_received: 0,
            script_activated_for_next_war: false,
          };
        }

        const licenses = await response.json();
        if (licenses.length > 0) {
          return {
            wars_paid: licenses[0].wars_paid || 0,
            total_xanax_received: licenses[0].total_xanax_received || 0,
            script_activated_for_next_war:
              licenses[0].script_activated_for_next_war || false,
          };
        }

        return {
          wars_paid: 0,
          total_xanax_received: 0,
          script_activated_for_next_war: false,
        };
      } catch (error) {
        console.error("[War Calling] Error checking faction license:", error);
        return {
          wars_paid: 0,
          total_xanax_received: 0,
          script_activated_for_next_war: false,
        };
      }
    }

    loadCachedFactionData() {
      const cachedData = GM_getValue(CONFIG.factionDataStorageKey);
      const cacheTime = GM_getValue(CONFIG.factionDataCacheTimeKey);

      if (cachedData && cacheTime) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        const maxAge = CONFIG.factionDataCacheExpiryMinutes * 60 * 1000;

        if (cacheAge < maxAge) {
          try {
            const factionData =
              typeof cachedData === "string"
                ? JSON.parse(cachedData)
                : cachedData;
            return factionData;
          } catch (error) {
            console.error(
              "[War Calling] Failed to parse cached faction data:",
              error
            );
          }
        } else {
        }
      } else {
      }

      return null;
    }

    saveFactionDataToCache(data) {
      if (data) {
        GM_setValue(CONFIG.factionDataStorageKey, JSON.stringify(data));
        GM_setValue(CONFIG.factionDataCacheTimeKey, Date.now().toString());
      }
    }

    clearFactionDataCache() {
      GM_setValue(CONFIG.factionDataStorageKey, null);
      GM_setValue(CONFIG.factionDataCacheTimeKey, null);
    }


    async registerUserInDatabase() {
      if (!this.userId || !this.factionId) return;

      try {
        const userData = {
          user_id: parseInt(this.userId),
          user_name: this.userName || "Unknown",
          faction_id: parseInt(this.factionId),
          last_seen: new Date().toISOString(),
        };

        // Use the database function to handle upsert properly
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/rpc/get_or_create_user`,
          {
            method: "POST",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_user_id: userData.user_id,
              p_user_name: userData.user_name,
              p_faction_id: userData.faction_id,
              p_role: null,
            }),
          }
        );

        if (response.ok) {
          // User registration successful
        }
      } catch (error) {
        console.error(
          "[C.A.T] Failed to register user in database:",
          error
        );
      }
    }

    async getPDAUserInfo() {
      if (!isTornPDA()) return null;

      return new Promise((resolve, reject) => {
        try {
          window.flutter_inappwebview
            .callHandler("PDA_getUserInfo")
            .then((result) => {
              if (result && (result.player_id || result.playerId)) {
                const userInfo = {
                  player_id: result.player_id || result.playerId,
                  name: result.name || result.username,
                  faction: result.faction || result.factionInfo,
                };
                resolve(userInfo);
              } else {
                resolve(null);
              }
            })
            .catch((error) => {
              resolve(null);
            });
        } catch (syncError) {
          resolve(null);
        }
      });
    }

    // ========================================
    // API KEY MANAGEMENT
    // ========================================
    showApiKeyModal() {
      // Track this modal request persistently
      this.persistentModalRequests.add('apiKey');

      // If interface is minimized, queue the modal for later
      if (this.isMinimized) {
        this.pendingModals.push(() => this.actuallyShowApiKeyModal());
        return;
      }

      this.actuallyShowApiKeyModal();
    }

    actuallyShowApiKeyModal() {
      const modal = document.createElement("div");
      modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #333333;
                border: 1px solid #333;
                padding: 20px;
                border-radius: 5px;
                z-index: 10000;
                box-shadow: 0 0 20px rgba(0,0,0,0.8);
            `;

      modal.innerHTML = `
                <h3 style="margin: 0 0 15px 0; color: #fff;">🔑 API Key Required</h3>
                <div style="margin-bottom: 15px;">
                    <label style="color: #fff; font-size: 14px; margin-bottom: 5px; display: block;">Torn API Key:</label>
                    <div style="background: #1a1a1a; padding: 12px; border-radius: 5px; margin-bottom: 10px; border-left: 3px solid #4a90e2;">
                        <p style="color: #4a90e2; font-size: 13px; margin: 0 0 5px 0; font-weight: bold;">💡 Same as TornStats!</p>
                        <p style="color: #ccc; font-size: 12px; margin: 0 0 5px 0;">
                            Use the <strong>same API key</strong> you already use for TornStats.
                        </p>
                        <p style="color: #888; font-size: 11px; margin: 0;">
                            No need to create a new one - your existing TornStats key works perfectly!
                        </p>
                    </div>
                    <p style="color: #ccc; font-size: 12px; margin: 0 0 5px 0;">
                        Don't have one? Get it from <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" style="color: #4a90e2;">Torn Preferences</a>
                    </p>
                    <p style="color: #888; font-size: 11px; margin: 0 0 8px 0;">
                        This key is saved locally and never shared.
                    </p>
                    <input type="text" id="tornApiKeyInput" placeholder="Paste your API Key you use for Tornstats here" value="${this.apiKey}" style="
                        width: 300px;
                        padding: 8px;
                        background: #2a2a2a;
                        border: 1px solid #444;
                        color: #fff;
                        border-radius: 3px;
                        margin-bottom: 10px;
                    ">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="saveApiKey" style="
                        padding: 8px 16px;
                        background: #4a90e2;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                    ">Save</button>
                    <button id="cancelApiKey" style="
                        padding: 8px 16px;
                        background: #666;
                        color: white;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                    ">Cancel</button>
                </div>
            `;

      document.body.appendChild(modal);

      document.getElementById("saveApiKey").onclick = async () => {
        const tornKey = document.getElementById("tornApiKeyInput").value.trim();

        if (!tornKey) {
          alert("Please enter your Torn API key");
          return;
        }

        // Show validation in progress
        const saveButton = document.getElementById("saveApiKey");
        const originalText = saveButton.textContent;
        saveButton.textContent = "Validating...";
        saveButton.disabled = true;

        try {
          // Validate with Torn API first
          const tornResponse = await customFetch(`https://api.torn.com/v2/user?selections=profile&key=${tornKey}`);
          if (!tornResponse.ok) {
            throw new Error("Invalid Torn API key");
          }
          const userData = await tornResponse.json();

          // Validate with Torn API v2
          const factionId = userData.profile?.faction_id || userData.faction?.faction_id || 1;
          const tornValidationResponse = await customFetch(`https://api.torn.com/v2/faction/${factionId}?selections=profile&key=${tornKey}`);

          let tornValid = false;
          if (tornValidationResponse.ok) {
            tornValid = true;
          } else if (tornValidationResponse.status === 404) {
            // 404 is OK - means faction not accessible, but key is valid
            const errorText = await tornValidationResponse.text();
            if (errorText.includes('Faction not found')) {
              tornValid = true; // Key format is valid, just not accessible
            }
          }

          if (!tornValid) {
            throw new Error("API key validation with Torn API failed");
          }

          // Save the validated key
          localStorage.setItem(CONFIG.apiKeyStorageKey, tornKey);
          localStorage.setItem(CONFIG.tornStatsKeyStorageKey, tornKey);
          this.apiKey = tornKey;
          this.tornStatsKey = tornKey;

          // Stop blinking when API key is configured
          const settingsTab = document.getElementById("tab-settings");
          if (settingsTab) {
            this.stopSettingsTabBlink(settingsTab);
          }

          modal.remove();
          this.init();

        } catch (error) {
          console.error("API key validation failed:", error);
          alert(`API key validation failed: ${error.message}\n\nPlease check that your API key is correct and that you have access to TornStats.`);

          // Reset button
          saveButton.textContent = originalText;
          saveButton.disabled = false;
        }
      };

      document.getElementById("cancelApiKey").onclick = () => {
        modal.remove();
      };
    }

    showSetupInstructions() {
      const statusElement = document.getElementById("war-status");
      if (statusElement) {
        statusElement.innerHTML = `
                    <span style="color: #ff9900;">⚠️ Edge functions not deployed</span><br>
                    <span style="color: #ccc; font-size: 12px;">
                        Please deploy the Supabase functions first. Check console for details.
                    </span>
                `;
      }
    }

    // ========================================
    // WAR MONITORING
    // ========================================
    async checkWarStatus() {
      // Prevent concurrent war checks to avoid loops on TornPDA
      if (this.isCheckingWarStatus) {
        return;
      }
      
      this.isCheckingWarStatus = true;
      
      try {
        if (!this.apiKey) {
          this.updateWarUI(null, "🔑 No API Key - Please add your Torn API key in Settings to enable war detection");
          return;
        }

        // Load cached war status first for instant UI
        const cachedWarStatus = this.loadCachedWarStatus();
        if (cachedWarStatus) {
          this.currentWar = cachedWarStatus.war;
          this.updateWarUI(cachedWarStatus.war_details, null, true); // true = from cache

          // Even if cache shows no war, continue to update the UI with xanax info
          // Don't return early anymore
        }

        // Get user info from Torn API (if missing userId or userName)
        if (
        (!this.userId ||
          !this.userName ||
          this.userName === "Unknown" ||
          !this.factionId) &&
        this.apiKey
      ) {
          try {
            const userUrl = `https://api.torn.com/v2/user?selections=profile&key=${this.apiKey}`;

            const userResponse = await customFetch(userUrl);

            if (userResponse.ok) {
              const userData = await userResponse.json();

              if (userData.error) {
                console.error(
                  "[War Calling] Torn API error:",
                  JSON.stringify(userData.error, null, 2)
                );
              } else {
                // Extract user info
                if (userData.player_id) {
                  this.userId = userData.player_id;
                  this.userName = userData.name;
                } else if (userData.profile && userData.profile.id) {
                  this.userId = userData.profile.id;
                  this.userName = userData.profile.name;
                }

                // Extract faction info - try both possible locations
                if (userData.profile && userData.profile.faction_id) {
                  this.factionId = userData.profile.faction_id;
                } else if (userData.faction && userData.faction.faction_id) {
                  this.factionId = userData.faction.faction_id;
                }

                if (this.userId && this.factionId) {
                  this.saveUserInfoToCache();
                }
              }
            } else {
              const errorText = await userResponse.text();
              console.error(
                "[War Calling] API call failed:",
                userResponse.status,
                errorText
              );
            }
          } catch (error) {
            console.error(
              "[War Calling] Failed to get user info from API:",
              error
            );
          }
        }

        // Fallback to known faction ID if detection failed
        if (!this.factionId && this.userId === 2353554) {
        this.factionId = 46666;
        this.saveUserInfoToCache(); // Save fallback to cache too
      }

        // Fallback for username if still null
        if (!this.userName && this.userId === 2353554) {
        this.userName = "Unknown";
        this.saveUserInfoToCache();
      }

        if (!this.factionId) {
          console.error("[War Calling] Still no faction ID, cannot continue");
          this.updateWarUI(null, "Could not determine faction ID");
          return;
        }

        if (!this.tornStatsKey) {
          console.error("[War Calling] TornStats API key not found, cannot check war status");
          this.updateWarUI(null, "TornStats API key required for war detection");
          return;
        }

        try {
          // Validate TornStats API key before making request
          if (!this.tornStatsKey || this.tornStatsKey.trim() === '') {
            console.warn("[War Calling] TornStats API key not configured");
            return;
          }

          const response = await customFetch(
            `${CONFIG.supabase.url}/functions/v1/war-detection`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: CONFIG.supabase.anonKey,
                Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              },
              body: JSON.stringify({
                faction_id: this.factionId,
                api_key: this.tornStatsKey,
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error("War detection response:", response.status, errorText);

            // Handle TornStats access errors gracefully
            if (response.status === 500 && (errorText.includes('TornStats API Key Error') || errorText.includes('User not found'))) {
              console.info("[War Calling] TornStats access issue - user may not be registered with TornStats or lacks faction access permissions.");
              // Show friendly message instead of error
              this.updateWarUI(null, "TornStats access unavailable - war detection limited");
              return;
            }

            // Show setup instructions if edge functions not deployed
            if (response.status === 404) {
              this.showSetupInstructions();
              return;
            }
            throw new Error(`War detection failed: ${response.status}`);
          }

          const data = await response.json();
          
          if (data.war_details) {
          }

          if (
            data.status === "new_war_detected" ||
            data.status === "war_active" ||
            data.status === "war_scheduled"
          ) {
            this.currentWar = data.war;

            // Save war status to cache
            this.saveWarStatusToCache({
              war: data.war,
              war_details: data.war_details,
            });

            // Sync active calls immediately when war is detected - REPLACED by unified sync
            // await this.syncActiveCalls();

            this.updateWarUI(data.war_details);
          } else {
            this.currentWar = null;

            // Save "no war" status to cache
            this.saveWarStatusToCache({
              war: null,
              war_details: null,
            });

            this.updateWarUI(null);
          }
        } catch (error) {
          console.error("War check error:", error);
          this.updateWarUI(null, error.message);
        }
      } finally {
        this.isCheckingWarStatus = false;
      }
    }

    startWarMonitoring() {
      this.warCheckTimer = setInterval(() => {
        this.checkWarStatus();
      }, CONFIG.warCheckInterval);
      
      // Start chain DOM observer for real-time updates
      this.startChainDOMObserver();
    }

    // ========================================
    // SYNC MONITORING
    // ========================================
    async syncUpdates() {
      if (!this.currentWar || !this.factionId) {
        return;
      }

      // Check circuit breaker before making request
      if (this.circuitBreakerOpen) {
        return;
      }

      try {
        const url = `${CONFIG.supabase.url}/functions/v1/sync-updates`;
        const body = {
          war_id: this.currentWar.war_id,
          faction_id: this.factionId,
          since: this.lastSync.toISOString(),
        };

        const response = await customFetch(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[War Calling] Sync failed:", response.status, errorText);
          throw new Error("Sync failed");
        }

        const data = await response.json();
        const updates = data.updates || [];

        this.processUpdates(updates);
        this.lastSync = new Date(data.server_timestamp);
      } catch (error) {
        console.error("[War Calling] Sync error:", error);
      }
    }

    processUpdates(updates) {
      updates.forEach((update) => {
        const targetId = String(update.target_id);

        switch (update.update_type) {
          case "call":
            // Enrich metadata with missing fields from current target data
            const target = this.currentTargets.get(targetId);
            const enrichedMetadata = {
              ...update.metadata,
              target_level: target?.level || update.metadata.target_level || 0,
              target_status: target?.status?.text || target?.status?.state || update.metadata.target_status || "Unknown"
            };

            this.activeCalls.set(targetId, enrichedMetadata);
            this.updateCallUI(targetId, true, enrichedMetadata);
            break;
          case "uncall":
            const hadCall = this.activeCalls.has(targetId);
            this.activeCalls.delete(targetId);
            this.updateCallUI(targetId, false);
            break;
          case "war_start":
            this.checkWarStatus();
            break;
          case "war_end":
            this.currentWar = null;
            this.activeCalls.clear();
            this.updateWarUI(null);
            break;
        }
      });
    }

    startSyncMonitoring() {

      // DISABLED OLD SYNC - using unified sync now
      // this.syncUpdates();
      // this.syncTimer = setInterval(() => {
      //   this.syncUpdates();
      // }, CONFIG.syncInterval);

      // UNIFIED: Use single API call every 1 second for enemy data
      this.activeSyncTimer = setInterval(() => {
        if (!this.isSyncingCalls && this.currentWar && this.factionId && this.tornStatsKey) {
          this.syncUnifiedWarData();
        }
      }, CONFIG.syncInterval);

      // Own faction data every 5 seconds
      this.ownFactionSyncTimer = setInterval(() => {
        if (this.currentWar && this.factionId && this.apiKey) {
          this.updateFactionTable();
        }
      }, CONFIG.ownFactionRefreshInterval);

      // Critical status checking disabled to preserve API calls
      // Main sync already checks every 1 second via backend

      // Update user's last seen every 5 minutes
      this.updateLastSeenTimer = setInterval(() => {
        // Only update if we have valid user data
        if (this.userId && this.factionId && !isNaN(parseInt(this.userId))) {
          this.updateUserLastSeen();
        }
      }, 5 * 60 * 1000);
    }

    async syncUnifiedWarData() {
      try {
        if (!this.currentWar || !this.factionId) return;

        // Check circuit breaker before making request
        if (this.circuitBreakerOpen) {
          return;
        }

        // Prevent concurrent sync calls
        if (this.isSyncingCalls) return;
        this.isSyncingCalls = true;

        // Get targets from intercepted data or DOM
        const domTargets = this.getEnemyTargetsFromInterceptedData();

        // Simulate the API response structure with DOM data
        const data = {
          active_calls: [],
          targets: domTargets,
          available_targets_count: domTargets.length,
          success: true
        };

        // Get active calls separately (if API key available)
        if (this.apiKey && this.apiKey.trim() !== "") {
          try {
            const callsResponse = await customFetch(`${CONFIG.supabase.url}/functions/v1/call-management`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: CONFIG.supabase.anonKey,
                Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              },
              body: JSON.stringify({
                action: "get_calls",
                war_id: this.currentWar.war_id,
                faction_id: this.factionId,
              }),
            });

            if (callsResponse.ok) {
              const callsData = await callsResponse.json();
              data.active_calls = callsData.calls || [];
            }
          } catch (error) {
            console.warn("[C.A.T] Could not fetch active calls in sync:", error);
          }
        }


        // Update active calls - this replaces syncActiveCalls
        if (data.active_calls) {
          // Store old active calls to detect removed calls
          const oldActiveCalls = new Map(this.activeCalls);

          this.activeCalls.clear();
          data.active_calls.forEach((call) => {
            // Ensure target_id is treated as string to match DOM attributes and old sync system
            const targetIdStr = String(call.target_id);
            this.activeCalls.set(targetIdStr, {
              caller_name: call.caller_name,
              target_name: call.target_name,
              target_level: call.target_level,
              target_status: call.target_status,
            });
            this.updateCallUI(targetIdStr, true, call);
          });

          // Update UI for targets that are no longer called (uncalled targets)
          oldActiveCalls.forEach((callData, targetId) => {
            if (!this.activeCalls.has(targetId)) {
              this.updateCallUI(targetId, false);
            }
          });

          // Update compact info bar with new call count
          this.updateCompactInfo();

          // Force UI update for all active calls (ensures buttons show caller names)
          this.activeCalls.forEach((callData, targetId) => {
            this.updateCallUI(targetId, true, callData);
          });
        }

        // Update targets data - this replaces getWarTargets
        if (data.targets) {
          // Update target data and refresh status indicators
          data.targets.forEach(target => {
            // Ensure target user_id is treated as string for consistency
            const targetIdStr = String(target.user_id);
            const oldTarget = this.currentTargets.get(targetIdStr);

            // Update target object with string ID
            const updatedTarget = { ...target, user_id: targetIdStr };
            this.currentTargets.set(targetIdStr, updatedTarget);

            // Update status indicators if target data changed
            if (oldTarget && this.hasTargetChanged(oldTarget, updatedTarget)) {
              const targetRow = document.querySelector(`tr[data-target-id="${targetIdStr}"]`);
              if (targetRow) {
                this.updateTargetRow(targetRow, updatedTarget);
              }
            }
          });

          // Targets display is handled by loadTargets() cache system
          // No need to rebuild UI here as it causes duplication

          // Update cache with fresh target data
          const targetsArray = Array.from(this.currentTargets.values());
          if (targetsArray.length > 0 && this.currentWar) {
            this.saveTargetsToCache(this.currentWar.war_id, targetsArray);
          }
        }

        // Faction data is now updated by separate timer (every 5 seconds)

        this.lastSync = new Date();
        this.failedRequestCount = 0; // Reset on success

      } catch (error) {
        console.error(`[UNIFIED-SYNC] Sync error:`, error);
        this.failedRequestCount++;

        // Activate circuit breaker on repeated failures
        if (this.failedRequestCount >= 3) {
          this.circuitBreakerOpen = true;
          this.circuitBreakerResetTime = Date.now() + 60000; // Reset after 60 seconds
        }
      } finally {
        this.isSyncingCalls = false;
      }
    }

    async updateFactionTable() {
      if (!this.apiKey || !this.factionId) return;

      try {
        // Cache disabled for testing - always fetch fresh data

        // Fetch our faction data from Torn API v2 if no cache
        const response = await customFetch(
          `https://api.torn.com/v2/faction/${this.factionId}/members?key=${this.apiKey}`
        );

        if (!response.ok) {
          console.error('[War Calling] Failed to fetch faction data for table, status:', response.status);
          return;
        }

        const membersData = await response.json();

        // Transform API v2 members array to expected object format for compatibility
        const membersObject = {};
        if (membersData && membersData.members && Array.isArray(membersData.members)) {
          membersData.members.forEach(member => {
            if (member.id) {
              membersObject[member.id] = member;

              // Store hospital end timestamp for faction members
              if (member.status && (member.status.text === "Hospital" || member.status.state === "Hospital")) {
                const timestamp = member.status.updateAt || member.status.until;
                if (timestamp) {
                  hospTime[member.id.toString()] = timestamp;
                }
              } else {
                delete hospTime[member.id.toString()];
              }
            }
          });
        }

        const formattedData = {
          faction: {
            name: "Fluffy Kittens", // We'll need to get this from another endpoint if needed
            tag: "[FK]", // Or from user data
            members: membersObject
          }
        };

        // Cache the data for future use
        const cacheData = {
          factionData: formattedData,
          factionMembers: membersObject,
        };
        this.saveFactionDataToCache(cacheData);

        // Store faction data for filter reapplication
        this.cachedFactionData = formattedData;

        // Display the faction members in the faction table
        this.displayWarFactionMembers(formattedData);

      } catch (error) {
        console.error('[War Calling] Error updating faction table:', error);
      }
    }

    async updateUserLastSeen() {
      // Ensure we have valid user data before attempting update
      if (!this.userId || !this.factionId || isNaN(parseInt(this.userId))) {
        console.warn("[War Calling] Invalid user data for last seen update:", {
          userId: this.userId,
          factionId: this.factionId
        });
        return;
      }

      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/users?user_id=eq.${this.userId}`,
          {
            method: "PATCH",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              last_seen: new Date().toISOString(),
            }),
          }
        );

        // If no rows were affected, the user doesn't exist - register them first
        if (response.status === 200) {
          const result = await response.text();
          if (result === '[]' || result === '') {
            console.info("[War Calling] User not found, registering in database");
            await this.registerUserInDatabase();
          }
        }
      } catch (error) {
        console.error("[War Calling] Failed to update last seen:", error);
        // Try to register user if update fails
        try {
          await this.registerUserInDatabase();
        } catch (registerError) {
          console.error("[War Calling] Failed to register user:", registerError);
        }
      }
    }

    startTargetRefresh() {
      // Cache refresh timer - updates cache every 1 second for real-time status
      this.targetRefreshTimer = setInterval(async () => {
        if (this.currentWar && this.currentTargets.size > 0) {
          // Get fresh data from unified sync and update cache
          const targets = Array.from(this.currentTargets.values());
          if (targets.length > 0) {
            this.saveTargetsToCache(this.currentWar.war_id, targets);
          }
        }
      }, 1000); // 1 second for real-time updates

      // Separate timer for hospital timers (every 1 second)
      this.startHospitalTimer();
    }

    startHospitalTimer() {
      this.hospitalTimer = setInterval(() => {
        if (this.currentWar && this.currentTargets.size > 0) {
          this.updateHospitalTimers();
        }
      }, CONFIG.hospitalTimerInterval);
    }

    async checkCriticalStatusChanges() {
      // Check status of called targets more frequently using direct API calls
      if (!this.apiKey || this.activeCalls.size === 0) return;

      // Limit to only 1 target to respect API rate limiting
      const targetsToCheck = Array.from(this.activeCalls.keys()).slice(0, 1);

      for (const targetId of targetsToCheck) {
        try {
          const response = await customFetch(
            `https://api.torn.com/v2/user/${targetId}?selections=profile&key=${this.apiKey}`
          );

          if (response.ok) {
            const userData = await response.json();
            if (userData.status) {
              // Update target status if it changed
              const currentTarget = this.currentTargets.get(targetId);
              if (currentTarget &&
                  currentTarget.status.text !== userData.status.text) {
                currentTarget.status = userData.status;
                this.updateTargetDisplay(targetId, currentTarget);
              }
            }
          }
        } catch (error) {
          // Silently continue on error to avoid spam
        }
      }
    }

    updateTargetDisplay(targetId, target) {
      // Update the display for a specific target
      const targetRow = document.querySelector(`.target-row[data-target-id="${targetId}"]`);
      if (targetRow) {
        const statusSpan = targetRow.querySelector('.target-status');
        if (statusSpan && target.status) {
          statusSpan.textContent = this.getStatusText(target.status);
          statusSpan.className = `target-status ${this.getStatusClass(target.status)}`;
        }
      }
    }

    updateHospitalTimers() {
      // Update hospital timers in real-time without API calls
      this.currentTargets.forEach((target, targetId) => {
        const targetRow = document.querySelector(
          `.target-row[data-target-id="${targetId}"]`
        );
        if (targetRow && target.status) {
          const statusSpan = targetRow.querySelector(".target-status");
          if (
            statusSpan &&
            ((target.status.text && target.status.text.toLowerCase() === "hospital" && target.status.updateAt) ||
             (target.status.state && target.status.state.toLowerCase() === "hospital" && target.status.until))
          ) {
            const hospitalTime = this.formatHospitalTime(target.status.until);
            statusSpan.textContent = hospitalTime;

            // Update color based on current status
            const now = Math.floor(Date.now() / 1000);
            if (target.status.until <= now) {
              statusSpan.style.color = this.getStatusColor({ text: "Okay", state: "Okay" });
            } else {
              statusSpan.style.color = this.getStatusColor(target.status);
            }
          }
        }
      });
    }

    async syncActiveCalls(retryCount = 0) {
      const maxRetries = 2;
      try {
        if (!this.currentWar || !this.factionId) return;

        // Check circuit breaker before making request
        if (this.circuitBreakerOpen) {
          return;
        }

        // Prevent concurrent sync calls
        if (this.isSyncingCalls) return;
        this.isSyncingCalls = true;

        // Exponential timeout: 15s, 20s, 30s for retries
        const timeoutMs = retryCount === 0 ? 15000 : retryCount === 1 ? 20000 : 30000;

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Sync timeout after ${timeoutMs}ms`)), timeoutMs)
        );


        const startTime = Date.now();
        const callsResponse = await Promise.race([
          customFetch(`${CONFIG.supabase.url}/functions/v1/call-management`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              action: "get_calls",
              war_id: this.currentWar.war_id,
              faction_id: this.factionId,
            }),
          }),
          timeoutPromise,
        ]);

        if (callsResponse.ok) {
          const callsData = await callsResponse.json();
          const backendCalls = new Map();

          // Build map from backend data
          if (callsData.calls) {
            callsData.calls.forEach((call) => {
              // Ensure target_id is treated as string to match DOM attributes
              const targetIdStr = String(call.target_id);
              backendCalls.set(targetIdStr, {
                caller_name: call.caller_name,
                called_at: call.called_at,
                target_name: call.target_name || "Unknown",
                target_level: call.target_level || 0,
                target_status: call.target_status,
              });
            });
          }

          // Smart merge: only update if backend has more recent data
          // For now, trust backend as source of truth but preserve recent local changes
          this.activeCalls = backendCalls;


          // Update UI for all targets: active calls and uncalled targets
          // First, reset all targets to uncalled state
          this.currentTargets.forEach((target, targetId) => {
            if (!this.activeCalls.has(targetId)) {
              this.updateCallUI(targetId, false);
            } else {
            }
          });

          // Then update UI for all active calls
          this.activeCalls.forEach((callData, targetId) => {
            this.updateCallUI(targetId, true, callData);
          });

          // Update compact info bar
          this.updateCompactInfo();
        }
      } catch (error) {
        // Retry logic with exponential backoff
        if (retryCount < maxRetries && (error.message.includes('timeout') || error.message.includes('fetch'))) {
          this.isSyncingCalls = false; // Allow retry

          // Exponential backoff: 1s, 3s, 7s
          const backoffMs = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));

          return this.syncActiveCalls(retryCount + 1);
        }

        // Final failure - only log occasionally to reduce spam
        if (
          !this.lastSyncErrorTime ||
          Date.now() - this.lastSyncErrorTime > 60000
        ) {
          console.warn(
            `[SYNC] Final sync failure after ${retryCount} retries:`,
            error.message || "Unknown error"
          );
          this.lastSyncErrorTime = Date.now();

          // Open circuit breaker temporarily
          this.circuitBreakerOpen = true;
          setTimeout(() => {
            this.circuitBreakerOpen = false;
          }, 30000); // 30 second cooldown
        }
      } finally {
        this.isSyncingCalls = false;
      }
    }

    async refreshTargetStatuses() {
      try {
        // Sync active calls first (but not too frequently) - REPLACED by unified sync
        // if (!this.isSyncingCalls) {
        //   await this.syncActiveCalls();
        // }

        // Update statuses for called targets in real-time
        if (this.activeCalls.size > 0) {
          await this.updateCalledTargetStatuses();
        }

        // Check for hospitalized targets and auto-uncall them
        const uncalledTargets = await this.autoUncallHospitalizedTargets();

        // Only refresh UI for targets that were actually uncalled
        if (uncalledTargets && uncalledTargets.length > 0) {
          uncalledTargets.forEach((targetId) => {
            this.updateCallUI(targetId, false);
          });
        }
      } catch (error) {
        console.error("[War Calling] Error refreshing target statuses:", error);
      }
    }

    async updateCalledTargetStatuses() {
      if (!this.currentWar || !this.factionId || this.activeCalls.size === 0)
        return;

      const apiKey = localStorage.getItem(CONFIG.tornStatsKeyStorageKey);
      if (!apiKey) return;

      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/functions/v1/get-war-targets`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              war_id: this.currentWar.war_id,
              faction_id: this.factionId,
              api_key: apiKey,
              force_refresh: true,
              called_targets_only: Array.from(this.activeCalls.keys()),
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.targets) {
            result.targets.forEach((freshTarget) => {
              const targetId = String(freshTarget.id);
              if (this.activeCalls.has(targetId)) {
                let existingTarget = this.currentTargets.get(targetId);
                if (existingTarget) {
                  existingTarget.status = freshTarget.status;
                  existingTarget.last_action = freshTarget.last_action;
                } else {
                  const newTarget = {
                    user_id: freshTarget.user_id,
                    name: freshTarget.name,
                    level: freshTarget.level,
                    faction_id: freshTarget.faction_id,
                    status: freshTarget.status,
                    last_action: freshTarget.last_action,
                  };
                  this.currentTargets.set(targetId, newTarget);
                  existingTarget = newTarget;
                }

                // Update UI for this target
                const targetRow = document.querySelector(`tr[data-target-id="${targetId}"]`);
                if (targetRow && existingTarget) {
                  this.updateTargetRow(targetRow, existingTarget);
                }
              }
            });
          }
        }
      } catch (error) {
        console.error(
          "[War Calling] Error updating called target statuses:",
          error
        );
      }
    }

    async autoUncallHospitalizedTargets() {
      if (!this.currentWar || !this.factionId || this.activeCalls.size === 0)
        return [];

      const uncalledTargets = [];

      // Initialize previous statuses tracker if not exists
      if (!this.previousTargetStatuses) {
        this.previousTargetStatuses = new Map();

        // Initialize previous statuses from activeCalls database
        for (const [targetId, callData] of this.activeCalls) {
          if (callData.target_status) {
            try {
              let storedStatus;
              // Handle both string and object formats
              if (typeof callData.target_status === "string") {
                storedStatus = JSON.parse(callData.target_status);
              } else {
                storedStatus = callData.target_status;
              }
              this.previousTargetStatuses.set(targetId, storedStatus.state);
            } catch (e) {
              // Silently ignore parse errors
            }
          }
        }
      }

      try {
        // For each called target, check status change
        for (const [targetId, callData] of this.activeCalls) {
          const target = this.currentTargets.get(targetId);

          if (target && target.status) {
            const currentStatus = target.status.text || target.status.state;
            const previousStatus = this.previousTargetStatuses.get(targetId);

            // Only auto-uncall if status changed from Okay to Hospital/Dead
            if (
              previousStatus === "Okay" &&
              (currentStatus === "Hospital" || currentStatus === "Dead")
            ) {
              this.activeCalls.delete(targetId);
              this.previousTargetStatuses.delete(targetId);
              uncalledTargets.push(targetId);

              // Remove from database
              try {
                await customFetch(
                  `${CONFIG.supabase.url}/functions/v1/call-management`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: CONFIG.supabase.anonKey,
                      Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
                    },
                    body: JSON.stringify({
                      action: "uncall",
                      war_id: this.currentWar.war_id,
                      faction_id: this.factionId,
                      target_id: targetId,
                      caller_id: this.userId,
                    }),
                  }
                );
              } catch (error) {
                console.error(
                  `[War Calling] Error auto-uncalling target ${targetId}:`,
                  error
                );
              }
            }

            // Update previous status for next check
            this.previousTargetStatuses.set(targetId, currentStatus);
          }
        }
      } catch (error) {
        console.error(
          "[War Calling] Error auto-uncalling hospitalized targets:",
          error
        );
      }

      return uncalledTargets;
    }

    startFullRefresh() {
      // Full targets refresh every 3 minutes to ensure fresh data
      this.fullRefreshTimer = setInterval(async () => {
        if (this.currentWar) {
          // Non-blocking background refresh
          this.loadTargets();
        }
      }, 3 * 60 * 1000); // 3 minutes
    }

    // ========================================
    // UI INJECTION
    // ========================================
    injectUI() {
      let mainObserver = null;
      let clickListenerAdded = false;
      let checkInterval = null;

      // Function to handle war list click and injection
      const handleWarListClick = () => {
        // Use a short delay to allow the descriptions to appear
        setTimeout(() => {
          const descriptionsLi = document.querySelector("li.descriptions");
          const existingContainer = document.getElementById("war-calling-container");

          if (descriptionsLi) {
            if (!existingContainer || !descriptionsLi.contains(existingContainer)) {
              if (existingContainer) {
                existingContainer.remove();
              }
              this.performInjection(descriptionsLi);
              // Update faction tables after re-injection with longer delay
              setTimeout(() => {

                // Make sure War tab is active
                const warTab = document.querySelector('[data-tab="war"]');
                if (warTab && !warTab.classList.contains('active')) {
                  warTab.click();
                }

                // Force reset all loading flags
                this.isLoadingTargets = false;
                this.isDisplayingTargets = false;
                this.isForceRenderFilters = true;

                // Clear current targets to force fresh load
                this.currentTargets.clear();

                // Use the loadTargets method which handles everything properly
                this.loadTargets();

                // Update faction table
                this.updateFactionTable();

                // Update display settings
                this.updateFactionTableDisplay();

              }, 500); // Increased delay to ensure DOM is ready
            }
          }
        }, 300);
      };

      // Function to setup click listener on war list items
      const setupWarListClickListener = () => {
        // First try to find by ID
        let warList = document.getElementById("faction_war_list_id");

        // If not found, find the war list by looking for the war item
        if (!warList) {
          const warItem = document.querySelector("li.warListItem___eE_Ve");
          if (warItem) {
            warList = warItem.parentElement;
          }
        }

        // Try other selectors if not found
        if (!warList) {
          warList = document.querySelector("ul.f-war-list");
        }
        if (!warList) {
          warList = document.querySelector("ul.war-new");
        }

        if (warList && !clickListenerAdded) {
          warList.addEventListener('click', (e) => {
            // Check if click was on a war list item
            const warItem = e.target.closest("li.warListItem___eE_Ve");
            if (warItem) {
              handleWarListClick();
            }
          });
          clickListenerAdded = true;

          // Also check periodically for descriptions element
          if (!checkInterval) {
            checkInterval = setInterval(() => {
              const descriptionsLi = document.querySelector("li.descriptions");
              const existingContainer = document.getElementById("war-calling-container");

              if (descriptionsLi && (!existingContainer || !descriptionsLi.contains(existingContainer))) {
                if (existingContainer) {
                  existingContainer.remove();
                }
                this.performInjection(descriptionsLi);
                // Update faction tables after re-injection with longer delay
                setTimeout(() => {

                  // Make sure War tab is active
                  const warTab = document.querySelector('[data-tab="war"]');
                  if (warTab && !warTab.classList.contains('active')) {
                    warTab.click();
                  }

                  // Force reset all loading flags
                  this.isLoadingTargets = false;
                  this.isDisplayingTargets = false;
                  this.isForceRenderFilters = true;

                  // Clear current targets to force fresh load
                  this.currentTargets.clear();

                  // Use the loadTargets method which handles everything properly
                  this.loadTargets();

                  // Update faction table
                  this.updateFactionTable();

                  // Update display settings
                  this.updateFactionTableDisplay();

                }, 500); // Increased delay to ensure DOM is ready
              }

              // Also try to setup click listener again if not already done
              if (!clickListenerAdded && !warList) {
                const retryWarItem = document.querySelector("li.warListItem___eE_Ve");
                if (retryWarItem && retryWarItem.parentElement) {
                  setupWarListClickListener();
                }
              }
            }, 1000); // Check every second
          }
        }
      };

      // Main observer to watch for the initial structure
      mainObserver = new MutationObserver((mutations, obs) => {
        if (!document.getElementById("war-calling-container")) {
          const targetLocation = this.findTargetLocation();
          if (targetLocation) {
            obs.disconnect();
            this.performInjection(targetLocation);
            if (checkInterval) {
              clearInterval(checkInterval);
              checkInterval = null;
            }
          } else {
            // Setup click listener for war list if it exists
            setupWarListClickListener();
          }
        }
      });

      // Start observing
      mainObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Try immediate injection first
      const immediateLocation = this.findTargetLocation();
      const existingContainer = document.getElementById("war-calling-container");

      if (immediateLocation && !existingContainer) {
        this.performInjection(immediateLocation);
        mainObserver.disconnect();
        return;
      }

      // Setup click listener immediately if possible
      setupWarListClickListener();

      // Retry after 1 second to wait for dynamic content
      setTimeout(() => {
        if (!clickListenerAdded) {
          setupWarListClickListener();
        }
      }, 1000);

      // Quick retry after 200ms
      setTimeout(() => {
        if (!document.getElementById("war-calling-container")) {
          const targetLocation = this.findTargetLocation();
          if (targetLocation) {
            this.performInjection(targetLocation);
            mainObserver.disconnect();
            if (checkInterval) {
              clearInterval(checkInterval);
              checkInterval = null;
            }
          }
        }
      }, 200);

      // Fallback after 2 seconds - inject somewhere
      setTimeout(() => {
        if (!document.getElementById("war-calling-container")) {
          this.performInjection(document.body);
          mainObserver.disconnect();
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
        }
      }, 2000);
    }

    findTargetLocation() {
      // First: Try to find li with descriptions class
      const descriptionsLi = document.querySelector("li.descriptions");
      if (descriptionsLi) {
        return descriptionsLi;
      }

      // Second: Try to find war description area (desc-wrap warDesc___qZfyO)
      const warDescWrap = document.querySelector(".desc-wrap.warDesc___qZfyO");
      if (warDescWrap) {
        return warDescWrap;
      }

      // Third: Try to find faction war info area
      const factionWarInfo = document.querySelector(".faction-war-info.factionWarInfo___FYhsP");
      if (factionWarInfo) {
        return factionWarInfo;
      }

      // Third: Try standard faction page detection (fallback)
      const factionMain = document.querySelector("#faction-main");
      if (factionMain) {
        const firstDiv = factionMain.querySelector(":scope > div");
        if (firstDiv) {
          const reactRoot = firstDiv.querySelector("#react-root");
          if (reactRoot) {
            const innerDiv = reactRoot.querySelector(":scope > div");
            if (innerDiv) {
              // Look specifically for hr with m-bottom10 class
              const hrElements = innerDiv.querySelectorAll(
                "hr.page-head-delimiter"
              );
              for (const hr of hrElements) {
                if (hr.classList.contains("m-bottom10")) {
                  return hr;
                }
              }
            }
          }
        }
      }

      // Second: If normal structure not found, check for travel state
      const travelHr = document.querySelector(
        "#react-root > div > hr.delimiter-999.m-top10"
      );
      if (travelHr) {
        return travelHr;
      }

      // Additional fallback - try to find any delimiter HR as last resort
      const reactRoot = document.querySelector("#react-root");
      if (reactRoot) {
        const innerDiv = reactRoot.querySelector(":scope > div");
        if (innerDiv) {
          // Look for any HR with delimiter class
          const hrElements = innerDiv.querySelectorAll(
            'hr[class*="delimiter"]'
          );
          for (const hr of hrElements) {
            if (
              hr.classList.contains("m-top10") ||
              hr.classList.contains("m-bottom10")
            ) {
              return hr;
            }
          }
        }
      }

      return null;
    }

    performInjection(targetLocation) {
      const container = document.createElement("div");
      container.id = "war-calling-container";
      container.style.cssText = `
                margin: 10px 0;
                padding: 15px;
                background: #333333;
                border: 1px solid #333;
                border-radius: 5px;
                width: 100%;
                box-sizing: border-box;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3), -2px 0 4px rgba(0,0,0,0.2), 2px 0 4px rgba(0,0,0,0.2);
            `;

      // Add responsive styles and animations
      const styles = document.createElement("style");
      styles.textContent = `
                @keyframes pulse {
                    0% { opacity: 0.4; }
                    50% { opacity: 1; }
                    100% { opacity: 0.4; }
                }

                @media (max-width: 768px) {
                    #war-calling-container {
                        padding: 5px !important;
                        margin: 5px 0 !important;
                    }

                    /* Mobile - Enable horizontal scroll for targets list */
                    #targets-list {
                        overflow-x: auto !important;
                        overflow-y: hidden !important;
                        padding: 10px 0px 10px 0px !important;
                        margin: 0 !important;
                    }

                    #targets-list table {
                        font-size: 12px !important;
                        width: 100% !important;
                        table-layout: auto !important;
                        margin: 0 !important;
                        border-collapse: collapse !important;
                    }

                    /* Mobile - Auto column widths with minimal content */
                    #targets-list th:nth-child(1),
                    #targets-list td:nth-child(1) {
                        width: auto !important;
                        min-width: 60px !important;
                        padding: 2px 4px !important;
                    }

                    #targets-list th:nth-child(1) a,
                    #targets-list td:nth-child(1) a {
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        white-space: nowrap !important;
                        max-width: 80px !important;
                        display: inline-block !important;
                    }

                    /* Mobile - Compact numeric columns */
                    #targets-list th:nth-child(2),
                    #targets-list td:nth-child(2),
                    #targets-list th:nth-child(3),
                    #targets-list td:nth-child(3),
                    #targets-list th:nth-child(4),
                    #targets-list td:nth-child(4),
                    #targets-list th:nth-child(5),
                    #targets-list td:nth-child(5),
                    #targets-list th:nth-child(6),
                    #targets-list td:nth-child(6),
                    #targets-list th:nth-child(7),
                    #targets-list td:nth-child(7) {
                        width: auto !important;
                        min-width: 30px !important;
                        padding: 2px 1px !important;
                        font-size: 10px !important;
                        text-align: center !important;
                        white-space: nowrap !important;
                    }

                    #targets-list td:nth-child(5) .target-status {
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        max-width: 50px !important;
                        display: inline-block !important;
                    }


                    #targets-list td,
                    #targets-list th {
                        padding: 4px 6px !important;
                    }

                    #targets-list button {
                        padding: 2px 6px !important;
                        font-size: 10px !important;
                        min-width: 45px !important;
                    }

                    /* Mobile - Call button optimizations */
                    #targets-list .call-btn {
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        max-width: 80px !important;
                    }

                    /* Mobile - Called by display */
                    #targets-list .called-by-btn {
                        font-size: 10px !important;

                        padding: 3px 3px !important;
                        max-width: 45px !important;
                        background: #666 !important;
                    }

                    /* Mobile - Attack column with war icon */
                    #targets-list .attack-link {
                        font-size: 0 !important;
                        width: 20px !important;
                        height: 20px !important;
                        padding: 0 !important;
                        text-align: center !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                    }

                    #targets-list .attack-link::before {
                        content: '⚔️' !important;
                        font-size: 12px !important;
                        line-height: 1 !important;
                    }

                    /* Mobile - Tab styles */
                    #war-calling-tabs {
                        margin-bottom: 10px !important;
                    }

                    #war-calling-tabs .war-tab {
                        padding: 6px 12px !important;
                        font-size: 12px !important;
                    }

                    /* Mobile - Faction members table */
                    #members-list table {
                        font-size: 11px !important;
                    }

                    #members-list th,
                    #members-list td {
                        padding: 4px 6px !important;
                    }

                    /* Mobile - Faction info section */
                    #faction-info {
                        padding: 8px !important;
                        margin-bottom: 8px !important;
                    }

                    #faction-leadership, #faction-stats {
                        font-size: 11px !important;
                    }

                    #faction-leadership div, #faction-stats div {
                        line-height: 1.3 !important;
                        margin-bottom: 2px !important;
                    }

                    /* Mobile - Hide Position column in members table */
                    #members-list th:nth-child(3),
                    #members-list td:nth-child(3) {
                        display: none !important;
                    }

                    /* Mobile - Compact member names and SVG */
                    #members-list td:first-child {
                        max-width: 140px !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                    }

                    /* Mobile - Smaller SVG logo */
                    #members-list svg {
                        width: 24px !important;
                        height: 12px !important;
                    }

                    /* Mobile - War tables layout */
                    .war-tables-container {
                        flex-direction: column !important;
                        gap: 15px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    .targets-section {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                    }

                    .targets-section, .faction-section {
                        flex: none !important;
                        min-width: unset !important;
                    }

                    /* Mobile - Faction table styles */
                    #faction-list table {
                        font-size: 12px !important;
                    }

                    #faction-list td,
                    #faction-list th {
                        padding: 4px 6px !important;
                    }
                }

                /* Enhanced styling for buttons and rows */
                .target-row:hover {
                    background: linear-gradient(to right, rgba(74, 144, 226, 0.1), rgba(74, 144, 226, 0.05)) !important;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }

                .call-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
                }

                .call-btn:active:not(:disabled) {
                    transform: translateY(0px);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
                }

                /* Desktop - Call/Uncall button width */
                @media (min-width: 769px) {
                    #targets-list .call-btn {
                        min-width: 84px !important;
                    }
                }

                /* Enhanced styling for faction members table */
                #members-list th {
                    background: linear-gradient(to bottom, #4a4a4a, #2a2a2a) !important;
                    border-right: 1px solid #333 !important;
                    border-left: none !important;
                    color: #e0e0e0 !important;
                    font-weight: bold !important;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
                }


                #members-list td {
                    border-right: 1px solid #333 !important;
                    border-left: none !important;
                }

                #members-list th:last-child,
                #members-list td:last-child {
                    border-right: none !important;
                }

                .target-row {
                    transition: all 0.2s ease;
                }

                /* Improved button hover states */
                button:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }

                button:active:not(:disabled) {
                    transform: translateY(0px);
                }

                /* Enhanced styling for attack links */
                .attack-link:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
                }

                .attack-link:active {
                    transform: translateY(0px);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
                }

                /* Hide Score column */
                #targets-list th:nth-child(4),
                #targets-list td:nth-child(4) {
                    display: none !important;
                }

                /* BSP column visibility will be handled by updateBSPColumnDisplay() */

                /* Reset z-index for View graph div */
                .graphIcon___LuL62 {
                    z-index: auto !important;
                }

                #war-calling-tabs {
                    z-index: 1000 !important;
                    position: relative !important;
                }
            `;
      document.head.appendChild(styles);

      // Add BSP styles for iconStats
      const bspStyles = document.createElement("style");
      bspStyles.innerHTML = `
                .iconStats {
                    height: 22px;
                    width: 40px;
                    position: relative;
                    text-align: center;
                    font-size: 11px;
                    font-weight: medium;
                    color: black;
                    box-sizing: border-box;
                    border: 1px solid rgba(0,0,0,0.3);
                    border-radius: 4px;
                    line-height: 20px;
                    font-family: 'Arial', sans-serif;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    transition: all 0.2s ease;
                }
                .iconStats:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                }
                .TDup_ColoredStatsInjectionDiv {
                    position: relative;
                    display: inline-block;
                }
                .TDup_ColoredStatsInjectionDiv a {
                    text-decoration: none !important;
                }
            `;
      document.head.appendChild(bspStyles);

      container.innerHTML = `
                <div id="war-calling-tabs" style="
                    display: flex;
                    border-bottom: 1px solid #222222;
                    margin: -15px -15px 15px -15px;
                    background: #2a2a2a;
                    border-radius: 5px 5px 0 0;
                    position: relative;
                    z-index: 1000;
                ">
                    <button id="tab-war" class="war-tab active" style="
                        padding: 12px 20px;
                        background: linear-gradient(to bottom, #232323, #444444);
                        color: white;
                        border: none;
                        border-radius: 5px 0 0 0;
                        cursor: pointer;
                        font-size: 14px;
                        flex: 1;
                        font-weight: bold;
                    ">War</button>
                    <button id="tab-faction" class="war-tab" style="
                        padding: 12px 20px;
                        background: linear-gradient(to bottom, #646464, #343434);
                        color: white;
                        border: none;
                        border-radius: 0 0 0 0;
                        cursor: pointer;
                        font-size: 14px;
                        flex: 1;
                        font-weight: bold;
                    ">My Faction</button>
                    <button id="tab-help" class="war-tab" style="
                        padding: 12px 20px;
                        background: linear-gradient(to bottom, #646464, #343434);
                        color: white;
                        border: none;
                        border-radius: 0 0 0 0;
                        cursor: pointer;
                        font-size: 14px;
                        flex: 1;
                        font-weight: bold;
                    ">Help</button>
                    ${
                      this.isAdmin()
                        ? `<button id="tab-admin" class="war-tab" style="
                        padding: 12px 20px;
                        background: linear-gradient(to bottom, #646464, #343434);
                        color: white;
                        border: none;
                        border-radius: 0 0 0 0;
                        cursor: pointer;
                        font-size: 14px;
                        flex: 1;
                        font-weight: bold;
                    ">Admin</button>`
                        : ""
                    }
                    <button id="tab-settings" class="war-tab" style="
                        padding: 12px 20px;
                        background: linear-gradient(to bottom, #646464, #343434);
                        color: white;
                        border: none;
                        border-radius: 0 5px 0 0;
                        cursor: pointer;
                        font-size: 14px;
                        flex: 1;
                        font-weight: bold;
                    ">Settings</button>
                </div>

                <!-- Compact info bar -->
                <div id="war-calling-info-bar" style="
                    display: flex;
                    flex-direction: column;
                    padding: 6px 10px;
                    font-size: 13px;
                    color: #e0e0e0;
                    background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
                    border-bottom: 2px solid rgba(76, 175, 80, 0.3);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    gap: 4px;
                ">
                    <!-- Top row: War status + Minimize button -->
                    <div style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                    ">
                        <!-- War status with faction names -->
                        <div id="compact-war-status" style="
                            font-weight: 600;
                            color: #fff;
                            text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                            border-left: 3px solid #4caf50;
                            padding: 2px 0 2px 8px;
                            font-size: 13px;
                            line-height: 1.2;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            flex: 1;
                            margin-right: 10px;
                        ">${this.getCompactInitialStatus()}</div>

                        <!-- Minimize button -->
                        <button id="minimize-btn" style="
                            padding: 4px 8px;
                            background: linear-gradient(135deg, #34495e, #2c3e50);
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 14px;
                            min-width: 28px;
                            height: 24px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: all 0.2s ease;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                            flex-shrink: 0;
                        " title="Minimize"
                        onmouseover="this.style.background='linear-gradient(135deg, #4a6741, #3d5a34)'; this.style.transform='translateY(-1px)'"
                        onmouseout="this.style.background='linear-gradient(135deg, #34495e, #2c3e50)'; this.style.transform='translateY(0px)'">−</button>
                    </div>

                    <!-- Bottom row: Targets, Calls, Chain, Enemy -->
                    <div style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        flex-wrap: wrap;
                        width: 100%;
                    ">
                        <!-- Targets count -->
                        <span id="compact-targets-count" style="
                            ${this.getInitialTargetsDisplay()}
                            background: linear-gradient(135deg, #e74c3c, #c0392b);
                            color: black;
                            padding: 4px 8px;
                            border-radius: 10px;
                            font-weight: 600;
                            font-size: 12px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Arial', sans-serif;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                            white-space: nowrap;
                            flex-shrink: 0;
                        ">${this.getInitialTargetsCount()}</span>

                        <!-- Calls count -->
                        <span id="compact-calls-count" style="
                            ${this.getInitialCallsDisplay()}
                            background: linear-gradient(135deg, #3498db, #2980b9);
                            color: black;
                            padding: 4px 8px;
                            border-radius: 10px;
                            font-weight: 600;
                            font-size: 12px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Arial', sans-serif;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                            white-space: nowrap;
                            flex-shrink: 0;
                        ">${this.getInitialCallsCount()}</span>

                        <!-- Chain info -->
                        <span id="compact-chain-container" style="
                            display: inline-block;
                            vertical-align: middle;
                        ">
                            <span id="compact-chain-info" style="
                                display: none;
                                background: linear-gradient(135deg, #f39c12, #e67e22);
                                color: black;
                                padding: 4px 8px;
                                border-radius: 10px;
                            font-weight: 600;
                            font-size: 12px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Arial', sans-serif;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                            white-space: nowrap;
                            flex-shrink: 0;
                        ">Chain: 0 (0:00)</span>
                        </span>
                    </div>

                    <!-- Third row: Save chain button (hidden by default) -->
                    <div id="save-chain-row" style="
                        display: none;
                        justify-content: center;
                        align-items: center;
                        width: 100%;
                        margin-top: 2px;
                    ">
                        <!-- Save chain button will be inserted here -->
                    </div>
                </div>

                <div id="tab-content-war" class="tab-content">
                    <div id="war-status" style="margin-bottom: 10px; color: #ccc;">
                        ${this.getInitialWarStatus()}
                    </div>
                    <div id="war-targets" style="display: none;">
                        <!-- War Filters Section -->
                        <div id="war-filters-container" style="margin-bottom: 15px;">
                            <div id="war-filters-header" style="background: #2a2a2a; padding: 8px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; border: 1px solid #444;">
                                <span style="color: #ccc; font-weight: bold;">Ranked War Filters</span>
                                <span id="filter-toggle-icon" style="color: #ccc;">▼</span>
                            </div>
                            <div id="war-filters-content" style="display: none; background: #1a1a1a; border: 1px solid #444; border-top: none; border-radius: 0 0 4px 4px; padding: 15px;">
                                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                                    <!-- Activity Filters -->
                                    <div style="flex: 1; min-width: 150px;">
                                        <h5 style="margin: 0 0 8px 0; color: #4a90e2;">Activity</h5>
                                        <div id="activity-filters" style="display: flex; flex-direction: column; gap: 4px;">
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-online" checked style="margin: 0;"> Online
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-idle" checked style="margin: 0;"> Idle
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-offline" checked style="margin: 0;"> Offline
                                            </label>
                                        </div>
                                    </div>

                                    <!-- Status Filters -->
                                    <div style="flex: 1; min-width: 150px;">
                                        <h5 style="margin: 0 0 8px 0; color: #4a90e2;">Status</h5>
                                        <div id="status-filters" style="display: flex; flex-direction: column; gap: 4px;">
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-okay" checked style="margin: 0;"> Okay
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-hospital" checked style="margin: 0;"> Hospital
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-abroad" checked style="margin: 0;"> Abroad
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-traveling" checked style="margin: 0;"> Traveling
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-jail" checked style="margin: 0;"> Jail
                                            </label>
                                            <label style="color: #ccc; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                                <input type="checkbox" id="filter-federal" checked style="margin: 0;"> Federal
                                            </label>
                                        </div>
                                    </div>

                                    <!-- Level Filters -->
                                    <div style="flex: 1; min-width: 150px;">
                                        <h5 style="margin: 0 0 8px 0; color: #4a90e2;">Level Range</h5>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <input type="number" id="filter-level-min" value="1" min="1" max="100" style="width: 60px; padding: 4px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
                                            <span style="color: #ccc;">-</span>
                                            <input type="number" id="filter-level-max" value="100" min="1" max="100" style="width: 60px; padding: 4px; background: #333; color: #fff; border: 1px solid #555; border-radius: 3px;">
                                        </div>
                                    </div>
                                </div>

                                <!-- Filter Actions -->
                                <div style="margin-top: 15px; display: flex; gap: 10px;">
                                    <button id="reset-filters-btn" style="padding: 6px 12px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer;">Reset All</button>
                                </div>
                            </div>
                        </div>

                        <div class="war-tables-container" style="display: flex; gap: 30px;">
                            <div class="targets-section" style="flex: 1; min-width: 0;">
                                <h4 id="enemy-faction-title" style="margin: 0 0 10px 0; color: #fff;">Enemy Targets</h4>
                                <div id="targets-list" style="background: #191919; border-radius: 8px; padding: 10px; width: 100%;"></div>
                            </div>
                            <div class="faction-section" style="flex: 0 0 220px;">
                                <h4 id="my-faction-title" style="margin: 0 0 10px 0; color: #fff;">Our Faction</h4>
                                <div id="faction-list" style="overflow-x: auto; overflow-y: hidden; background: #191919; border-radius: 8px; padding: 10px 0;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-content-faction" class="tab-content" style="display: none;">
                    <div id="faction-status" style="margin-bottom: 10px; color: #ccc;">
                        Loading faction information...
                    </div>
                    <div id="faction-info" style="display: none; background: #1a1a1a; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div id="faction-leadership" style="color: #ccc; padding-right: 10px; border-right: 1px solid #333;"></div>
                            <div id="faction-stats" style="color: #ccc; padding-left: 10px;"></div>
                        </div>
                    </div>
                    <div id="faction-members" style="display: none;">
                        <h4 style="margin: 0 0 10px 0; color: #fff;">Faction Members</h4>
                        <div id="members-list" style="overflow-x: auto;"></div>
                    </div>
                </div>

                <div id="tab-content-help" class="tab-content" style="display: none;">
                    <div id="help-status" style="margin-bottom: 10px; color: #ccc;">
                        Loading help data...
                    </div>
                    <div id="help-info" style="display: none;">
                        <!-- Quick Start Section -->
                        <div style="background: #1a1a1a; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                            <h3 style="margin: 0 0 15px 0; color: #4a90e2; font-size: 16px;">🚀 Quick Start Guide</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                                    <div style="color: #4caf50; font-weight: bold; margin-bottom: 5px; font-size: 13px;">Step 1: Configure API</div>
                                    <div style="font-size: 12px; color: #aaa;">Go to Settings tab and add your Torn API key</div>
                                </div>
                                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                                    <div style="color: #4caf50; font-weight: bold; margin-bottom: 5px; font-size: 13px;">Step 2: Enable Script</div>
                                    <div style="font-size: 12px; color: #aaa;">Admin activates war detection (30 xanax required)</div>
                                </div>
                                <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                                    <div style="color: #4caf50; font-weight: bold; margin-bottom: 5px; font-size: 13px;">Step 3: Start Calling</div>
                                    <div style="font-size: 12px; color: #aaa;">Click CALL to claim targets during war</div>
                                </div>
                            </div>
                        </div>

                        <!-- Features Grid -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 15px;">
                            <!-- War Features -->
                            <div style="background: #1a1a1a; padding: 15px; border-radius: 5px;">
                                <div style="color: #4a90e2; font-weight: bold; margin-bottom: 10px; font-size: 14px;">⚔️ WAR FEATURES</div>
                                <div style="font-size: 12px; color: #ccc; line-height: 1.8;">
                                    • <strong>Real-time sync</strong> - Instant target updates<br>
                                    • <strong>Status tracking</strong> - Auto-detect changes<br>
                                    • <strong>Chain timers</strong> - Live countdown alerts<br>
                                    • <strong>Hospital alerts</strong> - Early exit notifications<br>
                                    • <strong>Mobile optimized</strong> - Works with TornPDA
                                </div>
                            </div>

                            <!-- Target System -->
                            <div style="background: #1a1a1a; padding: 15px; border-radius: 5px;">
                                <div style="color: #ff9800; font-weight: bold; margin-bottom: 10px; font-size: 14px;">🎯 TARGET SYSTEM</div>
                                <div style="font-size: 12px; color: #ccc; line-height: 1.8;">
                                    • <strong>Smart sorting</strong> - Status/Level/BSP<br>
                                    • <strong>BSP predictions</strong> - Win chance calc<br>
                                    • <strong>Quick attack</strong> - One-click links<br>
                                    • <strong>Call protection</strong> - No duplicates<br>
                                    • <strong>Auto refresh</strong> - Every 5 seconds
                                </div>
                            </div>

                            <!-- Admin Tools -->
                            <div style="background: #1a1a1a; padding: 15px; border-radius: 5px;">
                                <div style="color: #e91e63; font-weight: bold; margin-bottom: 10px; font-size: 14px;">👨‍💼 ADMIN TOOLS</div>
                                <div style="font-size: 12px; color: #ccc; line-height: 1.8;">
                                    • <strong>Xanax tracking</strong> - Balance & history<br>
                                    • <strong>War control</strong> - Enable/disable script<br>
                                    • <strong>Payment log</strong> - 30-day history<br>
                                    • <strong>Member stats</strong> - Script usage<br>
                                    • <strong>Resource view</strong> - Wars available
                                </div>
                            </div>
                        </div>

                        <!-- Pro Tips -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="color: #4a90e2; font-weight: bold; margin-bottom: 8px; font-size: 13px;">💡 PRO TIPS</div>
                                <div style="font-size: 11px; color: #aaa; line-height: 1.6;">
                                    • Sort by BSP for easier targets<br>
                                    • Watch chain timer for coordination<br>
                                    • Enable hospital alerts for timing<br>
                                    • Use minimize when not active
                                </div>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="color: #ff9800; font-weight: bold; margin-bottom: 8px; font-size: 13px;">⚙️ SETTINGS</div>
                                <div style="font-size: 11px; color: #aaa; line-height: 1.6;">
                                    • Configure chain display options<br>
                                    • Toggle BSP column visibility<br>
                                    • Manage hospital notifications<br>
                                    • Clear cache when needed
                                </div>
                            </div>
                        </div>

                        <!-- Pricing Info -->
                        <div style="background: rgba(74, 144, 226, 0.1); padding: 12px; border-left: 4px solid #4a90e2; border-radius: 0 5px 5px 0; margin-bottom: 15px;">
                            <div style="color: #4a90e2; font-weight: bold; margin-bottom: 5px; font-size: 13px;">🆓 Trial Version - First War Free!</div>
                            <div style="font-size: 12px; color: #ccc;">
                                <strong>Cost:</strong> 30 Xanax per war • <strong>Your first war is completely free!</strong><br>
                                Perfect for testing all features before committing to the full system.<br>
                                <em>Any faction member can send Xanax to JESUUS [2353554] to contribute.</em>
                            </div>
                        </div>

                        <!-- Support Info -->
                        <div style="text-align: center; color: #666; font-size: 11px; padding: 10px; border-top: 1px solid #333;">
                            C.A.T v4.3.4 • Created by Advanced Torn Tools • Questions? Contact us in-game
                        </div>
                    </div>
                </div>

                ${
                  this.isAdmin()
                    ? `<div id="tab-content-admin" class="tab-content" style="display: none;">
                    <div id="admin-status" style="margin-bottom: 10px; color: #ccc;">
                        Loading admin data...
                    </div>
                    <div id="admin-info" style="display: none; background: #1a1a1a; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div id="admin-resources" style="color: #ccc; padding-right: 10px; border-right: 1px solid #333;">
                                <div style="font-size: 14px; line-height: 1.8;">
                                    <div style="color: #4a90e2; font-weight: bold; margin-bottom: 5px;">RESOURCES</div>
                                    <div style="background: #1a1a1a; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                                        <div style="margin-bottom: 5px;"><span style="color: #888;">Xanax balance:</span> <span id="total-xanax-count" style="color: #fff;">Loading...</span></div>
                                        <div style="margin-bottom: 5px;"><span style="color: #888;"><span id="wars-label">Wars can be purchased:</span></span> <span id="wars-count" style="color: #fff;">Loading...</span></div>
                                        <div style="font-size: 11px; color: #666; border-top: 1px solid #333; padding-top: 5px; margin-top: 5px;">
                                            <span id="wars-breakdown">30 xanax = 1 war</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div id="admin-control" style="color: #ccc; padding-left: 10px;">
                                <div style="font-size: 14px; line-height: 1.8;">
                                    <div style="color: #4a90e2; font-weight: bold; margin-bottom: 5px;">WAR SCRIPT</div>
                                    <div style="background: #1a1a1a; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                                        <div style="margin-bottom: 8px;">
                                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                                <input type="checkbox" id="admin-war-script-toggle">
                                                <span style="color: #ccc;">Activate script for next war</span>
                                            </label>
                                            <div id="war-script-requirement" style="font-size: 11px; color: #ff6b6b; margin-top: 3px; margin-left: 24px; display: none;">
                                                ⚠️ Requires at least 1 purchased war
                                            </div>
                                        </div>
                                        <div style="margin-bottom: 5px;"><span style="color: #888;">Status:</span> <span id="script-status-text" style="color: #4a90e2;">Loading...</span></div>
                                        <div style="font-size: 11px; color: #666; border-top: 1px solid #333; padding-top: 5px; margin-top: 5px;">
                                            <span id="activation-info">Activation consumes 30 xanax from your balance</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 15px;">
                            <div style="color: #4a90e2; font-weight: bold; margin-bottom: 10px; font-size: 14px;">XANAX HISTORY (Last 30 days)</div>
                            <div id="xanax-history-table" style="
                                border-radius: 8px;
                                overflow: hidden;
                                border: 1px solid #333;
                                background: #2a2a2a;
                            ">
                                <div style="color: #ccc; text-align: center; padding: 15px;">Loading history...</div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; padding: 10px; background: rgba(255, 193, 7, 0.1); border-left: 4px solid #ffc107; border-radius: 0 5px 5px 0;">
                            <div style="font-size: 12px; color: #ccc; line-height: 1.4;">
                                <strong>Info:</strong> Send Xanax to <strong>JESUUS [2353554]</strong> • 30 Xanax = 1 War • Auto-detection within minutes
                            </div>
                        </div>
                    </div>
                </div>`
                    : ""
                }

                <div id="tab-content-settings" class="tab-content" style="display: none;">
                    <div id="settings-status" style="margin-bottom: 10px; color: #ccc;">
                        Loading settings data...
                    </div>
                    <div id="settings-info" style="display: none; background: #1a1a1a; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <!-- Left Column: Configuration & Data -->
                            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                                <div id="settings-api" style="color: #ccc; margin-bottom: 20px;">
                                    <div style="font-size: 14px; line-height: 1.8;">
                                        <div style="color: #4a90e2; font-weight: bold; margin-bottom: 8px;">API CONFIGURATION</div>
                                        <div style="margin-bottom: 10px;">
                                            <span style="color: #888;">Torn Key:</span>
                                            <span id="current-api-display" style="color: #fff; font-family: monospace;">Loading...</span>
                                        </div>
                                        <div style="margin-bottom: 10px;">
                                            <span style="color: #888;">TornStats:</span>
                                            <span id="tornstats-status" style="color: #888; font-size: 12px;">Checking...</span>
                                        </div>
                                        <div style="margin-bottom: 10px;">
                                            <span style="color: #888;">User ID:</span>
                                            <span id="user-id-display" style="color: #fff; font-family: monospace;">Loading...</span>
                                        </div>
                                        <div style="margin-bottom: 15px;">
                                            <span style="color: #888;">Faction ID:</span>
                                            <span id="faction-id-display" style="color: #fff; font-family: monospace;">Loading...</span>
                                        </div>
                                        <button id="change-api-key-settings" style="
                                            padding: 6px 12px;
                                            background: linear-gradient(to bottom, #5ba3f5, #3d7fc4);
                                            color: white;
                                            border: 1px solid #2d5f94;
                                            border-radius: 3px;
                                            cursor: pointer;
                                            font-size: 11px;
                                            font-weight: bold;
                                            text-shadow: 0 1px 0 rgba(0,0,0,0.3);
                                            transition: all 0.2s;
                                        " onmouseover="this.style.background='linear-gradient(to bottom, #6cb0ff, #4d8fd4)'" onmouseout="this.style.background='linear-gradient(to bottom, #5ba3f5, #3d7fc4)'">Change API Key</button>
                                    </div>
                                </div>
                                <div id="settings-data" style="color: #ccc;">
                                    <div style="font-size: 14px; line-height: 1.8;">
                                        <div style="color: #4a90e2; font-weight: bold; margin-bottom: 8px;">DATA MANAGEMENT</div>
                                        <button id="clear-cache" style="
                                            padding: 6px 12px;
                                            background: linear-gradient(to bottom, #ff7a7a, #ff4444);
                                            color: white;
                                            border: 1px solid #cc2222;
                                            border-radius: 3px;
                                            cursor: pointer;
                                            font-size: 11px;
                                            font-weight: bold;
                                            text-shadow: 0 1px 0 rgba(0,0,0,0.3);
                                            transition: all 0.2s;
                                        " onmouseover="this.style.background='linear-gradient(to bottom, #ff8a8a, #ff5555)'" onmouseout="this.style.background='linear-gradient(to bottom, #ff7a7a, #ff4444)'">Clear Cache</button>
                                    </div>
                                </div>
                            </div>

                            <!-- Right Column: Display Options -->
                            <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="margin-bottom: 20px;">
                                    <div style="color: #4a90e2; font-weight: bold; margin-bottom: 8px;">CHAIN DISPLAY OPTIONS</div>
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
                                        <button id="toggle-my-chain" style="
                                            padding: 6px 12px;
                                            background: linear-gradient(to bottom, #666, #444);
                                            color: white;
                                            border: 1px solid #333;
                                            border-radius: 3px;
                                            cursor: pointer;
                                            font-size: 11px;
                                            font-weight: bold;
                                            text-shadow: 0 1px 0 rgba(0,0,0,0.3);
                                            transition: all 0.2s;
                                        ">Show our chain: OFF</button>
                                    </div>
                                </div>
                                <div style="margin-bottom: 20px;">
                                    <div style="color: #4a90e2; font-weight: bold; margin-bottom: 8px;">BSP COLUMN</div>
                                    <button id="toggle-bsp-column" style="
                                        padding: 6px 12px;
                                        background: linear-gradient(to bottom, #4caf50, #45a049);
                                        color: white;
                                        border: 1px solid #388e3c;
                                        border-radius: 3px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 11px;
                                        text-shadow: 0 1px 0 rgba(0,0,0,0.3);
                                        transition: all 0.2s;
                                    ">Show BSP Column: ON</button>
                                </div>
                                <div style="margin-bottom: 20px;">
                                    <div style="color: #4a90e2; font-weight: bold; margin-bottom: 8px;">FACTION TABLE</div>
                                    <button id="toggle-faction-table" style="
                                        padding: 6px 12px;
                                        background: linear-gradient(to bottom, #4caf50, #45a049);
                                        color: white;
                                        border: 1px solid #388e3c;
                                        border-radius: 3px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 11px;
                                        text-shadow: 0 1px 0 rgba(0,0,0,0.3);
                                        transition: all 0.2s;
                                    ">Show Faction Table: ON</button>
                                </div>
                                <div>
                                    <div style="color: #e74c3c; font-weight: bold; margin-bottom: 8px;">HOSPITAL NOTIFICATIONS</div>
                                    <button id="toggle-hospital-alerts" style="
                                        padding: 6px 12px;
                                        background: linear-gradient(to bottom, #e74c3c, #c0392b);
                                        color: white;
                                        border: 1px solid #a93226;
                                        border-radius: 3px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 11px;
                                        text-shadow: 0 1px 0 rgba(0,0,0,0.3);
                                        transition: all 0.2s;
                                    ">Early Exit Alerts: ON</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 15px; padding: 10px; background: rgba(74, 144, 226, 0.1); border-left: 4px solid #4a90e2; border-radius: 0 5px 5px 0;">
                            <div style="font-size: 12px; color: #ccc; line-height: 1.4;">
                                <strong>Version:</strong> <span id="current-version-display">4.3.4</span> • <strong>Author:</strong>
                                <a href="https://www.torn.com/profiles.php?XID=2353554" target="_blank" style="color: #4a90e2; text-decoration: none; font-weight: bold;" onmouseover="this.style.color='#6cb0ff'" onmouseout="this.style.color='#4a90e2'">JESUUS [2353554]</a>
                                • <strong>Support:</strong> Private message
                            </div>
                        </div>
                    </div>
                </div>
            `;

      // Insert based on target location type
      if (targetLocation.classList && (targetLocation.classList.contains("desc-wrap") || targetLocation.classList.contains("faction-war-info") || targetLocation.classList.contains("descriptions"))) {
        // Insert at the beginning of war description area or descriptions li
        targetLocation.insertAdjacentElement("afterbegin", container);
      } else if (
        targetLocation.parentNode &&
        targetLocation.parentNode.id === "faction-main"
      ) {
        targetLocation.parentNode.insertBefore(container, targetLocation);
      } else if (targetLocation.id === "faction-main") {
        targetLocation.insertAdjacentElement("afterbegin", container);
      } else {
        targetLocation.insertAdjacentElement("afterbegin", container);
      }

      // Setup minimize functionality
      document.getElementById("minimize-btn").onclick = () => {
        this.toggleMinimize();
      };

      // Setup tab functionality
      this.setupTabs();

      // Initialize chain elements visibility based on settings
      this.initializeChainVisibility();

      // Setup API key reminder
      this.setupApiKeyReminder();

      // Apply saved minimized state
      this.applyMinimizedState();

      // Listen for minimize state changes from other tabs
      this.setupCrossTabMinimizeSync();

      // Monitor warListItem state changes
      this.setupWarListItemMonitor();

      // Listen for intercepted war data updates
      window.addEventListener('warDataUpdated', (event) => {
        // Refresh targets display if we're on the war tab
        if (document.getElementById('war-targets-content')?.style.display !== 'none') {
          this.loadTargets();
        }
      });
    }

    setupTabs() {
      const tabs = {
        war: {
          tab: document.getElementById("tab-war"),
          content: document.getElementById("tab-content-war"),
        },
        faction: {
          tab: document.getElementById("tab-faction"),
          content: document.getElementById("tab-content-faction"),
        },
        help: {
          tab: document.getElementById("tab-help"),
          content: document.getElementById("tab-content-help"),
        },
        settings: {
          tab: document.getElementById("tab-settings"),
          content: document.getElementById("tab-content-settings"),
        },
      };

      // Add admin tab if user is admin
      if (this.isAdmin()) {
        tabs.admin = {
          tab: document.getElementById("tab-admin"),
          content: document.getElementById("tab-content-admin"),
        };
      }

      // Check if all tabs exist
      const allTabsExist = Object.values(tabs).every((t) => t.tab && t.content);
      if (!allTabsExist) return;

      // Tab switching function
      const switchToTab = (activeTabName) => {
        Object.entries(tabs).forEach(([name, elements]) => {
          if (name === activeTabName) {
            // Active tab
            elements.tab.style.background =
              "linear-gradient(to bottom, #232323, #444444)";
            // Only show content if not minimized
            elements.content.style.display = this.isMinimized
              ? "none"
              : "block";
            elements.tab.classList.add("active");
          } else {
            // Inactive tabs
            elements.tab.style.background =
              "linear-gradient(to bottom, #646464, #343434)";
            elements.content.style.display = "none";
            elements.tab.classList.remove("active");
          }
        });

        // Save active tab to localStorage
        GM_setValue(CONFIG.activeTabStorageKey, activeTabName);

        // Load specific data for certain tabs
        if (activeTabName === "faction") {
          this.loadFactionData();
        } else if (activeTabName === "help") {
          this.loadHelpData();
        } else if (activeTabName === "settings") {
          this.loadSettingsData();
        } else if (activeTabName === "admin") {
          this.loadAdminData();
        } else if (activeTabName === "war") {
          // Update table titles when switching to war tab
          this.updateTableTitles();
          // Update faction table visibility
          this.updateFactionTableDisplay();
          // Instantly display cached data if available
          this.displayCachedWarDataInstantly();
        }
      };

      // Set up click handlers
      tabs.war.tab.onclick = () => switchToTab("war");
      tabs.faction.tab.onclick = () => switchToTab("faction");
      tabs.help.tab.onclick = () => switchToTab("help");
      tabs.settings.tab.onclick = () => switchToTab("settings");

      // Add admin tab handler if it exists
      if (tabs.admin) {
        tabs.admin.tab.onclick = () => switchToTab("admin");
      }

      // Restore saved tab or default to 'war'
      const savedTab = GM_getValue(CONFIG.activeTabStorageKey, "war");
      if (tabs[savedTab]) {
        switchToTab(savedTab);
        // If restoring faction tab, ensure script users are loaded for badges
        if (savedTab === "faction") {
          setTimeout(() => this.loadScriptUsers(), 1000);
        }
      } else {
        switchToTab("war"); // Fallback if saved tab doesn't exist
      }
    }

    setupApiKeyReminder() {
      const settingsTab = document.getElementById("tab-settings");
      if (!settingsTab) return;

      // Check if API key is configured
      if (!this.apiKey || this.apiKey.trim() === "") {
        // Start blinking animation
        this.startSettingsTabBlink(settingsTab);
      } else {
        // Stop any existing animation
        this.stopSettingsTabBlink(settingsTab);
      }
    }

    startSettingsTabBlink(settingsTab) {
      // Clear any existing animation
      this.stopSettingsTabBlink(settingsTab);

      // Store original style
      this.originalSettingsBackground = settingsTab.style.background;

      // Animation parameters
      let startTime = null;
      const duration = 2000; // 2 seconds for full cycle

      // Colors for smooth transition
      const grayColors = [100, 100, 100]; // RGB for #646464
      const yellowColors = [255, 193, 7]; // RGB for #ffc107

      // Animation function
      const animate = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;

        // Calculate progress (0 to 1 and back)
        const rawProgress = (elapsed % duration) / duration;
        const progress =
          rawProgress <= 0.5 ? rawProgress * 2 : (1 - rawProgress) * 2;

        // Interpolate between gray and yellow
        const r = Math.round(
          grayColors[0] + (yellowColors[0] - grayColors[0]) * progress
        );
        const g = Math.round(
          grayColors[1] + (yellowColors[1] - grayColors[1]) * progress
        );
        const b = Math.round(
          grayColors[2] + (yellowColors[2] - grayColors[2]) * progress
        );

        // Create darker version for gradient
        const r2 = Math.round(r * 0.7);
        const g2 = Math.round(g * 0.7);
        const b2 = Math.round(b * 0.7);

        // Apply the gradient
        settingsTab.style.background = `linear-gradient(to bottom, rgb(${r}, ${g}, ${b}), rgb(${r2}, ${g2}, ${b2}))`;

        // Continue animation
        this.settingsAnimationFrame = requestAnimationFrame(animate);
      };

      // Start animation
      this.settingsAnimationFrame = requestAnimationFrame(animate);
    }

    stopSettingsTabBlink(settingsTab) {
      // Stop the animation frame
      if (this.settingsAnimationFrame) {
        cancelAnimationFrame(this.settingsAnimationFrame);
        this.settingsAnimationFrame = null;
      }

      // Remove animation class if it exists
      settingsTab.classList.remove("settings-blinking");

      // Remove the animation style from head if it exists
      const animationStyle = document.getElementById(
        "settings-blink-animation"
      );
      if (animationStyle) {
        animationStyle.remove();
      }

      // Reset to original styling
      settingsTab.style.background =
        this.originalSettingsBackground ||
        "linear-gradient(to bottom, #646464, #343434)";
    }

    updateWarUI(warDetails, errorMessage = null, fromCache = false) {
      const statusElement = document.getElementById("war-status");
      const targetsElement = document.getElementById("war-targets");
      const compactWarStatus = document.getElementById("compact-war-status");

      if (!statusElement) {
        return;
      }

      if (errorMessage) {
        const errorContent = `<span style="color: #ff6666;">Error: ${errorMessage}</span>`;
        if (statusElement.innerHTML !== errorContent) {
          statusElement.innerHTML = errorContent;
        }
        if (targetsElement) targetsElement.style.display = "none";
        if (compactWarStatus) {
          const compactError = `<span style="color: #ff6666;">Error</span>`;
          if (compactWarStatus.innerHTML !== compactError) {
            compactWarStatus.innerHTML = compactError;
          }
        }
        return;
      }

      if (warDetails) {
        // Update chain information if available
        this.updateChainInfo(warDetails);
        
        // Debug: log war details structure
        console.log('[CAT Debug] War details structure:', {
          hasFactions: !!warDetails.factions,
          hasAttackerDefender: !!(warDetails.attacker && warDetails.defender),
          factionIds: warDetails.factions ? Object.keys(warDetails.factions) : null,
          myFactionId: this.factionId,
          chainInfo: this.chainInfo
        });
        
        // Handle different war details structures
        let warDescription = "Active War";

        if (warDetails.factions) {
          // TornStats format: { factions: { "id1": {name: "..."}, "id2": {name: "..."} } }
          const factionNames = Object.values(warDetails.factions).map(
            (f) => f.name
          );
          if (factionNames.length >= 2) {
            // Store faction names for table titles
            const factionIds = Object.keys(warDetails.factions).map(id => parseInt(id));
            const myFactionIndex = factionIds.findIndex(id => id === this.factionId);
            const enemyFactionIndex = myFactionIndex === 0 ? 1 : 0;

            this.myFactionName = factionNames[myFactionIndex] || factionNames[0];
            this.enemyFactionName = factionNames[enemyFactionIndex] || factionNames[1];

            // Create inline format for compact display
            warDescription = `
              <div style="text-align: center;">
                <span style="color: #4a90e2; font-size: 13px;">${this.myFactionName}</span>
                <span style="color: #ccc; font-size: 13px; margin: 0 4px;">vs</span>
                <span style="color: #e74c3c; font-size: 13px;">${this.enemyFactionName}</span>
              </div>
            `;

            // Update table titles
            this.updateTableTitles();
          }
        } else if (warDetails.attacker && warDetails.defender) {
          // Standard format
          // Store faction names for table titles
          if (warDetails.attacker.faction_id === this.factionId) {
            this.myFactionName = warDetails.attacker.name;
            this.enemyFactionName = warDetails.defender.name;
          } else {
            this.myFactionName = warDetails.defender.name;
            this.enemyFactionName = warDetails.attacker.name;
          }

          // Create inline format for compact display
          warDescription = `
            <div style="text-align: center;">
              <span style="color: #4a90e2; font-size: 13px;">${this.myFactionName}</span>
              <span style="color: #ccc; font-size: 13px; margin: 0 4px;">vs</span>
              <span style="color: #e74c3c; font-size: 13px;">${this.enemyFactionName}</span>
            </div>
          `;

          // Update table titles
          this.updateTableTitles();
        } else {
          // Fallback: try to extract from chainInfo if already populated
          if (this.chainInfo.faction_a_name && this.chainInfo.faction_b_name) {
            // Determine which faction is ours
            const myFactionId = parseInt(this.factionId);
            if (myFactionId === this.chainInfo.faction_a_id) {
              this.myFactionName = this.chainInfo.faction_a_name;
              this.enemyFactionName = this.chainInfo.faction_b_name;
            } else {
              this.myFactionName = this.chainInfo.faction_b_name;
              this.enemyFactionName = this.chainInfo.faction_a_name;
            }
            
            warDescription = `
              <div style="text-align: center;">
                <span style="color: #4a90e2; font-size: 13px;">${this.myFactionName}</span>
                <span style="color: #ccc; font-size: 13px; margin: 0 4px;">vs</span>
                <span style="color: #e74c3c; font-size: 13px;">${this.enemyFactionName}</span>
              </div>
            `;
            
            // Update table titles
            this.updateTableTitles();
          }
        }

        statusElement.innerHTML = "";
        if (compactWarStatus) {
          compactWarStatus.innerHTML = warDescription;
        }
        if (targetsElement) {
          targetsElement.style.display = "block";

          // Load targets immediately for faster startup
          this.loadTargets();

          // No cache - fresh data only

          // Start target refresh timer
          if (!this.targetRefreshTimer) {
            this.startTargetRefresh();
          }

          // Start periodic full refresh timer (every 10 minutes)
          if (!this.fullRefreshTimer) {
            this.startFullRefresh();
          }
        }
      } else {
        // Get faction license info to show xanax status
        this.checkFactionLicense()
          .then((licenseData) => {
            const xanaxCount = licenseData.total_xanax_received || 0;
            const warsAvailable = licenseData.wars_paid || 0;
            const scriptActivated =
              licenseData.script_activated_for_next_war || false;

            let statusMessage = "";
            let compactMessage = "";

            if (warsAvailable > 0 && scriptActivated) {
              statusMessage = `<div style="text-align: center; color: #888;">
                            <div style="font-size: 16px; margin-bottom: 8px;">⏳ Waiting for War</div>
                            <div style="font-size: 13px; color: #aaa;">Your faction has ${warsAvailable} war${
                warsAvailable > 1 ? "s" : ""
              } ready (and ${xanaxCount} xanax left)</div>
                            <div style="font-size: 11px; color: #666; margin-top: 5px;">Script will activate automatically when war starts</div>
                        </div>`;
              compactMessage = `<span style="color: #4a90e2;">Ready for War (${warsAvailable} available)</span>`;
            } else if (warsAvailable > 0 && !scriptActivated) {
              const freeXanax = xanaxCount - warsAvailable * 30;
              statusMessage = `<div style="text-align: center; color: #888;">
                            <div style="margin-top: 10px; font-size: 16px; margin-bottom: 8px;">💤 Script Not Activated</div>
                            <div style="font-size: 13px; color: #aaa;">You can purshase ${warsAvailable} war${
                warsAvailable > 1 ? "s" : ""
              } with your ${xanaxCount} xanax.</div>
                            <div style="font-size: 11px; color: #666; margin-top: 5px;">Click "Enable for wars" in admin tab to activate ( only leader / co-leader ) </div>
                        </div>`;
              compactMessage = `<span style="color: #ffa500;">Script Available (${warsAvailable} war${
                warsAvailable > 1 ? "s" : ""
              } can be purshased)</span>`;
            } else {
              statusMessage = `<div style="text-align: center; color: #888;">
                            <div style="font-size: 16px; margin-bottom: 8px;">💤 No Active War</div>
                            <div style="font-size: 13px; color: #aaa;">Send 30 xanax to JESUUS [2353554] to activate war script</div>
                            <div style="font-size: 11px; color: #666; margin-top: 5px;">Current: ${xanaxCount} xanax (need ${
                30 - xanaxCount
              } more)</div>
                        </div>`;
              compactMessage = `<span style="color: #888;">No War (${xanaxCount}/30 xanax)</span>`;
            }

            // Only update DOM if content has changed to avoid flicker on TornPDA
            if (statusElement.innerHTML !== statusMessage) {
              statusElement.innerHTML = statusMessage;
            }
            if (compactWarStatus && compactWarStatus.innerHTML !== compactMessage) {
              compactWarStatus.innerHTML = compactMessage;
            }
          })
          .catch((error) => {
            // Fallback to simple message if error
            statusElement.innerHTML =
              '<span style="color: #888;">Your faction is not in war</span>';
            if (compactWarStatus) {
              compactWarStatus.innerHTML =
                '<span style="color: #888;">No War</span>';
            }
          });

        if (targetsElement) targetsElement.style.display = "none";
        // Stop all target refresh timers when no war
        if (this.targetRefreshTimer) {
          clearInterval(this.targetRefreshTimer);
          this.targetRefreshTimer = null;
        }
        if (this.fullRefreshTimer) {
          clearInterval(this.fullRefreshTimer);
          this.fullRefreshTimer = null;
        }
        if (this.hospitalTimer) {
          clearInterval(this.hospitalTimer);
          this.hospitalTimer = null;
        }
        if (this.activeSyncTimer) {
          clearInterval(this.activeSyncTimer);
          this.activeSyncTimer = null;
        }
        if (this.ownFactionSyncTimer) {
          clearInterval(this.ownFactionSyncTimer);
          this.ownFactionSyncTimer = null;
        }
        // Clear cached targets
        this.currentTargets.clear();
      }
    }

    loadSettingsData() {
      const settingsStatus = document.getElementById("settings-status");
      const settingsInfo = document.getElementById("settings-info");

      if (settingsStatus) {
        settingsStatus.style.display = "none";
      }

      if (settingsInfo) {
        settingsInfo.style.display = "block";
      }

      // Load current API key for display
      const currentApiDisplay = document.getElementById("current-api-display");
      if (currentApiDisplay && this.apiKey) {
        const maskedKey =
          this.apiKey.substring(0, 8) +
          "..." +
          this.apiKey.substring(this.apiKey.length - 4);
        currentApiDisplay.textContent = maskedKey;

        // Update user info displays
        const userIdDisplay = document.getElementById("user-id-display");
        const factionIdDisplay = document.getElementById("faction-id-display");
        if (userIdDisplay) {
          userIdDisplay.textContent = this.userId || "Unknown";
        }
        if (factionIdDisplay) {
          factionIdDisplay.textContent = this.factionId || "Unknown";
        }

        // Check TornStats status in background
        this.checkTornStatsStatus();
      } else if (currentApiDisplay) {
        currentApiDisplay.textContent = "Not configured";

        // Update TornStats status
        const tornStatsStatus = document.getElementById("tornstats-status");
        if (tornStatsStatus) {
          tornStatsStatus.textContent = "No API Key";
          tornStatsStatus.style.color = "#ff6666";
        }

        // Update user info displays
        const userIdDisplay = document.getElementById("user-id-display");
        const factionIdDisplay = document.getElementById("faction-id-display");
        if (userIdDisplay) {
          userIdDisplay.textContent = "Not configured";
        }
        if (factionIdDisplay) {
          factionIdDisplay.textContent = "Not configured";
        }
      }

      // Setup settings button handlers
      setTimeout(() => {
        const apiKeyBtn = document.getElementById("change-api-key-settings");
        const clearCacheBtn = document.getElementById("clear-cache");

        if (apiKeyBtn) {
          apiKeyBtn.onclick = () => this.showApiKeyModal();
        }

        // BSP mode toggle removed - always use TBS mode

        if (clearCacheBtn) {
          clearCacheBtn.onclick = () => {
            if (
              confirm(
                "Clear all cached data? This will remove stored targets and war status."
              )
            ) {
              try {
                // Clear localStorage items
                localStorage.removeItem(CONFIG.targetsStorageKey);
                localStorage.removeItem(CONFIG.targetsCacheTimeKey);
                localStorage.removeItem(CONFIG.warStatusStorageKey);
                localStorage.removeItem(CONFIG.warStatusCacheTimeKey);
                localStorage.removeItem(CONFIG.factionDataStorageKey);
                localStorage.removeItem(CONFIG.factionDataCacheTimeKey);
                localStorage.removeItem(CONFIG.showMyChainStorageKey);
                localStorage.removeItem(CONFIG.showEnemyChainStorageKey);
                localStorage.removeItem(CONFIG.showBSPColumnStorageKey);
                localStorage.removeItem(CONFIG.showFactionTableStorageKey);
                localStorage.removeItem(CONFIG.enableHospitalAlertsStorageKey);
                localStorage.removeItem(CONFIG.hospitalAlertsStorageKey);
                localStorage.removeItem(CONFIG.hospitalTimersStorageKey);
                localStorage.removeItem(CONFIG.minimizedStateStorageKey);
                localStorage.removeItem(CONFIG.activeTabStorageKey);
                localStorage.removeItem(CONFIG.sortConfigStorageKey);
                localStorage.removeItem(CONFIG.factionSortConfigStorageKey);
                localStorage.removeItem(CONFIG.warFiltersStorageKey);

                // Clear GM storage items
                GM_setValue(CONFIG.warStatusStorageKey, null);
                GM_setValue(CONFIG.warStatusCacheTimeKey, null);
                GM_setValue(CONFIG.factionDataStorageKey, null);
                GM_setValue(CONFIG.factionDataCacheTimeKey, null);

                // Clear all war-related localStorage keys
                const keys = Object.keys(localStorage);
                keys.forEach((key) => {
                  if (
                    key.includes("torn_war_") ||
                    key.includes("torn_faction_")
                    // key.startsWith("PlayerBattleStats") ||
                    // key.includes("tdup.battleStatsPredictor")
                  ) {
                    localStorage.removeItem(key);
                  }
                });

                // Clear current data from memory
                if (this.currentTargets) this.currentTargets.clear();
                if (this.hospitalTimers) this.hospitalTimers.clear();
                if (this.hospitalAlerts) this.hospitalAlerts = [];
                this.warStatus = null;
                this.factionData = null;

                alert(
                  "✅ Cache cleared successfully! Page will refresh in 2 seconds."
                );

                // Refresh the page to reload data
                setTimeout(() => {
                  location.reload();
                }, 2000);
              } catch (error) {
                console.error("Error clearing cache:", error);
                alert(
                  "❌ Error clearing cache: " +
                    error.message +
                    "\nCheck console for details."
                );
              }
            }
          };
        }

        // Setup chain visibility toggle handlers
        const myChainBtn = document.getElementById("toggle-my-chain");

        if (myChainBtn) {
          // Load current state
          const showMyChain = this.getChainVisibilitySetting("my");
          this.updateChainToggleButton(myChainBtn, showMyChain, "My Chain");

          myChainBtn.onclick = () => {
            const newState = !this.getChainVisibilitySetting("my");
            this.setChainVisibilitySetting("my", newState);
            this.updateChainToggleButton(myChainBtn, newState, "My Chain");

            // Immediately update chain element visibility
            const chainInfoElement = document.getElementById("compact-chain-info");
            if (chainInfoElement) {
              chainInfoElement.style.display = newState ? "inline" : "none";
            }

            this.updateCompactInfo(); // Refresh display
          };
        }

        // Setup BSP column visibility toggle handler
        const bspColumnBtn = document.getElementById("toggle-bsp-column");
        if (bspColumnBtn) {
          // Load current state (default to true - show BSP column)
          const showBSPColumn = this.getBSPColumnVisibilitySetting();
          this.updateChainToggleButton(
            bspColumnBtn,
            showBSPColumn,
            "BSP Column"
          );

          bspColumnBtn.onclick = () => {
            const newState = !this.getBSPColumnVisibilitySetting();
            this.setBSPColumnVisibilitySetting(newState);
            this.updateChainToggleButton(bspColumnBtn, newState, "BSP Column");
            this.updateBSPColumnDisplay(); // Refresh display
          };
        }

        // Setup hospital alerts toggle button
        const hospitalAlertsBtn = document.getElementById(
          "toggle-hospital-alerts"
        );
        if (hospitalAlertsBtn) {
          // Load current state (default to true - show hospital alerts)
          const enableHospitalAlerts = this.getHospitalAlertsEnabledSetting();
          this.updateChainToggleButton(
            hospitalAlertsBtn,
            enableHospitalAlerts,
            "Early Exit Alerts"
          );

          hospitalAlertsBtn.onclick = () => {
            const newState = !this.getHospitalAlertsEnabledSetting();
            this.setHospitalAlertsEnabledSetting(newState);
            this.updateChainToggleButton(
              hospitalAlertsBtn,
              newState,
              "Early Exit Alerts"
            );
          };
        }

        // Setup faction table visibility toggle handler
        const factionTableBtn = document.getElementById("toggle-faction-table");
        if (factionTableBtn) {
          // Load current state (default to true - show faction table)
          const showFactionTable = this.getFactionTableVisibilitySetting();
          this.updateChainToggleButton(
            factionTableBtn,
            showFactionTable,
            "Faction Table"
          );

          factionTableBtn.onclick = () => {
            const newState = !this.getFactionTableVisibilitySetting();
            this.setFactionTableVisibilitySetting(newState);
            this.updateChainToggleButton(factionTableBtn, newState, "Faction Table");
            this.updateFactionTableDisplay(); // Refresh display
          };
        }
      }, 100);

      // Initialize BSP column display
      setTimeout(() => {
        this.updateBSPColumnDisplay();
        this.updateFactionTableDisplay();
      }, 200);

      // Initialize hospital alerts display
      setTimeout(() => {
        this.updateHospitalAlertsDisplay();
      }, 300);
    }

    getChainVisibilitySetting(type) {
      const key =
        type === "my"
          ? CONFIG.showMyChainStorageKey
          : CONFIG.showEnemyChainStorageKey;
      const value = localStorage.getItem(key);
      return value === "true"; // Default to false (disabled)
    }

    setChainVisibilitySetting(type, enabled) {
      const key =
        type === "my"
          ? CONFIG.showMyChainStorageKey
          : CONFIG.showEnemyChainStorageKey;
      localStorage.setItem(key, enabled.toString());
    }

    initializeChainVisibility() {
      // Initialize my chain visibility
      const chainInfoElement = document.getElementById("compact-chain-info");
      if (chainInfoElement) {
        const showMyChain = this.getChainVisibilitySetting("my");
        chainInfoElement.style.display = showMyChain ? "inline" : "none";
        if (showMyChain) {
          // Set default content if data not loaded yet
          chainInfoElement.textContent = "Chain: 0 (Loading...)";
        }
      }


      // Force an immediate update to load real data
      setTimeout(() => {
        this.updateCompactInfo();
      }, 100);
    }

    getBSPColumnVisibilitySetting() {
      const value = localStorage.getItem(CONFIG.showBSPColumnStorageKey);
      return value === null ? true : value === "true"; // Default to true (show BSP column)
    }

    setBSPColumnVisibilitySetting(enabled) {
      localStorage.setItem(CONFIG.showBSPColumnStorageKey, enabled.toString());
    }

    getFactionTableVisibilitySetting() {
      const value = localStorage.getItem(CONFIG.showFactionTableStorageKey);
      return value === null ? true : value === "true"; // Default to true (show faction table)
    }

    setFactionTableVisibilitySetting(enabled) {
      localStorage.setItem(CONFIG.showFactionTableStorageKey, enabled.toString());
    }

    getHospitalAlertsEnabledSetting() {
      const value = localStorage.getItem(CONFIG.enableHospitalAlertsStorageKey);
      return value === null ? true : value === "true"; // Default to true (enable hospital alerts)
    }

    setHospitalAlertsEnabledSetting(enabled) {
      localStorage.setItem(
        CONFIG.enableHospitalAlertsStorageKey,
        enabled.toString()
      );
    }

    updateBSPColumnDisplay() {
      const showBSP = this.getBSPColumnVisibilitySetting();
      const style =
        document.getElementById("bsp-column-style") ||
        document.createElement("style");
      style.id = "bsp-column-style";

      if (!showBSP) {
        style.textContent = `
                    #targets-list th:nth-child(2),
                    #targets-list td:nth-child(2),
                    #faction-list th:nth-child(2),
                    #faction-list td:nth-child(2) {
                        display: none !important;
                    }
                `;
      } else {
        style.textContent = "";
      }

      if (!style.parentNode) {
        document.head.appendChild(style);
      }
    }

    updateFactionTableDisplay() {
      const showFactionTable = this.getFactionTableVisibilitySetting();
      const factionSection = document.querySelector('.faction-section');

      if (factionSection) {
        factionSection.style.display = showFactionTable ? 'block' : 'none';
      }
    }

    displayCachedWarDataInstantly() {
      // Instantly display cached war data when switching to war tab for better UX
      if (!this.currentWar) return;

      const targetsList = document.getElementById("targets-list");
      if (!targetsList) {
        return;
      }

      // Cache disabled for testing - skip cached display

      // Also instantly display cached faction data if available
      const cachedFactionData = this.loadCachedFactionData();
      if (cachedFactionData && cachedFactionData.factionData) {
        this.cachedFactionData = cachedFactionData.factionData;
        setTimeout(() => {
          this.displayWarFactionMembers(cachedFactionData.factionData);
        }, 100);
      }
    }

    trackHospitalStatus(userId, statusData) {
      if (!userId || !statusData) return;

      const currentTime = Math.floor(Date.now() / 1000);
      const isHospital =
        statusData.state && statusData.state.toLowerCase() === "hospital";
      const isOkay =
        statusData.state && statusData.state.toLowerCase() === "okay";

      // If currently in hospital, track the timer
      if (isHospital && statusData.until && statusData.until > currentTime) {
        const timeLeft = statusData.until - currentTime;
        this.hospitalTimers.set(userId, {
          timer: timeLeft,
          timestamp: currentTime,
          until: statusData.until,
        });
      }

      // If status changed from hospital to okay, check for early exit
      if (isOkay && this.hospitalTimers.has(userId)) {
        const hospitData = this.hospitalTimers.get(userId);
        const expectedRelease = hospitData.until;

        // If they're out before expected time, it's an early exit
        if (currentTime < expectedRelease) {
          this.createHospitalAlert(userId, hospitData, currentTime);
        }

        // Clean up the timer
        this.hospitalTimers.delete(userId);
      }
    }

    loadHelpData() {
      const helpStatus = document.getElementById("help-status");
      const helpInfo = document.getElementById("help-info");

      if (helpStatus) {
        helpStatus.style.display = "none";
      }

      if (helpInfo) {
        helpInfo.style.display = "block";
      }
    }

    createHospitalAlert(userId, hospitalData, exitTime) {
      // Check if hospital alerts are enabled
      if (!this.getHospitalAlertsEnabledSetting()) {
        return;
      }

      // Get user name from targets
      let userName = `User ${userId}`;
      if (this.currentTargets.has(userId)) {
        userName = this.currentTargets.get(userId).name || userName;
      }

      const timeLeft = hospitalData.until - exitTime;

      // Create temporary notification popup
      const notification = document.createElement("div");
      notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #ff4444, #cc0000);
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                font-family: 'Arial', sans-serif;
                font-size: 14px;
                font-weight: bold;
                box-shadow: 0 4px 15px rgba(255, 68, 68, 0.4);
                z-index: 10000;
                border: 2px solid rgba(255, 255, 255, 0.2);
                animation: slideInFromRight 0.3s ease-out;
                min-width: 280px;
            `;

      notification.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 5px;">
                    <span style="font-size: 18px; margin-right: 8px;">🚨</span>
                    <strong>Hospital Early Exit!</strong>
                </div>
                <div style="font-size: 12px; font-weight: normal; opacity: 0.9;">
                    <strong style="color: #ffcccc;">${userName}</strong> left hospital <strong>${this.formatTime(
        timeLeft
      )}</strong> early
                </div>
            `;

      // Add CSS animation if not exists
      if (!document.getElementById("hospital-notification-css")) {
        const style = document.createElement("style");
        style.id = "hospital-notification-css";
        style.textContent = `
                    @keyframes slideInFromRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOutToRight {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
        document.head.appendChild(style);
      }

      document.body.appendChild(notification);

      // Auto-remove after 4 seconds with slide-out animation
      setTimeout(() => {
        notification.style.animation = "slideOutToRight 0.3s ease-in forwards";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }, 4000);
    }

    formatTime(seconds) {
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    updateHospitalAlertsDisplay() {
      // Remove old badge and alert systems - now using temporary notifications only
      this.removeWarTabBadge();
      this.removeAlertsSection();
    }

    removeWarTabBadge() {
      const warTab = document.getElementById("tab-war");
      if (!warTab) return;

      const badge = warTab.querySelector(".alert-badge");
      if (badge) {
        badge.remove();
      }
    }

    removeAlertsSection() {
      const alertsSection = document.getElementById("hospital-alerts-section");
      if (alertsSection) {
        alertsSection.remove();
      }
    }

    formatTimeAgo(timestamp) {
      const now = Math.floor(Date.now() / 1000);
      const diff = now - timestamp;
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return `${Math.floor(diff / 3600)}h ago`;
    }

    loadHospitalAlerts() {
      try {
        const stored = localStorage.getItem(CONFIG.hospitalAlertsStorageKey);
        if (stored) {
          const alerts = JSON.parse(stored);
          // Clean old alerts (older than 2 hours)
          const now = Math.floor(Date.now() / 1000);
          return alerts.filter((alert) => now - alert.timestamp < 7200);
        }
      } catch (error) {
        console.error("[Hospital Alerts] Error loading alerts:", error);
      }
      return [];
    }

    updateChainToggleButton(button, enabled, label) {
      // Determine the prefix based on the label
      const prefix =
        label.includes("Alert") || label.includes("Exit") ? "" : "Show ";

      if (enabled) {
        button.textContent = `${prefix}${label}: ON`;
        button.style.background =
          "linear-gradient(to bottom, #4caf50, #388e3c)";
        button.style.border = "1px solid #2e7d32";
        button.onmouseover = () => {
          button.style.background =
            "linear-gradient(to bottom, #66bb6a, #43a047)";
        };
        button.onmouseout = () => {
          button.style.background =
            "linear-gradient(to bottom, #4caf50, #388e3c)";
        };
      } else {
        button.textContent = `${prefix}${label}: OFF`;
        button.style.background = "linear-gradient(to bottom, #666, #444)";
        button.style.border = "1px solid #333";
        button.onmouseover = () => {
          button.style.background = "linear-gradient(to bottom, #777, #555)";
        };
        button.onmouseout = () => {
          button.style.background = "linear-gradient(to bottom, #666, #444)";
        };
      }
    }

    async registerFactionForXanaxMonitoring() {
      if (!this.factionId || !this.apiKey) {
        return;
      }

      try {
        // Obtenir le nom de la faction depuis les données en cache
        const cachedFactionData = this.loadCachedFactionData();
        let factionName = "Unknown Faction";

        if (cachedFactionData && cachedFactionData.factionData) {
          factionName = cachedFactionData.factionData.name || factionName;
        }

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/rpc/register_faction_for_xanax_monitoring`,
          {
            method: "POST",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_faction_id: this.factionId,
              p_faction_name: factionName,
              p_torn_api_key: this.apiKey,
            }),
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
        } else {
          console.error(
            "[War Calling] Failed to register faction:",
            await response.text()
          );
        }
      } catch (error) {
        console.error("[War Calling] Error registering faction:", error);
      }
    }

    async loadAdminData() {
      if (!this.isAdmin()) {
        return;
      }

      try {
        // Get xanax data directly from Supabase faction_licenses table
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/faction_licenses?faction_id=eq.${this.factionId}&select=*`,
          {
            method: "GET",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        let totalXanax = 0;
        let warsAvailable = 0;
        let lastDonation = null;

        if (response.ok) {
          const licenses = await response.json();

          if (licenses.length > 0) {
            totalXanax = licenses[0].total_xanax_received || 0;
            warsAvailable = licenses[0].wars_paid || 0;

            // Get recent payments to find last donation
            const paymentsResponse = await customFetch(
              `${CONFIG.supabase.url}/rest/v1/xanax_payments?faction_id=eq.${this.factionId}&select=created_at&order=created_at.desc&limit=1`,
              {
                method: "GET",
                headers: {
                  apikey: CONFIG.supabase.anonKey,
                  Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (paymentsResponse.ok) {
              const payments = await paymentsResponse.json();
              if (payments.length > 0) {
                lastDonation = new Date(payments[0].created_at);
              }
            }
          }
        } else {
          console.error(
            "[War Calling] Error loading faction licenses:",
            await response.text()
          );
        }

        // Update UI elements
        const adminStatusElement = document.getElementById("admin-status");
        const adminInfoElement = document.getElementById("admin-info");
        const totalXanaxElement = document.getElementById("total-xanax-count");
        const warsCountElement = document.getElementById("wars-count");
        const lastDonationElement =
          document.getElementById("last-donation-time");
        const scriptStatusElement =
          document.getElementById("script-status-text");
        const toggleElement = document.getElementById(
          "admin-war-script-toggle"
        );

        // Clear loading message and show admin info (like faction tab)
        if (adminStatusElement) {
          adminStatusElement.innerHTML = "";
        }
        if (adminInfoElement) {
          adminInfoElement.style.display = "block";
        }

        if (totalXanaxElement)
          totalXanaxElement.textContent = totalXanax.toLocaleString();
        if (warsCountElement) warsCountElement.textContent = warsAvailable;

        // Update wars label dynamically
        const warsLabelElement = document.getElementById("wars-label");
        if (warsLabelElement) {
          warsLabelElement.textContent =
            warsAvailable === 1
              ? "War can be purchased:"
              : "Wars can be purchased:";
        }

        // Update breakdown information
        const breakdownElement = document.getElementById("wars-breakdown");
        if (breakdownElement) {
          const freeXanax = totalXanax - warsAvailable * 30;
          if (freeXanax > 0) {
            breakdownElement.innerHTML = `${freeXanax} free xanax • ${
              warsAvailable * 30
            }'ll be used for wars`;
          } else {
            breakdownElement.innerHTML = `All ${totalXanax} xanax used for wars`;
          }
        }
        if (lastDonationElement) {
          lastDonationElement.textContent = lastDonation
            ? lastDonation.toLocaleDateString()
            : "Never";
        }

        // War script status - get from faction data
        const isEnabled = await this.getFactionScriptStatus();
        if (scriptStatusElement) {
          scriptStatusElement.textContent = isEnabled ? "Enabled" : "Disabled";
          scriptStatusElement.style.color = isEnabled ? "#4caf50" : "#f44336";
        }
        if (toggleElement) {
          toggleElement.checked = isEnabled;

          const requirementElement = document.getElementById(
            "war-script-requirement"
          );

          // Only disable toggle and show warning if script is disabled AND insufficient xanax
          if (warsAvailable < 1 && !isEnabled) {
            toggleElement.disabled = true;
            toggleElement.style.cursor = "not-allowed";
            toggleElement.style.opacity = "0.5";

            // Add tooltip
            const labelElement = toggleElement.parentElement;
            if (labelElement) {
              labelElement.title = `Need at least 30 xanax to enable (current: ${totalXanax})`;
              labelElement.style.cursor = "not-allowed";
            }

            // Show requirement message
            if (requirementElement) {
              requirementElement.style.display = "block";
            }
          } else {
            // Check if faction is in active war or script is activated for next war
            if (isEnabled) {
              const isInActiveWar = await this.checkActiveWar();

              // Get license data to check if script is activated for next war
              let isActivatedForNextWar = false;
              try {
                const licenseResponse = await customFetch(
                  `${CONFIG.supabase.url}/rest/v1/faction_licenses?faction_id=eq.${this.factionId}&select=*`,
                  {
                    method: "GET",
                    headers: {
                      apikey: CONFIG.supabase.anonKey,
                      Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
                      "Content-Type": "application/json",
                    },
                  }
                );

                if (licenseResponse.ok) {
                  const licenses = await licenseResponse.json();
                  if (licenses.length > 0) {
                    isActivatedForNextWar =
                      licenses[0].script_activated_for_next_war || false;
                  }
                }
              } catch (error) {
                console.error(
                  "[War Calling] Error checking license data:",
                  error
                );
              }

              if (isInActiveWar || isActivatedForNextWar) {
                // Script is enabled and faction is in war - disable toggle
                toggleElement.disabled = true;
                toggleElement.style.cursor = "not-allowed";
                toggleElement.style.opacity = "0.7";

                const labelElement = toggleElement.parentElement;
                if (labelElement) {
                  labelElement.title =
                    "Cannot disable script during active war";
                  labelElement.style.cursor = "not-allowed";
                }

                // Show appropriate lock message
                if (requirementElement) {
                  requirementElement.style.display = "block";
                  requirementElement.style.color = "#ffa500";
                  requirementElement.innerHTML = isInActiveWar
                    ? "⚔️ Script locked during active war"
                    : "🔒 Script activated for next war - cannot disable";
                }
              } else {
                // Script enabled but no active war - allow toggle
                toggleElement.disabled = false;
                toggleElement.style.cursor = "pointer";
                toggleElement.style.opacity = "1";

                const labelElement = toggleElement.parentElement;
                if (labelElement) {
                  labelElement.title = "";
                  labelElement.style.cursor = "pointer";
                }

                // Hide requirement message
                if (requirementElement) {
                  requirementElement.style.display = "none";
                  requirementElement.style.color = "#ff6b6b";
                  requirementElement.innerHTML =
                    "⚠️ Requires at least 30 xanax (1 war)";
                }
              }
            } else {
              // Script disabled - normal behavior
              toggleElement.disabled = false;
              toggleElement.style.cursor = "pointer";
              toggleElement.style.opacity = "1";

              const labelElement = toggleElement.parentElement;
              if (labelElement) {
                labelElement.title = "";
                labelElement.style.cursor = "pointer";
              }

              // Hide requirement message
              if (requirementElement) {
                requirementElement.style.display = "none";
                requirementElement.style.color = "#ff6b6b";
                requirementElement.innerHTML =
                  "⚠️ Requires at least 30 xanax (1 war)";
              }
            }
          }
        }

        // Load xanax history directly in the table
        this.loadXanaxHistory();

        // Load script users data BEFORE faction data
        await this.loadScriptUsers();

        // Load faction data (which needs scriptUsers to display logos)
        await this.loadFactionData();

        // Setup admin button handlers
        setTimeout(() => {
          const refreshBtn = document.getElementById("refresh-xanax-data");
          const toggleBtn = document.getElementById("admin-war-script-toggle");

          if (refreshBtn) {
            refreshBtn.onclick = () => this.loadAdminData();
          }

          if (toggleBtn) {
            toggleBtn.onchange = (e) => this.toggleWarScript(e.target.checked);
          }
        }, 100);
      } catch (error) {
        console.error("[War Calling] Error loading admin data:", error);
        const adminStatusElement = document.getElementById("admin-status");
        if (adminStatusElement) {
          adminStatusElement.innerHTML = `<span style="color: #ff6666;">Error loading admin data: ${error.message}</span>`;
        }
      }
    }

    async loadXanaxHistory() {
      if (!this.factionId) {
        const historyTable = document.getElementById("xanax-history-table");
        if (historyTable) {
          historyTable.innerHTML =
            '<div style="color: #ff6666; text-align: center; padding: 15px;">No faction ID available</div>';
        }
        return;
      }

      try {
        // Get payment history from faction_xanax_payments table
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/faction_xanax_payments?faction_id=eq.${this.factionId}&select=*&order=created_at.desc&limit=20`,
          {
            method: "GET",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        const historyTable = document.getElementById("xanax-history-table");
        if (!historyTable) return;

        if (response.ok) {
          const payments = await response.json();

          if (payments.length === 0) {
            historyTable.innerHTML =
              '<div style="color: #888; text-align: center; padding: 15px; font-size: 13px;">No donations found in the last 30 days</div>';
          } else {
            let tableHTML = `
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead>
                                    <tr style="background: #1a1a1a;">
                                        <th style="padding: 10px 8px; text-align: left; border: none; color: #4a90e2; border-bottom: 1px solid #333;">Date</th>
                                        <th style="padding: 10px 8px; text-align: left; border: none; color: #4a90e2; border-bottom: 1px solid #333;">Sender</th>
                                        <th style="padding: 10px 8px; text-align: right; border: none; color: #4a90e2; border-bottom: 1px solid #333;">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                        `;

            payments.forEach((payment) => {
              const date = new Date(payment.created_at).toLocaleDateString();
              const time = new Date(payment.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
              tableHTML += `
                                <tr style="border-bottom: 1px solid #333;">
                                    <td style="padding: 8px; color: #ccc;">${date} ${time}</td>
                                    <td style="padding: 8px; color: #fff;">${
                                      payment.sender_name || "Unknown"
                                    }</td>
                                    <td style="padding: 8px; text-align: right; color: #4caf50; font-weight: bold;">${
                                      payment.xanax_amount || 0
                                    }</td>
                                </tr>
                            `;
            });

            tableHTML += "</tbody></table>";
            historyTable.innerHTML = tableHTML;
          }
        } else {
          historyTable.innerHTML =
            '<div style="color: #ff6666; text-align: center; padding: 15px;">Error loading history</div>';
        }
      } catch (error) {
        console.error("[War Calling] Error loading xanax history:", error);
        const historyTable = document.getElementById("xanax-history-table");
        if (historyTable) {
          historyTable.innerHTML =
            '<div style="color: #ff6666; text-align: center; padding: 15px;">Error loading history</div>';
        }
      }
    }

    async showXanaxHistory() {
      if (!this.factionId) return;

      // Track this modal request persistently
      this.persistentModalRequests.add('xanaxHistory');

      // If interface is minimized, queue the modal for later
      if (this.isMinimized) {
        this.pendingModals.push(() => this.showXanaxHistory());
        return;
      }

      const modal = document.createElement("div");
      modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

      modal.innerHTML = `
                <div style="
                    background: #2a2a2a;
                    padding: 20px;
                    border-radius: 10px;
                    width: 90%;
                    max-width: 600px;
                    max-height: 80%;
                    overflow-y: auto;
                    color: #fff;
                ">
                    <h3 style="margin: 0 0 20px 0; color: #4caf50;">💊 Xanax History (Last 30 Days)</h3>
                    <div id="xanax-history-content">Loading...</div>
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="this.closest('.fixed').remove()" style="
                            padding: 8px 16px;
                            background: #666;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                        ">Close</button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      // Load xanax history
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/faction_xanax_payments?faction_id=eq.${this.factionId}&select=*&order=created_at.desc&limit=50`,
          {
            method: "GET",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const payments = await response.json();
          const content = document.getElementById("xanax-history-content");

          if (payments.length === 0) {
            content.innerHTML =
              '<p style="text-align: center; color: #888;">No donations found in the last 30 days</p>';
          } else {
            let historyHTML =
              '<table style="width: 100%; border-collapse: collapse;">';
            historyHTML +=
              '<tr style="background: #1a1a1a;"><th style="padding: 10px; text-align: left;">Date</th><th style="padding: 10px; text-align: left;">Sender</th><th style="padding: 10px; text-align: right;">Amount</th></tr>';

            payments.forEach((payment) => {
              const date = new Date(payment.created_at).toLocaleDateString();
              historyHTML += `
                                <tr style="border-bottom: 1px solid #333;">
                                    <td style="padding: 8px;">${date}</td>
                                    <td style="padding: 8px;">${
                                      payment.sender_name || "Unknown"
                                    }</td>
                                    <td style="padding: 8px; text-align: right; color: #4caf50;">${
                                      payment.xanax_amount || 0
                                    }</td>
                                </tr>
                            `;
            });

            historyHTML += "</table>";
            content.innerHTML = historyHTML;
          }
        }
      } catch (error) {
        const content = document.getElementById("xanax-history-content");
        content.innerHTML =
          '<p style="color: #f44336;">Error loading history</p>';
      }
    }

    async getFactionScriptStatus() {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/factions?faction_id=eq.${this.factionId}&select=hasscriptfactionenabled`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
          }
        );

        if (!response.ok) {
          console.error(
            "[War Calling] Failed to get faction script status:",
            response.status
          );
          return true; // Default to enabled on error
        }

        const data = await response.json();
        if (data && data.length > 0) {
          const scriptEnabled = data[0].hasscriptfactionenabled;
          return scriptEnabled !== false; // Default to true if null/undefined
        }

        return true; // Default to enabled if no data found
      } catch (error) {
        console.error(
          "[War Calling] Error getting faction script status:",
          error
        );
        return true; // Default to enabled on error
      }
    }

    async checkActiveWar() {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/wars?select=*&or=(attacker_faction_id.eq.${this.factionId},defender_faction_id.eq.${this.factionId})&is_active=eq.true`,
          {
            method: "GET",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const wars = await response.json();
          return wars.length > 0;
        }
        return false;
      } catch (error) {
        console.error("[War Calling] Error checking active war:", error);
        return false;
      }
    }

    async toggleWarScript(enabled) {
      try {
        // If enabling, check if faction has enough xanax
        if (enabled) {
          const licenseResponse = await customFetch(
            `${CONFIG.supabase.url}/rest/v1/faction_licenses?faction_id=eq.${this.factionId}&select=*`,
            {
              method: "GET",
              headers: {
                apikey: CONFIG.supabase.anonKey,
                Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (licenseResponse.ok) {
            const licenses = await licenseResponse.json();
            if (licenses.length > 0) {
              const totalXanax = licenses[0].total_xanax_received || 0;
              const warsAvailable = licenses[0].wars_paid || 0;

              // Check if has at least 30 xanax (1 war)
              if (warsAvailable < 1) {
                // Reset checkbox
                const toggleBtn = document.getElementById(
                  "admin-war-script-toggle"
                );
                if (toggleBtn) {
                  toggleBtn.checked = false;
                }

                // Show error notification
                const notification = document.createElement("div");
                notification.style.cssText = `
                                    position: fixed;
                                    top: 20px;
                                    right: 20px;
                                    background: #ff6b6b;
                                    color: white;
                                    padding: 15px 20px;
                                    border-radius: 5px;
                                    z-index: 10001;
                                    font-size: 14px;
                                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                                `;
                notification.innerHTML = `
                                    <strong>Cannot enable war script</strong><br>
                                    <span style="font-size: 12px;">Your faction needs at least 30 xanax (1 war). You have ${totalXanax} xanax.</span>
                                `;

                document.body.appendChild(notification);

                setTimeout(() => {
                  notification.remove();
                }, 5000);

                return; // Stop here, don't enable
              }

              // Show confirmation dialog
              const confirmDialog = document.createElement("div");
              confirmDialog.style.cssText = `
                                position: fixed;
                                top: 50%;
                                left: 50%;
                                transform: translate(-50%, -50%);
                                background: #1a1a1a;
                                border: 2px solid #4a90e2;
                                border-radius: 8px;
                                padding: 20px 30px;
                                z-index: 10002;
                                box-shadow: 0 5px 20px rgba(0,0,0,0.8);
                                max-width: 400px;
                            `;

              confirmDialog.innerHTML = `
                                <h3 style="margin: 0 0 15px 0; color: #4a90e2; font-size: 18px;">Enable War Script?</h3>
                                <p style="color: #ccc; margin: 0 0 10px 0; font-size: 14px;">
                                    This will consume <strong style="color: #ffa500;">30 xanax</strong> (1 war) from your faction's balance.
                                </p>
                                <p style="color: #aaa; margin: 0 0 20px 0; font-size: 13px;">
                                    Current: ${totalXanax} xanax (${warsAvailable} wars available)<br>
                                    After activation: ${
                                      totalXanax - 30
                                    } xanax (${
                warsAvailable - 1
              } wars remaining)
                                </p>
                                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                    <button id="confirm-cancel" style="
                                        padding: 8px 20px;
                                        background: #444;
                                        color: white;
                                        border: none;
                                        border-radius: 4px;
                                        cursor: pointer;
                                    ">Cancel</button>
                                    <button id="confirm-enable" style="
                                        padding: 8px 20px;
                                        background: #4a90e2;
                                        color: white;
                                        border: none;
                                        border-radius: 4px;
                                        cursor: pointer;
                                    ">Enable Script</button>
                                </div>
                            `;

              document.body.appendChild(confirmDialog);

              // Add backdrop
              const backdrop = document.createElement("div");
              backdrop.style.cssText = `
                                position: fixed;
                                top: 0;
                                left: 0;
                                right: 0;
                                bottom: 0;
                                background: rgba(0,0,0,0.7);
                                z-index: 10001;
                            `;
              document.body.appendChild(backdrop);

              // Handle dialog buttons
              document.getElementById("confirm-cancel").onclick = () => {
                confirmDialog.remove();
                backdrop.remove();

                // Reset checkbox
                const toggleBtn = document.getElementById(
                  "admin-war-script-toggle"
                );
                if (toggleBtn) {
                  toggleBtn.checked = false;
                }
              };

              document.getElementById("confirm-enable").onclick = async () => {
                confirmDialog.remove();
                backdrop.remove();

                // Continue with enabling the script
                await this.performScriptToggle(enabled);
              };

              return; // Wait for user confirmation
            }
          }
        } else {
          // When disabling, check if script is activated for next war or in active war
          const licenseResponse = await customFetch(
            `${CONFIG.supabase.url}/rest/v1/faction_licenses?faction_id=eq.${this.factionId}&select=*`,
            {
              method: "GET",
              headers: {
                apikey: CONFIG.supabase.anonKey,
                Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          let isActivatedForNextWar = false;
          if (licenseResponse.ok) {
            const licenses = await licenseResponse.json();
            if (licenses.length > 0) {
              isActivatedForNextWar =
                licenses[0].script_activated_for_next_war || false;
            }
          }

          const isInActiveWar = await this.checkActiveWar();

          if (isInActiveWar || isActivatedForNextWar) {
            // Reset checkbox
            const toggleBtn = document.getElementById(
              "admin-war-script-toggle"
            );
            if (toggleBtn) {
              toggleBtn.checked = true;
            }

            // Show error notification
            const notification = document.createElement("div");
            notification.style.cssText = `
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: #ff6b6b;
                            color: white;
                            padding: 15px 20px;
                            border-radius: 5px;
                            z-index: 10001;
                            font-size: 14px;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        `;
            notification.innerHTML = `
                            <strong>Cannot disable war script</strong><br>
                            <span style="font-size: 12px;">${
                              isInActiveWar
                                ? "Your faction is currently in an active war. The script cannot be disabled until the war ends."
                                : "The script has been activated for the next war and cannot be disabled until a war ends."
                            }</span>
                        `;

            document.body.appendChild(notification);

            setTimeout(() => {
              notification.remove();
            }, 5000);

            return; // Stop here, don't disable
          }

          // Disabling allowed when no active war
          await this.performScriptToggle(enabled);
        }
      } catch (error) {
        console.error("[War Calling] Error in toggleWarScript:", error);

        // Revert checkbox on error
        const toggleElement = document.getElementById(
          "admin-war-script-toggle"
        );
        if (toggleElement) {
          toggleElement.checked = !enabled;
        }

        // Show error notification
        const notification = document.createElement("div");
        notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #ff6b6b;
                    color: white;
                    padding: 15px 20px;
                    border-radius: 5px;
                    z-index: 10001;
                    font-size: 14px;
                `;
        notification.textContent =
          "Error toggling war script: " + error.message;
        document.body.appendChild(notification);

        setTimeout(() => {
          notification.remove();
        }, 3000);
      }
    }

    async performScriptToggle(enabled) {
      try {
        // If enabling, consume 30 xanax
        if (enabled) {
          const consumeResponse = await customFetch(
            `${CONFIG.supabase.url}/rest/v1/rpc/consume_war_xanax`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: CONFIG.supabase.anonKey,
                Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              },
              body: JSON.stringify({
                p_faction_id: this.factionId,
                p_user_id: this.userId,
              }),
            }
          );

          if (!consumeResponse.ok) {
            const errorText = await consumeResponse.text();
            throw new Error(`Failed to consume xanax: ${errorText}`);
          }

          const consumeResult = await consumeResponse.json();
          if (!consumeResult || !consumeResult.success) {
            throw new Error(consumeResult?.error || "Failed to consume xanax");
          }
        }

        // Update faction hasScriptFactionEnabled in database
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/factions?faction_id=eq.${this.factionId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify({
              hasscriptfactionenabled: enabled,
              updated_at: new Date().toISOString(),
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            "[War Calling] Update faction error details:",
            errorText
          );
          throw new Error(
            `Failed to update faction: ${response.status} - ${errorText}`
          );
        }

        // Update UI immediately
        const statusElement = document.getElementById("script-status-text");
        if (statusElement) {
          statusElement.textContent = enabled ? "Enabled" : "Disabled";
          statusElement.style.color = enabled ? "#4caf50" : "#f44336";
        }

        // Show notification with xanax consumption info
        const notification = document.createElement("div");
        notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${enabled ? "#4caf50" : "#f44336"};
                    color: white;
                    padding: 15px 20px;
                    border-radius: 5px;
                    z-index: 10001;
                    font-size: 14px;
                `;

        if (enabled) {
          notification.innerHTML = `
                        <strong>✅ War script enabled!</strong><br>
                        <span style="font-size: 12px;">30 xanax consumed (1 war)</span>
                    `;
        } else {
          notification.textContent = "War script disabled for faction";
        }

        document.body.appendChild(notification);

        setTimeout(
          () => {
            notification.remove();
          },
          enabled ? 5000 : 3000
        );

        // Reload admin data to update xanax counts
        if (enabled) {
          setTimeout(() => {
            this.loadAdminData();
          }, 1000);
        }
      } catch (error) {
        console.error("[War Calling] Error toggling war script:", error);

        // Revert checkbox on error
        const toggleElement = document.getElementById(
          "admin-war-script-toggle"
        );
        if (toggleElement) {
          toggleElement.checked = !enabled;
        }

        // Show error notification
        const errorNotification = document.createElement("div");
        errorNotification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #f44336;
                    color: white;
                    padding: 15px 20px;
                    border-radius: 5px;
                    z-index: 10001;
                    font-size: 14px;
                `;
        errorNotification.textContent = `Error updating war script: ${error.message}`;

        document.body.appendChild(errorNotification);

        setTimeout(() => {
          errorNotification.remove();
        }, 5000);

        throw error; // Re-throw to be caught by toggleWarScript
      }
    }

    async loadFactionData() {
      if (!this.factionId || !this.apiKey) {
        const factionStatusElement = document.getElementById("faction-status");
        if (factionStatusElement) {
          factionStatusElement.innerHTML =
            '<span style="color: #ff6666;">No faction ID or API key available</span>';
        }
        return;
      }

      const factionStatusElement = document.getElementById("faction-status");
      const factionMembersElement = document.getElementById("faction-members");

      if (!factionStatusElement) return;

      // Try to load from cache first
      const cachedData = this.loadCachedFactionData();
      if (cachedData) {
        this.displayFactionData(cachedData);
        // Always load script users even when using cached faction data
        this.loadScriptUsers();
        return;
      }

      try {
        factionStatusElement.innerHTML = "Loading faction data...";

        // First fetch basic faction data from Torn API
        let basicFactionData = {};
        let factionMembers = {};

        try {
          const tornUrl = `https://api.torn.com/v2/faction?selections=profile&key=${this.apiKey}`;
          const tornResponse = await customFetch(tornUrl);

          if (tornResponse.ok) {
            basicFactionData = await tornResponse.json();
          }

          // Get members separately
          const membersUrl = `https://api.torn.com/v2/faction?selections=members&key=${this.apiKey}`;
          const membersResponse = await customFetch(membersUrl);

          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            factionMembers = membersData.members || {};

            // Basic selection includes members with limited info, let's check
          }
        } catch (tornError) {
          console.error("[War Calling] Torn API error:", tornError);
        }

        // Try Torn API v2 for additional faction data
        let additionalFactionData = null;
        try {
          const factionUrl = `https://api.torn.com/v2/faction/${this.factionId}?selections=profile,members&key=${this.apiKey}`;
          const factionResponse = await customFetch(factionUrl);

          if (factionResponse.ok) {
            additionalFactionData = await factionResponse.json();
          }
        } catch (factionError) {}

        // Combine data - use additional faction data if available, fallback to basic data
        let finalFactionData = basicFactionData;

        if (additionalFactionData) {
          // Merge additional faction data
          finalFactionData = {
            ...basicFactionData,
            ...additionalFactionData,
            best_chain:
              additionalFactionData.best_chain || basicFactionData.best_chain,
            rank: additionalFactionData.rank || basicFactionData.rank,
          };

          // Use additional faction members if available and more complete
          if (
            additionalFactionData.members &&
            Object.keys(additionalFactionData.members).length > 0
          ) {
            factionMembers = additionalFactionData.members;
          }
        }

        // Cache the data
        const cacheData = {
          factionData: finalFactionData,
          factionMembers: factionMembers,
        };

        this.saveFactionDataToCache(cacheData);

        // Display the data
        this.displayFactionData(cacheData);
      } catch (error) {
        console.error("[War Calling] Error loading faction data:", error);
        factionStatusElement.innerHTML = `<span style="color: #ff6666;">Error loading faction data: ${error.message}</span>`;
      }
    }

    isAdmin() {
      // Vérifier si l'utilisateur actuel est Leader, Co-leader ou Code Kitty
      const cachedFactionData = GM_getValue(CONFIG.factionDataStorageKey);

      if (cachedFactionData) {
        try {
          const data = JSON.parse(cachedFactionData);
          const factionMembers = data.factionMembers;

          if (factionMembers && this.userId) {
            const currentUser = factionMembers[this.userId];
            if (currentUser) {
              const position = currentUser.position.toLowerCase();
              const isAdmin =
                position === "leader" ||
                position === "co-leader" ||
                position === "code kitty";
              return isAdmin;
            }
          }
        } catch (error) {
          console.error("[War Calling] Error checking admin status:", error);
        }
      }

      // Fallback: show admin tab temporarily if we can't determine status yet
      // This will be updated once faction data loads
      return true;
    }

    updateAdminTabVisibility() {
      const adminTab = document.getElementById("tab-admin");
      const adminContent = document.getElementById("tab-content-admin");

      // Re-check admin status with current data
      const cachedFactionData = GM_getValue(CONFIG.factionDataStorageKey);
      let shouldShowAdmin = false;

      if (cachedFactionData) {
        try {
          const data = JSON.parse(cachedFactionData);
          const factionMembers = data.factionMembers;

          if (factionMembers && this.userId) {
            const currentUser = factionMembers[this.userId];
            if (currentUser) {
              const position = currentUser.position.toLowerCase();
              shouldShowAdmin =
                position === "leader" ||
                position === "co-leader" ||
                position === "code kitty";
            }
          }
        } catch (error) {
          console.error(
            "[War Calling] Error checking admin status in update:",
            error
          );
        }
      }

      if (adminTab) {
        adminTab.style.display = shouldShowAdmin ? "inline-block" : "none";
      }
      if (adminContent) {
        adminContent.style.display = shouldShowAdmin
          ? adminContent.style.display === "block"
            ? "block"
            : "none"
          : "none";
      }

      // If user is not admin and admin tab was active, switch to war tab
      if (!shouldShowAdmin) {
        const warTab = document.getElementById("tab-war");
        if (warTab && adminContent && adminContent.style.display === "block") {
          warTab.click();
        }
      }
    }

    displayFactionData(data) {
      const { factionData, factionMembers } = data;
      const factionStatusElement = document.getElementById("faction-status");
      const factionInfoElement = document.getElementById("faction-info");
      const leadershipElement = document.getElementById("faction-leadership");
      const statsElement = document.getElementById("faction-stats");
      const factionMembersElement = document.getElementById("faction-members");

      // Clear loading message
      if (factionStatusElement) {
        factionStatusElement.innerHTML = "";
      }

      if (factionInfoElement && leadershipElement && statsElement) {
        // Find leader and co-leader names from members
        let leaderName = "Unknown";
        let coLeaderName = "Unknown";
        let leaderId = null;
        let coLeaderId = null;
        const memberCount = Object.keys(factionMembers || {}).length;
        const capacity = factionData.capacity || 100;

        // TornStats provides leader/co-leader IDs, need to find their names
        if (factionMembers && factionData.leader) {
          leaderId = factionData.leader;
          const leaderMember = factionMembers[leaderId];
          if (leaderMember) leaderName = leaderMember.name;
        }

        if (factionMembers && factionData["co-leader"]) {
          coLeaderId = factionData["co-leader"];
          const coLeaderMember = factionMembers[coLeaderId];
          if (coLeaderMember) coLeaderName = coLeaderMember.name;
        }

        // Create clickable links for leader/co-leader
        const leaderLink = leaderId
          ? `<a href="https://www.torn.com/profiles.php?XID=${leaderId}" target="_blank" style="color: #4a90e2; text-decoration: none;">${leaderName}</a>`
          : leaderName;

        const coLeaderLink = coLeaderId
          ? `<a href="https://www.torn.com/profiles.php?XID=${coLeaderId}" target="_blank" style="color: #4a90e2; text-decoration: none;">${coLeaderName}</a>`
          : coLeaderName;

        // Display leadership info
        leadershipElement.innerHTML = `
                    <div style="font-size: 14px; line-height: 1.8;">
                        <div style="color: #4a90e2; font-weight: bold; margin-bottom: 5px;">LEADERSHIP</div>
                        <div><span style="color: #888;">Leader:</span> <span style="color: #fff;">${leaderLink}</span></div>
                        <div><span style="color: #888;">Co-leader:</span> <span style="color: #fff;">${coLeaderLink}</span></div>
                        <div><span style="color: #888;">Members:</span> <span style="color: #fff;">${memberCount} / ${capacity}</span></div>
                    </div>
                `;

        // Display stats info - TornStats structure
        const bestChain = factionData.best_chain || 0;
        let rankDisplay = "Unranked";

        let rankBadge = "";
        if (factionData.rank && factionData.rank.name) {
          rankDisplay = `${factionData.rank.name} ${
            factionData.rank.division || ""
          }`;
          if (factionData.rank.position) {
            rankDisplay += ` (#${factionData.rank.position})`;
          }

          // Generate ranking badge based on rank
          const rankName = factionData.rank.name.toLowerCase();
          let badgeColor = "#666";
          let badgeImage = "";

          if (rankName.includes("diamond")) {
            badgeColor = "#B9F2FF";
            badgeImage =
              "/images/v2/faction/rank/warring_tiers/big/diamond.png";
          } else if (rankName.includes("platinum")) {
            badgeColor = "#E5E4E2";
            badgeImage =
              "/images/v2/faction/rank/warring_tiers/big/platinum.png";
          } else if (rankName.includes("gold")) {
            badgeColor = "#FFD700";
            badgeImage = "/images/v2/faction/rank/warring_tiers/big/gold.png";
          } else if (rankName.includes("silver")) {
            badgeColor = "#C0C0C0";
            badgeImage = "/images/v2/faction/rank/warring_tiers/big/silver.png";
          } else if (rankName.includes("bronze")) {
            badgeColor = "#CD7F32";
            badgeImage = "/images/v2/faction/rank/warring_tiers/big/bronze.png";
          } else if (rankName.includes("metal")) {
            badgeColor = "#8C8C8C";
            badgeImage = "/images/v2/faction/rank/warring_tiers/big/metal.png";
          }

          // Create mini ranking badge with division progression
          if (badgeImage) {
            try {
              // Extract division info for progression dots
              let divisionNumber = 0;
              let maxDivisions = 4; // Default for most ranks

              if (
                factionData.rank &&
                factionData.rank.division !== undefined &&
                factionData.rank.division !== null
              ) {
                const divisionStr = String(
                  factionData.rank.division
                ).toLowerCase();
                if (divisionStr.includes("iii") || divisionStr === "3")
                  divisionNumber = 3;
                else if (divisionStr.includes("ii") || divisionStr === "2")
                  divisionNumber = 2;
                else if (divisionStr.includes("i") || divisionStr === "1")
                  divisionNumber = 1;
                else if (divisionStr === "0") divisionNumber = 0;
                else if (divisionStr === "") divisionNumber = 0; // Empty string case
              }

              // Metal only has 1 division
              if (rankName.includes("metal")) {
                maxDivisions = 1;
                divisionNumber = 1;
              }

              // Create progression dots
              let progressionDots = "";
              for (let i = 0; i < maxDivisions; i++) {
                const isActive =
                  i < divisionNumber || (maxDivisions === 1 && i === 0);
                const dotColor = isActive ? badgeColor : "#444";
                const opacity = isActive ? "1" : "0.6";
                const shadow = isActive
                  ? "box-shadow: 0 0 2px rgba(255,255,255,0.3);"
                  : "";

                progressionDots += `<div style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; opacity: ${opacity}; ${shadow}"></div>`;
              }

              rankBadge = `
                                <div style="display: inline-block; margin-left: 12px; vertical-align: top; opacity: 0.9; margin-top: -2px;">
                                    <img src="${badgeImage}" alt="${rankName} rank" style="width: 28px; height: 28px; vertical-align: middle;">
                                    <div style="display: inline-block; margin-left: 8px; vertical-align: middle;">
                                        <div style="display: flex; gap: 4px; align-items: center;">
                                            ${progressionDots}
                                        </div>
                                    </div>
                                </div>
                            `;
            } catch (error) {
              console.error("[War Calling] Error creating rank badge:", error);
              // Fallback to simple badge without progression dots
              rankBadge = `
                                <div style="display: inline-block; margin-left: 12px; vertical-align: top; opacity: 0.9; margin-top: -2px;">
                                    <img src="${badgeImage}" alt="${rankName} rank" style="width: 28px; height: 28px; vertical-align: middle;">
                                </div>
                            `;
            }
          }
        }

        statsElement.innerHTML = `
                    <div style="font-size: 14px; line-height: 1.8;">
                        <div style="color: #4a90e2; font-weight: bold; margin-bottom: 5px;">STATISTICS</div>
                        <div><span style="color: #888;">Best chain:</span> <span style="color: #fff;">${bestChain.toLocaleString()}</span></div>
                        <div><span style="color: #888;">Rank:</span> <span style="color: #fff;">${rankDisplay}</span>${rankBadge}</div>
                        <div><span style="color: #888;">Script Users:</span> <span id="script-users-count" style="color: #4a90e2;">Loading...</span></div>
                    </div>
                `;

        factionInfoElement.style.display = "block";
      }

      // Display members
      if (factionMembers && Object.keys(factionMembers).length > 0) {
        this.displayFactionMembers(factionMembers);
        if (factionMembersElement)
          factionMembersElement.style.display = "block";
      }

      // Load script users count
      this.loadScriptUsers();

      // Update admin tab visibility now that we have faction data
      this.updateAdminTabVisibility();
    }

    displayFactionMembers(members) {
      // Store current faction members for re-rendering after script users load
      this.currentFactionMembers = members;

      const membersListElement = document.getElementById("members-list");
      if (!membersListElement) return;

      // Convert members object to array and sort by level
      const membersList = Object.entries(members)
        .map(([id, member]) => ({
          id: parseInt(id),
          name: member.name,
          level: member.level,
          status: member.status,
          last_action: member.last_action,
          position: member.position,
        }))
        .sort((a, b) => b.level - a.level);

      const tableHTML = `
                <div style="border-radius: 8px; overflow: hidden; margin-top: 10px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #2a2a2a;">
                                <th style="padding: 12px 8px; text-align: left; border: none; color: #fff; border-bottom: 1px solid #333;">Name</th>
                                <th style="padding: 12px 8px; text-align: center; border: none; color: #fff; border-bottom: 1px solid #333;">Level</th>
                                <th style="padding: 12px 8px; text-align: left; border: none; color: #fff; border-bottom: 1px solid #333;">Position</th>
                                <th style="padding: 12px 8px; text-align: left; border: none; color: #fff; border-bottom: 1px solid #333;">Status</th>
                                <th style="padding: 12px 8px; text-align: center; border: none; color: #fff; border-bottom: 1px solid #333;">Last Action</th>
                            </tr>
                        </thead>
                    <tbody>
                        ${membersList
                          .map((member) => {
                            const lastActionDate = new Date(
                              member.last_action.timestamp * 1000
                            );
                            const lastActionText =
                              this.getTimeAgo(lastActionDate);

                            const hasScript =
                              this.scriptUsers?.has(member.id) || false;
                            const isActiveScript =
                              this.activeScriptUsers?.has(member.id) || false;

                            return `
                                <tr style="border-bottom: 1px solid #333; transition: background-color 0.2s;">
                                    <td style="padding: 10px 8px; border: none; background: #1a1a1a;">
                                        <a href="https://www.torn.com/profiles.php?XID=${
                                          member.id
                                        }"
                                           target="_blank"
                                           style="color: #4a90e2; text-decoration: none;">
                                            ${member.name}
                                        </a>
                                        ${
                                          hasScript
                                            ? `<span style="margin-left: 5px; display: inline-block;" title="${
                                                isActiveScript
                                                  ? "Active C.A.T user"
                                                  : "Inactive C.A.T user"
                                              }">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="16" viewBox="0 0 200 100" style="vertical-align: middle;">
                                                <rect x="5" y="5" width="190" height="90" rx="25" ry="25"
                                                      fill="${
                                                        isActiveScript
                                                          ? "#FFD84D"
                                                          : "#666"
                                                      }" stroke="${
                                                isActiveScript ? "#333" : "#222"
                                              }" stroke-width="3"/>
                                                <ellipse cx="100" cy="30" rx="85" ry="20" fill="white" opacity="0.2"/>
                                                <text x="50%" y="55%" font-size="50" font-family="Verdana, Geneva, sans-serif"
                                                      font-weight="bold" fill="${
                                                        isActiveScript
                                                          ? "black"
                                                          : "#888"
                                                      }" text-anchor="middle" dominant-baseline="middle"
                                                      style="letter-spacing:2px;">
                                                    C.A.T
                                                </text>
                                            </svg>
                                        </span>`
                                            : ""
                                        }
                                    </td>
                                    <td style="padding: 10px 8px; text-align: center; border: none; color: #ccc; background: #1a1a1a;">
                                        ${member.level}
                                    </td>
                                    <td style="padding: 10px 8px; border: none; color: #ccc; background: #1a1a1a;">
                                        ${member.position}
                                    </td>
                                    <td style="padding: 10px 8px; border: none; background: #1a1a1a;">
                                        <span style="color: ${this.getStatusColor(
                                          member.status.state
                                        )};">
                                            ${member.status.description}
                                        </span>
                                    </td>
                                    <td style="padding: 10px 8px; text-align: center; border: none; color: #ccc; background: #1a1a1a;">
                                        ${
                                          lastActionText === "Now"
                                            ? `${lastActionText} <span style="color: #00ff00; animation: pulse 2s ease-in-out infinite;">●</span>`
                                            : lastActionText
                                        }
                                    </td>
                                </tr>
                            `;
                          })
                          .join("")}
                    </tbody>
                </table>
                </div>
            `;

      membersListElement.innerHTML = tableHTML;
    }

    getStatusColor(state) {
      switch (state) {
        case "Okay":
          return "#4a90e2";
        case "Hospital":
          return "#ff6666";
        case "Jail":
          return "#ff9900";
        case "Abroad":
          return "#9966ff";
        case "Traveling":
          return "#9966ff";
        default:
          return "#ccc";
      }
    }

    getStatusIndicatorColor(target) {
      if (!target || !target.last_action || !target.last_action.status) {
        return "#808080"; // Gray for unknown
      }

      const activityStatus = target.last_action.status.toLowerCase();

      if (activityStatus === "online") {
        return "#A3D900"; // Green for online (actively using Torn)
      } else if (activityStatus === "idle") {
        return "#CD9900"; // Yellow for idle (on Torn but not active)
      } else if (activityStatus === "offline") {
        return "#B5B5B5"; // Gray for offline
      } else {
        return "#B5B5B5"; // Default gray for unknown status
      }
    }

    // ========================================
    // ATTACK TRACKING SYSTEM
    // ========================================
    startAttackTracking(targetId) {
      if (this.isAttacking) {
        this.stopAttackTracking();
      }

      this.currentAttackTarget = targetId;
      this.isAttacking = true;
      this.attackStartTime = Date.now(); // Track start time for 30s timeout
      // Start immediate status update and then every second
      this.updateAttackTargetStatus();
      this.attackStatusTimer = setInterval(() => {
        this.updateAttackTargetStatus();
      }, 2000); // Changed from 1000ms to 2000ms (2 seconds)
    }

    stopAttackTracking() {
      if (this.attackStatusTimer) {
        clearInterval(this.attackStatusTimer);
        this.attackStatusTimer = null;
      }

      if (this.currentAttackTarget) {

      }

      this.currentAttackTarget = null;
      this.isAttacking = false;
    }

    async updateAttackTargetStatus() {
      if (!this.currentAttackTarget || !this.apiKey) {

        return;
      }

      try {
        const apiUrl = `https://api.torn.com/v2/user/${this.currentAttackTarget}/basic?key=${this.apiKey}`;

        const response = await customFetch(apiUrl);

        if (!response.ok) {
          return;
        }

        const data = await response.json();


        // Update target in currentTargets if it exists
        const currentTarget = this.currentTargets.get(String(this.currentAttackTarget));
        if (currentTarget && data && data.profile) {

          // Extract data from API v2 format
          currentTarget.status = data.profile.status;
          currentTarget.last_action = data.profile.last_action;

          this.currentTargets.set(String(this.currentAttackTarget), currentTarget);

          // Update UI for this specific target
          const targetRow = document.querySelector(
            `.target-row[data-target-id="${this.currentAttackTarget}"]`
          );
          if (targetRow) {

            this.updateTargetRow(targetRow, currentTarget);
          }
          // Stop tracking if target is hospitalized OR after 30 seconds OR if target is not called
          const elapsedTime = Date.now() - this.attackStartTime;
          const isTargetCalled = this.activeCalls.has(String(this.currentAttackTarget));

          // Check for hospitalization - look for "Hospital" state or "In hospital" in description
          const isHospitalized = data.profile.status?.state === "Hospital" ||
                                 data.profile.status?.description?.toLowerCase().includes("in hospital");

          if (isHospitalized || elapsedTime >= 30000 || !isTargetCalled) {
            let reason = "unknown";
            if (isHospitalized) {
              reason = "target hospitalized";
              // Auto-uncall the target if hospitalized
              const targetToUncall = {
                user_id: this.currentAttackTarget,
                name: currentTarget.name
              };
              this.uncallTarget(targetToUncall, true); // true = auto uncall
            }
            else if (elapsedTime >= 30000) reason = "30 second timeout reached";
            else if (!isTargetCalled) reason = "target not called";

            this.stopAttackTracking();
            return;
          }
        }
      } catch (error) {
        console.error(
          "[War Calling] Error updating attack target status:",
          error
        );
      }
    }

    setupAttackTracking() {

      // Monitor URL changes to stop tracking when leaving attack page
      let currentUrl = window.location.href;
      setInterval(() => {
        if (window.location.href !== currentUrl) {
          const oldUrl = currentUrl;
          currentUrl = window.location.href;

          // If we're no longer on an attack page, stop tracking
          if (
            !currentUrl.includes("loader.php?sid=attack") &&
            this.isAttacking
          ) {
            this.stopAttackTracking();
          }
        }
      }, 1000);

      // Also stop tracking when page is about to unload
      window.addEventListener("beforeunload", () => {
        if (this.isAttacking) {
          this.stopAttackTracking();
        }
        // Clean up cache intervals
        if (this.cacheCleanupInterval) {
          clearInterval(this.cacheCleanupInterval);
        }
      });
    }

    getTimeAgo(date) {
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    }

    async loadScriptUsers() {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/users?select=user_id,user_name,last_seen&faction_id=eq.${this.factionId}`,
          {
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const scriptUsers = await response.json();
          const activeUsers = scriptUsers.filter((user) => {
            const lastSeen = new Date(user.last_seen);
            const now = new Date();
            const daysSinceLastSeen = (now - lastSeen) / (1000 * 60 * 60 * 24);
            return daysSinceLastSeen <= 7; // Active in last 7 days
          });

          const countElement = document.getElementById("script-users-count");
          if (countElement) {
            countElement.innerHTML = `${activeUsers.length}`;
            countElement.style.color =
              activeUsers.length > 0 ? "#4a90e2" : "#ff6666";
          }

          // Store for use in member display
          this.scriptUsers = new Set(scriptUsers.map((user) => user.user_id));
          this.activeScriptUsers = new Set(
            activeUsers.map((user) => user.user_id)
          );

          // Always ensure current user is marked as having the script
          if (this.userId) {
            this.scriptUsers.add(this.userId);
            this.activeScriptUsers.add(this.userId);
          }

          // Re-render faction members to show CAT badges
          if (this.currentFactionMembers) {
            this.displayFactionMembers(this.currentFactionMembers);
          }

          // Save to cache
          const cacheData = {
            scriptUsers: Array.from(this.scriptUsers),
            activeScriptUsers: Array.from(this.activeScriptUsers),
            timestamp: Date.now(),
          };
          localStorage.setItem(
            "cat_script_users_cache",
            JSON.stringify(cacheData)
          );
        }
      } catch (error) {
        const countElement = document.getElementById("script-users-count");
        if (countElement) {
          countElement.innerHTML = "Error";
          countElement.style.color = "#ff6666";
        }
        // Initialize empty sets on error and ensure current user is included
        this.scriptUsers = new Set();
        this.activeScriptUsers = new Set();
        if (this.userId) {
          this.scriptUsers.add(this.userId);
          this.activeScriptUsers.add(this.userId);
        }
      }
    }

    async refreshScriptUsers() {
      const refreshBtn = document.getElementById("refresh-script-users");
      if (refreshBtn) {
        refreshBtn.innerHTML = "Refreshing...";
        refreshBtn.disabled = true;
      }

      await this.loadScriptUsers();

      if (refreshBtn) {
        refreshBtn.innerHTML = "Refresh Script Users";
        refreshBtn.disabled = false;
      }
    }

    showMessageModal() {
      // Track this modal request persistently
      this.persistentModalRequests.add('messageModal');

      // If interface is minimized, queue the modal for later
      if (this.isMinimized) {
        this.pendingModals.push(() => this.showMessageModal());
        return;
      }

      const modal = document.createElement("div");
      modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

      modal.innerHTML = `
                <div style="
                    background: #2a2a2a;
                    padding: 20px;
                    border-radius: 10px;
                    width: 90%;
                    max-width: 500px;
                    border: 1px solid #555;
                ">
                    <h3 style="color: #fff; margin-top: 0;">Send Message to Script Users</h3>
                    <textarea id="message-content" placeholder="Enter your message..." style="
                        width: 100%;
                        height: 100px;
                        background: #333333;
                        border: 1px solid #555;
                        color: #ccc;
                        padding: 10px;
                        border-radius: 5px;
                        margin-bottom: 15px;
                        box-sizing: border-box;
                        resize: vertical;
                    "></textarea>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="cancel-message" style="
                            padding: 8px 16px;
                            background: #666;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                        ">Cancel</button>
                        <button id="send-message" style="
                            padding: 8px 16px;
                            background: #4a90e2;
                            color: white;
                            border: none;
                            border-radius: 5px;
                            cursor: pointer;
                        ">Send Message</button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      // Event handlers
      document.getElementById("cancel-message").onclick = () => {
        document.body.removeChild(modal);
      };

      document.getElementById("send-message").onclick = async () => {
        const messageContent = document
          .getElementById("message-content")
          .value.trim();
        if (!messageContent) {
          alert("Please enter a message");
          return;
        }

        const sendBtn = document.getElementById("send-message");
        sendBtn.innerHTML = "Sending...";
        sendBtn.disabled = true;

        await this.sendFactionMessage(messageContent);
        document.body.removeChild(modal);
      };

      // Close on backdrop click
      modal.onclick = (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      };
    }

    async sendFactionMessage(message) {
      try {
        const response = await customFetch(
          `${CONFIG.supabase.url}/rest/v1/faction_messages`,
          {
            method: "POST",
            headers: {
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              faction_id: this.factionId,
              sender_id: this.userId,
              sender_name: this.userName,
              message: message,
              created_at: new Date().toISOString(),
            }),
          }
        );

        if (response.ok) {
          alert("Message sent to all script users!");
        } else {
          throw new Error("Failed to send message");
        }
      } catch (error) {
        alert("Error sending message: " + error.message);
      }
    }

    toggleMinimize() {
      const container = document.getElementById("war-calling-container");
      const minimizeBtn = document.getElementById("minimize-btn");
      const infoBar = document.getElementById("war-calling-info-bar");

      if (!container || !minimizeBtn) return;

      this.isMinimized = !this.isMinimized;

      // Save state to localStorage
      localStorage.setItem(
        CONFIG.minimizedStateStorageKey,
        this.isMinimized.toString()
      );

      if (this.isMinimized) {
        // Minimize - hide all content except tabs header and info bar
        const contents = container.querySelectorAll(".tab-content");
        contents.forEach((element) => {
          element.style.display = "none";
        });

        // Change minimize button to restore
        minimizeBtn.innerHTML = "□";
        minimizeBtn.title = "Restore";

        // Make container smaller
        container.style.minHeight = "auto";
        container.style.height = "auto";
      } else {
        // Restore - show content for saved active tab
        const savedTab = GM_getValue(CONFIG.activeTabStorageKey, "war");
        const activeContent = document.getElementById(
          `tab-content-${savedTab}`
        );
        if (activeContent) {
          activeContent.style.display = "block";
        }

        // Change button back to minimize
        minimizeBtn.innerHTML = "−";
        minimizeBtn.title = "Minimize";

        // Restore container size
        container.style.minHeight = "";
        container.style.height = "";

        // Process any pending modals that were requested while minimized
        this.processPendingModals();
      }
    }

    isWarListItemOpen() {
      // Check if the war list item element is open (has act active classes)
      const warListItems = document.querySelectorAll('[class*="warListItem"]');
      for (const item of warListItems) {
        if (item.classList.contains('act') && item.classList.contains('active')) {
          return true;
        }
      }
      return false;
    }

    processPendingModals() {
      // Only process modals if the war list item is still open
      if (this.pendingModals.length > 0 && this.isWarListItemOpen()) {
        const lastModal = this.pendingModals[this.pendingModals.length - 1];
        this.pendingModals = []; // Clear the queue

        // Execute the modal function
        setTimeout(() => {
          if (typeof lastModal === 'function') {
            lastModal();
          }
        }, 100); // Small delay to ensure UI is fully restored
      } else {
        // Clear the queue if war list item is closed
        this.pendingModals = [];
      }
    }

    applyMinimizedState() {
      if (this.isMinimized) {
        const container = document.getElementById("war-calling-container");
        const minimizeBtn = document.getElementById("minimize-btn");

        if (container && minimizeBtn) {
          // Apply minimized state without toggling
          const contents = container.querySelectorAll(".tab-content");
          contents.forEach((element) => {
            element.style.display = "none";
          });

          // Set button to restore state
          minimizeBtn.innerHTML = "□";
          minimizeBtn.title = "Restore";

          // Make container smaller
          container.style.minHeight = "auto";
          container.style.height = "auto";
        }
      }
    }

    setupCrossTabMinimizeSync() {
      // Listen for localStorage changes from other tabs
      window.addEventListener("storage", (e) => {
        if (e.key === CONFIG.minimizedStateStorageKey && e.newValue !== null) {
          const newMinimizedState = e.newValue === "true";

          // Only update if state actually changed
          if (this.isMinimized !== newMinimizedState) {
            this.isMinimized = newMinimizedState;

            const container = document.getElementById("war-calling-container");
            const minimizeBtn = document.getElementById("minimize-btn");

            if (!container || !minimizeBtn) return;

            if (this.isMinimized) {
              // Minimize - hide all content except tabs header
              const contents = container.querySelectorAll(".tab-content");
              contents.forEach((element) => {
                element.style.display = "none";
              });

              // Change minimize button to restore
              minimizeBtn.innerHTML = "□";
              minimizeBtn.title = "Restore";

              // Make container smaller
              container.style.minHeight = "auto";
              container.style.height = "auto";
            } else {
              // Restore - show content for saved active tab
              const savedTab = GM_getValue(CONFIG.activeTabStorageKey, "war");
              const activeContent = document.getElementById(
                `tab-content-${savedTab}`
              );
              if (activeContent) {
                activeContent.style.display = "block";
              }

              // Change button back to minimize
              minimizeBtn.innerHTML = "−";
              minimizeBtn.title = "Minimize";

              // Restore container size
              container.style.minHeight = "";
              container.style.height = "";
            }
          }
        }
      });
    }

    setupWarListItemMonitor() {
      // Monitor DOM changes to detect when warListItem is opened/closed
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            if (target.className && target.className.includes('warListItem')) {
              // Check if the element gained the 'act active' classes (reopened)
              if (target.classList.contains('act') && target.classList.contains('active')) {
                // War list item was opened, restore persistent modal requests
                this.restorePersistentModals();
              } else {
                // War list item was closed, clear pending modals but keep persistent requests
                this.pendingModals = [];
              }
            }
          }
        });
      });

      // Start observing
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class']
      });
    }

    restorePersistentModals() {
      // Restore modal requests that were made before warListItem was closed
      for (const modalType of this.persistentModalRequests) {
        // Add to pending queue if interface is currently minimized
        if (this.isMinimized) {
          switch (modalType) {
            case 'apiKey':
              this.pendingModals.push(() => this.actuallyShowApiKeyModal());
              break;
            case 'xanaxHistory':
              this.pendingModals.push(() => this.actuallyShowXanaxHistory());
              break;
            case 'messageModal':
              this.pendingModals.push(() => this.actuallyShowMessageModal());
              break;
          }
        } else {
          // Show immediately if interface is not minimized
          setTimeout(() => {
            switch (modalType) {
              case 'apiKey':
                this.actuallyShowApiKeyModal();
                break;
              case 'xanaxHistory':
                this.actuallyShowXanaxHistory();
                break;
              case 'messageModal':
                this.actuallyShowMessageModal();
                break;
            }
          }, 100);
        }
      }

      // Clear persistent requests after restoring
      this.persistentModalRequests.clear();
    }

    updateChainInfo(warDetails) {
      // Handle the new format where chain data is in warDetails.factions
      if (warDetails && warDetails.factions && Array.isArray(warDetails.factions)) {
        
        const myFactionId = parseInt(this.factionId);
        
        // Find my faction and enemy faction in the factions array
        const myFaction = warDetails.factions.find(f => f.id === myFactionId);
        const enemyFaction = warDetails.factions.find(f => f.id !== myFactionId);
        
        if (myFaction && enemyFaction) {
          // Update chain info with new data
          this.chainInfo.my_chain = myFaction.chain || 0;
          this.chainInfo.enemy_chain = enemyFaction.chain || 0;
          this.chainInfo.faction_a_id = myFaction.id;
          this.chainInfo.faction_b_id = enemyFaction.id;
          this.chainInfo.faction_a_name = myFaction.name;
          this.chainInfo.faction_b_name = enemyFaction.name;
          
          // For compatibility, also set faction_a/b_chain
          this.chainInfo.faction_a_chain = myFaction.chain || 0;
          this.chainInfo.faction_b_chain = enemyFaction.chain || 0;
          
          this.chainInfo.last_update = Date.now();
          
        

          // Get chain timer data from Torn API
          this.updateChainTimer();

          // Update compact info after receiving new chain data
          this.updateCompactInfo();
        }
      }
      // Fallback to old format if needed
      else if (warDetails && warDetails.war) {
        this.chainInfo.faction_a_chain = warDetails.war.faction_a_chain || 0;
        this.chainInfo.faction_b_chain = warDetails.war.faction_b_chain || 0;
        this.chainInfo.faction_a_name = warDetails.war.faction_a_name || "";
        this.chainInfo.faction_b_name = warDetails.war.faction_b_name || "";
        this.chainInfo.faction_a_id = warDetails.war.faction_a_id;
        this.chainInfo.faction_b_id = warDetails.war.faction_b_id;

        // Determine my faction vs enemy faction
        const myFactionId = parseInt(this.factionId);
        if (myFactionId === this.chainInfo.faction_a_id) {
          this.chainInfo.my_chain = this.chainInfo.faction_a_chain;
          this.chainInfo.enemy_chain = this.chainInfo.faction_b_chain;
        } else {
          this.chainInfo.my_chain = this.chainInfo.faction_b_chain;
          this.chainInfo.enemy_chain = this.chainInfo.faction_a_chain;
        }

        this.chainInfo.last_update = Date.now();

        // Get chain timer data from Torn API
        this.updateChainTimer();

        // Update compact info after receiving new chain data
        this.updateCompactInfo();
      }
    }

    async updateChainTimer() {
      if (!this.apiKey || !this.factionId) return;

      // Check if we have recent WebSocket data (within last 10 seconds)
      const hasRecentWebSocketData = this.chainInfo.lastWebSocketUpdate && 
        (Date.now() - this.chainInfo.lastWebSocketUpdate < 10000) &&
        this.chainInfo.dataSource === 'websocket';
        
      if (hasRecentWebSocketData) {
        return;
      }

      try {
        const response = await fetch(
          `https://api.torn.com/v2/faction/${this.factionId}?selections=chain&key=${this.apiKey}`
        );
        const data = await response.json();

        if (data.chain) {
          // Only update if we don't have fresher WebSocket data
          if (!hasRecentWebSocketData) {
            // Update chain count from Torn API
            this.chainInfo.my_chain = data.chain.current || 0;

            // Chain timeout is returned as seconds remaining until chain expires
            const timeout = data.chain.timeout;
            if (timeout && timeout > 0) {
              // Convert seconds remaining to unix timestamp
              const currentTime = Math.floor(Date.now() / 1000);
              this.chainInfo.chain_timeout = currentTime + timeout;
              this.chainInfo.last_chain_hit = currentTime + timeout - 300; // 5 minutes before timeout
            } else {
              // No timeout or 0 means no active chain
              this.chainInfo.chain_timeout = null;
              this.chainInfo.last_chain_hit = null;
            }
            
            this.chainInfo.dataSource = 'api';
            
          

            // Start the countdown timer
            this.startChainTimer();
          } else {
          }
        }
      } catch (error) {
        console.error("[War Calling] Error fetching chain timer:", error);
      }
    }

    getChainProgression(currentChain) {
      const milestones = [
        10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000,
        100000,
      ];

      if (currentChain === 0) return "";

      // Find the next milestone
      const nextMilestone = milestones.find(
        (milestone) => currentChain < milestone
      );

      if (nextMilestone) {
        return `${currentChain}/${nextMilestone}`;
      } else {
        // Past all milestones
        return `${currentChain}/100000+`;
      }
    }

    updateSaveChainButton(timeLeft, myChain) {
      let saveChainBtn = document.getElementById("save-chain-btn");

      // Show button only if timer < 90 seconds, we have a chain, and my chain is visible
      if (
        timeLeft > 0 &&
        timeLeft < 90 &&
        myChain > 0 &&
        this.getChainVisibilitySetting("my")
      ) {
        if (!saveChainBtn) {
          // Create the button
          saveChainBtn = document.createElement("button");
          saveChainBtn.id = "save-chain-btn";
          saveChainBtn.textContent = "Save the chain";
          saveChainBtn.style.cssText = `
                        background: #ff6666;
                        color: black;
                        border: none;
                        padding: 6px 16px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Arial', sans-serif;
                        cursor: pointer;
                        animation: blinkFast 0.5s infinite;
                        font-weight: 600;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                        white-space: nowrap;
                    `;

          // Add CSS animation for fast blinking
          if (!document.getElementById("save-chain-css")) {
            const style = document.createElement("style");
            style.id = "save-chain-css";
            style.textContent = `
                            @keyframes blinkFast {
                                0%, 50% { opacity: 1; }
                                51%, 100% { opacity: 0.3; }
                            }
                        `;
            document.head.appendChild(style);
          }

          // Add click handler
          saveChainBtn.addEventListener("click", () => {
            this.saveChain();
          });

          // Insert into save chain row
          const saveChainRow = document.getElementById("save-chain-row");
          if (saveChainRow) {
            saveChainRow.appendChild(saveChainBtn);
          }
        }

        // Show the save chain row and button
        const saveChainRow = document.getElementById("save-chain-row");
        if (saveChainRow) {
          saveChainRow.style.display = "flex";
        }
        saveChainBtn.style.display = "inline-block";
      } else {
        // Hide button and row
        const saveChainRow = document.getElementById("save-chain-row");
        if (saveChainRow) {
          saveChainRow.style.display = "none";
        }
        if (saveChainBtn) {
          saveChainBtn.style.display = "none";
        }
      }
    }

    saveChain() {
      const minID = 3000000;
      const maxID = 3400000;

      function getRandomNumber(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      const randID = getRandomNumber(minID, maxID);
      const profileLink = `https://www.torn.com/loader.php?sid=attack&user2ID=${randID}`;

      window.location.href = profileLink;
    }

    startChainTimer() {
      // Only start a new timer if one doesn't exist
      if (!this.chainTimerInterval) {
        this.chainTimerInterval = setInterval(() => {
          this.updateCompactInfo();
        }, 250); // Update 4 times per second for real-time sync
      } else {
        // Timer already running, just trigger immediate update
        this.updateCompactInfo();
      }
    }

    extractChainDataFromDOM() {
      // Extract chain data directly from Torn's DOM elements
      const chainBoxElement = document.querySelector('.chain-box');
      if (!chainBoxElement) {
        return null;
      }

      try {
        // Extract chain count
        const chainCountElement = chainBoxElement.querySelector('.chain-box-center-stat');
        const chainCount = chainCountElement ? parseInt(chainCountElement.textContent.trim()) : null;

        // Extract time left
        const timeLeftElement = chainBoxElement.querySelector('.chain-box-timeleft');
        const timeLeftText = timeLeftElement ? timeLeftElement.textContent.trim() : null;

        // Convert time format (MM:SS or HH:MM:SS) to seconds
        let timeLeftSeconds = null;
        if (timeLeftText && timeLeftText.includes(':')) {
          const timeParts = timeLeftText.split(':').map(part => parseInt(part));
          if (timeParts.length === 2) {
            // MM:SS format
            timeLeftSeconds = (timeParts[0] * 60) + timeParts[1];
          } else if (timeParts.length === 3) {
            // HH:MM:SS format
            timeLeftSeconds = (timeParts[0] * 3600) + (timeParts[1] * 60) + timeParts[2];
          }
        }

        const result = {
          chainCount: chainCount,
          timeLeftSeconds: timeLeftSeconds,
          timeLeftText: timeLeftText,
          timestamp: Date.now()
        };

        return result;
      } catch (error) {
        console.error("[Chain DOM] Error extracting chain data:", error);
        return null;
      }
    }

    syncChainDataFromDOM() {
      // Get chain data from DOM and sync with chainInfo
      const domData = this.extractChainDataFromDOM();
      if (!domData) return false;

      let updated = false;

      // Update chain count if different
      if (domData.chainCount !== null && domData.chainCount !== this.chainInfo.my_chain) {
        this.chainInfo.my_chain = domData.chainCount;
        updated = true;
      }

      // Update chain timeout if we have time left
      if (domData.timeLeftSeconds !== null) {
        const currentTime = Math.floor(Date.now() / 1000);
        const newTimeout = currentTime + domData.timeLeftSeconds;
        
        // Only update if significantly different (> 2 seconds difference)
        const currentTimeout = this.chainInfo.chain_timeout || 0;
        if (Math.abs(newTimeout - currentTimeout) > 2) {
          this.chainInfo.chain_timeout = newTimeout;
          this.chainInfo.last_chain_hit = newTimeout - 300; // 5 minutes before timeout
          this.chainInfo.dataSource = 'dom';
          this.chainInfo.lastDOMUpdate = Date.now();
          updated = true;
        
        }
      }

      return updated;
    }

    updateCompactInfo() {
      const targetsCountElement = document.getElementById("compact-targets-count");
      const callsCountElement = document.getElementById("compact-calls-count");
      const compactChainContainer = document.getElementById("compact-chain-container");
      const chainInfoElement = document.getElementById("compact-chain-info");
      const enemyChainElement = document.getElementById("compact-enemy-chain");
      
      // Extract chain data from DOM instead of cloning
      const originalChainBox = document.querySelector('.chain-box');
      if (originalChainBox && compactChainContainer && this.getChainVisibilitySetting("my")) {
        // Extract the data we need
        const centerStatEl = originalChainBox.querySelector('.chain-box-center-stat');
        const timeleftEl = originalChainBox.querySelector('.chain-box-timeleft');
        
        const chainCount = centerStatEl ? parseInt(centerStatEl.textContent.trim()) : 0;
        const timeText = timeleftEl ? timeleftEl.textContent.trim() : '';
        
        // Check if we already have a compact chain text
        let compactChainText = compactChainContainer.querySelector('[data-cat-chain="true"]');
        
        if (!compactChainText) {
          // Create simple text span only if it doesn't exist
          compactChainText = document.createElement('span');
          compactChainText.setAttribute('data-cat-chain', 'true');
          compactChainText.style.cssText = `
            font-size: 11px !important;
            font-weight: 600 !important;
            margin: 0 5px !important;
            white-space: nowrap !important;
            display: inline-block !important;
            vertical-align: middle !important;
          `;
          
          // Clear the container and add our text
          compactChainContainer.innerHTML = '';
          compactChainContainer.appendChild(compactChainText);
        }
        
        // Update the text content and color based on time
        const progression = this.getChainProgression(chainCount);
        const displayText = `Chain: ${progression || chainCount} (${timeText})`;
        compactChainText.textContent = displayText;
        
        // Calculate time left for color coding
        const timeParts = timeText.split(':').map(p => parseInt(p));
        let timeLeft = 0;
        if (timeParts.length >= 2) {
          timeLeft = timeParts[0] * 60 + timeParts[1];
          if (timeParts.length === 3) {
            timeLeft = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
          }
        }
        
        // Apply text color based on time
        if (timeLeft >= 180) {
          compactChainText.style.color = '#27ae60'; // Green
        } else if (timeLeft >= 90) {
          compactChainText.style.color = '#e67e22'; // Orange
        } else if (timeLeft > 0) {
          compactChainText.style.color = '#e74c3c'; // Red
          // Add animation for critical timer
          if (timeLeft < 30) {
            compactChainText.style.animation = 'pulse-text 1s infinite';
          }
        } else {
          compactChainText.style.color = '#7f8c8d'; // Gray
        }
        
        // Store chain count for internal tracking
        this.chainInfo.my_chain = chainCount;
        
        // Show the container
        compactChainContainer.style.display = 'inline-block';
        
        // Show/hide save chain button based on timer
        this.updateSaveChainButton(timeLeft, chainCount);
      } else if (compactChainContainer) {
        // If no chain box found or chain display disabled, fall back to text display
        compactChainContainer.style.display = this.getChainVisibilitySetting("my") ? 'inline-block' : 'none';
        compactChainContainer.innerHTML = chainInfoElement ? chainInfoElement.outerHTML : '';
      }

      if (this.currentWar) {
        // Update targets count
        if (targetsCountElement) {
          const targetCount = this.currentTargets.size;
          targetsCountElement.textContent = `${targetCount} targets`;
          targetsCountElement.style.display =
            targetCount > 0 ? "inline" : "none";
        }

        // Update calls count
        if (callsCountElement) {
          const callsCount = this.activeCalls.size;
          callsCountElement.textContent = `${callsCount} calls`;
          callsCountElement.style.display = callsCount > 0 ? "inline" : "none";
        }

        // Old chain info logic removed - now using cloned DOM element

        // Update enemy chain info (only if enabled)
        if (
          enemyChainElement &&
          this.getChainVisibilitySetting("enemy")
        ) {
          const enemyChain = this.chainInfo.enemy_chain || 0;
          const enemyChainProgression = this.getChainProgression(enemyChain);
          enemyChainElement.textContent = `Enemy: ${
            enemyChainProgression || enemyChain
          }`;
          enemyChainElement.style.display = "inline";
        } else if (enemyChainElement) {
          enemyChainElement.style.display = "none";
        }
      } else {
        // No war - hide counts
        if (targetsCountElement) targetsCountElement.style.display = "none";
        if (callsCountElement) callsCountElement.style.display = "none";
        if (chainInfoElement) chainInfoElement.style.display = "none";
        if (enemyChainElement) enemyChainElement.style.display = "none";
      }
    }

    parseEnemyTargetsFromDOM() {
      const targets = [];

      try {
        // Look for the members list container first
        const membersList = document.querySelector('ul.members-list.membersCont___USwcq');
        if (!membersList) {
          console.warn('[C.A.T] Members list container not found');
          return targets;
        }

        // Look for enemy faction members in the specific container
        const enemyMembers = membersList.querySelectorAll('li.enemy.enemy___uiAJH');


        enemyMembers.forEach((memberElement, index) => {
          try {
            // Extract user ID from profile link
            const profileLink = memberElement.querySelector('a[href*="/profiles.php?XID="]');
            if (!profileLink) {
              console.warn(`[C.A.T] No profile link found for member ${index + 1}`);
              return;
            }

            const userIdMatch = profileLink.href.match(/XID=(\d+)/);
            if (!userIdMatch) {
              console.warn(`[C.A.T] Could not extract user ID for member ${index + 1}`);
              return;
            }

            const userId = parseInt(userIdMatch[1]);

            // Extract user name from honor text - try multiple selectors
            let userName = '';

            // Try the direct honor text first
            const honorText = memberElement.querySelector('.honor-text');
            if (honorText && honorText.textContent.trim()) {
              userName = honorText.textContent.trim();
            } else {
              // Fallback: try to get from alt attribute
              const honorImg = memberElement.querySelector('.honor-text-wrap img');
              if (honorImg && honorImg.alt) {
                userName = honorImg.alt;
              } else {
                // Last fallback: try to extract from profile link
                const profileHref = profileLink.href;
                console.warn(`[C.A.T] Could not extract name for user ${userId}, using ID`);
                userName = `User_${userId}`;
              }
            }

            // Extract level - look for the specific level div
            const levelElements = memberElement.querySelectorAll('.level.left.level___g3CWR');
            let level = 0;
            if (levelElements.length > 0) {
              // Take the first level element (sometimes there are duplicates in the HTML)
              level = parseInt(levelElements[0].textContent.trim()) || 0;
            }

            // Extract status - more robust detection
            const statusElement = memberElement.querySelector('.status.left');
            let status = 'Okay';
            let hospitalUntil = null;

            if (statusElement) {
              const statusText = statusElement.textContent.trim();
              const statusClasses = statusElement.className;

              // Check for specific status classes and text
              if (statusClasses.includes('hospital') || statusText.match(/^\d{2}:\d{2}:\d{2}$/)) {
                status = 'Hospital';

                // First check if we have a timestamp from the interceptors
                if (hospTime[userId]) {
                  hospitalUntil = hospTime[userId];
                } else {
                  // Fallback: Extract hospital timer if it's in HH:MM:SS format
                  const timeMatch = statusText.match(/^(\d{2}):(\d{2}):(\d{2})$/);
                  if (timeMatch) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = parseInt(timeMatch[3]);
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

                    // Calculate the "until" timestamp
                    hospitalUntil = Math.floor(Date.now() / 1000) + totalSeconds;
                  }
                }
              } else if (statusClasses.includes('traveling') || statusText.toLowerCase().includes('traveling')) {
                status = 'Traveling';
              } else if (statusClasses.includes('abroad') || statusText.toLowerCase().includes('abroad')) {
                status = 'Abroad';
              } else if (statusClasses.includes('jail') || statusText.toLowerCase().includes('jail')) {
                status = 'Jail';
              } else if (statusClasses.includes('federal') || statusText.toLowerCase().includes('federal')) {
                status = 'Federal';
              } else if (statusClasses.includes('okay') || statusText.toLowerCase().includes('okay')) {
                status = 'Okay';
              }
            }

            // Extract faction ID from faction link
            const factionLink = memberElement.querySelector('a[href*="/factions.php?step=profile&ID="]');
            let factionId = null;
            if (factionLink) {
              const factionIdMatch = factionLink.href.match(/ID=(\d+)/);
              if (factionIdMatch) {
                factionId = parseInt(factionIdMatch[1]);
              }
            }

            // Check activity status from SVG fill attribute
            const statusSvg = memberElement.querySelector('.userStatusWrap___ljSJG svg');
            let lastAction = { status: 'Offline' };
            if (statusSvg) {
              const fillUrl = statusSvg.getAttribute('fill');
              if (fillUrl && fillUrl.includes('svg_status_online')) {
                lastAction.status = 'Online';
              } else if (fillUrl && fillUrl.includes('svg_status_idle')) {
                lastAction.status = 'Idle';
              } else {
                lastAction.status = 'Offline';
              }
            }

            // Extract points (respect)
            const pointsElement = memberElement.querySelector('.points.left.points___TQbnu');
            let respect = 0;
            if (pointsElement) {
              respect = parseFloat(pointsElement.textContent.trim()) || 0;
            }

            const targetData = {
              user_id: userId,
              name: userName,
              level: level,
              faction_id: factionId,
              status: hospitalUntil ? { state: status, until: hospitalUntil } : status,
              last_action: lastAction,
              respect: respect
            };

            targets.push(targetData);


          } catch (error) {
            console.warn('[C.A.T] Error parsing member:', error);
          }
        });


      } catch (error) {
        console.error('[C.A.T] Error parsing DOM:', error);
      }

      return targets;
    }

    getEnemyTargetsFromInterceptedData() {
      const targets = [];

      try {
        // Get data from unsafeWindow
        const warData = unsafeWindow.CATWarData || {};
        const userData = unsafeWindow.CATUserData || {};

        // Check if we have intercepted war data
        if (!warData.opponentFaction || !warData.currentFaction) {
          return this.parseEnemyTargetsFromDOM();
        }

        // Get enemy faction ID
        const enemyFactionId = warData.opponentFaction.id;
        const myFactionId = warData.currentFaction.id;

        // Process all users from intercepted data
        Object.values(userData).forEach(user => {

          // Only get enemy faction members
          if (user.warFactionId === enemyFactionId) {

            const targetData = {
              user_id: user.userID,
              name: user.name,
              level: user.level,
              faction_id: user.factionId,
              status: user.status,
              last_action: {
                status: user.onlineStatus.status,
                timestamp: user.lastaction
              },
              respect: user.score || 0,
              honor_id: user.honorID,
              area: user.area || 1
            };

            targets.push(targetData);
          }
        });


      } catch (error) {
        console.warn('[C.A.T] Error getting targets from intercepted data, falling back to DOM:', error);
        return this.parseEnemyTargetsFromDOM();
      }

      return targets;
    }

    async loadTargets() {
      if (!this.currentWar) {
        return;
      }

      // Prevent concurrent loading
      if (this.isLoadingTargets) {
        return;
      }
      this.isLoadingTargets = true;

      const targetsList = document.getElementById("targets-list");

      try {
        // Parse targets directly from DOM - no API calls needed
        // if (targetsList) {
        //   targetsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #4a90e2;">⚔️ Loading...</div>';
        // }

        // Get enemy targets from intercepted data (falls back to DOM if needed)
        const domTargets = this.getEnemyTargetsFromInterceptedData();

        if (domTargets.length === 0) {
          if (targetsList) {
            targetsList.innerHTML = `
              <div style="text-align: center; padding: 40px 20px; color: #ffa500; background: rgba(255, 165, 0, 0.1); border-radius: 8px; margin: 20px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <h3 style="margin: 0 0 12px 0; color: #ffa500; font-size: 18px;">No Enemy Targets Found</h3>
                <p style="margin: 0; color: #ccc; font-size: 14px;">Make sure you're on an active war page to see enemy targets.</p>
              </div>
            `;
          }
          this.isLoadingTargets = false;
          return;
        }

        // Display the targets immediately without waiting for API calls
        this.displayTargets(domTargets);

        // Get active calls from Supabase in background to update UI (non-blocking)
        if (this.apiKey && this.apiKey.trim() !== "") {
          customFetch(`${CONFIG.supabase.url}/functions/v1/call-management`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              action: "get_calls",
              war_id: this.currentWar.war_id,
              faction_id: this.factionId,
            }),
          })
          .then(async callsResponse => {
            if (callsResponse.ok) {
              const callsData = await callsResponse.json();
              const activeCalls = callsData.calls || [];

              // Update UI to show which targets are already called
              activeCalls.forEach(call => {
                this.updateCallUI(call.target_id, true, call);
              });
            }
          })
          .catch(error => {
            console.warn("[C.A.T] Could not fetch active calls:", error);
          });
        }

        // Update faction table
        this.updateFactionTable();

        // Update UI with active calls
        this.activeCalls.forEach((callData, targetId) => {
          this.updateCallUI(targetId, true, callData);
        });
      } catch (error) {
        console.error("Load targets error:", error);
        // Only show error if this is the first load
        if (targetsList && this.currentTargets.size === 0) {
          targetsList.innerHTML = `<p style="color: #ff6666;">Error loading targets: ${error.message}</p>`;
        }
      } finally {
        this.isLoadingTargets = false;
      }
    }

    displayScriptDisabledMessage(message, reason = "disabled") {
      const targetsList = document.getElementById("targets-list");
      const warTargetsDiv = document.getElementById("war-targets");

      if (targetsList && warTargetsDiv) {
        // Show the war targets section
        warTargetsDiv.style.display = "block";

        let content = "";

        if (reason === "insufficient_xanax") {
          content = `
                        <div style="text-align: center; padding: 40px 20px; color: #ffa500; background: rgba(255, 165, 0, 0.1); border-radius: 8px; margin: 20px 0;">
                            <div style="font-size: 48px; margin-bottom: 16px;">💊</div>
                            <h3 style="margin: 0 0 12px 0; color: #ffa500; font-size: 18px;">War Script Not Available</h3>
                            <p style="margin: 0 0 12px 0; color: #ccc; font-size: 14px;">Your faction needs at least <strong>30 xanax</strong> to enable the war script.</p>
                            <p style="margin: 0 0 12px 0; color: #888; font-size: 12px;">Once you have 30 xanax (1 war), faction leadership can enable the script in the admin panel.</p>
                            <div style="margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 5px;">
                                <p style="margin: 0 0 8px 0; color: #aaa; font-size: 13px;"><strong>How to get xanax:</strong></p>
                                <p style="margin: 0; color: #999; font-size: 12px;">Send xanax to JESUUS [2353554] to activate the war script for your faction.</p>
                            </div>
                        </div>
                    `;
        } else if (reason === "disabled_by_admin") {
          content = `
                        <div style="text-align: center; padding: 40px 20px; color: #ff6b6b; background: rgba(255, 107, 107, 0.1); border-radius: 8px; margin: 20px 0;">
                            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                            <h3 style="margin: 0 0 12px 0; color: #ff6b6b; font-size: 18px;">${message}</h3>
                            <p style="margin: 0; color: #ccc; font-size: 14px;">Contact your faction leadership to re-enable the war script.</p>
                            <p style="margin: 12px 0 0 0; color: #888; font-size: 12px;">War script access can be managed in the admin panel by Leaders and Co-Leaders.</p>
                        </div>
                    `;
        }

        targetsList.innerHTML = content;
      }
    }

    displayTargets(targets) {

      // Prevent multiple simultaneous calls
      if (this.isDisplayingTargets) {
        return;
      }

      try {
        this.isDisplayingTargets = true;

      // Store unfiltered targets for filter reapplication
      if (targets && targets.length > 0) {
        this.allTargetsUnfiltered = [...targets];
      }

      // Performance optimization: Skip re-render if targets haven't changed
      // But allow re-render for sorting (when targets are same but order might be different)
      // Also allow re-render when filters have changed (isForceRenderFilters flag)
      if (targets && this.currentTargets.size > 0 && !this.isForceSort && !this.isForceRenderFilters) {
        const currentTargetIds = Array.from(this.currentTargets.keys()).sort();
        const newTargetIds = targets.map(t => t.user_id.toString()).sort();

        if (currentTargetIds.length === newTargetIds.length &&
            currentTargetIds.every((id, index) => id === newTargetIds[index])) {
          // Same targets, just update the existing display without full re-render
          this.isDisplayingTargets = false;
          return;
        }
      }

      // Reset force sort and filter flags
      this.isForceSort = false;
      this.isForceRenderFilters = false;

      const targetsList = document.getElementById("targets-list");

      if (!targets || targets.length === 0) {
        if (targetsList) {
          targetsList.innerHTML =
            '<p style="color: #888;">No available targets</p>';
        }
        this.currentTargets.clear();
        this.isDisplayingTargets = false;
        return;
      }

      // Apply filters first
      this._debuggedFirstMember = false; // Reset debug flag
      const filteredTargets = targets.filter(target => this.passesFilters(target));

      // Update currentTargets map for smart updates
      const newTargetsMap = new Map();
      filteredTargets.forEach((target) => {
        // Ensure user_id is string for consistency
        const targetIdStr = String(target.user_id);
        const updatedTarget = { ...target, user_id: targetIdStr };
        newTargetsMap.set(targetIdStr, updatedTarget);

        // Track hospital status changes for early exit detection
        if (target.status) {
          this.trackHospitalStatus(targetIdStr, target.status);
        }
      });

      if (this.activeCalls && this.activeCalls.size > 0) {
        this.activeCalls.forEach((callData, targetIdStr) => {
          if (!newTargetsMap.has(targetIdStr)) {
            const existingTarget = this.currentTargets.get(targetIdStr);

            let status = { state: "Unknown" };

            if (
              callData.target_status &&
              typeof callData.target_status === "object"
            ) {
              // If we have stored status, reconstruct it
              if (
                callData.target_status.state === "Hospital" &&
                callData.target_status.until
              ) {
                // Check if still in hospital
                const now = Math.floor(Date.now() / 1000);

                if (callData.target_status.until > now) {
                  // Still in hospital - keep the stored status
                  status = callData.target_status;
                } else {
                  // Hospital time expired - check actual current status instead of forcing "Okay"
                  // Use WebSocket or cached user data if available
                  const userId = callData.target_id?.toString();
                  if (userId && userData[userId]?.status) {
                    status = userData[userId].status;
                  } else {
                    // Fallback to checking existing target status or default
                    status = existingTarget?.status || { state: "Okay" };
                  }
                }
              } else {
                // Non-hospital status (Traveling, Abroad, Okay, etc.)
                status = callData.target_status;
              }
            } else {
              if (existingTarget?.status) {
                status = existingTarget.status;
              }
            }

            newTargetsMap.set(targetIdStr, {
              user_id: targetIdStr,
              name: callData.target_name || existingTarget?.name || "Unknown",
              level: existingTarget?.level || callData.target_level || 0,
              score: existingTarget?.score || 0,
              status: status,
              faction_id: this.currentWar?.enemy_faction_id || 0,
            });
          }
        });
      }

      // Check if table exists
      const tbody = document.getElementById("targets-tbody");
      const isFirstLoad = !tbody;

      // Always sync calls before first display if we have the prerequisites
      if (isFirstLoad && this.factionId && this.currentWar) {
        // Always sync on first load, regardless of current activeCalls size - REPLACED by unified sync
        // this.syncActiveCalls().then(() => {
        setTimeout(() => {
          // Small delay to ensure DOM is ready
          setTimeout(() => {
            // Force update UI for all called targets
            this.activeCalls.forEach((callData, targetId) => {
              this.updateCallUI(targetId, true, callData);
            });
          }, 100);
        }, 100);
        // });
      }

      if (isFirstLoad) {
        // Convert newTargetsMap back to array for table creation
        let allTargets = Array.from(newTargetsMap.values());

        // Apply saved sorting
        allTargets = this.sortTargets(
          allTargets,
          this.sortConfig.column,
          this.sortConfig.direction
        );

        // Full rebuild
        targetsList.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="border-bottom: 2px solid #444;">
                                <th style="padding: 8px; text-align: left; color: #ccc;">Name</th>
                                <th data-sort="bsp" class="sortable-header" style="padding: 8px; text-align: center; color: #ccc; cursor: pointer;">BSP ${this.getSortIcon(
                                  "bsp"
                                )}</th>
                                <th data-sort="level" class="sortable-header" style="padding: 8px; text-align: center; color: #ccc; cursor: pointer;">Level ${this.getSortIcon(
                                  "level"
                                )}</th>
                                <th data-sort="score" class="sortable-header" style="padding: 8px; text-align: center; color: #ccc; cursor: pointer;">Score ${this.getSortIcon(
                                  "score"
                                )}</th>
                                <th data-sort="status" class="sortable-header" style="padding: 8px; text-align: center; color: #ccc; cursor: pointer;">Status ${this.getSortIcon(
                                  "status"
                                )}</th>
                                <th data-sort="call" class="sortable-header" style="padding: 8px; text-align: center; color: #ccc; cursor: pointer;">Call ${this.getSortIcon(
                                  "call"
                                )}</th>
                                <th style="padding: 8px; text-align: center; color: #ccc;">⚔️</th>
                            </tr>
                        </thead>
                        <tbody id="targets-tbody">
                            ${allTargets
                              .map((target) => this.createTargetRow(target))
                              .join("")}
                        </tbody>
                    </table>
                `;

        // Add event listeners for call buttons
        targetsList.querySelectorAll(".call-btn").forEach((btn) => {
          btn.onclick = () => {
            const clickStartTime = performance.now();

            const target = JSON.parse(btn.dataset.target);

            // Use button text to determine action instead of activeCalls state
            const buttonText = btn.textContent.trim();
            const isUncallButton = buttonText === "UNCALL";

            if (isUncallButton) {
              this.uncallTarget(target);
            } else {
              this.callTarget(target);
            }
          };
        });

        // Add event listeners for attack links
        targetsList.querySelectorAll(".attack-link").forEach((link) => {
          link.onclick = (e) => {
            // Extract target ID from href
            const href = link.getAttribute("href");
            const targetIdMatch = href.match(/user2ID=(\d+)/);
            if (targetIdMatch) {
              const targetId = targetIdMatch[1];
              this.startAttackTracking(targetId);
            }
          };
        });

        // Add event listeners for sortable headers
        targetsList.querySelectorAll(".sortable-header").forEach((header) => {
          header.onclick = () => {
            const column = header.dataset.sort;
            // Toggle direction if clicking same column
            const newDirection =
              this.sortConfig.column === column &&
              this.sortConfig.direction === "asc"
                ? "desc"
                : "asc";

            // Save new sort config
            this.sortConfig = { column, direction: newDirection };
            this.saveSortConfig(column, newDirection);

            // Force re-render for sorting
            this.isForceSort = true;
            // Re-display targets with new sorting
            this.displayTargets(Array.from(this.currentTargets.values()));
          };
        });
      } else {
        // For updates, just rebuild the whole table to maintain sorting
        // Convert to sorted array
        let allTargets = Array.from(newTargetsMap.values());
        allTargets = this.sortTargets(
          allTargets,
          this.sortConfig.column,
          this.sortConfig.direction
        );

        // Disable transitions temporarily during rebuild to prevent animation flickering
        tbody.style.transition = 'none';
        tbody.querySelectorAll('*').forEach(el => el.style.transition = 'none');

        // Update the tbody content
        tbody.innerHTML = allTargets
          .map((target) => this.createTargetRow(target))
          .join("");

        // Re-enable transitions after a short delay
        setTimeout(() => {
          tbody.style.transition = '';
          tbody.querySelectorAll('*').forEach(el => el.style.transition = '');
        }, 50);

        // Update BSP data asynchronously for targets without cache
        this.updateBSPDataAsync(allTargets);

        // Re-attach event listeners for sortable headers
        targetsList.querySelectorAll(".sortable-header").forEach((header) => {
          header.onclick = () => {
            const column = header.dataset.sort;
            // Toggle direction if clicking same column
            const newDirection =
              this.sortConfig.column === column &&
              this.sortConfig.direction === "asc"
                ? "desc"
                : "asc";

            // Save new sort config
            this.sortConfig = { column, direction: newDirection };
            this.saveSortConfig(column, newDirection);

            // Force re-render for sorting
            this.isForceSort = true;
            // Re-display targets with new sorting
            this.displayTargets(Array.from(this.currentTargets.values()));
          };
        });

        // Re-attach event listeners for call buttons
        targetsList.querySelectorAll(".call-btn").forEach((btn) => {
          btn.onclick = () => {
            const target = JSON.parse(btn.dataset.target);
            const isTargetCalled = this.activeCalls.has(
              target.user_id.toString()
            );

            if (isTargetCalled) {
              // Check if current user is the caller
              const callData = this.activeCalls.get(target.user_id.toString());
              if (callData && callData.caller_name === this.userName) {
                this.uncallTarget(target);
              } else {
                alert("You can only uncall targets that you called yourself.");
              }
            } else {
              this.callTarget(target);
            }
          };
        });

        // Re-attach event listeners for attack links
        targetsList.querySelectorAll(".attack-link").forEach((link) => {
          link.onclick = (e) => {
            // Extract target ID from href
            const href = link.getAttribute("href");
            const targetIdMatch = href.match(/user2ID=(\d+)/);
            if (targetIdMatch) {
              const targetId = targetIdMatch[1];
              this.startAttackTracking(targetId);
            }
          };
        });
      }

      // Update current targets map
      this.currentTargets = newTargetsMap;
      this.lastTargetListRefresh = Date.now(); // Track when target list was refreshed

      // Reset flag
      this.isDisplayingTargets = false;

      // Register hospital nodes for timer updates
      this.registerHospitalNodes();

      // Start hospital timers if not already running
      this.startHospitalTimers();

      // Update compact info bar
      this.updateCompactInfo();

      } catch (error) {
        console.error('[CAT Debug] Error in displayTargets:', error);
        // Always reset the flag on error to prevent blocking
        this.isDisplayingTargets = false;
      }
    }

    getSortIcon(column) {
      if (this.sortConfig.column !== column) return "";
      return this.sortConfig.direction === "asc" ? " ▲" : " ▼";
    }
    getFactionSortIcon(column) {
      return "";
    }
    sortFactionMembers(members, column, direction) {
      return members.sort((a, b) => {
        let compareValue = 0;
        switch (column) {
          case "name":
            compareValue = (a.name || "").localeCompare(b.name || "");
            break;
          case "bsp":
            // For BSP sorting, use the cached BSP data
            const aBspData = this.getBSPDataFromCache(a.id);
            const bBspData = this.getBSPDataFromCache(b.id);
            const aBsp = aBspData ? aBspData.best_ff_attack : 0;
            const bBsp = bBspData ? bBspData.best_ff_attack : 0;
            compareValue = aBsp - bBsp;
            break;
          case "level":
            compareValue = (a.level || 0) - (b.level || 0);
            break;
          case "status":
            // Special sorting for status: OK first, then Hospital by time, then others
            const aState = a.status?.text || a.status?.state || "Unknown";
            const bState = b.status?.text || b.status?.state || "Unknown";
            // Define priority order
            const getStatusPriority = (state) => {
              switch (state) {
                case "Okay":
                  return 0;
                case "Hospital":
                  return 1;
                case "Traveling":
                  return 2;
                case "Abroad":
                  return 3;
                case "Jail":
                  return 4;
                case "Federal":
                  return 5;
                default:
                  return 999;
              }
            };

            const aPriority = getStatusPriority(aState);
            const bPriority = getStatusPriority(bState);

            if (aPriority !== bPriority) {
              compareValue = aPriority - bPriority;
            } else {
              // If same status, sort by name
              compareValue = (a.name || "").localeCompare(b.name || "");
            }
            break;
          default:
            compareValue = 0;
        }
        return direction === "desc" ? -compareValue : compareValue;
      });
    }

    sortTargets(targets, column, direction) {
      return targets.sort((a, b) => {
        let compareValue = 0;

        switch (column) {
          case "level":
            compareValue = a.level - b.level;
            break;
          case "score":
            compareValue = a.score - b.score;
            break;
          case "bsp":
            // Sort by BSP score (higher is better) - use cached data only for sorting
            const aBspData = this.getBSPDataFromCache(a.user_id);
            const bBspData = this.getBSPDataFromCache(b.user_id);

            const aBspValue = aBspData
              ? aBspData.Score || aBspData.TBS || 0
              : 0;
            const bBspValue = bBspData
              ? bBspData.Score || bBspData.TBS || 0
              : 0;

            compareValue = aBspValue - bBspValue;
            break;
          case "status":
            // Advanced status sorting with sub-sorting for hospital times
            const aState = a.status?.text || a.status?.state || "Unknown";
            const bState = b.status?.text || b.status?.state || "Unknown";

            // Define priority order
            const getStatusPriority = (state) => {
              const stateLower = state.toLowerCase();
              if (stateLower === "okay" || stateLower.includes("okay")) return 0;
              if (stateLower === "hospital" || stateLower.includes("hospital")) return 1;
              if (stateLower === "abroad" || stateLower.includes("abroad")) return 2;
              if (stateLower === "traveling" || stateLower.includes("travel")) return 3;
              if (stateLower === "jail" || stateLower.includes("jail")) return 4;
              if (stateLower === "federal" || stateLower.includes("federal")) return 5;
              if (stateLower === "unknown") return 6;
              return 7;
            };

            const aPriority = getStatusPriority(aState);
            const bPriority = getStatusPriority(bState);

            if (aPriority !== bPriority) {
              compareValue = aPriority - bPriority;
            } else if ((aState.toLowerCase() === "hospital" || aState.toLowerCase().includes("hospital")) &&
                       (bState.toLowerCase() === "hospital" || bState.toLowerCase().includes("hospital"))) {
              // Both in hospital - sort by time remaining (shortest first)
              const aHospTime = hospTime[a.user_id.toString()] || a.status?.updateAt || a.status?.until || 0;
              const bHospTime = hospTime[b.user_id.toString()] || b.status?.updateAt || b.status?.until || 0;

              // Calculate remaining time
              const now = Math.floor(Date.now() / 1000);
              const aRemaining = aHospTime > now ? aHospTime - now : 0;
              const bRemaining = bHospTime > now ? bHospTime - now : 0;

              // Sort by remaining time (shortest hospital time first)
              compareValue = aRemaining - bRemaining;
            } else {
              // Same status, maintain original order
              compareValue = 0;
            }
            break;
          case "call":
            // Sort by call status: uncalled first, then called
            const aIsCalled = this.activeCalls.has(a.user_id.toString());
            const bIsCalled = this.activeCalls.has(b.user_id.toString());

            if (aIsCalled === bIsCalled) {
              compareValue = 0;
            } else if (!aIsCalled && bIsCalled) {
              compareValue = -1;
            } else {
              compareValue = 1;
            }
            break;
          default:
            compareValue = 0;
        }

        // Apply direction
        return direction === "asc" ? compareValue : -compareValue;
      });
    }

    // Synchronous version for initial display (cache only)
    calculateBSPSync(target) {
      // Try to get cached BSP data only (no server fetch)
      const bspData = this.getBSPDataFromCache(target.user_id);

      if (bspData) {
        return this.formatBSPData(target, bspData);
      }

      // Check if BSP API key is available for potential fetch
      const bspAPIKey = GetBSPAPIKey();
      const placeholder = bspAPIKey ? "..." : "❓";
      const bgColor = bspAPIKey ? "#666666" : "#444444";
      const title = bspAPIKey ? "Loading BSP data..." : "No BSP API key found";

      // If we have an API key but no cached data, trigger async fetch immediately
      if (bspAPIKey) {
        // Use setTimeout to avoid blocking the UI
        setTimeout(() => {
          this.fetchSingleBSPData(target);
        }, 100);
      }

      // Return placeholder for loading
      return `<div class="TDup_ColoredStatsInjectionDiv">
                <a href="/loader.php?sid=attack&user2ID=${target.user_id}" target="_blank" title="${title}" onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">
                    <div style="position: relative; z-index: 100;">
                        <div class="iconStats" style="background:${bgColor}">${placeholder}</div>
                    </div>
                </a>
            </div>`;
    }

    // Asynchronous version that can fetch from server
    async calculateBSP(target, allowServerFetch = true) {
      // Try to get BSP data (with optional server fetch)
      const bspData = await GetPlayerBSPData(target.user_id, false);

      if (bspData) {
        return this.formatBSPData(target, bspData);
      }

      // Fallback to estimation if no BSP data available
      if (!target.level || !target.score) {
        return '<span style="color: #888;">❓</span>';
      }

      // Rough BSP calculation based on level and score (as battle score estimate)
      const levelFactor = Math.min(target.level / 100, 1);
      const scoreFactor = Math.log10(Math.max(target.score, 1)) / 6;
      const estimatedScore = Math.round(
        ((levelFactor * 50 + scoreFactor * 950) * target.level) / 10
      );

      return `<span style="color: #ccc;">~${estimatedScore.toLocaleString()}</span>`;
    }

    // Helper function to get BSP data from cache only (synchronous)
    getBSPDataFromCache(playerId) {
      try {
        // Try BSP prediction cache first (most accurate)
        const predictionKey = `tdup.battleStatsPredictor.cache.prediction.${playerId}`;
        let data = localStorage[predictionKey];
        if (data) {
          const prediction = JSON.parse(data);
          if (prediction && (prediction.TBS || prediction.Score)) {
            // Check if prediction is not too old (5 days validity)
            const predictionDate = new Date(
              prediction.DateFetched || prediction.PredictionDate
            );
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() - 5);

            if (predictionDate > expirationDate) {
              return {
                TBS: prediction.TBS || prediction.TBS_Raw,
                Str: prediction.Str || 0,
                Def: prediction.Def || 0,
                Spd: prediction.Spd || 0,
                Dex: prediction.Dex || 0,
                Score: prediction.Score,
                Source: "BSP_Prediction",
              };
            }
          }
        }

        // Try TornStats spy cache
        const tornStatsKey = `tdup.battleStatsPredictor.cache.spy_v2.tornstats_${playerId}`;
        data = localStorage[tornStatsKey];
        if (data) {
          const spy = JSON.parse(data);
          if (spy && spy.total) {
            return {
              TBS: spy.total,
              Str: spy.str,
              Def: spy.def,
              Spd: spy.spd,
              Dex: spy.dex,
              Score:
                spy.str && spy.def && spy.spd && spy.dex
                  ? Math.sqrt(spy.str) +
                    Math.sqrt(spy.def) +
                    Math.sqrt(spy.spd) +
                    Math.sqrt(spy.dex)
                  : 0,
              Source: "TornStats_Spy",
            };
          }
        }

        // Try YATA spy cache
        const yataKey = `tdup.battleStatsPredictor.cache.spy_v2.yata_${playerId}`;
        data = localStorage[yataKey];
        if (data) {
          const spy = JSON.parse(data);
          if (spy && spy.total) {
            return {
              TBS: spy.total,
              Str: spy.str,
              Def: spy.def,
              Spd: spy.spd,
              Dex: spy.dex,
              Score:
                spy.str && spy.def && spy.spd && spy.dex
                  ? Math.sqrt(spy.str) +
                    Math.sqrt(spy.def) +
                    Math.sqrt(spy.spd) +
                    Math.sqrt(spy.dex)
                  : 0,
              Source: "YATA_Spy",
            };
          }
        }

        return null;
      } catch (e) {
        return null;
      }
    }

    // Helper function to format BSP data into HTML
    formatBSPData(target, bspData) {
      let displayValue = "";
      let backgroundColor = "#FF0000"; // Default red
      const localBattleStats = this.getLocalBattleStats();
      const isShowingScore = this.isShowingBattleStatsScore();

      // Always use TBS with relative coloring
      if (bspData.TBS && bspData.TBS > 0) {
        // Show TBS with relative coloring
        displayValue = this.formatBattleStats(bspData.TBS);
        if (localBattleStats.TBS > 0) {
          const tbsRatio = (100 * bspData.TBS) / localBattleStats.TBS;
          backgroundColor = this.getColorMaxValueDifference(tbsRatio);
        } else {
          backgroundColor = this.getBSPColorFromTBS(bspData.TBS);
        }
      } else if (bspData.Score && bspData.Score > 0) {
        // Fallback to TBS calculated from score
        const estimatedTBS = Math.round(bspData.Score * bspData.Score);
        displayValue = this.formatBattleStats(estimatedTBS);
        if (localBattleStats.TBS > 0) {
          const tbsRatio = (100 * estimatedTBS) / localBattleStats.TBS;
          backgroundColor = this.getColorMaxValueDifference(tbsRatio);
        } else {
          backgroundColor = this.getBSPColorFromTBS(estimatedTBS);
        }
      } else {
        displayValue = "N/A";
        backgroundColor = "#888888";
      }

      // Add source indicator
      let sourceIndicator = "";
      if (bspData.Source === "BSP_Server_Fetch") {
        sourceIndicator =
          '<span style="position: absolute; top: -2px; right: -2px; color: #00ff00; font-size: 8px;">●</span>';
      }

      // Return BSP-style HTML structure
      return `<div class="TDup_ColoredStatsInjectionDiv">
                <a href="/loader.php?sid=attack&user2ID=${target.user_id}" target="_blank" title="BSP Data from ${bspData.Source}" onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">
                    <div style="position: relative; z-index: 100;">
                        <div class="iconStats" style="background:${backgroundColor}">${displayValue}${sourceIndicator}</div>
                    </div>
                </a>
            </div>`;
    }

    // Update BSP data asynchronously for targets that need server fetch
    async updateBSPDataAsync(targets) {
      const bspAPIKey = GetBSPAPIKey();
      if (!bspAPIKey) {
        return; // No BSP API key available
      }

      // Performance optimization: Filter out targets that already have cached BSP data
      const uncachedTargets = targets.filter(target => {
        const cachedData = this.getBSPDataFromCache(target.user_id);
        return !cachedData;
      });

      if (uncachedTargets.length === 0) {
        return; // All targets already have cached data
      }

      // Process targets in smaller batches to avoid overwhelming the server
      const batchSize = 2; // Reduced from 3 for better performance
      let fetchedCount = 0;

      for (let i = 0; i < uncachedTargets.length; i += batchSize) {
        const batch = uncachedTargets.slice(i, i + batchSize);

        // Process batch in parallel
        const promises = batch.map(async (target) => {
          try {
            // Double-check cache to avoid race conditions
            const cachedData = this.getBSPDataFromCache(target.user_id);
            if (cachedData) {
              return; // Already have data, skip
            }

            // Fetch new data
            const bspData = await GetPlayerBSPData(target.user_id, false);
            if (bspData) {
              fetchedCount++;

              // Update the cell with new data
              const cell = document.querySelector(
                `[data-bsp-cell="${target.user_id}"]`
              );
              if (cell) {
                cell.innerHTML = this.formatBSPData(target, bspData);
              }
            } else {
              // Update cell to show failed fetch
              const cell = document.querySelector(
                `[data-bsp-cell="${target.user_id}"]`
              );
              if (cell) {
                cell.innerHTML = `<div class="TDup_ColoredStatsInjectionDiv">
                                    <a href="/loader.php?sid=attack&user2ID=${target.user_id}" target="_blank" title="BSP data not available" onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">
                                        <div style="position: relative; z-index: 100;">
                                            <div class="iconStats" style="background:#888888">N/A</div>
                                        </div>
                                    </a>
                                </div>`;
              }
            }
          } catch (error) {
            // Silently handle fetch errors

            // Update cell to show error
            const cell = document.querySelector(
              `[data-bsp-cell="${target.user_id}"]`
            );
            if (cell) {
              cell.innerHTML = `<div class="TDup_ColoredStatsInjectionDiv">
                                <a href="/loader.php?sid=attack&user2ID=${target.user_id}" target="_blank" title="Error loading BSP data" onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">
                                    <div style="position: relative; z-index: 100;">
                                        <div class="iconStats" style="background:#ff4444">ERR</div>
                                    </div>
                                </a>
                            </div>`;
            }
          }
        });

        // Wait for batch to complete
        await Promise.all(promises);

        // Small delay between batches to be respectful to BSP server
        if (i + batchSize < targets.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    // Fetch BSP data for a single target (used for immediate fetching)
    async fetchSingleBSPData(target) {
      try {
        const bspData = await GetPlayerBSPData(target.user_id, false);
        if (bspData) {
          // Update the cell with new data
          const cell = document.querySelector(
            `[data-bsp-cell="${target.user_id}"]`
          );
          if (cell) {
            cell.innerHTML = this.formatBSPData(target, bspData);
          }
        } else {
          // Update cell to show failed fetch
          const cell = document.querySelector(
            `[data-bsp-cell="${target.user_id}"]`
          );
          if (cell) {
            cell.innerHTML = `<div class="TDup_ColoredStatsInjectionDiv">
                            <a href="/loader.php?sid=attack&user2ID=${target.user_id}" target="_blank" title="BSP data not available" onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">
                                <div style="position: relative; z-index: 100;">
                                    <div class="iconStats" style="background:#888888">N/A</div>
                                </div>
                            </a>
                        </div>`;
          }
        }
      } catch (error) {
        // Silently handle fetch errors

        // Update cell to show error
        const cell = document.querySelector(
          `[data-bsp-cell="${target.user_id}"]`
        );
        if (cell) {
          cell.innerHTML = `<div class="TDup_ColoredStatsInjectionDiv">
                        <a href="/loader.php?sid=attack&user2ID=${target.user_id}" target="_blank" title="Error loading BSP data" onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">
                            <div style="position: relative; z-index: 100;">
                                <div class="iconStats" style="background:#ff4444">ERR</div>
                            </div>
                        </a>
                    </div>`;
        }
      }
    }

    // LOCAL_COLORS array based on BSP original script
    getLocalColors() {
      return [
        { maxValue: 5, maxValueScore: 30, color: '#949494', canModify: true },
        { maxValue: 35, maxValueScore: 70, color: '#FFFFFF', canModify: true },
        { maxValue: 75, maxValueScore: 90, color: '#73DF5D', canModify: true },
        { maxValue: 125, maxValueScore: 105, color: '#47A6FF', canModify: true },
        { maxValue: 400, maxValueScore: 115, color: '#FFB30F', canModify: true },
        { maxValue: 10000000000, maxValueScore: 10000000000, color: '#FF0000', canModify: false },
      ];
    }

    // Get or set local player battle stats
    getLocalBattleStats() {
      const data = localStorage.getItem(CONFIG.playerBattleStatsKey);
      if (data) {
        return JSON.parse(data);
      }
      // Default stats if none stored
      return {
        Str: 0,
        Def: 0,
        Spd: 0,
        Dex: 0,
        TBS: 0,
        Score: 0
      };
    }

    setLocalBattleStats(stats) {
      localStorage.setItem(CONFIG.playerBattleStatsKey, JSON.stringify(stats));
    }

    // Get color based on TBS ratio comparison (like original BSP)
    getColorMaxValueDifference(ratio) {
      const colors = this.getLocalColors();
      for (let i = 0; i < colors.length; i++) {
        if (ratio < colors[i].maxValue) {
          return colors[i].color;
        }
      }
      return "#ffc0cb"; // pink fallback
    }

    // Get color based on Score ratio comparison (like original BSP)
    getColorScoreDifference(ratio) {
      const colors = this.getLocalColors();
      for (let i = 0; i < colors.length; i++) {
        if (ratio < colors[i].maxValueScore) {
          return colors[i].color;
        }
      }
      return "#ffc0cb"; // pink fallback
    }

    // Check if using battle stats score instead of TBS
    isShowingBattleStatsScore() {
      // Always return false - we only use TBS mode
      return false;
    }

    // Updated methods with relative comparison for TBS only
    getBSPColor(score) {
      const localStats = this.getLocalBattleStats();
      if (localStats.TBS === 0) {
        // Use absolute color scheme as fallback
        if (score >= 2000) return "#FF0000"; // Red - Very Strong
        if (score >= 1500) return "#FFB30F"; // Orange - Strong
        if (score >= 1000) return "#47A6FF"; // Blue - Moderate
        if (score >= 500) return "#73DF5D"; // Green - Weak
        if (score >= 100) return "#DCDCDC"; // White - Very Weak
        return "#949494"; // Gray - Unknown/Low
      }

      // Convert score to estimated TBS for relative comparison
      const estimatedTBS = score * score;
      const tbsRatio = (100 * estimatedTBS) / localStats.TBS;
      return this.getColorMaxValueDifference(tbsRatio);
    }

    getBSPColorFromTBS(tbs) {
      const localStats = this.getLocalBattleStats();
      if (localStats.TBS === 0) {
        // Convert TBS to approximate score for coloring as fallback
        const approximateScore = Math.sqrt(tbs / 1000000) * 100;
        return this.getBSPColor(approximateScore);
      }

      // Use relative TBS comparison
      const tbsRatio = (100 * tbs) / localStats.TBS;
      return this.getColorMaxValueDifference(tbsRatio);
    }

    getBSPColorFromScore(score) {
      // Use actual score for coloring with relative comparison
      return this.getBSPColor(score);
    }

    formatBattleStats(number) {
      if (!number || number === 0) return "0";

      var localized = number.toLocaleString("en-US");
      var myArray = localized.split(",");
      if (myArray.length < 1) {
        return "ERROR";
      }

      var toReturn = myArray[0];
      if (number < 1000) return number;
      if (parseInt(toReturn) < 10) {
        if (parseInt(myArray[1][0]) != 0) {
          toReturn += "." + myArray[1][0];
        }
      }
      switch (myArray.length) {
        case 2:
          toReturn += "k";
          break;
        case 3:
          toReturn += "m";
          break;
        case 4:
          toReturn += "b";
          break;
        case 5:
          toReturn += "t";
          break;
        case 6:
          toReturn += "q";
          break;
      }

      return toReturn;
    }

    createTargetRow(target) {
      const isCalled = this.activeCalls.has(target.user_id);
      const callMetadata = this.activeCalls.get(target.user_id);

      let callButtonStyle =
        "padding: 4px 12px; background: linear-gradient(to bottom, #5a9bd4, #3a7abd); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: background 0.2s ease, box-shadow 0.2s ease;";
      if (isCalled && callMetadata) {
        const isCurrentUserCaller = callMetadata.caller_name === this.userName;
        callButtonStyle = isCurrentUserCaller
          ? "padding: 4px 12px; background: linear-gradient(to bottom, #e74c3c, #c0392b); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: background 0.2s ease, box-shadow 0.2s ease;"
          : "padding: 4px 12px; background: linear-gradient(to bottom, #7f8c8d, #566363); color: white; border: none; border-radius: 4px; cursor: not-allowed; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); opacity: 0.7;";
      }

      let callButtonText = "Call";
      if (isCalled && callMetadata) {
        const isCurrentUserCaller = callMetadata.caller_name === this.userName;
        if (isCurrentUserCaller) {
          callButtonText = "UNCALL";
        } else {
          // Mobile-friendly shorter text
          const shortName =
            callMetadata.caller_name.length > 8
              ? callMetadata.caller_name.substring(0, 8) + "..."
              : callMetadata.caller_name;
          callButtonText = `${shortName}`;
        }
      }

      const rowBackgroundColor = isCalled ? "rgba(255, 193, 7, 0.1)" : "";

      return `
                <tr class="target-row" data-target-id="${
                  target.user_id
                }" style="border-bottom: 1px solid #222222; background: ${
        rowBackgroundColor ||
        "linear-gradient(to right, rgba(255,255,255,0.02), rgba(255,255,255,0.01))"
      }; transition: background 0.2s ease;">
                    <td style="padding: 8px; vertical-align: middle;">
                        <div style="display: flex; align-items: center;">
                          <span class="status-indicator" style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; background-color: ${this.getStatusIndicatorColor(
                            target
                          )}; flex-shrink: 0;"></span>
                          <a href="/profiles.php?XID=${
                            target.user_id
                          }" target="_blank" style="color: #4a90e2; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; display: inline-block;">
                              ${target.name}
                          </a>
                        </div>
                    </td>
                    <td style="padding: 8px; text-align: center; color: #fff; vertical-align: middle;" data-bsp-cell="${
                      target.user_id
                    }">${this.calculateBSPSync(target)}</td>
                    <td style="padding: 8px; text-align: center; color: #fff; vertical-align: middle;">${
                      target.level
                    }</td>
                    <td style="padding: 8px; text-align: center; color: #fff; vertical-align: middle;">
                        ${target.score ? target.score.toLocaleString() : "-"}
                    </td>
                    <td style="padding: 8px; text-align: center; vertical-align: middle;">
                        <span class="target-status" data-user-id="${
                          target.user_id
                        }" style="color: ${this.getStatusColor(
                          target.status
                        )};">
                            ${this.getStatusText(target.status)}
                        </span>
                    </td>
                    <td style="padding: 8px; text-align: center; vertical-align: middle;">
                        <button class="call-btn" data-target='${JSON.stringify(
                          target
                        )}' style="${callButtonStyle}" ${
        isCalled ? "disabled" : ""
      }>${callButtonText}</button>
                    </td>
                    <td style="padding: 8px; text-align: center; vertical-align: middle;">
                        <a class="attack-link" href="/loader.php?sid=attack&user2ID=${
                          target.user_id
                        }" target="_blank" style="
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            padding: 4px 12px;
                            background: linear-gradient(to bottom, #e74c3c, #c0392b);
                            color: white;
                            text-decoration: none;
                            border-radius: 4px;
                            font-size: 12px;
                            width: 40px;
                            height: 24px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                            transition: all 0.2s ease;
                            box-sizing: border-box;
                        " onclick="window.warCallingSystemInstance.updateTargetStatusOnAttack('${target.user_id}')">⚔️</a>
                    </td>
                </tr>
            `;
    }

    hasTargetChanged(oldTarget, newTarget) {
      return (
        oldTarget.level !== newTarget.level ||
        oldTarget.score !== newTarget.score ||
        JSON.stringify(oldTarget.status) !== JSON.stringify(newTarget.status)
      );
    }

    updateTargetRow(row, target) {
      // Update only changed cells
      const statusSpan = row.querySelector(".target-status");
      if (statusSpan) {
        // Don't update if this is a hospital timer being actively updated
        const userId = statusSpan.getAttribute('data-user-id');
        if (userId && this.hospNodes.has(userId)) {
          // Just update the color, not the text
          statusSpan.style.color = this.getStatusColor(target.status);
        } else {
          // Normal update
          statusSpan.textContent = this.getStatusText(target.status);
          statusSpan.style.color = this.getStatusColor(target.status);
        }
      }

      // Update status indicator
      const statusIndicator = row.querySelector(".status-indicator");
      if (statusIndicator) {
        statusIndicator.style.backgroundColor =
          this.getStatusIndicatorColor(target);
      }

      // Update score if changed
      const scoreTd = row.children[3];
      if (scoreTd) {
        scoreTd.textContent = target.score
          ? target.score.toLocaleString()
          : "-";
      }

      // Update level if changed
      const levelTd = row.children[2];
      if (levelTd) {
        levelTd.textContent = target.level;
      }
    }

    displayWarFactionMembers(factionData) {
      const factionList = document.getElementById("faction-list");

      if (!factionData || !factionData.faction || !factionData.faction.members) {
        factionList.innerHTML = '<p style="color: #888;">No faction data available</p>';
        return;
      }

      const members = Object.values(factionData.faction.members);

      if (members.length === 0) {
        factionList.innerHTML = '<p style="color: #888;">No faction members found</p>';
        return;
      }

      // Apply filters first
      const filteredMembers = members.filter(member => this.passesFilters(member));

      if (filteredMembers.length === 0) {
        factionList.innerHTML = '<p style="color: #888;">No members match current filters</p>';
        return;
      }

      // Sort members using saved sort config
      const sortedMembers = this.sortFactionMembers(
        filteredMembers,
        this.factionSortConfig.column,
        this.factionSortConfig.direction
      );

      factionList.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed;">
          <thead>
            <tr style="border-bottom: 2px solid #444;">
              <th data-sort="name" class="faction-sortable-header" style="padding: 8px 4px 8px 6px; text-align: left; color: #ccc; cursor: pointer; width: 35%;">Name${this.getFactionSortIcon("name")}</th>
              <th data-sort="bsp" class="faction-sortable-header" style="padding: 8px 4px; text-align: center; color: #ccc; cursor: pointer; width: 20%;">BSP${this.getFactionSortIcon("bsp")}</th>
              <th data-sort="level" class="faction-sortable-header" style="padding: 8px 4px; text-align: center; color: #ccc; cursor: pointer; width: 18%;">Lvl${this.getFactionSortIcon("level")}</th>
              <th data-sort="status" class="faction-sortable-header" style="padding: 8px 4px; text-align: center; color: #ccc; cursor: pointer; width: 27%;">Status${this.getFactionSortIcon("status")}</th>
            </tr>
          </thead>
          <tbody>
            ${sortedMembers.map((member) => this.createFactionMemberRow(member)).join("")}
          </tbody>
        </table>
      `;

      // Add click event listeners for sorting
      factionList.querySelectorAll(".faction-sortable-header").forEach((header) => {
        header.onclick = () => {
          const column = header.dataset.sort;
          // Toggle direction if clicking same column
          const newDirection =
            this.factionSortConfig.column === column &&
            this.factionSortConfig.direction === "asc"
              ? "desc"
              : "asc";
          // Save new sort config
          this.factionSortConfig = { column, direction: newDirection };
          this.saveFactionSortConfig(column, newDirection);
          // Re-display faction members with new sorting
          this.displayWarFactionMembers(factionData);
        };
      });

      // Register hospital nodes for timer updates
      this.registerHospitalNodes();

      // Start hospital timers if not already running
      this.startHospitalTimers();
    }

    createFactionMemberRow(member) {
      const statusText = this.getStatusTextShort(member.status);
      const statusColor = this.getStatusColor(member.status);
      const statusIndicatorColor = this.getStatusIndicatorColor(member);

      return `
        <tr class="target-row" data-member-id="${member.id}" style="border-bottom: 1px solid #222222; background: linear-gradient(to right, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); transition: all 0.2s ease;">
          <td style="vertical-align: middle; height: 34px; padding: 3px;">
            <div style="display: flex; align-items: center; justify-content: flex-start; height: 100%;">
              <span class="status-indicator" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; background-color: ${statusIndicatorColor}; flex-shrink: 0;"></span>
              <a href="/profiles.php?XID=${member.id}" target="_blank" style="color: #4a90e2; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                ${member.name || 'Unknown'}
              </a>
            </div>
          </td>
          <td style="text-align: center; color: #fff; vertical-align: middle; height: 34px; padding: 3px; font-size: 11px;" data-bsp-cell="${member.id}">
            ${this.calculateBSPSync({user_id: member.id, level: member.level, score: member.score})}
          </td>
          <td style="text-align: center; color: #fff; vertical-align: middle; height: 34px; padding: 3px; font-size: 14px;">
            ${member.level || '-'}
          </td>
          <td style="text-align: center; vertical-align: middle; height: 34px; padding: 3px; font-size: 14px;">
            <span class="target-status" data-user-id="${
              member.id
            }" style="color: ${statusColor};">
              ${statusText}
            </span>
          </td>
        </tr>
      `;
    }

    getStatusColor(status) {
      if (!status) return "#888";

      // Handle string status
      if (typeof status === "string") {
        const statusLower = status.toLowerCase();
        if (statusLower.includes("okay")) return "#5cb85c";
        if (statusLower.includes("hospital")) return "#d9534f";
        if (statusLower.includes("jail")) return "#f0ad4e";
        if (statusLower.includes("traveling") || statusLower.includes("abroad"))
          return "#5bc0de";
        return "#888";
      }

      // Handle object status with text property (current data structure)
      if (status.text) {
        const textLower = status.text.toLowerCase();
        if (textLower === "okay") return "#5cb85c";
        if (textLower === "hospital") return "#d9534f";
        if (textLower === "jail") return "#f0ad4e";
        if (textLower === "traveling" || textLower === "abroad")
          return "#5bc0de";
      }

      // Handle object status with state property (legacy)
      if (status.state) {
        const stateLower = status.state.toLowerCase();
        if (stateLower === "okay") return "#5cb85c";
        if (stateLower === "hospital") return "#d9534f";
        if (stateLower === "jail") return "#f0ad4e";
        if (stateLower === "traveling" || stateLower === "abroad")
          return "#5bc0de";
      }

      return "#888";
    }

    getStatusText(status) {
      if (!status) return "Unknown";

      // Handle object status with text property (current data structure)
      if (typeof status === "object" && status.text) {
        // For hospital status, updateAt contains the timestamp when user will leave hospital
        if (status.text.toLowerCase() === "hospital" && status.updateAt) {
          return this.formatHospitalTime(status.updateAt);
        }
        return this.abbreviateStatus(status.text);
      }

      // Handle object status with hospital timer
      if (typeof status === "object" && status.state) {
        if (status.state.toLowerCase() === "hospital" && status.until) {
          const hospitalTime = this.formatHospitalTime(status.until);
          return hospitalTime;
        }
        return this.abbreviateStatus(status.state);
      }

      // Handle object status with description
      if (typeof status === "object" && status.description) {
        if (
          status.description.toLowerCase().includes("hospital") &&
          status.until
        ) {
          const hospitalTime = this.formatHospitalTime(status.until);
          return hospitalTime;
        }
        return this.abbreviateStatus(status.description);
      }

      // Handle string status
      if (typeof status === "string") return this.abbreviateStatus(status);

      return "Unknown";
    }

    getStatusTextShort(status) {
      if (!status) return "Unknown";

      // Handle object status with text property (current data structure)
      if (typeof status === "object" && status.text) {
        // For hospital status, updateAt contains the timestamp when user will leave hospital
        if (status.text.toLowerCase() === "hospital" && status.updateAt) {
          return this.formatHospitalTime(status.updateAt);
        }
        return this.abbreviateStatus(status.text);
      }

      // Handle object status with hospital timer
      if (typeof status === "object" && status.state) {
        if (status.state.toLowerCase() === "hospital" && status.until) {
          const hospitalTime = this.formatHospitalTime(status.until);
          return hospitalTime;
        }
        return this.abbreviateStatus(status.state);
      }

      // Handle object status with description
      if (typeof status === "object" && status.description) {
        if (
          status.description.toLowerCase().includes("hospital") &&
          status.until
        ) {
          const hospitalTime = this.formatHospitalTime(status.until);
          return hospitalTime;
        }
        return this.abbreviateStatus(status.description);
      }

      // Handle string status
      if (typeof status === "string") return this.abbreviateStatus(status);

      return "Unknown";
    }

    abbreviateStatus(statusText) {
      if (!statusText) return "Unknown";

      const status = statusText.toLowerCase();
      switch (status) {
        case "traveling":
        case "travelling":
          return "Travel";
        default:
          // Keep all other statuses as they are
          return statusText;
      }
    }

    formatHospitalTime(until) {
      if (!until) return "Hospital";

      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = until - now;

      if (remainingSeconds <= 0) return "Okay";

      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;

      // If less than 5 minutes, show seconds
      if (remainingSeconds < 300) {
        // 5 minutes = 300 seconds
        if (minutes > 0) {
          return `${minutes}m ${seconds}s`;
        } else {
          return `${seconds}s`;
        }
      }

      // For longer times, show hours and minutes
      if (hours > 0) {
        return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
      } else {
        return `${minutes}m`;
      }
    }

    updateHospitalTimers() {
      // Update hospital timers every second
      for (const [userId, statusSpan] of this.hospNodes.entries()) {
        if (!statusSpan || !statusSpan.isConnected) {
          // Remove if node is no longer in DOM
          this.hospNodes.delete(userId);
          continue;
        }

        const hospEndTime = hospTime[userId];
        if (!hospEndTime) {
          this.hospNodes.delete(userId);
          continue;
        }

        const now = Math.floor(Date.now() / 1000);
        const totalSeconds = hospEndTime - now;

        if (totalSeconds <= 0) {
          // Time is up - need to fetch actual current status
          
          // Clear hospital time since it's expired
          delete hospTime[userId];
          
          // Fetch real current status via API
          this.fetchUserCurrentStatus(userId).then(realStatus => {
            if (realStatus) {
              statusSpan.textContent = realStatus.text || realStatus.state || "Okay";
              statusSpan.style.color = this.getStatusColor(realStatus);
              
              // Update userData with real status
              if (!userData[userId]) userData[userId] = {};
              userData[userId].status = realStatus;
              userData[userId].lastStatusUpdate = Date.now();
              userData[userId].statusSource = 'api_refresh';
            } else {
              // Fallback if API fails
              statusSpan.textContent = "Okay";
              statusSpan.style.color = this.getStatusColor({ text: "Okay", state: "Okay" });
            }
          });
          
          this.hospNodes.delete(userId);
          continue;
        }

        // Skip update for optimization based on time remaining
        if (totalSeconds >= 10 * 60 && this.hospLoopCounter % 10 !== 0) continue; // Update every 10 seconds if > 10 minutes
        if (totalSeconds >= 5 * 60 && totalSeconds < 10 * 60 && this.hospLoopCounter % 5 !== 0) continue; // Update every 5 seconds if 5-10 minutes

        // Update the timer display
        statusSpan.textContent = this.formatHospitalTime(hospEndTime);
      }

      if (this.hospNodes.size > 0) {
        this.hospLoopCounter++;
      }
    }

    startHospitalTimers() {
      if (this.hospTimerInterval) return; // Already running

      this.hospTimerInterval = setInterval(() => {
        this.updateHospitalTimers();
      }, 1000);
    }

    stopHospitalTimers() {
      if (this.hospTimerInterval) {
        clearInterval(this.hospTimerInterval);
        this.hospTimerInterval = null;
        this.hospLoopCounter = 0;
      }
    }

    startChainDOMObserver() {
      // Observe changes to the chain box for real-time updates
      if (this.chainDOMObserver) {
        this.chainDOMObserver.disconnect();
      }

      const chainBox = document.querySelector('.chain-box');
      if (!chainBox) {
        return;
      }

      this.chainDOMObserver = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        
        mutations.forEach((mutation) => {
          // Check if chain-related elements changed
          if (mutation.target.classList && 
              (mutation.target.classList.contains('chain-box-center-stat') ||
               mutation.target.classList.contains('chain-box-timeleft'))) {
            shouldUpdate = true;
          }
          
          // Check if any of the child nodes are chain-related
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (element.querySelector && 
                  (element.querySelector('.chain-box-center-stat') ||
                   element.querySelector('.chain-box-timeleft'))) {
                shouldUpdate = true;
              }
            }
          });
        });

        if (shouldUpdate) {
          this.syncChainDataFromDOM();
          this.updateCompactInfo();
        }
      });

      this.chainDOMObserver.observe(chainBox, {
        childList: true,
        subtree: true,
        characterData: true
      });

    }

    stopChainDOMObserver() {
      if (this.chainDOMObserver) {
        this.chainDOMObserver.disconnect();
        this.chainDOMObserver = null;
      }
    }

    registerHospitalNodes() {
      // Clear existing nodes
      this.hospNodes.clear();

      // Find all status spans with hospital status
      document.querySelectorAll('.target-status').forEach(statusSpan => {
        const userId = statusSpan.getAttribute('data-user-id');
        if (!userId) return;

        const statusText = statusSpan.textContent.toLowerCase();
        // Register if it's showing hospital time or "hospital" text
        if (statusText.includes('hospital') || statusText.includes('h') || statusText.includes('m') || statusText.includes('s')) {
          // Check if we have hospital time for this user
          if (hospTime[userId]) {
            this.hospNodes.set(userId, statusSpan);
          }
        }
      });
    }

    updateTargetStatusInUI(userId, status) {
      // Find and update status for this user in the UI
      const statusElements = document.querySelectorAll(`[data-user-id="${userId}"] .target-status, .target-status[data-user-id="${userId}"]`);
      
      statusElements.forEach(statusSpan => {
        if (!statusSpan) return;
        
        // Check if this status update is newer than what we have
        const lastUpdate = userData[userId]?.lastStatusUpdate || 0;
        const currentTime = Date.now();
        
        // Only update if this is a recent WebSocket update (within last 5 seconds)
        if (currentTime - lastUpdate < 5000 && userData[userId]?.statusSource === 'websocket') {
          const statusText = status.text || status.state || "Unknown";
          const currentDisplayed = statusSpan.textContent;
          
          // Only update if the status actually changed
          if (currentDisplayed !== statusText) {
            statusSpan.textContent = statusText;
            statusSpan.style.color = this.getStatusColor(status);
          }
        }
      });
    }

    async fetchUserCurrentStatus(userId) {
      // Fetch real current status for a user via Torn API
      if (!this.apiKey) {
        return null;
      }

      try {
        const response = await fetch(
          `https://api.torn.com/v2/user/${userId}?selections=profile&key=${this.apiKey}`
        );
        
        if (!response.ok) {
          return null;
        }
        
        const data = await response.json();
        
        if (data.profile?.status) {
          return data.profile.status;
        }
        
        return null;
      } catch (error) {
        console.error("[Status Fix] Error fetching user status:", error);
        return null;
      }
    }

    updateCallUI(targetId, isCalled, metadata = null, isPending = false) {
      // Allow pending state updates even if there's a pending request
      if (!isPending && this.pendingCallRequests.has(targetId)) {
        // Don't update UI while a call/uncall request is pending
        return;
      }

      // Try to get cached elements first
      let cachedElements = this.targetRowCache.get(targetId);

      if (!cachedElements) {
        // Cache miss - find and cache elements
        const targetRow = document.querySelector(
          `.target-row[data-target-id="${targetId}"]`
        );
        if (!targetRow) {
          return;
        }
        const button = targetRow.querySelector(".call-btn");
        if (!button) {
          return;
        }

        cachedElements = { row: targetRow, button };
        this.targetRowCache.set(targetId, cachedElements);
      }

      const { row: targetRow, button } = cachedElements;

      // Verify elements are still in DOM (in case of table refresh)
      if (!document.contains(targetRow) || !document.contains(button)) {
        this.targetRowCache.delete(targetId);
        return this.updateCallUI(targetId, isCalled, metadata); // Retry
      }

      if (isPending) {
        // Show pending state
        button.textContent = "PENDING";
        button.style.background = "#f0ad4e"; // Orange color for pending
        button.style.cursor = "wait";
        button.disabled = true;
      } else if (isCalled && metadata) {
        // Check if current user is the caller
        const isCurrentUserCaller = metadata.caller_name === this.userName;

        if (isCurrentUserCaller) {
          button.textContent = "UNCALL";
          button.style.background = "#d9534f"; // Red color for uncall
          button.style.cursor = "pointer";
          button.disabled = false;
        } else {
          // Mobile-friendly shorter text
          const shortName =
            metadata.caller_name.length > 8
              ? metadata.caller_name.substring(0, 8) + "..."
              : metadata.caller_name;
          button.textContent = shortName;
          button.style.background = "#666";
          button.style.cursor = "not-allowed";
          button.disabled = true;
          button.classList.add("called-by-btn");
        }

        // Add visual indicator that target is called
        targetRow.style.backgroundColor = "rgba(255, 193, 7, 0.1)"; // Light yellow tint
      } else {
        button.textContent = "Call";
        button.style.background = "#4a90e2";
        button.style.cursor = "pointer";
        button.disabled = false;
        button.classList.remove("called-by-btn");

        // Remove visual indicator
        targetRow.style.backgroundColor = "";
      }
    }

    // ========================================
    // CALL/UNCALL ACTIONS
    // ========================================
    async uncallTarget(target, isAutoUncall = false) {
      if (!this.currentWar) return;

      const targetId = target.user_id.toString();

      if (this.activeCalls.has(targetId)) {
        const callData = this.activeCalls.get(targetId);
      }

      // TEMP: Allow all uncalls to proceed for debugging
      // if (!this.activeCalls.has(targetId)) {
      //   return;
      // }

      // Check for pending request
      if (this.pendingCallRequests.has(targetId)) {
        return this.pendingCallRequests.get(targetId);
      }

      // Check for rapid successive calls (debounce)
      const lastCall = this.lastCallTime.get(targetId);
      if (lastCall && Date.now() - lastCall < 1000) {
        return; // Ignore if less than 1 second since last call
      }

      this.lastCallTime.set(targetId, Date.now());

      // Show PENDING state immediately
      this.updateCallUI(targetId, true, { caller_name: this.userName }, true);

      const uncallPromise = this._performUncall(target, isAutoUncall);
      this.pendingCallRequests.set(targetId, uncallPromise);

      try {
        const result = await uncallPromise;
        this.pendingCallRequests.delete(targetId);

        // Update UI based on result
        if (result && result.success) {
          this.updateCallUI(targetId, false);
        } else if (this.activeCalls.has(targetId)) {
          // Restore original state if failed
          this.updateCallUI(targetId, true, this.activeCalls.get(targetId));
        }

        return result;
      } finally {
        this.pendingCallRequests.delete(targetId);
      }
    }

    async _performUncall(target, isAutoUncall = false) {
      try {
        // Store original call data before attempting uncall
        const targetId = target.user_id.toString();
        const originalCallData = this.activeCalls.get(targetId);

        if (!originalCallData) {
          // No call to uncall - return success to trigger UI update in finally block
          return { success: true };
        }

        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Uncall request timeout")), 15000)
        );

        const response = await Promise.race([
          customFetch(`${CONFIG.supabase.url}/functions/v1/call-management`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              action: "uncall",
              war_id: this.currentWar.war_id,
              faction_id: this.factionId,
              target_id: target.user_id,
              caller_id: this.userId,
              is_auto_uncall: isAutoUncall,
            }),
          }),
          timeoutPromise,
        ]);

        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          throw new Error("Invalid response from server");
        }

        if (!result.success) {
          // If uncall failed
          alert(result.error || "Failed to uncall target");
        } else {
          // Update data on successful uncall
          this.activeCalls.delete(targetId);
          this.updateCompactInfo();
        }

        return result;
      } catch (error) {
        console.error("Uncall target error:", error);

        // Don't update UI here - it will be done in uncallTarget

        // Show more specific error message
        if (error.message && error.message.includes("timeout")) {
          alert("Uncall request timed out. Please try again.");
        } else {
          alert(
            "Failed to uncall target. Please check your connection and try again."
          );
        }

        return { success: false, error: error.message };
      }
    }

    async callTarget(target) {
      const methodStartTime = performance.now();

      if (!this.currentWar) return;

      const targetId = target.user_id.toString();

      // Check for pending request
      if (this.pendingCallRequests.has(targetId)) {
        return this.pendingCallRequests.get(targetId);
      }

      // Check for rapid successive calls (debounce)
      const lastCall = this.lastCallTime.get(targetId);
      if (lastCall && Date.now() - lastCall < 1000) {
        return; // Ignore if less than 1 second since last call
      }

      this.lastCallTime.set(targetId, Date.now());

      // Limit concurrent calls to reduce server load
      const maxConcurrentCalls = 2; // Maximum 2 simultaneous calls
      if (this.pendingCallRequests.size >= maxConcurrentCalls) {
        // Wait for at least one call to complete before proceeding
        await Promise.race(Array.from(this.pendingCallRequests.values()));
      }

      const performCallStartTime = performance.now();

      // Show PENDING state immediately
      this.updateCallUI(targetId, false, null, true);

      const callPromise = this._performCall(target);
      this.pendingCallRequests.set(targetId, callPromise);

      try {
        const result = await callPromise;
        this.pendingCallRequests.delete(targetId);

        // Update UI based on result
        if (result && result.success) {
          this.updateCallUI(targetId, true, {
            caller_name: this.userName || "Unknown",
            target_name: target.name,
            target_level: target.level || 0,
            target_status: target.status
          });
        } else {
          // Restore Call button if failed
          this.updateCallUI(targetId, false);
        }

        return result;
      } finally {
        this.pendingCallRequests.delete(targetId);
      }
    }

    async _performCall(target) {
      try {
        // Prevent multiple simultaneous calls on the same target
        if (this.pendingCalls && this.pendingCalls.has(target.user_id)) {
          return;
        }

        // Track pending calls
        if (!this.pendingCalls) this.pendingCalls = new Set();
        this.pendingCalls.add(target.user_id);

        const startTime = performance.now();

        // Don't update UI immediately - wait for server response
        const uiStartTime = performance.now();
        const uiEndTime = performance.now();

        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Call request timeout")), 15000)
        );

        const url = `${CONFIG.supabase.url}/functions/v1/call-management`;

        const apiStartTime = performance.now();

        const response = await Promise.race([
          customFetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: CONFIG.supabase.anonKey,
              Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              action: "call",
              war_id: this.currentWar.war_id,
              faction_id: this.factionId,
              target_id: target.user_id,
              target_name: target.name,
              target_level: target.level,
              target_faction_id: target.faction_id,
              target_status: target.status ? JSON.stringify(target.status) : null,
              caller_id: this.userId,
              caller_name: this.userName || "Unknown",
            }),
          }),
          timeoutPromise,
        ]);

        const apiEndTime = performance.now();

        let result;
        try {
          const parseStartTime = performance.now();
          result = await response.json();
          const parseEndTime = performance.now();
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          throw new Error("Invalid response from server");
        }

        if (!result.success) {
          // Call failed
          alert(result.error || "Failed to call target");
        } else {
          // Call succeeded - update data
          this.activeCalls.set(target.user_id, {
            caller_name: this.userName || "Unknown",
            target_name: target.name,
            target_level: target.level || 0,
            target_status: target.status,
          });
          // Update compact info on successful call
          this.updateCompactInfo();
        }

        const totalTime = performance.now() - startTime;

        return result;
      } catch (error) {
        console.error("Call target error:", error);
        // Don't update UI on error

        // Show more specific error message
        if (error.message && error.message.includes("timeout")) {
          alert("Call request timed out. Please try again.");
        } else {
          alert(
            "Failed to call target. Please check your connection and try again."
          );
        }

        return { success: false, error: error.message };
      } finally {
        // Always clean up pending calls
        if (this.pendingCalls) {
          this.pendingCalls.delete(target.user_id);
        }
      }
    }

    // Check TornStats API status for settings display
    async checkTornStatsStatus() {
      const tornStatsStatus = document.getElementById("tornstats-status");
      if (!tornStatsStatus) return;

      try {
        if (!this.apiKey || !this.factionId) {
          tornStatsStatus.textContent = "Incomplete setup";
          tornStatsStatus.style.color = "#ff6666";
          return;
        }

        tornStatsStatus.textContent = "Checking...";
        tornStatsStatus.style.color = "#888";

        // Also update user info while we're at it
        const userIdDisplay = document.getElementById("user-id-display");
        const factionIdDisplay = document.getElementById("faction-id-display");
        if (userIdDisplay && this.userId) {
          userIdDisplay.textContent = this.userId;
        }
        if (factionIdDisplay && this.factionId) {
          factionIdDisplay.textContent = this.factionId;
        }

        const response = await customFetch(`https://api.torn.com/v2/faction/${this.factionId}?selections=profile&key=${this.apiKey}`);

        if (response.ok) {
          tornStatsStatus.textContent = "✓ Connected";
          tornStatsStatus.style.color = "#4CAF50";
        } else if (response.status === 404) {
          const errorText = await response.text();
          if (errorText.includes('Faction not found')) {
            tornStatsStatus.textContent = "⚠ Faction not accessible";
            tornStatsStatus.style.color = "#FFA726";
          } else {
            tornStatsStatus.textContent = "✗ Access denied";
            tornStatsStatus.style.color = "#ff6666";
          }
        } else {
          tornStatsStatus.textContent = "✗ Connection failed";
          tornStatsStatus.style.color = "#ff6666";
        }
      } catch (error) {
        console.error("TornStats status check failed:", error);
        tornStatsStatus.textContent = "✗ Check failed";
        tornStatsStatus.style.color = "#ff6666";
      }
    }

    // ========================================
    // ATTACK STATUS UPDATE FUNCTION
    // ========================================
    async updateTargetStatusOnAttack(targetId) {
      try {

        // Get current target status and update database
        await this.refreshAndUpdateTargetStatus(targetId);

        // Start attack tracking to monitor target status changes
        this.startAttackTracking(targetId);

      } catch (error) {
        console.error(`[War Calling] Error updating target status on attack:`, error);
      }
    }

    // Function to refresh target status and update database
    async refreshAndUpdateTargetStatus(targetId) {
      try {
        if (!this.apiKey || !this.factionId) {
          console.warn('[War Calling] Cannot refresh target status: missing API key or faction ID');
          return;
        }

        // Only proceed if we have an active war
        const activeWar = await this.checkActiveWar();
        if (!activeWar) {
          console.warn('[War Calling] Cannot refresh target status: no active war');
          return;
        }


        // Get fresh target data with current status
        const response = await this.customFetch(
          `${this.CONFIG.supabase.url}/functions/v1/get-war-targets`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              war_id: activeWar.war_id,
              faction_id: this.factionId,
              api_key: this.apiKey,
              called_targets_only: [targetId]
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.targets && data.targets.length > 0) {
            const target = data.targets[0];

            // Update target status in database
            await this.updateTargetInDatabase(target, activeWar.war_id);
          }
        }

      } catch (error) {
        console.error('[War Calling] Error refreshing target status:', error);
      }
    }

    // Helper function to update target in database
    async updateTargetInDatabase(target, warId) {
      try {
        const targetStatus = target.status ? JSON.stringify(target.status) : null;

        const response = await this.customFetch(
          `${this.CONFIG.supabase.url}/functions/v1/call-management`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.CONFIG.supabase.anonKey}`,
            },
            body: JSON.stringify({
              action: 'update_status',
              war_id: warId,
              faction_id: this.factionId,
              target_id: target.user_id || target.id,
              target_status: targetStatus
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
        } else {
          console.error('[War Calling] Failed to update target in database:', await response.text());
        }

      } catch (error) {
        console.error('[War Calling] Error updating target in database:', error);
      }
    }
  }

  // ========================================
  // TEST FUNCTION FOR DEBUGGING
  // ========================================
  window.testSupabaseConnection = async function () {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://wdgvdggkhxeugyusaymo.supabase.co/rest/v1/",
        headers: {
          apikey: CONFIG.supabase.anonKey,
          Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
        },
        timeout: 15000,
        onload: (response) => {
          resolve(response);
        },
        onerror: (error) => {
          console.error("[War Calling] REST API test FAILED:", error);
          reject(error);
        },
        ontimeout: () => {
          console.error("[War Calling] REST API test TIMEOUT");
          reject(new Error("Timeout"));
        },
      });
    });
  };

  window.testEdgeFunction = async function () {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: "https://wdgvdggkhxeugyusaymo.supabase.co/functions/v1/call-management",
        headers: {
          "Content-Type": "application/json",
          apikey: CONFIG.supabase.anonKey,
          Authorization: `Bearer ${CONFIG.supabase.anonKey}`,
        },
        data: JSON.stringify({
          action: "get_calls",
          war_id: "31623",
          faction_id: 46666
        }),
        timeout: 30000,
        onload: (response) => {
          resolve(response);
        },
        onerror: (error) => {
          console.error("[TEST] Edge Function test FAILED:", error);
          reject(error);
        },
        ontimeout: () => {
          console.error("[TEST] Edge Function test TIMEOUT");
          reject(new Error("Timeout"));
        },
      });
    });
  };

  // ========================================
  // INITIALIZATION
  // ========================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.warCallingSystemInstance = new WarCallingSystem();
      window.warCallingSystemInstance.init();

      // Defer connection tests to avoid blocking UI
      setTimeout(() => {
        Promise.all([
          window.testSupabaseConnection().catch(console.error),
          TestBSPConnection().catch(console.error),
          window.testEdgeFunction().catch(console.error)
        ]);
      }, 1000);
    });
  } else {
    window.warCallingSystemInstance = new WarCallingSystem();
    window.warCallingSystemInstance.init();

    // Defer connection tests
    setTimeout(() => {
      Promise.all([
        window.testSupabaseConnection().catch(console.error),
        TestBSPConnection().catch(console.error),
        window.testEdgeFunction().catch(console.error)
      ]);
    }, 1000);
  }
})();
