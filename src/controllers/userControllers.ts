import pool from '../db/db';
import bcrypt from "bcrypt";
import fs from "fs";
import { Request, Response } from 'express';
import { EditPasswordRequestBody, EditProfileRequestBody } from '../types/userTypes';
import cloudinary from '../config/cloudinary';
import { extractPublicId } from '../utils/extractCloudinaryUrl';

// View User Public Profile
const viewUserProfile = async (req: Request, res: Response) => {
    const userId = req.params.id;

    try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        const users = result.rows.map(({ password_hash, ...rest }) => rest);
        res.status(200).json({ users });

    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

// View Own Profile (Registered Users)
const viewProfile = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

        if (result.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const { password_hash, ...safeUser } = result.rows[0];
        res.status(200).json({ user: safeUser });
    } catch (error) {
        console.error("Error in getUserProfile:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Edit Own Profile (Registered Users)
const editProfile = async (req: Request<{}, {}, EditProfileRequestBody>, res: Response) => {
    const userId = req.user!.id;

    try {
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userResult.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
        }
        const user = userResult.rows[0];

        const {
            username = user.username,
            email = user.email,
            first_name = user.first_name,
            last_name = user.last_name,
            phone = user.phone,
            gender = user.gender,
            bio = user.bio
        } = req.body;

        const editResult = await pool.query(
            "UPDATE users SET username = $1, email = $2, first_name = $3, last_name = $4, phone = $5, gender = $6, bio = $7 WHERE id = $8 RETURNING *",
            [username, email, first_name, last_name, phone, gender, bio, userId]
        );

        res.status(200).json({ user: editResult.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

// Edit Own Password (Registered Users)
const editPassword = async (req: Request<{}, {}, EditPasswordRequestBody>, res: Response) => {
    try {
        const userId = req.user!.id;
        const { oldPassword, newPassword } = req.body;

        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userResult.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const user = userResult.rows[0];

        const isPasswordMatch = await bcrypt.compare(oldPassword, user.password_hash);
        if (!isPasswordMatch) {
            res.status(400).json({ message: "Old password is incorrect" });
            return;
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [hashedPassword, userId]
        );

        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Upload Profile Image (Registered Users)
const uploadProfileImage = async (req: Request, res: Response) => {
    const userId = req.user!.id;

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

// Delete Profile Image (Registered Users)
const deleteProfileImage = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    try {
        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [userId]
        );

        if (userResult.rows.length === 0) {
            res.status(403).json({ message: "Unauthorized to delete image for this user" });
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

// Delete Own Account (Registered Users)
const deleteAccount = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING *", [userId]);

        if (result.rowCount === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        res.status(200).json({ message: "User account deleted successfully" });
    } catch (error) {
        console.error("Error deleting user account:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export { viewUserProfile, viewProfile, editProfile, editPassword, uploadProfileImage, deleteProfileImage, deleteAccount };