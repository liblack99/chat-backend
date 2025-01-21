const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const db = require("./config/database");
const authRoutes = require("./routes/auth");
const friendsRoutes = require("./routes/friends");
const chatRoutes = require("./routes/chat");
const {getPendingRequests} = require("./controllers/friendsController");

dotenv.config();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Rutas de la API
app.use("/api/auth", authRoutes); // Rutas de autenticación
app.use("/api/friends", friendsRoutes); // Rutas de amigos
app.use("/api/chat", chatRoutes); // Rutas de chat

// Servidor HTTP
const server = app.listen(process.env.PORT || 5000, () => {
  console.log(
    `Servidor corriendo en http://localhost:${server.address().port}`
  );
});

// Configuración de Socket.IO
const io = socketIO(server, {
  cors: {
    origin: "*",
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("No token provided"));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("Token inválido:", err);
      return next(new Error("Invalid token"));
    }

    if (!user?.userId) {
      return next(new Error("Token is missing userId"));
    }

    // Adjuntar el ID del usuario al socket
    socket.user = {userId: user.userId};
    next();
  });
});

io.on("connection", (socket) => {
  const userId = socket.user.userId.toString();
  console.log(`Usuario conectado: ${userId}`);

  socket.join(userId);

  // Verificar la conexión del usuario
  socket.on("checkUserConnection", (targetUserId) => {
    const isConnected = io.sockets.adapter.rooms.has(targetUserId.toString());
    socket.emit("userConnectionStatus", isConnected);
  });

  socket.on("sendMessage", async ({receiverId, content}) => {
    console.log("Mensaje recibido:", {receiverId, content});

    try {
      // Verificar relación de amistad
      console.log("Verificando relación de amistad...");
      const {rows: friendship} = await db.execute(
        "SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ? OR user_id = ? AND friend_id = ?) AND status = 'accepted'",
        [userId, receiverId, receiverId, userId]
      );

      if (friendship.length === 0) {
        socket.emit(
          "error",
          "No tienes permiso para enviar mensajes a este usuario."
        );
        return;
      }

      const {rows: result} = await db.execute(
        "INSERT INTO messages (sender_id, receiver_id, content, created_at, delivered) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0) RETURNING *",
        [userId, receiverId, content]
      );
      const message = result[0]; // El primer mensaje insertado

      const isReceiverConnected = io.sockets.adapter.rooms.has(
        receiverId.toString()
      );

      if (isReceiverConnected) {
        io.to(receiverId).emit("receiveMessage", message);
      }

      socket.emit("messageSent", message);
    } catch (err) {
      console.error("Error al enviar el mensaje:", err.message);
      socket.emit("error", "No se pudo enviar el mensaje.");
    }
  });

  socket.on("sendFriendRequest", async (friend_id) => {
    if (!userId || !friend_id) {
      return socket.emit("error", "user_id and friend_id are required.");
    }

    if (userId === friend_id) {
      return socket.emit("error", "Cannot send a friend request to yourself.");
    }

    try {
      const existingFriendship = await db.execute(
        "SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
        [userId, friend_id, friend_id, userId]
      );

      if (existingFriendship.rows.length > 0) {
        const {id, status} = existingFriendship.rows[0];

        if (status === "accepted") {
          return socket.emit(
            "error",
            "You are already friends with this user."
          );
        }

        if (status === "pending") {
          return socket.emit("error", "Friend request is already pending.");
        }

        if (status === "rejected") {
          console.log("Resending friend request for rejected status...");
          await db.execute(
            "UPDATE friendships SET status = 'pending' WHERE id = ?",
            [id]
          );

          return socket.emit("success", "Friend request resent.");
        }
      }

      const insertResult = await db.execute(
        "INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)",
        [userId, friend_id]
      );

      console.log("insetResult", insertResult);

      if (insertResult.rowsAffected >= 1) {
        const result = await db.execute(
          `SELECT f.id, f.user_id, u.username, u.profileImage 
          FROM friendships f 
          JOIN users u ON u.id = f.user_id
          WHERE f.friend_id = ? AND f.status = 'pending'`,
          [userId]
        );
        const pendingRequests = result.rows;
        console.log("solicitudes pendientes", pendingRequests);

        const isReceiverConnected = io.sockets.adapter.rooms.has(
          friend_id.toString()
        );

        if (isReceiverConnected) {
          io.to(friend_id).emit("pendingRequest", pendingRequests);
        }
      } else {
        console.log("fallo consulta");
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
      return socket.emit(
        "error",
        "Error sending friend request: " + error.message
      );
    }
  });

  // Manejo de desconexión
  socket.on("disconnect", () => {
    console.log(`Usuario desconectado: ${userId}`);
  });
});
