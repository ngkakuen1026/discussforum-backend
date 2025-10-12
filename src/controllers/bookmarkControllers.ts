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
                u.username AS author_name,
                COALESCE(SUM(CASE WHEN pv.vote_type = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
                COALESCE(SUM(CASE WHEN pv.vote_type = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
                c.name AS category_name,
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
                b.id, p.id, u.username, c.name
        `, [userId]);

        res.status(200).json(bookmarks.rows);
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
            res.status(400).json({ message: 'Post already bookmarked.' });
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

export { viewBookmarks, addPostToBookmark, removePostFromBookmark };