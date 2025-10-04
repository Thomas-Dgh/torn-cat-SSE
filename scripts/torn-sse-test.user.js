// ==UserScript==
// @name         Torn SSE Test
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Test SSE connection and manual calls
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      torn-cat-sse.onrender.com
// ==/UserScript==

(function() {
  'use strict';
  
  const SSE_URL = "https://torn-cat-sse.onrender.com/events";
  const TRIGGER_URL = "https://torn-cat-sse.onrender.com/trigger";
  
  // Créer le panneau de contrôle
  const panel = document.createElement('div');
  panel.innerHTML = `
    <div id="sse-panel" style="position:fixed;top:100px;right:20px;background:#2c3e50;color:white;padding:15px;border-radius:8px;z-index:99999;font-family:Arial;min-width:250px;box-shadow:0 4px 6px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 10px 0;font-size:16px;">🚀 SSE Test Panel</h3>
      <div id="sse-status" style="margin-bottom:10px;padding:5px;background:#e74c3c;border-radius:4px;text-align:center;">Déconnecté</div>
      
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:5px;">Caller ID:</label>
        <input type="text" id="caller-id" placeholder="Ex: 123456" style="width:100%;padding:5px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
      </div>
      
      <div style="margin-bottom:10px;">
        <label style="display:block;margin-bottom:5px;">Target ID:</label>
        <input type="text" id="target-id" placeholder="Ex: 789012" style="width:100%;padding:5px;border-radius:4px;border:1px solid #34495e;background:#34495e;color:white;">
      </div>
      
      <button id="send-call" style="width:100%;padding:10px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Envoyer Call Test</button>
      
      <div id="call-log" style="margin-top:10px;max-height:200px;overflow-y:auto;font-size:12px;"></div>
    </div>
  `;
  document.body.appendChild(panel);
  
  const statusDiv = document.getElementById('sse-status');
  const callLog = document.getElementById('call-log');
  const sendButton = document.getElementById('send-call');
  const callerInput = document.getElementById('caller-id');
  const targetInput = document.getElementById('target-id');
  
  // Connexion SSE
  const evtSource = new EventSource(SSE_URL);
  
  evtSource.onopen = () => {
    console.log("[SSE] Connecté!");
    statusDiv.textContent = "Connecté ✅";
    statusDiv.style.background = "#27ae60";
  };
  
  evtSource.addEventListener("target_call", (e) => {
    const data = JSON.parse(e.data);
    console.log("[SSE] Call reçu:", data);
    
    // Ajouter au log
    const logEntry = document.createElement('div');
    logEntry.style.cssText = "padding:5px;margin-bottom:5px;background:#34495e;border-radius:4px;";
    logEntry.innerHTML = `
      <strong>${new Date(data.created_at).toLocaleTimeString()}</strong><br>
      ${data.caller_id} → ${data.target_id}
    `;
    callLog.insertBefore(logEntry, callLog.firstChild);
    
    // Notification flottante
    const notif = document.createElement('div');
    notif.textContent = `Call: ${data.caller_id} → ${data.target_id}`;
    notif.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#f39c12;color:#000;padding:15px 25px;border-radius:8px;font-weight:bold;z-index:99999;animation:slideUp 0.3s ease-out;";
    document.body.appendChild(notif);
    
    setTimeout(() => notif.remove(), 5000);
  });
  
  evtSource.onerror = () => {
    console.error("[SSE] Erreur de connexion");
    statusDiv.textContent = "Erreur ❌";
    statusDiv.style.background = "#e74c3c";
  };
  
  // Bouton d'envoi
  sendButton.addEventListener('click', async () => {
    const callerId = callerInput.value || Math.floor(Math.random() * 1000000);
    const targetId = targetInput.value || Math.floor(Math.random() * 1000000);
    
    sendButton.disabled = true;
    sendButton.textContent = "Envoi...";
    
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
          console.log("[SSE] Call envoyé:", result);
          
          sendButton.textContent = `Envoyé à ${result.sent_to} clients`;
          setTimeout(() => {
            sendButton.textContent = "Envoyer Call Test";
            sendButton.disabled = false;
          }, 2000);
        } catch (e) {
          console.error("[SSE] Erreur parsing:", e);
          sendButton.textContent = "Erreur!";
          sendButton.disabled = false;
        }
      },
      onerror: function(error) {
        console.error("[SSE] Erreur d'envoi:", error);
        sendButton.textContent = "Erreur!";
        sendButton.disabled = false;
      }
    });
  });
  
  // Animation CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(100px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
})();