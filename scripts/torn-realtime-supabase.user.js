// ==UserScript==
// @name         Torn Realtime with Supabase
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Real-time calls using Supabase Realtime
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      vcxzqgrivbgwewmaaiye.supabase.co
// @connect      wdgvdggkhxeugyusaymo.supabase.co
// ==/UserScript==

(function() {
  'use strict';
  
  // Supabase config
  const SUPABASE_URL = 'https://vcxzqgrivbgwewmaaiye.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjeHpxZ3JpdmJnd2V3bWFhaXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDAxNjMsImV4cCI6MjA3NTExNjE2M30.s-_8ygoHo6t_4lsqxUnXctyCACTV8nXT6RH3WNmSXHk';
  
  console.log("[Realtime] Starting Supabase connection...");
  
  // Create panel
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div style="position:fixed;top:100px;right:20px;background:#2c3e50;color:white;padding:15px;border-radius:8px;z-index:99999;font-family:Arial;min-width:250px;">
      <h3 style="margin:0 0 10px 0;">🔴 Supabase Realtime</h3>
      <div id="rt-status" style="padding:5px;background:#e74c3c;border-radius:4px;text-align:center;margin-bottom:10px;">Connecting...</div>
      
      <button id="test-insert" style="width:100%;padding:10px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Test Insert Call</button>
      
      <div id="rt-log" style="margin-top:10px;max-height:200px;overflow-y:auto;font-size:12px;"></div>
    </div>
  `;
  document.body.appendChild(panel);
  
  const statusDiv = document.getElementById('rt-status');
  const logDiv = document.getElementById('rt-log');
  const testButton = document.getElementById('test-insert');
  
  // Function to add log
  function addLog(message, data = null) {
    const entry = document.createElement('div');
    entry.style.cssText = "padding:5px;margin:2px 0;background:#34495e;border-radius:4px;";
    entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    if (data) {
      entry.innerHTML += `<br><small>${JSON.stringify(data)}</small>`;
    }
    logDiv.insertBefore(entry, logDiv.firstChild);
  }
  
  // Test button - Insert directly into Supabase
  testButton.addEventListener('click', () => {
    console.log("[Realtime] Testing insert...");
    testButton.disabled = true;
    
    const callData = {
      caller_id: Math.floor(100000 + Math.random() * 900000),
      target_id: Math.floor(100000 + Math.random() * 900000),
      caller_name: "Test User",
      target_name: "Test Target",
      war_id: 1
    };
    
    GM_xmlhttpRequest({
      method: "POST",
      url: `${SUPABASE_URL}/rest/v1/target_calls`,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      data: JSON.stringify(callData),
      onload: function(response) {
        console.log("[Realtime] Insert response:", response);
        if (response.status === 201) {
          addLog("✅ Call inserted!", callData);
          statusDiv.style.background = "#27ae60";
          statusDiv.textContent = "Connected - Call sent!";
        } else {
          addLog("❌ Insert failed", response.responseText);
        }
        testButton.disabled = false;
      },
      onerror: function(error) {
        console.error("[Realtime] Insert error:", error);
        addLog("❌ Insert error");
        testButton.disabled = false;
      }
    });
  });
  
  // Try WebSocket connection to Supabase Realtime
  addLog("Attempting Supabase connection...");
  
  // For now, let's test if we can connect to Supabase
  GM_xmlhttpRequest({
    method: "GET",
    url: `${SUPABASE_URL}/rest/v1/`,
    headers: {
      "apikey": SUPABASE_ANON_KEY
    },
    onload: function(response) {
      console.log("[Realtime] Supabase test:", response);
      if (response.status === 200) {
        statusDiv.style.background = "#27ae60";
        statusDiv.textContent = "✅ Supabase Connected!";
        addLog("Connected to Supabase!");
      }
    },
    onerror: function(error) {
      console.error("[Realtime] Connection error:", error);
      statusDiv.textContent = "❌ Connection Failed";
      addLog("Connection failed");
    }
  });
  
})();