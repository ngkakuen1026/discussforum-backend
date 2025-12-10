import pool from '../db/db';
import { Request, Response } from 'express';
import { VoteRequestBody } from '../types/postTypes';
import { createNotification } from '../utils/notificationUtils';

// Get Votes for a Post
const getVotes = async (req: Request<{ postId: string }>, res: Response) => {
    const postId = Number(req.params.postId);
    const userId = req.user?.id;

    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);

        if (postResult.rows.length === 0) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        const votesResult = await pool.query("SELECT vote_type, COUNT(*) as count FROM post_votes WHERE post_id = $1 GROUP BY vote_type", [postId]);

        const response: any = {
            votes: votesResult.rows.map(row => ({
                vote_type: Number(row.vote_type),
                count: Number(row.count)
            }))
        };
        
        if (userId) {
            const userVoteResult = await pool.query(
                "SELECT vote_type FROM post_votes WHERE post_id = $1 AND user_id = $2",
                [postId, userId]
            );

            response.user_vote = userVoteResult.rows[0]
                ? Number(userVoteResult.rows[0].vote_type)
                : null;
        } else {
            response.user_vote = null;
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching votes:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Vote on a Post
const votePost = async (req: Request<{ postId: string }, {}, VoteRequestBody>, res: Response) => {
    const postId = Number(req.params.postId);
    const userId = req.user!.id;
    const voteType = req.body.voteType;

    if (![1, -1].includes(voteType)) {
        res.status(400).json({ message: "Invalid vote type. Use 1 for upvote and -1 for downvote." });
        return;
    }

    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);

        if (postResult.rows.length === 0) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        const existingVote = await pool.query("SELECT * FROM post_votes WHERE post_id = $1 AND user_id = $2", [postId, userId]);

        if (existingVote.rows.length > 0) {
            res.status(403).json({ message: "You have already voted on this post. You cannot change your vote." });
            return;
        } else {
            await pool.query("INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)", [postId, userId, voteType]);
        }

        const userResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [userId]
        )

        const voterUsername = userResult.rows[0]?.username;

        const postOwnerId = postResult.rows[0].user_id;
        const notificationMessage = `User ${voterUsername} ${voteType === 1 ? 'liked' : 'disliked'} your post: ${postResult.rows[0].title}.`;
        await createNotification(postOwnerId, notificationMessage, voteType === 1 ? 'like' : 'dislike', postId);

        res.status(200).json({ message: "Vote recorded successfully." });
    } catch (error) {
        console.error("Error voting on post:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export { getVotes, votePost };