import { Request, Response, NextFunction } from "express";
import pool from "../db/db";

const logPostHistory = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const postId = req.params.postId;

    try {
        const postResult = await pool.query(
            "SELECT id FROM posts WHERE id = $1",
            [postId]
        );

        if (postResult.rows.length === 0) {
            console.error(`Post with ID ${postId} does not exist.`);
            return next();
        }

        await pool.query(
            `UPDATE posts 
            SET views = views + 1 
            WHERE id = $1`,
            [postId]
        );

        if (userId)

            await pool.query(
                `INSERT INTO browsing_history (user_id, post_id, visited_at)
                VALUES ($1, $2, NOW())`,
                [userId, postId]
            );
    } catch (error) {
        console.error("Error logging post visit:", error);
    }
    next();
};

export { logPostHistory };
