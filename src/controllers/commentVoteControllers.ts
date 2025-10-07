import pool from '../db/db';
import { Request, Response } from 'express';
import { VoteRequestBody } from '../types/commentTypes';
import { createNotification } from '../utils/notificationUtils';

// Get Votes for a comment
const getVotes = async (req: Request<{ commentId: string }>, res: Response) => {
    const commentId = Number(req.params.commentId);

    try {
        const commentResult = await pool.query("SELECT * FROM comments WHERE id = $1", [commentId]);
        if (commentResult.rows.length === 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }

        const votesResult = await pool.query("SELECT vote_type, COUNT(*) as count FROM comment_votes WHERE comment_id = $1 GROUP BY vote_type", [commentId]);
        res.status(200).json({ votes: votesResult.rows });
    } catch (error) {
        console.error("Error fetching comment votes:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}


// Vote on a comment
const voteComment = async (req: Request<{ commentId: string }, {}, VoteRequestBody>, res: Response) => {
    const commentId = Number(req.params.commentId);
    const userId = req.user!.id;
    const voteType = req.body.voteType;

    if (![1, -1].includes(voteType)) {
        res.status(400).json({ message: "Invalid vote type. Use 1 for upvote and -1 for downvote." });
        return;
    }

    try {
        const commentResult = await pool.query("SELECT * FROM comments WHERE id = $1", [commentId]);

        if (commentResult.rows.length === 0) {
            res.status(404).json({ message: "Comment not found" });
            return;
        }

        const existingVote = await pool.query("SELECT * FROM comment_votes WHERE comment_id = $1 AND user_id = $2", [commentId, userId]);
        if (existingVote.rows.length > 0) {
            res.status(403).json({ message: "You have already voted on this comment. You cannot change your vote." });
            return;
        } else {
            await pool.query("INSERT INTO comment_votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)", [commentId, userId, voteType]);
        }

        const postResult = await pool.query("SELECT title FROM posts WHERE id = $1", [commentResult.rows[0].post_id]);
        if (postResult.rows.length === 0) {
            res.status(404).json({ message: "Post not found for the given comment." });
            return;
        }
        const postTitle = postResult.rows[0].title;

        const userResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [userId]
        )

        const voterUsername = userResult.rows[0]?.username;

        const commentOwnerId = commentResult.rows[0].user_id;
        const notificationMessage = `User ${voterUsername} ${voteType === 1 ? 'liked' : 'disliked'} your comment: ${commentResult.rows[0].content} on post ${postTitle}.`;
        await createNotification(commentOwnerId, notificationMessage, 'like', commentId);

        res.status(200).json({ message: "Vote recorded successfully." });
    }
    catch (error) {
        console.error("Error voting on comment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export { getVotes, voteComment };