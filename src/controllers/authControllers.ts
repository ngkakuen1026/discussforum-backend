import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import fs from "fs";
import pool from '../db/db';
import { Request, Response } from 'express';
import { LoginRequestBody, RegisterRequestBody } from '../types/authTypes';
import cloudinary from '../config/cloudinary';

const saltRounds = 10;
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;

const generateAccessToken = (userPayload: object) => {
    if (!accessTokenSecret) {
        throw new Error("ACCESS_TOKEN_SECRET is not defined");
    }
    return jwt.sign(userPayload, accessTokenSecret, { expiresIn: "15m" });
};

const generateRefreshToken = (userPayload: object) => {
    if (!refreshTokenSecret) {
        throw new Error("REFRESH_TOKEN_SECRET is not defined");
    }
    return jwt.sign(userPayload, refreshTokenSecret, { expiresIn: "7d" });
};

const tempUploads = new Map<string, { url: string; public_id: string; expiresAt: number }>();

setInterval(() => {
    const now = Date.now();
    for (const [id, data] of tempUploads.entries()) {
        if (now > data.expiresAt) {
            cloudinary.uploader.destroy(data.public_id, (error) => {
                if (error) console.error("Failed to delete temp image:", error);
            });
            tempUploads.delete(id);
        }
    }
}, 5 * 60 * 1000);

const tempUploadImage = async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "discuss-forum/temp_uploads",
            use_filename: true,
            unique_filename: false,
        });

        fs.unlinkSync(req.file.path);

        const tempId = crypto.randomUUID();
        const expiresAt = Date.now() + 15 * 60 * 1000;

        tempUploads.set(tempId, {
            url: result.secure_url,
            public_id: result.public_id,
            expiresAt,
        });

        res.json({
            tempId,
            url: result.secure_url,
            expiresIn: 15 * 60,
        });
    } catch (err) {
        console.error("Temp upload failed:", err);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: "Upload failed" });
    }
};

const cleanupTempImage = async (req: Request, res: Response) => {
    const { tempId } = req.body;
    if (!tempId) return res.status(400).json({ message: "tempId required" });

    const data = tempUploads.get(tempId);
    if (data) {
        await cloudinary.uploader.destroy(data.public_id);
        tempUploads.delete(tempId);
    }

    res.json({ success: true });
};

const registerUser = async (req: Request<{}, {}, RegisterRequestBody & { temp_image_id?: string }>, res: Response) => {
    const {
        username,
        email,
        password,
        first_name,
        last_name,
        phone,
        gender,
        bio,
        temp_image_id,
    } = req.body;

    let finalImageUrl: string | null = null;

    try {
        const checkUsername = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
        const checkEmail = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);

        if (checkUsername.rows.length > 0) return res.status(400).json({ message: 'Username already exists' });
        if (checkEmail.rows.length > 0) return res.status(400).json({ message: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        if (temp_image_id) {
            const temp = tempUploads.get(temp_image_id);
            if (!temp) {
                return res.status(400).json({ message: "Invalid or expired image" });
            }

            const newPublicId = `discuss-forum/profile_images/user_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
            await cloudinary.uploader.rename(temp.public_id, newPublicId);

            finalImageUrl = `https://res.cloudinary.com/${cloudinary.config().cloud_name}/image/upload/${newPublicId}`;

            tempUploads.delete(temp_image_id);
        }
        const newUser = await pool.query(
            `INSERT INTO users 
            (username, email, password_hash, first_name, last_name, phone, gender, bio, profile_image, is_admin)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, username, email, first_name, last_name, phone, gender, bio, profile_image, registration_date`,
            [
                username,
                email,
                hashedPassword,
                first_name ?? null,
                last_name ?? null,
                phone ?? null,
                gender ?? null,
                bio ?? null,
                finalImageUrl,
                false,
            ]
        );

        const user = newUser.rows[0];

        res.status(201).json({
            message: 'User registered successfully',
            user,
        });

        console.log(`User ${username} registered with ID ${user.id}`);
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const checkUsername = async (req: Request, res: Response) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ message: "Username required" });

        const result = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            return res.status(409).json({ message: "Username taken" });
        }
        res.status(200).json({ message: "Available" });
    } catch (err) {
        console.error("Username check error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const checkEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email required" });

        const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            return res.status(409).json({ message: "Email taken" });
        }
        res.status(200).json({ message: "Available" });
    } catch (err) {
        console.error("Email check error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

const loginUser = async (req: Request<{}, {}, LoginRequestBody>, res: Response) => {
    const { email, password } = req.body;

    try {
        const checkUserEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (checkUserEmail.rows.length === 0) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const user = checkUserEmail.rows[0];
        const correctPassword = await bcrypt.compare(password, user.password_hash);

        if (!correctPassword) {
            res.status(401).json({ message: "Incorrect password" });
            return;
        }

        const { id, username: userUsername, email: userEmail, is_admin: isAdmin } = user;

        const accessToken = generateAccessToken({ id, userUsername, userEmail, isAdmin });
        const refreshToken = generateRefreshToken({ id, userUsername, userEmail, isAdmin });

        await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [id]);
        await pool.query(
            "INSERT INTO refresh_tokens (token, user_id, expired_at) VALUES ($1, $2, $3)",
            [refreshToken, id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
        );

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000,
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        console.log(`User ${userUsername} logged in successfully`);
        console.log(`User refreshToken: ${refreshToken}`);
        console.log(`User accessToken: ${accessToken}`);

        res.status(200).json({
            message: `Welcome back, ${userUsername}!`,
            accessToken,
            user: {
                username: userUsername,
                email: userEmail,
                isAdmin,
            },
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

// User Logout
const logoutUser = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        console.log(`${refreshToken} received from client`);

        if (!refreshToken) {
            return res.status(400).json({ message: "No refresh token provided" });
        }

        await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);

        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        });

        console.log("User logged out successfully");
        res.status(200).json({ message: "User logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const refreshUserToken = async (req: Request, res: Response): Promise<any> => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token provided" });
    }

    try {
        const checkToken = await pool.query("SELECT * FROM refresh_tokens WHERE token = $1", [refreshToken]);
        if (checkToken.rows.length === 0) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }

        const storedToken = checkToken.rows[0];

        if (new Date(storedToken.expired_at) < new Date()) {
            await pool.query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
            return res.status(403).json({ message: "Refresh token expired" });
        }

        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!, (error: any, user: any) => {
            if (error) {
                console.error("Token verification error:", error);
                return res.status(403).json({ message: "Invalid refresh token" });
            }


            const { id, username: userUsername, email: userEmail, is_admin: isAdmin } = user;
            const accessToken = generateAccessToken({ id, userUsername, userEmail, isAdmin });

            res.cookie("accessToken", accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 15 * 60 * 1000,
            });

            res.status(200).json({ message: "Token refreshed" });
        });
    } catch (error) {
        console.error("Error during token verification:", error);
    }
}

export { registerUser, tempUploadImage, cleanupTempImage, checkUsername, checkEmail, loginUser, logoutUser, refreshUserToken };