import pool from '../db/db';
import { Request, Response } from 'express';
import { EditProfileRequestBody } from '../types/userTypes';
import cloudinary from "../config/cloudinary";
import fs from "fs";
import { extractPublicId } from "../utils/extractCloudinaryUrl";
import { addCategoryRequestBody, addParentCategoryRequestBody, editCategoryRequestBody } from '../types/categoryTypes';

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
    const userId = req.params.userId;

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

        res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const uploadUserProfileImage = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = req.params.userId;

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
    const userId = req.params.userId;

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

        res.status(200).json({ message: "Image deleted successfully" });

    } catch (error) {
        console.error("Delete image error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }

}

const deleteUserAccount = async (req: Request<{ userId: string }, {}, {}>, res: Response) => {
    const userId = req.params.userId;

    try {
        const userResult = await pool.query("SELECT profile_image FROM users WHERE id = $1", [userId]);

        if (userResult.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
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
    const postId = req.params.postId;

    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);

        if (postResult.rowCount === 0) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        await pool.query("DELETE FROM posts WHERE id = $1", [postId]);

        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

//Comments db table related controllers
const deleteUserComment = async (req: Request<{ commentId: string }, {}, {}>, res: Response) => {
    const commentId = req.params.commentId;

    try {
        const commentResult = await pool.query("SELECT * FROM comments WHERE id = $1", [commentId]);

        if (commentResult.rowCount === 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }

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

        await pool.query("DELETE FROM user_following WHERE follower_id = $1 AND followed_id = $2", [followerId, userId]);
        res.status(200).json({ message: "Follower removed successfully" });
    } catch (error) {
        console.error("Error removing follower:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export { viewAllUsers, searchUsers, viewUserProfile, editUserProfile, uploadUserProfileImage, deleteUserProfileImage, deleteUserAccount, deleteUserPost, deleteUserComment, addParentCategory, editParentCategory, deleteParentCategory, addCategory, editCategory, deleteCategory, viewUserFollowers, viewUserFollowing, removeUserFollower };