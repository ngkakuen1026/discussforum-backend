import pool from '../db/db';
import { Request, Response } from 'express';

const viewOwnBrowsingHistory = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const result = await pool.query(`
            SELECT DISTINCT on (p.id) 
                bh.id AS browsing_id,
                p.id AS post_id,
                p.title AS post_title,
                p.views AS post_view,
                p.pending_tag_name AS post_pending_tag_name,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender,
                COALESCE(SUM(CASE WHEN pv.vote_type = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
                COALESCE(SUM(CASE WHEN pv.vote_type = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
                c.name AS category_name,
                c.id AS category_id,
                p.created_at AS post_created_at,
                bh.visited_at AS browsing_visited_at
            FROM 
                browsing_history bh
            JOIN 
                posts p ON bh.post_id = p.id
            JOIN 
                users u ON p.user_id = u.id
            LEFT JOIN 
                post_votes pv ON p.id = pv.post_id
            LEFT JOIN 
                categories c ON p.category_id = c.id
            WHERE 
                bh.user_id = $1
            GROUP BY 
                bh.id, 
                p.id, p.title, p.created_at,
                u.username, u.profile_image, u.is_admin, u.registration_date, u.gender,
                c.name, c.id,
                bh.visited_at
            ORDER BY 
                p.id, bh.visited_at DESC
        `, [userId]);
        res.status(200).json({ browsingHistories: result.rows });
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