import pool from '../db/db';

export const createNotification = async (
    userId: number,
    message: string,
    type: string,
    relatedId?: number
) => {
    try {
        await pool.query(
            'INSERT INTO notifications (user_id, message, type, related_id) VALUES ($1, $2, $3, $4)',
            [userId, message, type, relatedId]
        );
    } catch (error) {
        console.error('Error creating notification:', error);
    }
};