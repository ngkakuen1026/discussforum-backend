import { Request, Response } from 'express';
import pool from '../db/db';
import { createNotification } from '../utils/notificationUtils';

const viewOwnFollowers = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    try {
        const result = await pool.query(
            `SELECT 
                users.id, 
                users.username 
            FROM users 
            JOIN user_following ON users.id = user_following.follower_id 
            WHERE user_following.followed_id = $1`,
            [userId]
        );
        res.status(200).json({ followersCount: result.rows.length, followers: result.rows });
    } catch (error) {
        console.error('Error fetching followers:', error);
        res.status(500).json({ error: 'Failed to fetch followers' });
    }
}

const viewOwnFollowing = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    try {
        const result = await pool.query(
            `SELECT 
                users.id, 
                users.username 
            FROM users 
            JOIN user_following ON users.id = user_following.followed_id 
            WHERE user_following.follower_id = $1`,
            [userId]
        );
        res.status(200).json({ followingCount: result.rows.length, following: result.rows });
    } catch (error) {
        console.error('Error fetching following users:', error);
        res.status(500).json({ error: 'Failed to fetch following users' });
    }
}

const followUser = async (req: Request, res: Response) => {
    const followerId = req.user!.id;
    const { followedId } = req.body;

    if (followerId === followedId) {
        return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    try {
        const existingFollow = await pool.query(
            'SELECT * FROM user_following WHERE follower_id = $1 AND followed_id = $2',
            [followerId, followedId]
        );

        if (existingFollow.rows.length > 0) {
            res.status(400).json({ message: 'You had already following this user' });
            return;
        }

        await pool.query(
            'INSERT INTO user_following (follower_id, followed_id) VALUES ($1, $2)',
            [followerId, followedId]
        );

        const userResult = await pool.query(
            'SELECT username FROM users WHERE id = $1',
            [followerId]
        );

        const followerUserName = userResult.rows[0].username;
        const notificationMessage = `User ${followerUserName} started following you.`;
        await createNotification(followedId, notificationMessage, "follow", followerId);

        res.status(201).json({ message: 'User followed successfully' });
    } catch (error) {
        console.error('Error following user:', error);
        res.status(500).json({ error: 'Failed to follow user' });
    }
};

const unfollowUser = async (req: Request, res: Response) => {
    const followerId = req.user!.id;
    const { followedId } = req.body;

    try {
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [followedId]
        );

        if (existingUser.rows.length === 0) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const existingFollow = await pool.query(
            'SELECT * FROM user_following WHERE follower_id = $1 AND followed_id = $2',
            [followerId, followedId]
        );

        if (existingFollow.rows.length === 0) {
            res.status(400).json({ message: 'You are not following this user' });
            return;
        }

        await pool.query(
            'DELETE FROM user_following WHERE follower_id = $1 AND followed_id = $2',
            [followerId, followedId]
        );

        const userResult = await pool.query(
            'SELECT username FROM users WHERE id = $1',
            [followerId]
        );

        const unfollowerUserName = userResult.rows[0].username;
        const notificationMessage = `User ${unfollowerUserName} unfollowed you.`;
        await createNotification(followedId, notificationMessage, "unfollow", followerId);

        res.status(200).json({ message: 'User unfollowed successfully' });
    } catch (error) {
        console.error('Error unfollowing user:', error);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
};

export { viewOwnFollowers, viewOwnFollowing, followUser, unfollowUser };