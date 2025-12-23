// socket-server.js
import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

/* ============================== CONFIG ============================== */

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

/* =========================== STATE STORES =========================== */

// Support chat online users
const supportClients = {}; // socket.id → { socketId, name, email, room }


const ADMIN_SECRET = process.env.ADMIN_ROOM_SECRET;

/* ============================= SOCKETS ============================== */

io.on("connection", socket => {
    console.log("Socket connected:", socket.id);

    /* ====================== CLIENT JOINS SUPPORT ===================== */
    socket.on("join_chat", ({ name, email, room }) => {
        if (!name || !email || !room) return;

        socket.join(room);

        supportClients[socket.id] = {
            socketId: socket.id,
            name,
            email,
            room
        };

        io.to("admins").emit("support_user_joined", supportClients[socket.id]);

        console.log("Support client joined:", supportClients[socket.id]);
    });

    /* ====================== CLIENT MESSAGE ====================== */
    socket.on("client_message", ({ room, message, email }) => {
        if (!room || !message) return;

        io.to("admins").emit("support_client_message", {
            room,
            message,
            email,
            sender: "client",
            time: new Date().toISOString()
        });
    });

    /* ====================== ADMIN MESSAGE ====================== */
    socket.on("admin_message", ({ room, message }) => {
        if (!room || !message) return;

        io.to(room).emit("admin_message", {
            message,
            sender: "admin",
            time: new Date().toISOString()
        });
    });

    /* ====================== TYPING ====================== */
    socket.on("typing", ({ room, sender }) => {
        if (!room) return;
        socket.to(room).emit("typing", { sender });
    });

    /* ====================== ADMIN JOIN ====================== */
    socket.on("join_admin_room", ({ token }) => {
        if (token !== ADMIN_SECRET) {
            socket.emit("error", "Unauthorized admin");
            return;
        }

        socket.join("admins");
        socket.emit("joined_admin");

        // Sync all online support clients
        socket.emit(
            "sync_support_clients",
            Object.values(supportClients)
        );

        console.log("Admin joined:", socket.id);
    });

    /* ====================== DISCONNECT ====================== */
    socket.on("disconnect", () => {
        if (supportClients[socket.id]) {
            io.to("admins").emit("support_user_left", {
                socketId: socket.id,
                room: supportClients[socket.id].room
            });

            delete supportClients[socket.id];
        }

        console.log("Socket disconnected:", socket.id);
    });
});

/* ============================= SERVER ============================== */

const PORT = process.env.PORT || 3001;
server.listen(PORT, () =>
    console.log(`Socket server running on port ${PORT}`)
);
