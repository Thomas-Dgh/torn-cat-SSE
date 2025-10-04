import express from "express";
import { Client } from "pg";
import cors from "cors";

const app = express();
app.use(cors({ origin: "https://www.torn.com", methods: ["GET"] }));

// PostgreSQL client - will be created when needed
let pg = null;
let pgConnected = false;

async function connectPostgres() {
  if (pgConnected) return; // Already connected
  
  try {
    // Use connection string directly - let pg handle parsing
    const dbUrl = process.env.DATABASE_URL;
    console.log("Connecting to database...");
    
    // Create new client with connection string
    pg = new Client({ 
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    await pg.connect();
    console.log("✅ Connected to PostgreSQL");
    await pg.query("LISTEN target_calls");
    pgConnected = true;
    
    // Set up notification listener
    pg.on("notification", (msg) => {
      try {
        const data = JSON.parse(msg.payload);
        for (const res of clients) {
          res.write(`event: target_call\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      } catch (err) {
        console.error("Bad payload", err);
      }
    });
    
    // Handle connection errors
    pg.on("error", (err) => {
      console.error("PostgreSQL error:", err);
      pgConnected = false;
      // Try to reconnect after 5 seconds
      setTimeout(connectPostgres, 5000);
    });
    
  } catch (error) {
    console.error("❌ PostgreSQL connection error:", error);
    pgConnected = false;
    // Retry in 5 seconds
    setTimeout(connectPostgres, 5000);
  }
}

let clients = new Set();

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "SSE server running",
    clients: clients.size,
    postgres: pgConnected ? "connected" : "disconnected"
  });
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  
  res.write("retry: 10000\n\n");
  clients.add(res);
  
  const keepAlive = setInterval(() => res.write(":\n\n"), 20000);
  
  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ SSE server running on", PORT);
  // Start PostgreSQL connection after server is up
  connectPostgres();
});