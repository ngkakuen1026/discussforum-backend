import pool from '../db/db';
import { Request, Response } from 'express';
import { CreateCommentRequestBody, CreateReplyRequestBody } from '../types/commentTypes';
import { createNotification } from '../utils/notificationUtils';
import { extractUserMentions } from '../utils/extractUserMentions';

const viewComments = async (req: Request<{ postId: string }>, res: Response) => {
    const postId = Number(req.params.postId);
    const userId = req.user?.id;

    try {
        const postResult = await pool.query("SELECT id FROM posts WHERE id = $1", [postId]);
        if (postResult.rows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }
        const blockedUserIds: number[] = userId
            ? (
                await pool.query("SELECT blocked_id FROM user_blocked WHERE blocker_id = $1", [
                    userId,
                ])
            ).rows.map((r) => r.blocked_id)
            : [];

        const whereConditions = ["c.post_id = $1"];
        const queryParams: any[] = [postId];

        if (blockedUserIds.length > 0) {
            whereConditions.push(`c.user_id NOT IN (${blockedUserIds.map((_, i) => `$${i + 2}`).join(",")})`);
            queryParams.push(...blockedUserIds);
        }

        const commentsResult = await pool.query(
            `
                SELECT 
                    c.id,
                    c.post_id,
                    c.user_id,
                    c.content,
                    c.created_at,
                    c.parent_comment_id,
                    pc.content AS parent_comment_content,
                    pc.created_at AS parent_comment_created_at,
                    pu.username AS parent_commenter_username,
                    pu.is_admin AS parent_commenter_is_admin,
                    pu.gender AS parent_commenter_gender,
                    u.id AS commenter_id,
                    u.username AS commenter_username,
                    u.profile_image AS commenter_profile_image,
                    u.is_admin AS commenter_is_admin,
                    u.registration_date AS commenter_registration_date,
                    u.gender AS commenter_gender
                FROM comments c
                LEFT JOIN comments pc ON c.parent_comment_id = pc.id
                LEFT JOIN users pu ON pc.user_id = pu.id
                LEFT JOIN users u ON c.user_id = u.id
                WHERE ${whereConditions.join(" AND ")}
                ORDER BY c.created_at ASC
            `,
            queryParams
        );

        const comments = commentsResult.rows.map((comment, index) => {
            const floorNumber = (index + 2).toString();

            // Find parent's floor number
            let parentFloorNumber: string | null = null;
            if (comment.parent_comment_id) {
                const parentIndex = commentsResult.rows.findIndex(
                    (c) => c.id === comment.parent_comment_id
                );
                if (parentIndex !== -1) {
                    parentFloorNumber = (parentIndex + 2).toString();
                }
            }

            return {
                ...comment,
                floor_number: floorNumber,
                parent_floor_number: parentFloorNumber,
                parent_comment_content: comment.parent_comment_content || null,
                parent_comment_username: comment.parent_comment_username || null,
            };
        });

        res.status(200).json({ comments });
    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

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


        const mentions = extractUserMentions(content);

        for (const username of mentions) {
            const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
            if (userResult.rows.length > 0) {
                const mentionedUserId = userResult.rows[0].id;
                const mentionNotificationMessage = `User ${userName} mentioned you in a comment on post "${postTitle}".`;
                await createNotification(mentionedUserId, mentionNotificationMessage, 'mention', newComment.rows[0].id);
            }
        }

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

        const postId = commentResult.rows[0].post_id;
        const titleResult = await pool.query(
            "SELECT title FROM posts WHERE id = $1",
            [postId]
        )

        const userName = userResult.rows[0].username;
        const postTitle = titleResult.rows[0].title;
        const originalCommentAuthorId = commentResult.rows[0].user_id;

        const notificationMessage = `User ${userName} replied to your comment in post ${postTitle}`;
        await createNotification(originalCommentAuthorId, notificationMessage, 'comment_reply', commentId);

        const mentions = extractUserMentions(content);

        for (const username of mentions) {
            const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
            if (userResult.rows.length > 0) {
                const mentionedUserId = userResult.rows[0].id;
                const mentionNotificationMessage = `User ${userName} mentioned you in a reply to a comment on post "${postTitle}".`;
                await createNotification(mentionedUserId, mentionNotificationMessage, 'mention', newReply.rows[0].id);
            }
        }

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