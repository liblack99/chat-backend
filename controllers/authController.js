// controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/database");

// Registrar un nuevo usuario
exports.register = async (req, res) => {
  const {fullName, email, password, profileImage} = req.body;

  // Depurar valores de entrada

  // Verificar si password es un string

  try {
    // Validar si el usuario o correo ya existen

    const existingUser = await db.execute(
      "SELECT * FROM users WHERE username = ? OR email = ?",
      [fullName, email]
    );

    if (existingUser.rows.length > 0) {
      console.warn("Usuario o correo ya registrados");
      return res
        .status(400)
        .send("El usuario o el correo ya están registrados");
    }

    // Cifrar la contraseña

    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insertar el nuevo usuario

    const result = await db.execute(
      "INSERT INTO users (username, email, password, profileImage) VALUES (?, ?, ?, ?)",
      [fullName, email, hashedPassword, profileImage]
    );

    res.status(201).send("Usuario registrado exitosamente");
  } catch (error) {
    console.error("Error al registrar el usuario:", error);
    res.status(500).send("Error al registrar el usuario");
  }
};

// Iniciar sesión y generar JWT
exports.login = async (req, res) => {
  const {email, password} = req.body;

  try {
    // Buscar al usuario por email
    const result = await db.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(400).send("Usuario no encontrado");
    }

    const user = result.rows[0];

    // Verificar la contraseña
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).send("Contraseña incorrecta");
    }

    // Generar el token JWT
    const token = jwt.sign({userId: user.id}, process.env.JWT_SECRET);

    // Excluir la contraseña antes de devolver los datos del usuario
    const {password: _, ...userWithoutPassword} = user;

    // Responder con el token y los datos del usuario
    res.json({token, user: userWithoutPassword});
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    res.status(500).send("Error al iniciar sesión");
  }
};

exports.getUserData = async (req, res) => {
  const userId = req.userId; // Obtén el userId desde el middleware

  // Verificar si el userId está presente
  if (!userId) {
    return res.status(400).json({message: "User ID no proporcionado"});
  }

  try {
    // Consultar los datos del usuario en la base de datos
    const result = await db.execute(
      "SELECT id, email, username, profileImage FROM users WHERE id = ?",
      [userId]
    );

    // Verificar si no se encontró el usuario
    if (result.rows.length === 0) {
      return res.status(404).json({message: "Usuario no encontrado"});
    }

    // Retornar los datos del usuario
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error al obtener los datos del usuario:", error);
    res.status(500).json({
      message: "Error al obtener los datos del usuario",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  const userId = req.userId; // Obtén el userId desde el middleware
  const {fullName, email, profileImage, currentPassword, newPassword} =
    req.body;

  try {
    // Validar si el usuario existe
    const userResult = await db.execute("SELECT * FROM users WHERE id = ?", [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({message: "Usuario no encontrado"});
    }

    const user = userResult.rows[0];

    // Actualizar la contraseña si se proporciona
    let updatedPassword = user.password; // Mantener la contraseña actual por defecto
    if (newPassword) {
      // Verificar la contraseña actual
      if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(400).json({message: "Contraseña actual incorrecta"});
      }

      // Cifrar la nueva contraseña
      updatedPassword = bcrypt.hashSync(newPassword, 10);
    }

    // Actualizar los demás campos
    await db.execute(
      `UPDATE users 
       SET username = ?, email = ?, profileImage = ?, password = ? 
       WHERE id = ?`,
      [
        fullName || user.username,
        email || user.email,
        profileImage || user.profileImage,
        updatedPassword,
        userId,
      ]
    );
    const updatedUserResult = await db.execute(
      "SELECT id, username, email, profileImage FROM users WHERE id = ?",
      [userId]
    );
    const updatedUser = updatedUserResult.rows[0];

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error al actualizar los datos del usuario:", error);
    res.status(500).json({
      message: "Error al actualizar los datos del usuario",
      error: error.message,
    });
  }
};
