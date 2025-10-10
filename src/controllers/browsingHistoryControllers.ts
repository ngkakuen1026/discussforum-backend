import pool from '../db/db';
import { Request, Response } from 'express';

const viewOwnBrowsingHistory = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const result = await pool.query(`
            SELECT 
                bh.post_id, 
                p.title, 
                COALESCE(SUM(CASE WHEN pv.vote_type = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
                COALESCE(SUM(CASE WHEN pv.vote_type = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
                c.name AS category,
                u.username, 
                p.created_at
            FROM 
                browsing_history bh
            JOIN 
                posts p ON bh.post_id = p.id
            LEFT JOIN 
                post_votes pv ON p.id = pv.post_id
            LEFT JOIN 
                categories c ON p.category_id = c.id
            JOIN 
                users u ON p.user_id = u.id  -- Join to get author's name
            WHERE 
                bh.user_id = $1
            GROUP BY 
                bh.post_id, p.title, c.name, p.created_at, u.username
        `, [userId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching browsing history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

const deleteMultipleHistories = async (req: Request, res: Response) => {
    const userId = req.user?.id;
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

        res.status(200).json({ message: "Browsing history deleted", deletedCount: result.rowCount });
    } catch (error) {
        console.error("Error deleting browsing history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export { viewOwnBrowsingHistory, deleteMultipleHistories };