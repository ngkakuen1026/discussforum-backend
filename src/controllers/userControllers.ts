import bcrypt from 'bcrypt';
import pool from '../db/db';
import { Request, Response } from 'express';

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

// Edit Own Profile (Registered Users)
const editProfile = async (req: Request, res: Response) => {
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
            bio = user.bio,
            profile_image = user.profile_image
        } = req.body;

        const editResult = await pool.query(
            "UPDATE users SET username = $1, email = $2, first_name = $3, last_name = $4, phone = $5, gender = $6, bio = $7, profile_image = $8 WHERE id = $9 RETURNING *",
            [username, email, first_name, last_name, phone, gender, bio, profile_image, userId]
        );

        res.status(200).json({ user: editResult.rows[0] });
    } catch (error) {
        console.error(error);
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

export { viewUserProfile, editProfile, deleteAccount };