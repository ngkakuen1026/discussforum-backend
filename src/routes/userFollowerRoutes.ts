import express from 'express';
import { followUser, viewOwnFollowers, unfollowUser } from '../controllers/userFollowerControllers';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

router.get("/followers/me", isAuthenticated, viewOwnFollowers);
router.post("/follow", isAuthenticated, followUser);
router.delete("unfollow", isAuthenticated, unfollowUser);

export default router;