import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { isAdmin } from '../middleware/isAdmin';
import upload from '../middleware/multer';
import { addCategory, addParentCategory, approveTag, createTag, deleteBrowsingHistory, deleteCategory, deleteParentCategory, deleteTag, deleteUserAccount, deleteUserBookmarkById, deleteUserBrowsingHistories, deleteUserComment, deleteUserPost, deleteUserProfileImage, editCategory, editParentCategory, editUserProfile, getBrowsingAnalytics, getBrowsingHistorySummary, helpBlockUser, helpUnblockUser, removeUserFollower, resolveReport, searchUsers, uploadUserProfileImage, viewAllBlockedUsers, viewAllBookmarks, viewAllPendingTags, viewAllReports, viewAllUsers, viewAllUsersBrowsingHistory, viewBookmarkStatistics, viewUserBrowsingHistory, viewUserFollowers, viewUserFollowing, viewUserProfile } from '../controllers/adminControllers';
import { searchPosts, viewAllPosts, viewPost } from '../controllers/postControllers';
import { viewComments } from '../controllers/commentControllers';

const router = express.Router();

// User Routes (Admin access only)
router.get("/users/all-users", isAuthenticated, isAdmin, viewAllUsers);
router.get("/users/search-users", isAuthenticated, isAdmin, searchUsers);
router.get("/users/user/profile/:userId", isAuthenticated, isAdmin, viewUserProfile);
router.patch("/users/user/profile/:userId", isAuthenticated, isAdmin, editUserProfile);
router.post("/users/user/profile/:userId/profile-image", isAuthenticated, isAdmin, upload.single("profile_image"), uploadUserProfileImage);
router.delete("/users/user/profile/:userId/profile-image", isAuthenticated, isAdmin, deleteUserProfileImage);
router.delete("/users/user/profile/:userId", isAuthenticated, isAdmin, deleteUserAccount);

// Post Routes (Admin access only)
router.get("/posts/all-posts", isAuthenticated, isAdmin, viewAllPosts);
router.get("/posts/post/:postId", isAuthenticated, isAdmin, viewPost);
router.get("/posts/search-posts", isAuthenticated, isAdmin, searchPosts);
router.delete("/posts/post/:postId", isAuthenticated, isAdmin, deleteUserPost);

// Comment Routes (Admin access only)
router.get("/comments/:postId/all-comments", isAuthenticated, isAdmin, viewComments);
router.delete("/comments/comment/:commentId", isAuthenticated, isAdmin, deleteUserComment);

// Parent Category Routes (Admin access only)
router.post("/parent-categories/parent-category", isAuthenticated, isAdmin, addParentCategory);
router.patch("/parent-categories/parent-category/:parentCategoryId", isAuthenticated, isAdmin, editParentCategory);
router.delete("/parent-categories/parent-category/:parentCategoryId", isAuthenticated, isAdmin, deleteParentCategory);

// Category Routes (Admin access only)
router.post("/categories/category", isAuthenticated, isAdmin, addCategory);
router.patch("/categories/category/:categoryId", isAuthenticated, isAdmin, editCategory);
router.delete("/categories/category/:categoryId", isAuthenticated, isAdmin, deleteCategory);

// User Following Routes (Admin access only)
router.get("/user-following/followers/:userId", isAuthenticated, isAdmin, viewUserFollowers);
router.get("/user-following/following/:userId", isAuthenticated, isAdmin, viewUserFollowing);
router.delete("/user-following/:userId/remove/:followerId", isAuthenticated, isAdmin, removeUserFollower);

// Report Routes (Admin access only)
router.get("/reports/all-reports", isAuthenticated, isAdmin, viewAllReports);
router.patch("/reports/report/:reportId", isAuthenticated, isAdmin, resolveReport);

// User Blocked Routes (Admin access only)
router.get("/user-blocked/all-blocked-relationships", isAuthenticated, isAdmin, viewAllBlockedUsers);
router.post("/user-blocked/help-blocking", isAuthenticated, isAdmin, helpBlockUser);
router.delete("/user-blocked/help-unblocking", isAuthenticated, isAdmin, helpUnblockUser);

// Browsing History Routes (Admin access only)
router.get("/browsing-history/all-users-browsing-history", isAuthenticated, isAdmin, viewAllUsersBrowsingHistory);
router.get("/browsing-history/user-browsing-history/:userId", isAuthenticated, isAdmin, viewUserBrowsingHistory);
router.get("/browsing-history/analytics", isAuthenticated, isAdmin, getBrowsingAnalytics);
router.get("/browsing-history/summary", isAuthenticated, isAdmin, getBrowsingHistorySummary);
router.delete("/browsing-history/user-browsing-history/:userId", isAuthenticated, isAdmin, deleteUserBrowsingHistories);
router.delete("/browsing-history/:historyId", isAuthenticated, isAdmin, deleteBrowsingHistory);

// Bookmark Routes (Admin access only)
router.get("/bookmarks/all-users-bookmarks", isAuthenticated, isAdmin, viewAllBookmarks);
router.get("/bookmarks/statistics", isAuthenticated, isAdmin, viewBookmarkStatistics);
router.delete("/bookmarks/bookmark/:bookmarkId", isAuthenticated, isAdmin, deleteUserBookmarkById);

// Tag and Post Tags Routes (Admin access only)
router.get("/tags/all-pending-tags", isAuthenticated, isAdmin, viewAllPendingTags);
router.post("/tags/new-tag", isAuthenticated, isAdmin, createTag);
router.patch("/tags/tag/:tagId", isAuthenticated, isAdmin, approveTag);
router.delete("/tags/tag/:tagId", isAuthenticated, isAdmin, deleteTag);

export default router;