// routes/chat.js
const express = require("express");
const chatController = require("../controllers/chatController");
const verifyToken = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/last-message", verifyToken, chatController.getLastMessage);
router.get("/conversation", verifyToken, chatController.getConversation);
router.put(
  "/mark-delivered",
  verifyToken,
  chatController.markMessagesAsDelivered
);

module.exports = router;
