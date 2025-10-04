import express from "express";
import cors from "cors";

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

let clients = new Set();

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "SSE server running (simple mode)",
    clients: clients.size,
    postgres: "disabled"
  });
});

// SSE endpoint
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  
  res.write("retry: 10000\n\n");
  clients.add(res);
  console.log(`Client connected. Total: ${clients.size}`);
  
  const keepAlive = setInterval(() => res.write(":\n\n"), 20000);
  
  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });
});

// Manual trigger endpoint for testing
app.post("/trigger", (req, res) => {
  const { target_id, caller_id } = req.body;
  
  const data = {
    id: Date.now(),
    caller_id: caller_id || 123,
    target_id: target_id || 456,
    created_at: new Date().toISOString()
  };
  
  // Send to all connected clients
  for (const client of clients) {
    client.write(`event: target_call\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  
  res.json({ success: true, sent_to: clients.size });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Simple SSE server running on ${PORT}`);
});