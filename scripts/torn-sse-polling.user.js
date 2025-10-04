// ==UserScript==
// @name         Torn SSE with Polling
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  SSE via polling to bypass CSP
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      torn-cat-sse.onrender.com
// ==/UserScript==

(function() {
  'use strict';
  
  const TRIGGER_URL = "https://torn-cat-sse.onrender.com/trigger";
  const POLL_URL = "https://torn-cat-sse.onrender.com/events";
  
  let lastEventId = GM_getValue('lastEventId', 0);
  let isPolling = false;
  
  // Create control panel
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div id="sse-panel" style="position:fixed;top:100px;right:20px;background:#2c3e50;color:white;padding:15px;border-radius:8px;z-index:99999;font-family:Arial;min-width:250px;box-shadow:0 4px 6px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 10px 0;font-size:16px;">🚀 SSE Polling Test</h3>
      <div id="sse-status" style="margin-bottom:10px;padding:5px;background:#27ae60;border-radius:4px;text-align:center;">Connected (Polling)</div>
      
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:5px;">Caller ID:</label>
        <input type="text" id="caller-id" placeholder="Ex: 123456" style="width:100%;padding:5px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
      </div>
      
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:5px;">Target ID:</label>
        <input type="text" id="target-id" placeholder="Ex: 789012" style="width:100%;padding:5px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
      </div>
      
      <button id="send-call" style="width:100%;padding:10px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Send Call Test</button>
      <button id="send-multi" style="width:100%;padding:10px;background:#9b59b6;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;margin-top:5px;">Send 5 Calls</button>
      
      <div id="call-log" style="margin-top:10px;max-height:200px;overflow-y:auto;font-size:12px;"></div>
      <div id="stats" style="margin-top:5px;font-size:11px;opacity:0.7;">Waiting for calls...</div>
    </div>
  `;
  document.body.appendChild(panel);
  
  const callLog = document.getElementById('call-log');
  const sendButton = document.getElementById('send-call');
  const sendMultiButton = document.getElementById('send-multi');
  const callerInput = document.getElementById('caller-id');
  const targetInput = document.getElementById('target-id');
  const stats = document.getElementById('stats');
  
  let callCount = 0;
  
  // Function to add log entry
  function addLogEntry(data) {
    callCount++;
    const logEntry = document.createElement('div');
    logEntry.style.cssText = "padding:5px;margin-bottom:5px;background:#34495e;border-radius:4px;";
    logEntry.innerHTML = `
      <strong>${new Date(data.created_at || Date.now()).toLocaleTimeString()}</strong><br>
      ${data.caller_id} → ${data.target_id}
    `;
    callLog.insertBefore(logEntry, callLog.firstChild);
    
    // Keep only last 10 entries
    while (callLog.children.length > 10) {
      callLog.removeChild(callLog.lastChild);
    }
    
    // Show floating notification
    const notif = document.createElement('div');
    notif.textContent = `Call: ${data.caller_id} → ${data.target_id}`;
    notif.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#f39c12;color:#000;padding:15px 25px;border-radius:8px;font-weight:bold;z-index:99999;animation:slideUp 0.3s ease-out;";
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
    
    // Update stats
    stats.textContent = `Total calls received: ${callCount}`;
  }
  
  // Send single call
  sendButton.addEventListener('click', () => {
    const callerId = callerInput.value || Math.floor(Math.random() * 1000000);
    const targetId = targetInput.value || Math.floor(Math.random() * 1000000);
    
    sendCall(callerId, targetId);
  });
  
  // Send multiple calls
  sendMultiButton.addEventListener('click', () => {
    sendMultiButton.disabled = true;
    sendMultiButton.textContent = "Sending...";
    
    let sent = 0;
    const interval = setInterval(() => {
      sendCall(
        Math.floor(Math.random() * 1000000),
        Math.floor(Math.random() * 1000000)
      );
      sent++;
      
      if (sent >= 5) {
        clearInterval(interval);
        sendMultiButton.disabled = false;
        sendMultiButton.textContent = "Send 5 Calls";
      }
    }, 500);
  });
  
  // Function to send call
  function sendCall(callerId, targetId) {
    GM_xmlhttpRequest({
      method: "POST",
      url: TRIGGER_URL,
      headers: {
        "Content-Type": "application/json"
      },
      data: JSON.stringify({
        caller_id: parseInt(callerId),
        target_id: parseInt(targetId)
      }),
      onload: function(response) {
        try {
          const result = JSON.parse(response.responseText);
          console.log("[SSE] Call sent:", result);
          
          // Add our own call to log immediately
          addLogEntry({
            caller_id: callerId,
            target_id: targetId,
            created_at: new Date().toISOString()
          });
          
        } catch (e) {
          console.error("[SSE] Parse error:", e);
        }
      },
      onerror: function(error) {
        console.error("[SSE] Send error:", error);
      }
    });
  }
  
  // CSS Animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(100px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  console.log("[SSE Polling] Script loaded! Panel should be visible.");
  
})();