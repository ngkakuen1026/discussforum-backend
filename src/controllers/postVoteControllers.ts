import pool from '../db/db';
import { Request, Response } from 'express';
import { VoteRequestBody } from '../types/postTypes';

// Get Votes for a Post
const getVotes = async (req: Request<{postId: string}>, res: Response) => {
    const postId = req.params.postId;

    try {
        const votesResult = await pool.query("SELECT vote_type, COUNT(*) as count FROM post_votes WHERE post_id = $1 GROUP BY vote_type", [postId]);
        res.status(200).json({ votes: votesResult.rows });
    } catch (error) {
        console.error("Error fetching votes:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Vote on a Post
const votePost = async (req: Request<{postId: string}, {}, VoteRequestBody>, res: Response) => {
    const postId = req.params.postId;
    const userId = req.user!.id;
    const voteType = req.body.voteType;

    if (![1, -1].includes(voteType)) {
        return res.status(400).json({ message: "Invalid vote type. Use 1 for upvote and -1 for downvote." });
    }

    try {
        const existingVote = await pool.query("SELECT * FROM post_votes WHERE post_id = $1 AND user_id = $2", [postId, userId]);

        if (existingVote.rows.length > 0) {
            res.status(403).json({ message: "You have already voted on this post. You cannot change your vote." });
            return;
        } else {
            await pool.query("INSERT INTO post_votes (post_id, user_id, vote_type) VALUES ($1, $2, $3)", [postId, userId, voteType]);
        }

        res.status(200).json({ message: "Vote recorded successfully." });
    } catch (error) {
        console.error("Error voting on post:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export { getVotes, votePost };