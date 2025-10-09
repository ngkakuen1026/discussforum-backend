import pool from '../db/db';
import { Request, Response } from 'express';

const blockUser = async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const blockedId = Number(req.params.userId);

    if (blockerId === blockedId) {
        res.status(400).json({ message: 'You cannot block yourself' });
        return;
    }

    try {
        const existingBlock = await pool.query(
            "SELECT * FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
            [blockerId, blockedId]
        );

        if (existingBlock.rows.length > 0) {
            res.status(400).json({ message: "User is already blocked." });
            return;
        }

        await pool.query(
            "INSERT INTO user_blocked (blocker_id, blocked_id) VALUES ($1, $2)",
            [blockerId, blockedId]
        );

        res.status(200).json({ message: "User blocked successfully." });
    } catch (error) {
        console.error("Error blocking user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const unblockUser = async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const blockedId = Number(req.params.userId);

    try {
        const result = await pool.query(
            "DELETE FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
            [blockerId, blockedId]
        );

        if (result.rowCount === 0) {
            res.status(404).json({ message: "User not found in blocked list." });
            return;
        }

        res.status(200).json({ message: "User unblocked successfully." });
    } catch (error) {
        console.error("Error unblocking user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getBlockedUsers = async (req: Request, res: Response) => {
    const blockerId = req.user!.id;

    try {
        const result = await pool.query(
            `
            SELECT users.id, users.username, users.profile_image
            FROM user_blocked
            JOIN users ON user_blocked.blocked_id = users.id
            WHERE user_blocked.blocker_id = $1
            `,
            [blockerId]
        );

        const blockedUserList = result.rows.map(row => ({
            id: row.id,
            username: row.username,
            profileImage: row.profile_image
        }));

        res.status(200).json({
            message: "User blocked list fetched successfully",
            blockedUserList
        });
    } catch (error) {
        console.error("Error fetching blocked users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export { blockUser, unblockUser, getBlockedUsers };