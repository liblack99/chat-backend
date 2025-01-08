// routes/friends.js
const express = require("express");
const {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  getPendingRequests,
  searchUsers,
} = require("../controllers/friendsController");

const router = express.Router();

router.post("/send", sendFriendRequest);
router.put("/accept/:id", acceptFriendRequest);
router.put("/reject/:id", rejectFriendRequest);
router.get("/list/:user_id", getFriends);
router.get("/pending/:user_id", getPendingRequests);
router.get("/search", searchUsers);

module.exports = router;
