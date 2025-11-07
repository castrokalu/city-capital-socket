// socket-server.js
console.log("🧠 Starting socket server...");

import 'dotenv/config';
import express from "express";
import http from "http";
import { Server } from "socket.io";

console.log("✅ Modules imported. Env vars:", process.env.PORT, process.env.SOCKET_SECRET);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ["https://your-domain.com", "http://localhost:3000"] }
});

app.use(express.json());

// Simple auth token for the HTTP emit endpoint (rotate / store in env)
const SECRET = process.env.SOCKET_SECRET || "replace_with_a_strong_secret";

// HTTP endpoint for backend to trigger admin notifications
app.post("/emit", (req, res) => {
  const token = req.header("x-api-key") || "";
  if (!token || token !== SECRET) return res.status(401).json({ ok: false, message: "Unauthorized" });

  const payload = req.body || {};
  // Validate allowed fields: transaction_id, user_id, amount, status, time, bank, last4
  const safe = {
    transaction_id: payload.transaction_id || null,
    user_id: payload.user_id || null,
    amount: payload.amount || null,
    status: payload.status || "unknown",
    time: payload.time || new Date().toISOString(),
    bank: payload.bank || "Unknown",
    last4: payload.last4 || null
  };

  // Broadcast only to admins room
  io.to("admins").emit("notify_admin", safe);
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  // Admins should call socket.emit('join_admin_room', { token }) after connecting
  socket.on("join_admin_room", ({ token }) => {
    if (token === process.env.ADMIN_ROOM_SECRET) {
      socket.join("admins");
      socket.emit("joined_admin");
      console.log("Socket joined admins:", socket.id);
    } else {
      socket.emit("error", "Invalid admin token");
    }
  });

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Socket server running on port ${PORT}`));
