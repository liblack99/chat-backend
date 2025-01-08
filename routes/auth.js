// routes/auth.js
const express = require("express");
const authController = require("../controllers/authController");
const verifyToken = require("../middlewares/authMiddleware");
const router = express.Router();

// Rutas de autenticación
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/user", verifyToken, authController.getUserData);

module.exports = router;
