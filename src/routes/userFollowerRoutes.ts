import express from 'express';
import { followUser, viewOwnFollowers, unfollowUser, viewOwnFollowing, viewPublicUserFollowers, viewPublicUserFollowing, removeFollower } from '../controllers/userFollowerControllers';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

router.get("/followers/me", isAuthenticated, viewOwnFollowers);
router.get("/following/me", isAuthenticated, viewOwnFollowing);
router.get("/followers/:userId", viewPublicUserFollowers);
router.get("/following/:userId", viewPublicUserFollowing);
router.post("/follow", isAuthenticated, followUser);
router.delete("/unfollow", isAuthenticated, unfollowUser);
router.delete("/remove-follower", isAuthenticated, removeFollower);

export default router;