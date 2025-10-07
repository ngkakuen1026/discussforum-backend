import pool from '../db/db';
import { Request, Response } from 'express';
import { CreateCommentRequestBody, CreateReplyRequestBody } from '../types/commentTypes';
import { createNotification } from '../utils/notificationUtils';

const viewComments = async (req: Request<{ postId: string }>, res: Response) => {
    const postId = Number(req.params.postId);

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
    const postId = Number(req.params.postId);
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

        const userResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [userId]
        )
        const userName = userResult.rows[0]?.username;

        const postAuthorId = postResult.rows[0].user_id;
        const postTitle = postResult.rows[0].title;
        const notificationMessage = `User ${userName} commented on your post ${postTitle}.`;
        await createNotification(postAuthorId, notificationMessage, 'comment', postId);

        res.status(201).json({
            message: `Comment created successfully for post ID ${postId}`,
            comment: newComment.rows[0],
        });
    } catch (error) {
        console.error("Error creating comment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

const replyToComment = async (req: Request<{ commentId: string }, {}, CreateReplyRequestBody>, res: Response) => {
    const userId = req.user?.id;
    const commentId = Number(req.params.commentId);
    const { content } = req.body;

    try {
        if (!content) {
            return res.status(400).json({ message: "Content is required" });
        }

        const commentResult = await pool.query("SELECT * FROM comments WHERE id = $1", [commentId]);
        if (commentResult.rows.length === 0) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const newReply = await pool.query(
            "INSERT INTO comments (user_id, post_id, content, created_at, parent_comment_id) VALUES ($1, $2, $3, NOW(), $4) RETURNING *",
            [userId, commentResult.rows[0].post_id, content, commentId] 
        );
        
        const userResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [userId]
        )

        const postId = commentResult.rows[0].id;
        const titleResult = await pool.query(
            "SELECT title FROM posts WHERE id = $1",
            [postId]
        )

        const userName = userResult.rows[0].username;
        const postTitle = titleResult.rows[0].title;
        const originalCommentAuthorId = commentResult.rows[0].user_id;

        const notificationMessage = `User ${userName} replied to your comment in post ${postTitle}`;
        await createNotification(originalCommentAuthorId, notificationMessage, 'comment_reply', commentId);

        res.status(201).json({
            message: `Reply created successfully for comment ID ${commentId}`,
            reply: newReply.rows[0],
        });
    } catch (error) {
        console.error("Error replying to comment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export { viewComments, createComment, replyToComment };