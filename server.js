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

  const totalConectados = io.engine.clientsCount;

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

      // Insertar el mensaje y devolverlo con RETURNING
      console.log("Insertando mensaje...");
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

  socket.on("getPendingRequests", async () => {
    try {
      const results = await db.execute(
        `SELECT f.id, f.user_id, u.username, u.profileImage 
        FROM friendships f 
        JOIN users u ON u.id = f.user_id
        WHERE f.friend_id = ? AND f.status = 'pending'`,
        [userId]
      );
      if (results.rows.length === 0) {
        return socket.emit("error", {message: "No hay solicitudes pendientes"});
      }

      const pendingRequests = results.rows;
      socket.emit("pendingRequests", pendingRequests);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      res.emit("Error fetching pending requests");
    }
  });

  // Manejo de desconexión
  socket.on("disconnect", () => {
    console.log(`Usuario desconectado: ${userId}`);
  });
});
