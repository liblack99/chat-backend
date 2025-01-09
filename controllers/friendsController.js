// controllers/friendsController.js
const db = require("../config/database");

// Obtener la lista de amigos
exports.getFriends = async (req, res) => {
  const {user_id} = req.params;
  console.log("Received user_id:", user_id);

  try {
    const results = await db.execute(
      `SELECT f.id, f.friend_id, u.username, u.profileImage 
         FROM friendships f 
         JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = ? AND f.status = 'accepted'
         UNION
         SELECT f.id, f.user_id AS friend_id, u.username, u.profileImage  
         FROM friendships f 
         JOIN users u ON u.id = f.user_id
         WHERE f.friend_id = ? AND f.status = 'accepted'`,
      [user_id, user_id]
    );
    const friends = results.rows.length > 0 ? results.rows : [];
    res.status(200).json(friends);
  } catch (error) {
    console.error("Error fetching friends:", error);
    res.status(500).send("Error fetching friends");
  }
};

exports.searchUsers = async (req, res) => {
  const {query} = req.query; // Texto ingresado para buscar
  console.log("Search query:", query); // Depuración

  try {
    // Buscar usuarios que coincidan con el nombre o correo electrónico
    const users = await db.execute(
      `SELECT id, username, email, profileImage
         FROM users 
         WHERE username LIKE ? OR email LIKE ?`,
      [`%${query}%`, `%${query}%`]
    );

    if (users.rows.length === 0) {
      return res.status(404).json({message: "No se encontraron usuarios."});
    }

    // Retornar los usuarios encontrados
    return res.status(200).json(users.rows); // Se usa `rows` porque es el formato adecuado para Turso
  } catch (error) {
    console.error("Error searching users:", error);
    return res
      .status(500)
      .json({message: "Error al buscar usuarios", error: error.message});
  }
};

// Obtener solicitudes pendientes
exports.getPendingRequests = async (req, res) => {
  const {user_id} = req.params;
  console.log("Received user_id for pending requests:", user_id);

  try {
    const results = await db.execute(
      `SELECT f.id, f.user_id, u.username, u.profileImage 
      FROM friendships f 
      JOIN users u ON u.id = f.user_id
      WHERE f.friend_id = ? AND f.status = 'pending'`,
      [user_id]
    );
    if (results.rows.length === 0) {
      return res.status(400).send("No hay solicitudes pendientes");
    }

    const pendingRequests = results.rows;
    res.status(200).json(pendingRequests);
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    res.status(500).send("Error fetching pending requests");
  }
};
// Rechazar solicitud de amistad
exports.rejectFriendRequest = async (req, res) => {
  const {id} = req.params;
  console.log("Received friend request ID to reject:", id); // Depuración

  try {
    const results = await db.execute(
      "UPDATE friendships SET status = 'rejected' WHERE id = ? AND status = 'pending'",
      [id]
    );

    // Verificar si la consulta afectó alguna fila
    if (results.rowsAffected === 0) {
      return res
        .status(404)
        .json({message: "Friend request not found or already handled"});
    }

    res.status(200).json({message: "Friend request rejected successfully"});
  } catch (error) {
    console.error("Error rejecting friend request:", error);
    res.status(500).json({message: "Error rejecting friend request"});
  }
};

// Aceptar solicitud de amistad
exports.acceptFriendRequest = async (req, res) => {
  const {id} = req.params;
  console.log("Received friend request ID to accept:", id); // Depuración

  try {
    const result = await db.execute(
      "UPDATE friendships SET status = 'accepted' WHERE id = ? AND status = 'pending'",
      [id]
    );

    if (result.rowsAffected === 0) {
      return res
        .status(404)
        .json({message: "Friend request not found or already handled"});
    }
    res.status(200).json({message: "Friend request accepted successfully"});
  } catch (error) {
    console.error("Error accepting friend request:", error);
    res.status(500).json({message: "Error accepting friend request"});
  }
};

exports.sendFriendRequest = async (req, res) => {
  const {user_id, friend_id} = req.body;

  console.log("Received user_id:", user_id, "Received friend_id:", friend_id);

  // Validar que los IDs sean válidos
  if (!user_id || !friend_id) {
    return res
      .status(400)
      .json({message: "user_id and friend_id are required."});
  }

  if (user_id === friend_id) {
    return res
      .status(400)
      .json({message: "Cannot send a friend request to yourself."});
  }

  try {
    // Comprobar si ya existe una relación de amistad o una solicitud previa
    const existingFriendship = await db.execute(
      "SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
      [user_id, friend_id, friend_id, user_id]
    );

    console.log("Existing friendship check:", existingFriendship);

    // Si existe una relación previa, revisar el estado
    if (existingFriendship.rows.length > 0) {
      const {id, status} = existingFriendship.rows[0];

      if (status === "accepted") {
        return res
          .status(400)
          .json({message: "You are already friends with this user."});
      }

      if (status === "pending") {
        return res
          .status(400)
          .json({message: "Friend request is already pending."});
      }

      if (status === "rejected") {
        console.log("Resending friend request for rejected status...");
        // Actualizar el estado de la solicitud rechazada a pendiente
        await db.execute(
          "UPDATE friendships SET status = 'pending' WHERE id = ?",
          [id]
        );

        return res.status(200).json({message: "Friend request resent."});
      }
    }

    // Crear una nueva solicitud de amistad si no existe relación previa
    console.log("Creating new friend request...");
    await db.execute(
      "INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)",
      [user_id, friend_id]
    );

    return res.status(201).json({message: "Friend request sent successfully."});
  } catch (error) {
    console.error("Error sending friend request:", error);
    return res
      .status(500)
      .json({message: "Error sending friend request", error: error.message});
  }
};
