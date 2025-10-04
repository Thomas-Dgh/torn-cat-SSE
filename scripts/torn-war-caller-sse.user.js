// ==UserScript==
// @name         Torn War Caller (Realtime SSE)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Affiche en direct qui call qui via SSE backend Render
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  
  const SSE_URL = "https://torncat-sse.onrender.com/events";
  const evtSource = new EventSource(SSE_URL);
  
  evtSource.addEventListener("open", () => {
    console.log("[TornCat] Connecté au flux SSE");
  });
  
  evtSource.addEventListener("error", (err) => {
    console.warn("[TornCat] Erreur SSE", err);
  });
  
  evtSource.addEventListener("target_call", (e) => {
    const data = JSON.parse(e.data);
    console.log("[TornCat] Nouveau call:", data);
    showNotification(`Target ${data.target_id} appelé par ${data.caller_id}`);
  });
  
  function showNotification(msg) {
    const div = document.createElement("div");
    div.textContent = msg;
    div.style = "position:fixed;bottom:20px;right:20px;background:#222;color:#fff;padding:10px 15px;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 2px 6px rgba(0,0,0,0.4)";
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }
})();