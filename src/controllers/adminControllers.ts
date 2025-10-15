import pool from '../db/db';
import { Request, Response } from 'express';
import { EditProfileRequestBody } from '../types/userTypes';
import cloudinary from "../config/cloudinary";
import fs from "fs";
import { extractPublicId } from "../utils/extractCloudinaryUrl";
import { addCategoryRequestBody, addParentCategoryRequestBody, editCategoryRequestBody } from '../types/categoryTypes';
import { ResolveReportRequestBody } from '../types/reportTypes';
import { CreateTagRequestBody, LinkTagToPostRequestBody } from '../types/tagTypes';
import { createNotification } from '../utils/notificationUtils';

//Users db table related controllers
const viewAllUsers = async (req: Request, res: Response) => {
    try {
        const result = await pool.query("SELECT * FROM users");
        const users = result.rows.map(({ password_hash, ...rest }) => rest);
        res.status(200).json({ users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const searchUsers = async (req: Request, res: Response) => {
    const { query } = req.query;

    if (!query) {
        res.status(400).json({ message: "Search query is required" });
        return;
    }

    try {
        const userResult = await pool.query(`SELECT * FROM users WHERE users.username ILIKE $1`, [`%${query}%`]);
        const users = userResult.rows.map(({ password_hash, ...rest }) => rest);
        res.status(200).json({ users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const viewUserProfile = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = req.params.userId;

    try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const user = { ...result.rows[0], password_hash: undefined };
        res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const editUserProfile = async (req: Request<{ userId: string }, {}, EditProfileRequestBody>, res: Response) => {
    const userId = Number(req.params.userId);

    try {
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

        if (userResult.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const user = userResult.rows[0];

        const {
            username = user.username,
            first_name = user.first_name,
            last_name = user.last_name,
            phone = user.phone,
            gender = user.gender,
            bio = user.bio,
        } = req.body;

        const result = await pool.query(
            "UPDATE users SET username = $1, first_name = $2, last_name = $3, phone = $4, gender = $5, bio = $6 WHERE id = $7 RETURNING *",
            [username, first_name, last_name, phone, gender, bio, userId]
        );

        // Notify user
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;
        const notificationMessage = `Your profile has been edited by admin ${adminName}.`;
        await createNotification(userId, notificationMessage, 'profile_edited', userId);

        res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const uploadUserProfileImage = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = Number(req.params.userId);

    try {
        if (!req.file) {
            res.status(400).json({ message: "No file uploaded" });
            return;
        }

        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

        if (userResult.rows.length === 0) {
            fs.unlinkSync(req.file.path);

            res.status(404).json({ message: "User not found" });
            return;
        }

        const currentUser = userResult.rows[0];

        if (currentUser.profile_image) {
            const publicId = extractPublicId(currentUser.profile_image);
            if (publicId) {
                await cloudinary.uploader.destroy(publicId);
            }
        }

        const cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
            folder: "/discuss-forum/profile_images",
            use_filename: true,
            unique_filename: false
        });

        fs.unlinkSync(req.file.path);

        const updateResult = await pool.query(
            "UPDATE users SET profile_image = $1 WHERE id = $2 RETURNING *",
            [cloudinaryResult.secure_url, userId]
        );

        // Notify user
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;
        const notificationMessage = `Your profile image has been changed by admin ${adminName}.`;
        await createNotification(userId, notificationMessage, 'profile_image_changed', userId);

        res.status(200).json({
            message: "Image uploaded and user updated successfully",
            user: updateResult.rows[0]
        });
    } catch (error) {
        console.error("Upload error:", error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const deleteUserProfileImage = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = Number(req.params.userId);

    try {
        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [userId]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const imageResult = await pool.query(
            "SELECT profile_image FROM users WHERE id = $1", [userId]
        )

        if (imageResult.rows.length === 0) {
            res.status(200).json({ message: "Image not found" })
            return;
        }

        const publicId = extractPublicId(imageResult.rows[0].profile_image);
        if (publicId) {
            await cloudinary.uploader.destroy(publicId);
        }

        await pool.query("UPDATE users SET profile_image = NULL WHERE id = $1", [userId]);

        // Notify user
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;
        const notificationMessage = `Your profile image has been deleted by admin ${adminName}.`;
        await createNotification(userId, notificationMessage, 'profile_image_deleted', userId);

        res.status(200).json({ message: "Image deleted successfully" });

    } catch (error) {
        console.error("Delete image error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }

}

const deleteUserAccount = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = Number(req.params.userId);

    try {
        const userResult = await pool.query("SELECT profile_image FROM users WHERE id = $1", [userId]);

        if (userResult.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const deletedUserName = userResult.rows[0].username;

        const followersResult = await pool.query(
            "SELECT follower_id FROM user_following WHERE followed_id = $1",
            [userId]
        );
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;

        for (const follower of followersResult.rows) {
            const notificationMessage = `User ${deletedUserName} has been deleted by admin ${adminName}.`;
            await createNotification(follower.follower_id, notificationMessage, 'user_deleted', userId);
        }

        const publicId = extractPublicId(userResult.rows[0].profile_image);
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
            } catch (imageError) {
                console.error("Error deleting image from Cloudinary:", imageError);
            }
        }

        await pool.query("DELETE FROM users WHERE id = $1", [userId]);

        res.status(200).json({ message: "User account deleted successfully" });
    } catch (error) {
        console.error("Error deleting user account:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

//Posts db table related controllers
const deleteUserPost = async (req: Request<{ postId: string }, {}, {}>, res: Response) => {
    const postId = Number(req.params.postId);

    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);

        if (postResult.rowCount === 0) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        const postOwnerId = postResult.rows[0].user_id;
        const postTitle = postResult.rows[0].title;

        // Get admin username
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;

        const notificationMessage = `Your post "${postTitle}" has been deleted by admin ${adminName}.`;
        await createNotification(postOwnerId, notificationMessage, 'post_deleted', postId);

        await pool.query("DELETE FROM posts WHERE id = $1", [postId]);

        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

//Comments db table related controllers
const deleteUserComment = async (req: Request<{ commentId: string }, {}, {}>, res: Response) => {
    const commentId = Number(req.params.commentId);

    try {
        const commentResult = await pool.query("SELECT * FROM comments WHERE id = $1", [commentId]);

        if (commentResult.rowCount === 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }

        const commentOwnerId = commentResult.rows[0].user_id;
        const commentContent = commentResult.rows[0].content;

        // Get admin username
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;

        const notificationMessage = `Your comment "${commentContent}" has been deleted by admin ${adminName}.`;
        await createNotification(commentOwnerId, notificationMessage, 'comment_deleted', commentId);

        await pool.query("DELETE FROM comments WHERE id = $1", [commentId]);

        res.status(200).json({ message: "Comment deleted successfully" });
    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

//Parent Categories db table related controllers
const addParentCategory = async (req: Request<{}, {}, addParentCategoryRequestBody>, res: Response) => {
    const { name } = req.body;

    if (!name || name.length < 2) {
        res.status(400).json({ message: "Parent category name is required and must be at least 2 characters long" });
        return;
    }

    try {
        const existingCategory = await pool.query("SELECT * FROM parent_categories WHERE name ILIKE $1", [name]);
        if (existingCategory.rows.length > 0) {
            res.status(409).json({ message: "Parent category already exists" });
            return;
        }
        const result = await pool.query(
            "INSERT INTO parent_categories (name, created_at) VALUES ($1, NOW()) RETURNING *",
            [name.toUpperCase()]
        );

        res.status(201).json({ message: "Parent category added successfully", parentCategory: result.rows[0] });
    } catch (error) {
        console.error("Error adding parent category:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const editParentCategory = async (req: Request<{ parentCategoryId: string }, {}, editCategoryRequestBody>, res: Response) => {
    const parentCategoryId = req.params.parentCategoryId;
    const { name } = req.body;

    if (!name || name.length < 2) {
        res.status(400).json({ message: "Parent category name is required and must be at least 2 characters long" });
        return;
    }

    try {
        const categoryResult = await pool.query("SELECT * FROM parent_categories WHERE id = $1", [parentCategoryId]);
        if (categoryResult.rowCount === 0) {
            res.status(404).json({ message: "Parent category not found" });
            return;
        }

        const duplicateCheck = await pool.query("SELECT * FROM parent_categories WHERE name ILIKE $1 AND id != $2", [name, parentCategoryId]);
        if (duplicateCheck.rows.length > 0) {
            res.status(409).json({ message: "Another parent category with the same name already exists" });
            return;
        }

        await pool.query("UPDATE parent_categories SET name = $1 WHERE id = $2", [name.toUpperCase(), parentCategoryId]);
        res.status(200).json({
            message: `Parent category updated successfully`,
            parentCategory: { id: parentCategoryId, newName: name }
        });
    } catch (error) {
        console.error("Error updating parent category:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const deleteParentCategory = async (req: Request<{ parentCategoryId: string }, {}, {}>, res: Response) => {
    const parentCategoryId = req.params.parentCategoryId;

    try {
        const categoryResult = await pool.query("SELECT * FROM parent_categories WHERE id = $1", [parentCategoryId]);
        if (categoryResult.rowCount === 0) {
            res.status(404).json({ message: "Parent category not found" });
            return;
        }

        await pool.query("UPDATE categories SET parent_id = NULL WHERE parent_id = $1", [parentCategoryId]);
        await pool.query("DELETE FROM parent_categories WHERE id = $1", [parentCategoryId]);
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting parent category:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

//Categories db table related controllers
const addCategory = async (req: Request<{}, {}, addCategoryRequestBody>, res: Response) => {
    const { name, parent_id } = req.body;

    if (!name || name.length < 2) {
        res.status(400).json({ message: "Category name is required and must be at least 2 characters long" });
        return;
    }

    if (parent_id) {
        const parentResult = await pool.query("SELECT * FROM parent_categories WHERE id = $1", [parent_id]);
        if (parentResult.rowCount === 0) {
            return res.status(400).json({ message: "Invalid parent category ID" });
        }
    }

    try {
        const categoryResult = await pool.query("SELECT * FROM categories WHERE name ILIKE $1", [name]);
        if (categoryResult.rows.length > 0) {
            res.status(409).json({ message: "Category already exists" });
            return;
        }

        const result = await pool.query(
            "INSERT INTO categories (name, parent_id, created_at) VALUES ($1, $2, NOW()) RETURNING *",
            [name.toUpperCase(), parent_id]
        );

        res.status(201).json({ message: "Category added successfully", category: result.rows[0] });
    } catch (error) {
        console.error("Error adding category:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const editCategory = async (req: Request<{ categoryId: string }, {}, editCategoryRequestBody>, res: Response) => {
    const categoryId = req.params.categoryId;
    const { name, parent_id } = req.body;

    if (!name || name.length < 2) {
        res.status(400).json({ message: "Category name is required and must be at least 2 characters long" });
        return;
    }

    if (parent_id) {
        const parentResult = await pool.query("SELECT * FROM parent_categories WHERE id = $1", [parent_id]);
        if (parentResult.rowCount === 0) {
            return res.status(400).json({ message: "Invalid parent category ID" });
        }
    }

    try {
        const categoryResult = await pool.query("SELECT * FROM categories WHERE id = $1", [categoryId]);
        if (categoryResult.rowCount === 0) {
            res.status(404).json({ message: "Category not found" });
            return;
        }

        const duplicateCheck = await pool.query("SELECT * FROM categories WHERE name ILIKE $1 AND id != $2", [name, categoryId]);
        if (duplicateCheck.rows.length > 0) {
            res.status(409).json({ message: "Another category with the same name already exists" });
            return;
        }

        await pool.query("UPDATE categories SET name = $1, parent_id = $2 WHERE id = $3", [name.toUpperCase(), parent_id, categoryId]);
        res.status(200).json({
            message: `Category updated successfully`,
            category: { id: categoryId, newName: name, newParentId: parent_id }
        });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const deleteCategory = async (req: Request<{ categoryId: string }, {}, {}>, res: Response) => {
    const categoryId = req.params.categoryId;

    try {
        const categoryResult = await pool.query("SELECT * FROM categories WHERE id = $1", [categoryId]);
        if (categoryResult.rowCount === 0) {
            res.status(404).json({ message: "Category not found" });
            return;
        }

        const subcategories = await pool.query("SELECT * FROM categories WHERE parent_id = $1", [categoryId]);
        if (subcategories.rows.length > 0) {
            return res.status(400).json({ message: "Cannot delete category with subcategories" });
        }

        await pool.query("DELETE FROM categories WHERE id = $1", [categoryId]);
        res.status(204).send();
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

//user_following db table related controllers
const viewUserFollowers = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = req.params.userId;

    try {
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userResult.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const followersResult = await pool.query(
            `SELECT users.id, users.username, users.first_name, users.last_name, users.profile_image
             FROM users
             JOIN user_following ON users.id = user_following.follower_id
             WHERE user_following.followed_id = $1`,
            [userId]
        );
        res.status(200).json({ userFollowersCount: followersResult.rows.length, userFollowerList: followersResult.rows });
    } catch (error) {
        console.error("Error fetching followers:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const viewUserFollowing = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = req.params.userId;

    try {
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userResult.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const followingResult = await pool.query(
            `SELECT users.id, users.username, users.first_name, users.last_name, users.profile_image
             FROM users
             JOIN user_following ON users.id = user_following.followed_id
             WHERE user_following.follower_id = $1`,
            [userId]
        );
        res.status(200).json({ userFollowingCount: followingResult.rows.length, userFollowingList: followingResult.rows });
    } catch (error) {
        console.error("Error fetching following users:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const removeUserFollower = async (req: Request<{ userId: string, followerId: string }, {}, {}>, res: Response) => {
    const { userId, followerId } = req.params;

    if (userId === followerId) {
        res.status(400).json({ message: "You cannot remove yourself" });
        return;
    }

    try {
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userResult.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const followerResult = await pool.query("SELECT * FROM users WHERE id = $1", [followerId]);
        if (followerResult.rowCount === 0) {
            res.status(404).json({ message: "Follower not found" });
            return;
        }

        const followCheck = await pool.query(
            "SELECT * FROM user_following WHERE follower_id = $1 AND followed_id = $2",
            [followerId, userId]
        );
        if (followCheck.rowCount === 0) {
            res.status(400).json({ message: `User with ${followerId} is not following the user with ${userId}` });
            return;
        }

        await pool.query("DELETE FROM user_following WHERE follower_id = $1 AND followed_id = $2", [followerId, userId]);
        res.status(200).json({ message: "Follower removed successfully" });
    } catch (error) {
        console.error("Error removing follower:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

//report db table related controllers
const viewAllReports = async (req: Request, res: Response) => {
    try {
        const reportsResult = await pool.query("SELECT * FROM reports ORDER BY created_at DESC");

        res.status(200).json({
            message: "Reports retrieved successfully.",
            reports: reportsResult.rows,
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const resolveReport = async (req: Request<{ reportId: string }, {}, ResolveReportRequestBody>, res: Response) => {
    const reportId = Number(req.params.reportId);
    const { status } = req.body;

    try {
        const result = await pool.query("UPDATE reports SET status = $1 WHERE id = $2 RETURNING *", [status, reportId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Report not found." });
        }

        // Get the report owner
        const reportOwnerId = result.rows[0].user_id;

        // Get admin username
        const adminId = req.user!.id;
        const adminResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [adminId]
        );
        const adminName = adminResult.rows[0].username;

        const notificationMessage = `Your report #${reportId} has been resolved by admin ${adminName}.`;
        await createNotification(reportOwnerId, notificationMessage, 'report_resolved', reportId);

        res.status(200).json({
            message: "Report resolved successfully.",
            report: result.rows[0],
        });
    } catch (error) {
        console.error("Error resolving report:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

//user_blocked db table related controllers
const viewAllBlockedUsers = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT user_blocked.blocker_id, user_blocked.blocked_id, 
                users1.username AS blocker_username, 
                users2.username AS blocked_username
            FROM user_blocked 
            JOIN users AS users1 ON user_blocked.blocker_id = users1.id
            JOIN users AS users2 ON user_blocked.blocked_id = users2.id
        `);

        const blockedUsersWithMessages = result.rows.map(row => ({
            blocker_id: row.blocker_id,
            blocked_id: row.blocked_id,
            blocker_username: row.blocker_username,
            blocked_username: row.blocked_username,
            relations: `${row.blocker_username} blocked ${row.blocked_username}`
        }));

        res.status(200).json({
            message: "Blocked users list fetched successfully",
            blockedUsers: blockedUsersWithMessages
        });
    } catch (error) {
        console.error("Error fetching blocked users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

const helpBlockUser = async (req: Request, res: Response) => {
    const { blockerId, blockedId, block_reason } = req.body;

    try {
        const existingBlock = await pool.query(
            "SELECT * FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
            [blockerId, blockedId]
        );

        if (existingBlock.rows.length > 0) {
            res.status(400).json({ message: "Block relationship already exists." });
            return;
        }

        await pool.query(
            "INSERT INTO user_blocked (blocker_id, blocked_id, block_reason) VALUES ($1, $2, $3)",
            [blockerId, blockedId, block_reason]
        );

        res.status(200).json({ message: "User blocked successfully." });
    } catch (error) {
        console.error("Error blocking user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const helpUnblockUser = async (req: Request, res: Response) => {
    const { blockerId, blockedId } = req.body;

    try {
        const result = await pool.query(
            "DELETE FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
            [blockerId, blockedId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ message: "No blocked relationship found." });
            return;
        }

        res.status(200).json({ message: "User unblocked successfully." });
    } catch (error) {
        console.error("Error unblocking user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

//browsing_histroy db table related controllers
const viewAllUsersBrowsingHistory = async (req: Request, res: Response) => {
    try {
        const result = await pool.query("SELECT * FROM browsing_history ORDER BY visited_at DESC");
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching browsing history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

const viewUserBrowsingHistory = async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    try {
        const result = await pool.query("SELECT * FROM browsing_history WHERE user_id = $1", [userId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching user browsing history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const deleteBrowsingHistory = async (req: Request, res: Response) => {
    const historyId = req.params.historyId;
    try {
        await pool.query("DELETE FROM browsing_history WHERE id = $1", [historyId]);
        res.status(200).json({ message: "Browsing entry deleted successfully." });
    } catch (error) {
        console.error("Error deleting browsing entry:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

const deleteUserBrowsingHistories = async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const { postIds } = req.body;

    if (!Array.isArray(postIds) || postIds.length === 0) {
        res.status(400).json({ message: "Invalid post IDs" });
        return;
    }

    try {
        const result = await pool.query(
            "DELETE FROM browsing_history WHERE user_id = $1 AND post_id = ANY($2::int[])",
            [userId, postIds]
        );

        res.status(200).json({ message: `Browsing history deleted for user ID ${userId}`, deletedCount: result.rowCount });
    } catch (error) {
        console.error("Error deleting browsing history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getBrowsingAnalytics = async (req: Request, res: Response) => {
    try {
        const mostVisitedPosts = await pool.query(`
            SELECT post_id, COUNT(*) AS visit_count, COUNT(DISTINCT user_id) AS unique_users
            FROM browsing_history
            GROUP BY post_id
            ORDER BY visit_count DESC
        `);

        const dailyVisits = await pool.query(`
            SELECT post_id, DATE(visited_at) AS visit_date, COUNT(*) AS visits
            FROM browsing_history
            GROUP BY post_id, visit_date
            ORDER BY visit_date DESC, visits DESC
        `);

        const userVisitPatterns = await pool.query(`
            SELECT user_id, COUNT(DISTINCT post_id) AS posts_visited
            FROM browsing_history
            GROUP BY user_id
            ORDER BY posts_visited DESC
        `);

        res.status(200).json({
            most_visited_posts: mostVisitedPosts.rows,
            daily_visits: dailyVisits.rows,
            user_visit_patterns: userVisitPatterns.rows,
        });
    } catch (error) {
        console.error("Error fetching detailed analytics:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getBrowsingHistorySummary = async (req: Request, res: Response) => {
    try {
        const totalVisitsResult = await pool.query("SELECT COUNT(*) AS total_visits FROM browsing_history");
        const uniqueUsersResult = await pool.query("SELECT COUNT(DISTINCT user_id) AS unique_users FROM browsing_history");

        const totalVisits = totalVisitsResult.rows[0].total_visits;
        const uniqueUsers = uniqueUsersResult.rows[0].unique_users;

        const averageVisitsPerPostResult = await pool.query(`
            SELECT AVG(visit_count) AS average_visits_per_post
            FROM (
                SELECT post_id, COUNT(*) AS visit_count
                FROM browsing_history
                GROUP BY post_id
            ) AS post_visits
        `);
        const averageVisitsPerPost = averageVisitsPerPostResult.rows[0].average_visits_per_post || 0;

        res.status(200).json({
            total_visits: totalVisits,
            unique_users: uniqueUsers,
            average_visits_per_post: averageVisitsPerPost,
        });
    } catch (error) {
        console.error("Error fetching browsing history summary:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

//bookmark db table related controllers
const viewAllBookmarks = async (req: Request, res: Response) => {
    try {
        const bookmarks = await pool.query(`
            SELECT 
                b.id AS bookmark_id,
                b.user_id,
                u.username AS user_name,
                p.id AS post_id,
                p.title AS post_title,
                COALESCE(SUM(CASE WHEN pv.vote_type = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
                COALESCE(SUM(CASE WHEN pv.vote_type = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
                c.name AS category_name,
                p.created_at AS post_created_at
            FROM 
                bookmarks b
            JOIN 
                posts p ON b.post_id = p.id
            JOIN 
                users u ON b.user_id = u.id
            LEFT JOIN 
                post_votes pv ON p.id = pv.post_id
            LEFT JOIN 
                categories c ON p.category_id = c.id
            GROUP BY 
                b.id, u.username, p.id, c.name
            ORDER BY 
                b.created_at DESC
        `);

        res.status(200).json(bookmarks.rows);
    } catch (error) {
        console.error("Error fetching all bookmarks:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const viewBookmarkStatistics = async (req: Request, res: Response) => {
    try {
        const totalBookmarks = await pool.query("SELECT COUNT(*) FROM bookmarks");
        const bookmarksPerUser = await pool.query(`
            SELECT user_id, COUNT(*) AS total FROM bookmarks GROUP BY user_id
        `);

        res.status(200).json({
            totalBookmarks: totalBookmarks.rows[0].count,
            bookmarksPerUser: bookmarksPerUser.rows,
        });
    } catch (error) {
        console.error("Error fetching bookmark statistics:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

const deleteUserBookmarkById = async (req: Request<{ bookmarkId: string }, {}, {}>, res: Response) => {
    const bookmarkId = Number(req.params.bookmarkId);

    if (!bookmarkId) {
        return res.status(400).json({ message: "Bookmark ID is required." });
    }

    try {
        const result = await pool.query(
            "DELETE FROM bookmarks WHERE id = $1",
            [bookmarkId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ message: "Bookmark not found." });
            return;
        }

        res.status(200).json({ message: `Bookmark ${bookmarkId} removed successfully.` });
    } catch (error) {
        console.error("Error removing bookmark:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

//tag and post_tags db table related controllers
const createTag = async (req: Request<{}, {}, CreateTagRequestBody>, res: Response) => {
    const userId = req.user!.id;
    const { name } = req.body;

    if (!name) {
        res.status(400).json({ message: "Tag name is required." });
        return;
    }

    try {
        const tagResult = await pool.query(
            "SELECT * FROM tags WHERE name ILIKE $1",
            [name]
        )

        if (tagResult.rows.length > 0) {
            res.status(409).json({ message: "Similar tags already exists" });
            return;
        }

        const result = await pool.query(
            "INSERT INTO tags (name, approved, user_id) VALUES ($1, TRUE, $2) RETURNING *",
            [name, userId]
        );

        res.status(201).json({
            message: "Tag created successfully.",
            tag: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating tag:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const linkTagToPost = async (req: Request<{}, {}, LinkTagToPostRequestBody>, res: Response) => {
    const { postId, tagId } = req.body;

    if (!postId || !tagId) {
        return res.status(400).json({ message: "Post ID and Tag ID are required." });
    }

    try {
        const tagResult = await pool.query(
            "SELECT * FROM tags WHERE id = $1 AND approved = TRUE",
            [tagId]
        );

        if (tagResult.rowCount === 0) {
            res.status(404).json({ message: "Tag not found or not approved." });
            return;
        }

        await pool.query(
            "INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)",
            [postId, tagId]
        );

        res.status(200).json({ message: "Tag linked to post successfully." });
    } catch (error) {
        console.error("Error linking tag to post:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const approveTag = async (req: Request<{ tagId: string }, {}, {}>, res: Response) => {
    const tagId = Number(req.params.tagId);

    if (!tagId) {
        res.status(400).json({ message: "Tag ID is required." });
        return;
    }

    try {
        // Approve the tag
        const tagResult = await pool.query("UPDATE tags SET approved = TRUE WHERE id = $1 RETURNING *", [tagId]);
        if (tagResult.rowCount === 0) {
            res.status(404).json({ message: "Tag not found." });
            return;
        }
        const tagName = tagResult.rows[0].name;
        const tagCreatorId = tagResult.rows[0].user_id;

        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;
        const notificationMessage = `Your tag "${tagName}" has been approved by admin ${adminName}. Everyone can use the tag you created while posting now!`;
        await createNotification(tagCreatorId, notificationMessage, 'tag_approved', tagId);

        // Link tag to posts
        const postResult = await pool.query(
            "SELECT id FROM posts WHERE pending_tag_name = $1",
            [tagName]
        );

        for (const post of postResult.rows) {
            await pool.query(
                "INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                [post.id, tagId]
            );
        }

        await pool.query(
            "UPDATE posts SET pending_tag_name = NULL WHERE pending_tag_name = $1",
            [tagName]
        );

        res.status(200).json({ message: "Tag approved and linked to posts successfully." });
    } catch (error) {
        console.error("Error approving tag:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const deleteTag = async (req: Request, res: Response) => {
    const tagId = Number(req.params.tagId);

    if (!tagId) {
        res.status(400).json({ message: "Tag ID is required." });
        return;
    }

    try {
        const tagResult = await pool.query("SELECT name, user_id FROM tags WHERE id = $1", [tagId]);
        if (tagResult.rowCount === 0) {
            res.status(404).json({ message: "Tag not found." });
            return;
        }
        const tagName = tagResult.rows[0].name;
        const tagCreatorId = tagResult.rows[0].user_id;

        await pool.query("DELETE FROM tags WHERE id = $1", [tagId]);

        // Notify tag creator
        const adminId = req.user!.id;
        const adminResult = await pool.query("SELECT username FROM users WHERE id = $1", [adminId]);
        const adminName = adminResult.rows[0].username;
        const notificationMessage = `Your tag "${tagName}" has been deleted by admin ${adminName}.`;
        await createNotification(tagCreatorId, notificationMessage, 'tag_deleted', tagId);

        res.status(200).json({ message: `Tag ${tagId} removed successfully.` });
    } catch (error) {
        console.error("Error removing tag:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

export {
    viewAllUsers, searchUsers, viewUserProfile, editUserProfile, uploadUserProfileImage, deleteUserProfileImage, deleteUserAccount,
    deleteUserPost,
    deleteUserComment,
    addParentCategory, editParentCategory, deleteParentCategory,
    addCategory, editCategory, deleteCategory,
    viewUserFollowers, viewUserFollowing, removeUserFollower,
    viewAllReports, resolveReport,
    viewAllBlockedUsers, helpBlockUser, helpUnblockUser,
    viewAllUsersBrowsingHistory, viewUserBrowsingHistory, deleteUserBrowsingHistories, deleteBrowsingHistory, getBrowsingAnalytics, getBrowsingHistorySummary,
    viewAllBookmarks, viewBookmarkStatistics, deleteUserBookmarkById,
    createTag, approveTag, linkTagToPost, deleteTag
};