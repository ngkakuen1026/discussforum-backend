import { Request, Response } from 'express';
import pool from '../db/db';

const viewNotifications = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    try {
        const notifications = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        res.status(200).json({
            message: 'Notifications retrieved successfully',
            notifications: notifications.rows,
        });
    } catch (error) {
        console.error('Error retrieving notifications:', error);
        res.status(500).json({ error: 'Failed to retrieve notifications' });
    }
};

export { viewNotifications };