import pool from '../db/db';
import { Request, Response } from 'express';
import { EditProfileRequestBody } from '../types/userTypes';
import cloudinary from "../config/cloudinary";
import fs from "fs";
import { extractPublicId } from "../utils/extractCloudinaryUrl";

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

export { viewAllUsers, searchUsers, viewUserProfile, editUserProfile, uploadUserProfileImage, deleteUserProfileImage, deleteUserAccount, deleteUserPost }