// ==UserScript==
// @name         Torn Realtime with GM_xmlhttpRequest
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Real-time call system using only GM_xmlhttpRequest
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      vcxzqgrivbgwewmaaiye.supabase.co
// ==/UserScript==

(function() {
  'use strict';
  
  const SUPABASE_URL = 'https://vcxzqgrivbgwewmaaiye.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjeHpxZ3JpdmJnd2V3bWFhaXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDAxNjMsImV4cCI6MjA3NTExNjE2M30.s-_8ygoHo6t_4lsqxUnXctyCACTV8nXT6RH3WNmSXHk';
  
  let pollInterval = null;
  let lastCallId = GM_getValue('lastCallId', 0);
  let warInitialized = false;
  
  // Create UI
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div style="position:fixed;top:100px;right:20px;background:#2c3e50;color:white;padding:15px;border-radius:8px;z-index:99999;font-family:Arial;min-width:280px;box-shadow:0 4px 6px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 10px 0;">💬 Realtime Calls System</h3>
      <div id="rt-status" style="padding:5px;background:#f39c12;border-radius:4px;text-align:center;margin-bottom:10px;">Initializing...</div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <input type="text" id="caller-id" placeholder="Caller ID" style="padding:8px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
        <input type="text" id="target-id" placeholder="Target ID" style="padding:8px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
      </div>
      
      <button id="send-call" style="width:100%;padding:10px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;margin-bottom:5px;">Send Call via Supabase</button>
      <button id="toggle-polling" style="width:100%;padding:8px;background:#9b59b6;color:white;border:none;border-radius:4px;cursor:pointer;">Start Smart Polling</button>
      
      <div style="margin-top:10px;padding:10px;background:#34495e;border-radius:4px;">
        <h4 style="margin:0 0 5px 0;font-size:14px;">📊 Stats</h4>
        <div id="stats" style="font-size:12px;">Ready to send calls...</div>
      </div>
      
      <div id="call-log" style="margin-top:10px;max-height:150px;overflow-y:auto;"></div>
    </div>
  `;
  document.body.appendChild(panel);
  
  const statusDiv = document.getElementById('rt-status');
  const callLog = document.getElementById('call-log');
  const statsDiv = document.getElementById('stats');
  const sendButton = document.getElementById('send-call');
  const toggleButton = document.getElementById('toggle-polling');
  const callerInput = document.getElementById('caller-id');
  const targetInput = document.getElementById('target-id');
  
  let callCount = 0;
  let isPolling = false;
  
  // Functions
  function updateStatus(message, color) {
    statusDiv.textContent = message;
    statusDiv.style.background = color;
  }
  
  function addCallToLog(call, type = 'received') {
    callCount++;
    const entry = document.createElement('div');
    entry.style.cssText = `padding:8px;margin-bottom:5px;background:${type === 'sent' ? '#27ae60' : '#3498db'};border-radius:4px;color:white;font-size:12px;`;
    entry.innerHTML = `
      <strong>${type === 'sent' ? '📤' : '📨'} ${new Date(call.created_at).toLocaleTimeString()}</strong><br>
      ${call.caller_id} → ${call.target_id}
    `;
    callLog.insertBefore(entry, callLog.firstChild);
    
    // Keep only 10 entries
    while (callLog.children.length > 10) {
      callLog.removeChild(callLog.lastChild);
    }
    
    // Update stats
    statsDiv.innerHTML = `
      Calls: ${callCount} | Polling: ${isPolling ? 'ON (2s)' : 'OFF'}<br>
      Last: ${new Date().toLocaleTimeString()}
    `;
    
    // Show notification
    if (type === 'received') {
      showNotification(call);
    }
  }
  
  function showNotification(call) {
    const notif = document.createElement('div');
    notif.innerHTML = `<strong>New Call!</strong><br>${call.caller_id} → ${call.target_id}`;
    notif.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#2ecc71;color:white;padding:15px 25px;border-radius:8px;
      font-weight:bold;z-index:99999;box-shadow:0 4px 6px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
  }
  
  // Send call via GM_xmlhttpRequest
  function sendCall() {
    const callerId = callerInput.value || Math.floor(Math.random() * 1000000);
    const targetId = targetInput.value || Math.floor(Math.random() * 1000000);
    
    sendButton.disabled = true;
    sendButton.textContent = "Sending...";
    
    const callData = {
      caller_id: parseInt(callerId),
      target_id: parseInt(targetId),
      caller_name: `User ${callerId}`,
      target_name: `Target ${targetId}`,
      war_id: 1
    };
    
    GM_xmlhttpRequest({
      method: "POST",
      url: `${SUPABASE_URL}/rest/v1/target_calls`,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      data: JSON.stringify(callData),
      onload: function(response) {
        console.log("[GM] Insert response:", response);
        if (response.status === 201) {
          const data = JSON.parse(response.responseText);
          updateStatus('✅ Call sent!', '#27ae60');
          addCallToLog(data[0], 'sent');
          
          // Update lastCallId
          if (data[0].id > lastCallId) {
            lastCallId = data[0].id;
            GM_setValue('lastCallId', lastCallId);
          }
        } else {
          updateStatus('❌ Send failed', '#e74c3c');
          console.error("Send error:", response.responseText);
        }
        
        sendButton.disabled = false;
        sendButton.textContent = "Send Call via Supabase";
      },
      onerror: function(error) {
        console.error("[GM] Send error:", error);
        updateStatus('❌ Connection error', '#e74c3c');
        sendButton.disabled = false;
        sendButton.textContent = "Send Call via Supabase";
      }
    });
  }
  
  // Smart polling function
  function pollForNewCalls() {
    if (!isPolling) return;
    
    GM_xmlhttpRequest({
      method: "GET",
      url: `${SUPABASE_URL}/rest/v1/target_calls?id=gt.${lastCallId}&order=id.asc&limit=10`,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      onload: function(response) {
        if (response.status === 200) {
          const calls = JSON.parse(response.responseText);
          if (calls.length > 0) {
            calls.forEach(call => {
              if (call.id > lastCallId) {
                addCallToLog(call, 'received');
                lastCallId = call.id;
                GM_setValue('lastCallId', lastCallId);
              }
            });
          }
        }
      },
      onerror: function(error) {
        console.error("[Poll] Error:", error);
      }
    });
  }
  
  // Toggle polling
  function togglePolling() {
    isPolling = !isPolling;
    
    if (isPolling) {
      toggleButton.textContent = "Stop Polling";
      toggleButton.style.background = "#e74c3c";
      updateStatus('🔄 Polling active (every 2s)', '#27ae60');
      
      // Start polling
      pollInterval = setInterval(pollForNewCalls, 2000);
      pollForNewCalls(); // First call immediately
    } else {
      toggleButton.textContent = "Start Smart Polling";
      toggleButton.style.background = "#9b59b6";
      updateStatus('⏸️ Polling stopped', '#f39c12');
      
      // Stop polling
      clearInterval(pollInterval);
    }
  }
  
  // Event listeners
  sendButton.addEventListener('click', sendCall);
  toggleButton.addEventListener('click', togglePolling);
  
  // Enter key
  [callerInput, targetInput].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendCall();
    });
  });
  
  // Initialize test war
  function initializeWar() {
    GM_xmlhttpRequest({
      method: "POST",
      url: `${SUPABASE_URL}/rest/v1/wars`,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      data: JSON.stringify({
        war_id: 1,
        faction_a_id: 1000,
        faction_b_id: 2000,
        faction_a_name: "Test Faction A",
        faction_b_name: "Test Faction B",
        is_active: true
      }),
      onload: function(response) {
        if (response.status === 201 || response.status === 200) {
          console.log("[GM] War initialized");
          warInitialized = true;
        }
      },
      onerror: function(error) {
        console.error("[GM] War init error:", error);
      }
    });
  }
  
  // Load initial data
  function loadRecentCalls() {
    GM_xmlhttpRequest({
      method: "GET",
      url: `${SUPABASE_URL}/rest/v1/target_calls?order=id.desc&limit=5`,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      onload: function(response) {
        if (response.status === 200) {
          const calls = JSON.parse(response.responseText);
          updateStatus('✅ Connected to Supabase', '#27ae60');
          
          // Update lastCallId
          if (calls.length > 0 && calls[0].id > lastCallId) {
            lastCallId = calls[0].id;
            GM_setValue('lastCallId', lastCallId);
          }
          
          // Show recent calls
          calls.reverse().forEach(call => {
            addCallToLog(call, 'historical');
          });
        }
      },
      onerror: function(error) {
        updateStatus('❌ Connection failed', '#e74c3c');
      }
    });
  }
  
  // Initialize
  console.log("[Realtime GM] Script loaded!");
  initializeWar(); // Create test war first
  setTimeout(loadRecentCalls, 1000); // Then load calls
  
})();