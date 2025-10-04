// ==UserScript==
// @name         Torn Realtime Calls (Supabase)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Real-time call system using Supabase (no polling!)
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      vcxzqgrivbgwewmaaiye.supabase.co
// @require      https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// ==/UserScript==

(function() {
  'use strict';
  
  // Configuration Supabase
  const SUPABASE_URL = 'https://vcxzqgrivbgwewmaaiye.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjeHpxZ3JpdmJnd2V3bWFhaXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDAxNjMsImV4cCI6MjA3NTExNjE2M30.s-_8ygoHo6t_4lsqxUnXctyCACTV8nXT6RH3WNmSXHk';
  
  // Wait for Supabase to load
  function waitForSupabase() {
    if (typeof window.supabase !== 'undefined') {
      initializeRealtime();
    } else {
      setTimeout(waitForSupabase, 100);
    }
  }
  
  function initializeRealtime() {
    console.log("[Realtime] Initializing Supabase client...");
    
    // Create Supabase client
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Create UI
    const panel = document.createElement('div');
    panel.innerHTML = `
      <div style="position:fixed;top:100px;right:20px;background:#2c3e50;color:white;padding:15px;border-radius:8px;z-index:99999;font-family:Arial;min-width:280px;box-shadow:0 4px 6px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 10px 0;">⚡ Realtime Calls (No Polling!)</h3>
        <div id="rt-status" style="padding:5px;background:#f39c12;border-radius:4px;text-align:center;margin-bottom:10px;">Connecting to Supabase...</div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <input type="text" id="caller-id" placeholder="Caller ID" style="padding:8px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
          <input type="text" id="target-id" placeholder="Target ID" style="padding:8px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
        </div>
        
        <button id="send-call" style="width:100%;padding:10px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;margin-bottom:5px;">Send Real Call</button>
        <button id="clear-db" style="width:100%;padding:8px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Clear All Calls</button>
        
        <div style="margin-top:10px;padding:10px;background:#34495e;border-radius:4px;">
          <h4 style="margin:0 0 5px 0;font-size:14px;">📊 Stats</h4>
          <div id="stats" style="font-size:12px;">Waiting for realtime events...</div>
        </div>
        
        <div id="call-log" style="margin-top:10px;max-height:200px;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(panel);
    
    const statusDiv = document.getElementById('rt-status');
    const callLog = document.getElementById('call-log');
    const statsDiv = document.getElementById('stats');
    const sendButton = document.getElementById('send-call');
    const clearButton = document.getElementById('clear-db');
    const callerInput = document.getElementById('caller-id');
    const targetInput = document.getElementById('target-id');
    
    let callCount = 0;
    let subscription = null;
    
    // Function to update UI
    function updateStatus(message, color) {
      statusDiv.textContent = message;
      statusDiv.style.background = color;
    }
    
    function addCallToLog(call, type = 'received') {
      callCount++;
      const entry = document.createElement('div');
      entry.style.cssText = `padding:8px;margin-bottom:5px;background:${type === 'sent' ? '#27ae60' : '#3498db'};border-radius:4px;color:white;`;
      entry.innerHTML = `
        <div style="font-weight:bold;">${type === 'sent' ? '📤' : '📨'} ${new Date(call.created_at).toLocaleTimeString()}</div>
        <div>${call.caller_name || call.caller_id} → ${call.target_name || call.target_id}</div>
      `;
      callLog.insertBefore(entry, callLog.firstChild);
      
      // Limit to 10 entries
      while (callLog.children.length > 10) {
        callLog.removeChild(callLog.lastChild);
      }
      
      // Update stats
      statsDiv.innerHTML = `
        Total calls: ${callCount}<br>
        Status: <span style="color:#2ecc71;">● Connected</span><br>
        Last event: ${new Date().toLocaleTimeString()}
      `;
      
      // Show floating notification
      showNotification(call);
    }
    
    function showNotification(call) {
      const notif = document.createElement('div');
      notif.innerHTML = `
        <strong>New Call!</strong><br>
        ${call.caller_id} → ${call.target_id}
      `;
      notif.style.cssText = `
        position:fixed;
        bottom:20px;
        left:50%;
        transform:translateX(-50%);
        background:#2ecc71;
        color:white;
        padding:15px 25px;
        border-radius:8px;
        font-weight:bold;
        z-index:99999;
        animation:slideUp 0.3s ease-out;
        box-shadow:0 4px 6px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(notif);
      setTimeout(() => notif.remove(), 4000);
    }
    
    // Subscribe to realtime changes
    async function subscribeToRealtime() {
      console.log("[Realtime] Subscribing to target_calls changes...");
      
      subscription = supabaseClient
        .channel('realtime:target_calls')
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'target_calls' 
          }, 
          (payload) => {
            console.log('[Realtime] New call received:', payload);
            addCallToLog(payload.new, 'received');
          }
        )
        .subscribe((status) => {
          console.log('[Realtime] Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            updateStatus('✅ Connected - Realtime Active!', '#27ae60');
          }
        });
    }
    
    // Send call function
    async function sendCall() {
      const callerId = callerInput.value || Math.floor(Math.random() * 1000000);
      const targetId = targetInput.value || Math.floor(Math.random() * 1000000);
      
      sendButton.disabled = true;
      sendButton.textContent = "Sending...";
      
      try {
        const { data, error } = await supabaseClient
          .from('target_calls')
          .insert({
            caller_id: parseInt(callerId),
            target_id: parseInt(targetId),
            caller_name: `User ${callerId}`,
            target_name: `Target ${targetId}`,
            war_id: 1
          })
          .select()
          .single();
        
        if (error) throw error;
        
        console.log('[Realtime] Call sent:', data);
        sendButton.textContent = "✅ Sent!";
        
        // Note: We'll receive this via realtime subscription
        
      } catch (error) {
        console.error('[Realtime] Send error:', error);
        sendButton.textContent = "❌ Error!";
        updateStatus(`Error: ${error.message}`, '#e74c3c');
      }
      
      setTimeout(() => {
        sendButton.disabled = false;
        sendButton.textContent = "Send Real Call";
      }, 2000);
    }
    
    // Clear all calls
    async function clearCalls() {
      if (!confirm('Clear all calls from database?')) return;
      
      clearButton.disabled = true;
      try {
        const { error } = await supabaseClient
          .from('target_calls')
          .delete()
          .gte('id', 0);
        
        if (error) throw error;
        
        callLog.innerHTML = '';
        callCount = 0;
        statsDiv.textContent = 'Database cleared!';
      } catch (error) {
        console.error('[Realtime] Clear error:', error);
      }
      clearButton.disabled = false;
    }
    
    // Event listeners
    sendButton.addEventListener('click', sendCall);
    clearButton.addEventListener('click', clearCalls);
    
    // Enter key to send
    [callerInput, targetInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendCall();
      });
    });
    
    // CSS for animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Initialize
    subscribeToRealtime();
    
    // Load recent calls
    async function loadRecentCalls() {
      try {
        const { data, error } = await supabaseClient
          .from('target_calls')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (!error && data) {
          data.reverse().forEach(call => {
            addCallToLog(call, 'historical');
          });
        }
      } catch (error) {
        console.error('[Realtime] Load error:', error);
      }
    }
    
    loadRecentCalls();
  }
  
  // Start
  waitForSupabase();
  
})();