import pool from '../db/db';
import { Request, Response } from 'express';

const getVisibility = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const result = await pool.query(`
      SELECT 
        visibility_mode,
        show_full_name,
        show_email,
        show_phone,
        show_gender,
        show_bio,
        show_registration_date,
        show_last_login_at
      FROM user_visibility
      WHERE user_id = $1
    `, [userId]);

        if (result.rows.length === 0) {
            return res.status(200).json({
                visibility_mode: 'public',
                show_full_name: true,
                show_email: false,
                show_phone: false,
                show_gender: true,
                show_bio: true,
                show_registration_date: true,
                show_last_login_at: false,
            });
        }

        const visibility = result.rows[0];

        // Return all fields
        res.status(200).json({
            visibility_mode: visibility.visibility_mode,
            show_full_name: visibility.show_full_name,
            show_email: visibility.show_email,
            show_phone: visibility.show_phone,
            show_gender: visibility.show_gender,
            show_bio: visibility.show_bio,
            show_registration_date: visibility.show_registration_date,
            show_last_login_at: visibility.show_last_login_at,
        });
    } catch (err) {
        console.error("Error fetching visibility:", err);
        res.status(500).json({ message: "Failed to fetch visibility settings" });
    }
};

const changeVisibility = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const {
        visibility_mode,
        show_full_name,
        show_email,
        show_phone,
        show_gender,
        show_bio,
        show_registration_date,
        show_last_login_at,
    } = req.body;

    const validModes = ['public', 'followers_only', 'private'];
    if (visibility_mode && !validModes.includes(visibility_mode)) {
        return res.status(400).json({ message: "Invalid visibility mode" });
    }

    try {
        const updates: string[] = [];
        const values: any[] = [userId];
        // Index 1 = user id
        let paramIndex = 2;

        if (visibility_mode !== undefined) {
            updates.push(`visibility_mode = $${paramIndex}`);
            values.push(visibility_mode);
            paramIndex++;
        }
        if (show_full_name !== undefined) {
            updates.push(`show_full_name = $${paramIndex}`);
            values.push(show_full_name);
            paramIndex++;
        }
        if (show_email !== undefined) {
            updates.push(`show_email = $${paramIndex}`);
            values.push(show_email);
            paramIndex++;
        }
        if (show_phone !== undefined) {
            updates.push(`show_phone = $${paramIndex}`);
            values.push(show_phone);
            paramIndex++;
        }
        if (show_gender !== undefined) {
            updates.push(`show_gender = $${paramIndex}`);
            values.push(show_gender);
            paramIndex++;
        }
        if (show_bio !== undefined) {
            updates.push(`show_bio = $${paramIndex}`);
            values.push(show_bio);
            paramIndex++;
        }
        if (show_registration_date !== undefined) {
            updates.push(`show_registration_date = $${paramIndex}`);
            values.push(show_registration_date);
            paramIndex++;
        }
        if (show_last_login_at !== undefined) {
            updates.push(`show_last_login_at = $${paramIndex}`);
            values.push(show_last_login_at);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: "No fields provided to update" });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        const query = `
            UPDATE user_visibility
            SET ${updates.join(", ")}
            WHERE user_id = $1
            RETURNING *;
        `;

        const result = await pool.query(query, values);

        if (result.rowCount === 0) {
            await pool.query(`
                INSERT INTO user_visibility (user_id, visibility_mode)
                VALUES ($1, 'public')
        `, [userId]);
            return res.status(200).json({ message: "Visibility settings created and updated" });
        }

        res.status(200).json({ message: "Visibility settings updated" });
    } catch (err) {
        console.error("Error updating visibility:", err);
        res.status(500).json({ message: "Failed to update visibility" });
    }
};

const resetDefaultVisibility = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        await pool.query(`
        UPDATE user_visibility
        SET 
            visibility_mode = 'public',
            show_full_name = TRUE,
            show_email = FALSE,
            show_phone = FALSE,
            show_gender = TRUE,
            show_bio = TRUE,
            show_registration_date = TRUE,
            show_last_login_at = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        `, [userId]);

        res.status(200).json({ message: "Visibility reset to defaults" });
    } catch (err) {
        console.error("Error resetting visibility:", err);
        res.status(500).json({ message: "Failed to reset visibility" });
    }
};

export { getVisibility, changeVisibility, resetDefaultVisibility };