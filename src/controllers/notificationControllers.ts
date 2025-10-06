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

const getUnreadCount = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE',
            [userId]
        );

        res.status(200).json({
            unreadCount: parseInt(result.rows[0].count, 10),
        });
    } catch (error) {
        console.error('Error fetching unread notifications count:', error);
        res.status(500).json({ error: 'Failed to fetch unread notifications count.' });
    }
};

const readNotifications = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const result = await pool.query(
            'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE RETURNING *',
            [userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'No unread notifications found.' });
        }

        res.status(200).json({
            message: 'Notifications marked as read successfully.',
            notifications: result.rows,
        });
    } catch (error) {
        console.error('Error reading notifications:', error);
        res.status(500).json({ error: 'Failed to read notifications.' });
    }
};

const deleteNotification = async (req: Request<{ notificationId: string }, {}, {}>, res: Response) => {
    const userId = req.user!.id;
    const { notificationId } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
            [notificationId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Notification not found.' });
        }

        res.status(200).json({
            message: 'Notification deleted successfully.',
            deletedNotification: result.rows[0],
        });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification.' });
    }
};

export { viewNotifications, getUnreadCount, readNotifications, deleteNotification };