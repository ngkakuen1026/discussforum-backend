import { Request, Response, NextFunction } from "express";
import pool from "../db/db";

const logPostHistory = async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const postId = req.params.postId;

    if (userId) {
        try {
            const postResult = await pool.query(
                "SELECT id FROM posts WHERE id = $1",
                [postId]
            );

            if (postResult.rows.length === 0) {
                console.error(`Post with ID ${postId} does not exist.`);
                return next();
            }

            const visitCheck = await pool.query(
                "SELECT id FROM browsing_history WHERE user_id = $1 AND post_id = $2",
                [userId, postId]
            );

            if (visitCheck.rows.length > 0) {
                await pool.query(
                    "UPDATE browsing_history SET visited_at = NOW() WHERE user_id = $1 AND post_id = $2",
                    [userId, postId]
                );
                console.log(`User ${userId} has already visited post ${postId}.`);
            } else {
                await pool.query(
                    "INSERT INTO browsing_history (user_id, post_id) VALUES ($1, $2)",
                    [userId, postId]
                );
            }
        } catch (error) {
            console.error("Error logging post visit:", error);
        }
    }
    next(); 
};

export { logPostHistory };