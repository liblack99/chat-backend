const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    console.log("No se encontró el token en la solicitud.");
    return res.status(401).send("Acceso denegado");
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("Token inválido:", err);
      return res.status(403).send("Token inválido");
    }

    if (!user?.userId) {
      console.log("Token no contiene userId");
      return res.status(400).send("Token no contiene userId");
    }

    req.userId = user.userId; // Guarda el userId en la solicitud
    next(); // Continúa con el siguiente middleware o controlador
  });
};

module.exports = verifyToken;
