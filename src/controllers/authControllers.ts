import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../db/db';
import { Request, Response } from 'express';
import { LoginRequestBody, RegisterRequestBody } from '../types/authTypes';

const saltRoutds = 10;
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


const registerUser = async (req: Request<{}, {}, RegisterRequestBody>, res: Response) => {
    const { username, email, password, first_name, last_name, phone, gender, bio, is_admin } = req.body;

    try {
        const checkUsername = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const checkEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (checkUsername.rows.length > 0) {
            res.status(400).json({ message: 'Username already exists' });
            return;
        }
        if (checkEmail.rows.length > 0) {
            res.status(400).json({ message: 'Email already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, saltRoutds);

        const newUser = await pool.query(
            "INSERT INTO users (username, email, password_hash, first_name, last_name, phone, gender, bio, is_admin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
            [username, email, hashedPassword, first_name, last_name, phone, gender, bio, is_admin]
        );

        res.status(201).json({ message: 'User registered successfully', user: newUser.rows[0] });
        console.log(`User ${username} with ID ${newUser.rows[0].id} registered successfully`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
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

export { registerUser, loginUser, logoutUser, refreshUserToken };