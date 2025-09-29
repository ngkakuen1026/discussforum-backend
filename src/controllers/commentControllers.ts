import pool from '../db/db';
import { Request, Response } from 'express';
import { CreateCommentRequestBody } from '../types/commentTypes';

const viewComments = async (req: Request<{ postId: string }>, res: Response) => {
    const postId = req.params.postId;

    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);
        if (postResult.rows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        const commentsResult = await pool.query("SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at DESC", [postId]);
        res.status(200).json({ comments: commentsResult.rows });

    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

const createComment = async (req: Request<{ postId: string }, {}, CreateCommentRequestBody>, res: Response) => {
    const userId = req.user?.id;
    const postId = req.params.postId;
    const { content } = req.body;

    try {
        if (!content) {
            return res.status(400).json({ message: "Content is required" });
        }

        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);
        if (postResult.rows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }

        const newComment = await pool.query(
            "INSERT INTO comments (user_id, post_id, content, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *",
            [userId, postId, content]
        );


        res.status(201).json({
            message: `Comment created successfully for post ID ${postId}`,
            comment: newComment.rows[0],
        });
    } catch (error) {
        console.error("Error creating comment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}



export { viewComments, createComment };