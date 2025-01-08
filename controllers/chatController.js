// controllers/chatController.js
const db = require("../config/database");

exports.getLastMessage = async (req, res) => {
  const userId = req.userId; // El ID del usuario autenticado
  const {friendId} = req.query;

  try {
    const messages = await db.execute(
      `SELECT * FROM messages 
         WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?)
         ORDER BY created_at DESC LIMIT 1`,
      [userId, friendId, friendId, userId]
    );

    if (messages.rows.length === 0) {
      return res
        .status(200)
        .json({message: "No hay mensajes entre estos usuarios."});
    }

    return res.status(200).json(messages.rows[0]);
  } catch (error) {
    console.error("Error al obtener el último mensaje:", error);
    return res.status(500).json({message: "Error al obtener el mensaje."});
  }
};

exports.getConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const {friend_id} = req.query;

    const {rows: friendship} = await db.execute(
      "SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ? OR user_id = ? AND friend_id = ?) AND status = 'accepted'",
      [userId, friend_id, friend_id, userId]
    );

    if (friendship.length === 0) {
      throw new Error("No tienes permiso para acceder a esta conversación.");
    }

    // Obtener la conversación entre los dos usuarios
    const {rows: conversation} = await db.execute(
      "SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC",
      [userId, friend_id, friend_id, userId]
    );

    return res.json(conversation); // Devuelve la conversación como respuesta
  } catch (err) {
    console.error("Error al obtener conversación:", err.message);
    return res.status(500).send("Error al obtener la conversación.");
  }
};
exports.markMessagesAsDelivered = async (req, res) => {
  try {
    const userId = req.userId; // Usuario autenticado desde el middleware
    const {senderId} = req.body; // ID del remitente desde el cuerpo de la solicitud

    console.log("userId mark:", userId);
    console.log("senderId mark:", senderId);
    if (!senderId) {
      return res
        .status(400)
        .json({error: "El ID del remitente es obligatorio."});
    }

    // Actualizar mensajes no entregados
    const result = await db.execute(
      "UPDATE messages SET delivered = 1 WHERE receiver_id = ? AND sender_id = ? AND delivered = 0",
      [userId, senderId]
    );

    return res.status(200).json({
      message: "Mensajes marcados como entregados",
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error("Error al marcar los mensajes como entregados:", error);
    res.status(500).json({error: "Error interno del servidor"});
  }
};
