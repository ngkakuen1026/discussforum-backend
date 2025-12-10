import pool from '../db/db';
import { Request, Response } from 'express';
import { AddBookmarkRequestBody } from '../types/bookmarkTypes';

const viewBookmarks = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const bookmarks = await pool.query(`
            SELECT 
                b.id AS bookmark_id,
                p.id AS post_id,
                p.title AS post_title,
                p.views AS post_view,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender,
                COALESCE(SUM(CASE WHEN pv.vote_type = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
                COALESCE(SUM(CASE WHEN pv.vote_type = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
                c.name AS category_name,
                c.id AS category_id,
                p.created_at AS post_created_at
            FROM 
                bookmarks b
            JOIN 
                posts p ON b.post_id = p.id
            JOIN 
                users u ON p.user_id = u.id
            LEFT JOIN 
                post_votes pv ON p.id = pv.post_id
            LEFT JOIN 
                categories c ON p.category_id = c.id
            WHERE 
                b.user_id = $1
            GROUP BY 
                    b.id, 
                    p.id, p.title, p.created_at,
                    u.username, u.profile_image, u.is_admin, u.registration_date, u.gender,
                    c.name, c.id,
                    b.created_at
            ORDER BY 
                b.created_at DESC
        `, [userId]);

        res.status(200).json({ bookmarks: bookmarks.rows });
    } catch (error) {
        console.error("Error fetching bookmarks:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const addPostToBookmark = async (req: Request<{}, {}, AddBookmarkRequestBody>, res: Response) => {
    const userId = req.user!.id;
    const { postId } = req.body;

    if (!postId) {
        res.status(400).json({ message: 'Post ID is required.' });
        return;
    }

    try {
        const current = await pool.query(
            "SELECT * FROM bookmarks WHERE user_id = $1 AND post_id = $2",
            [userId, postId]
        );

        if (current.rows.length > 0) {
            res.status(409).json({ message: 'Post already bookmarked.' });
            return;
        }

        const result = await pool.query(
            "INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)",
            [userId, postId]
        )

        res.status(201).json({
            message: `Post ${postId} bookmarked successfully.`,
        })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const removePostFromBookmark = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const postId = Number(req.params.postId);

    if (!postId) {
        res.status(400).json({ message: 'Post ID is required.' });
        return;
    }

    try {
        const result = await pool.query(
            "DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2",
            [userId, postId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ message: 'Post not found in bookmark.' });
            return;
        }

        res.status(200).json({ message: `Post ${postId} removed from bookmark successfully.` });
    } catch (error) {
        console.error('Error removing post from bookmark:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
}

const removeMultipleBookmarks = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const postIds = req.body.data?.postIds || req.body.postIds;

    console.log("Received postIds:", postIds);


    if (!Array.isArray(postIds) || postIds.length === 0) {
        return res.status(400).json({ message: "postIds array is required" });
    }

    try {
        const result = await pool.query(
            "DELETE FROM bookmarks WHERE user_id = $1 AND post_id = ANY($2::int[])",
            [userId, postIds]
        );

        return res.status(200).json({
            message: "Bookmarks removed",
            deletedCount: result.rowCount,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

export { viewBookmarks, addPostToBookmark, removePostFromBookmark, removeMultipleBookmarks };