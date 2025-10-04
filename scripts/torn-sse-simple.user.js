// ==UserScript==
// @name         Torn SSE Simple Test
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Simple SSE test with manual polling fallback
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      torn-cat-sse.onrender.com
// ==/UserScript==

(function() {
  'use strict';
  
  const TRIGGER_URL = "https://torn-cat-sse.onrender.com/trigger";
  
  console.log("[SSE Test] Script loaded!");
  
  // Create floating button
  const button = document.createElement('button');
  button.innerHTML = '🚀 Send Test Call';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 15px 25px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    z-index: 99999;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(button);
  
  // Status indicator
  const status = document.createElement('div');
  status.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    padding: 10px 20px;
    background: #2c3e50;
    color: white;
    border-radius: 8px;
    z-index: 99999;
    font-family: Arial;
  `;
  status.textContent = "SSE Test Ready";
  document.body.appendChild(status);
  
  // Send test call
  button.addEventListener('click', () => {
    console.log("[SSE Test] Sending test call...");
    button.disabled = true;
    button.textContent = "Sending...";
    
    const callData = {
      caller_id: Math.floor(100000 + Math.random() * 900000),
      target_id: Math.floor(100000 + Math.random() * 900000)
    };
    
    GM_xmlhttpRequest({
      method: "POST",
      url: TRIGGER_URL,
      headers: {
        "Content-Type": "application/json"
      },
      data: JSON.stringify(callData),
      onload: function(response) {
        console.log("[SSE Test] Response:", response.responseText);
        
        try {
          const result = JSON.parse(response.responseText);
          
          // Show notification
          const notif = document.createElement('div');
          notif.innerHTML = `
            <strong>✅ Call Sent!</strong><br>
            ${callData.caller_id} → ${callData.target_id}<br>
            Sent to ${result.sent_to} clients
          `;
          notif.style.cssText = `
            position: fixed;
            top: 160px;
            right: 20px;
            padding: 15px;
            background: #27ae60;
            color: white;
            border-radius: 8px;
            z-index: 99999;
            font-family: Arial;
          `;
          document.body.appendChild(notif);
          
          setTimeout(() => notif.remove(), 5000);
          
          status.textContent = `Last call: ${new Date().toLocaleTimeString()}`;
          
        } catch (e) {
          console.error("[SSE Test] Parse error:", e);
          status.textContent = "Error: " + e.message;
        }
        
        button.disabled = false;
        button.innerHTML = '🚀 Send Test Call';
      },
      onerror: function(error) {
        console.error("[SSE Test] Request error:", error);
        status.textContent = "Error: Request failed";
        button.disabled = false;
        button.innerHTML = '🚀 Send Test Call';
      }
    });
  });
  
  // Test connection on load
  GM_xmlhttpRequest({
    method: "GET",
    url: "https://torn-cat-sse.onrender.com/",
    onload: function(response) {
      console.log("[SSE Test] Server status:", response.responseText);
      status.textContent = "✅ Server connected";
    },
    onerror: function(error) {
      console.error("[SSE Test] Connection error:", error);
      status.textContent = "❌ Server offline";
    }
  });
  
})();