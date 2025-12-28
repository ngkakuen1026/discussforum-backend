import pool from '../db/db';
import { Request, Response } from 'express';

const blockUser = async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const blockedId = Number(req.params.userId);
    const block_reason = req.body?.block_reason;

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
            "INSERT INTO user_blocked (blocker_id, blocked_id, block_reason) VALUES ($1, $2, $3)",
            [blockerId, blockedId, block_reason.trim()]
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

const updateBlockedReason = async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const blockedId = Number(req.params.userId);
    const { block_reason } = req.body;

    if (!block_reason?.trim()) {
        return res.status(400).json({ message: "Block reason is required." });
    }

    try {
        const result = await pool.query(
            "UPDATE user_blocked SET block_reason = $1 WHERE blocker_id = $2 AND blocked_id = $3 RETURNING *",
            [block_reason.trim(), blockerId, blockedId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "User not found in blocked list." });
        }

        res.status(200).json({
            message: "Blocked reason updated successfully.",
            updated: result.rows[0]
        });
    } catch (error) {
        console.error("Error updating block reason:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getBlockedUsers = async (req: Request, res: Response) => {
    const blockerId = req.user!.id;

    try {
        const result = await pool.query(
            `SELECT
                u.id as blocked_user_id, 
                u.username as blocked_user_username,
                u.profile_image AS blocked_user_profile_image,
                u.is_admin AS blocked_user_is_admin,
                u.registration_date AS blocked_user_registration_date,
                u.gender AS blocked_user_gender,
                ub.created_at AS blocked_blocked_at,
                ub.block_reason AS blocked_reason
            FROM users u
            JOIN user_blocked ub ON u.id = ub.blocked_id 
            WHERE ub.blocker_id = $1
            `,
            [blockerId]
        )

        const blockedUserList = result.rows.map(row => ({
            blocked_user_id: row.blocked_user_id,
            blocked_user_username: row.blocked_user_username,
            blocked_user_profile_image: row.blocked_user_profile_image,
            blocked_user_is_admin: row.blocked_user_is_admin,
            blocked_user_registration_date: row.blocked_user_registration_date,
            blocked_user_gender: row.blocked_user_gender,
            user_blocked_at: row.blocked_blocked_at,
            blocked_reason: row.blocked_reason
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

export { blockUser, unblockUser, updateBlockedReason, getBlockedUsers };