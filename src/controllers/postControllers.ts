import pool from '../db/db';
import { Request, Response } from 'express';
import { CreatePostRequestBody } from '../types/postTypes';
import { createNotification } from '../utils/notificationUtils';
import { formatDate } from '../utils/dateUtils';
import { extractUserMentions } from '../utils/extractUserMentions';

// View all posts
const viewAllPosts = async (req: Request, res: Response) => {
    const userId = req.user?.id;

    try {
        let blockedUserIds: number[] = [];
        if (userId) {
            const blockedResult = await pool.query(
                "SELECT blocked_id FROM user_blocked WHERE blocker_id = $1",
                [userId]
            );
            blockedUserIds = blockedResult.rows.map(row => row.blocked_id);
        }

        const query = `
            SELECT p.* ,
                u.id AS author_id,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE ($1::integer IS NULL OR p.user_id NOT IN (
                SELECT blocked_id FROM user_blocked WHERE blocker_id = $1
            ))
            ORDER BY p.created_at DESC
        `;

        const result = await pool.query(query, [userId || null]);

        res.status(200).json({ posts: result.rows });
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// View Single Post
const viewPost = async (req: Request<{ postId: string }, {}, {}>, res: Response) => {
    const postId = Number(req.params.postId);
    try {
        const postResult = await pool.query(`
            SELECT 
                p.*,
                u.id AS author_id,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = $1`,
            [postId]);
        if (postResult.rows.length === 0) {
            return res.status(404).json({ message: "Post not found" });
        }
        res.status(200).json({ post: postResult.rows[0] });
    } catch (error) {
        console.error("Error fetching post:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

// Search Posts
const searchPosts = async (req: Request, res: Response) => {
    const { query } = req.query;

    if (!query) {
        res.status(400).json({ message: "Search query is required" });
        return;
    }

    try {
        const searchResult = await pool.query(`
            SELECT 
                p.*,
                u.id AS author_id,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.title ILIKE $1
            ORDER BY p.created_at DESC`,
            [`%${query}%`]);
        res.status(200).json({ posts: searchResult.rows });
    } catch (error) {
        console.error("Error searching posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

// View All Posts by Category
const viewPostsByCategory = async (req: Request<{ categoryId: string }, {}, {}>, res: Response) => {
    const categoryId = Number(req.params.categoryId);

    try {
        const result = await pool.query(`
            SELECT 
                p.*,
                u.id AS author_id,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.category_id = $1
            ORDER BY p.created_at DESC`,
            [categoryId]);
        res.status(200).json({ posts: result.rows });
    } catch (error) {
        console.error("Error fetching posts by category:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// View All Own Posts (Registered Users)
const viewAllOwnPosts = async (req: Request, res: Response) => {
    const userId = req.user!.id;

    try {
        const postsResult = await pool.query("SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
        res.status(200).json({ posts: postsResult.rows });
    } catch (error) {
        console.error("Error fetching user's posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

// Create Post (Registered Users)
const createPost = async (req: Request<{}, {}, CreatePostRequestBody>, res: Response) => {
    const userId = req.user!.id;
    const { title, content, categoryId, tag } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (!title || !content || !categoryId) {
            return res.status(400).json({ message: "Title, content and categoryId are required." });
        }

        const categoryResult = await client.query(
            "SELECT id FROM categories WHERE id = $1",
            [categoryId]
        );
        if (categoryResult.rowCount === 0) {
            return res.status(404).json({ message: "Category not found" });
        }

        let tagId: number | null = null;
        let tagApproved = false;
        let normalizedTag: string | null = null;

        if (tag && typeof tag === 'string') {
            normalizedTag = tag.trim();
            if (normalizedTag === '') {
                return res.status(400).json({ message: "Tag cannot be empty" });
            }

            const tagResult = await client.query(`
                INSERT INTO tags (name, user_id, approved)
                VALUES ($1, $2, FALSE)
                ON CONFLICT (name_lowercase) DO UPDATE 
                SET name = EXCLUDED.name
                RETURNING id, approved
            `, [normalizedTag, userId]);

            tagId = tagResult.rows[0].id;
            tagApproved = tagResult.rows[0].approved;
        }

        // Create the post
        const newPostResult = await client.query(
            `INSERT INTO posts 
            (user_id, title, content, category_id, created_at, pending_tag_name)
            VALUES ($1, $2, $3, $4, NOW(), $5)
            RETURNING *`,
            [userId, title, content, categoryId, tagId && !tagApproved ? normalizedTag : null]
        );

        const newPost = newPostResult.rows[0];

        if (tagId && tagApproved) {
            await client.query(
                `INSERT INTO post_tags (post_id, tag_id)
                VALUES ($1, $2)`,
                [newPost.id, tagId]
            );
        }

        await client.query('COMMIT');

        const userResult = await pool.query("SELECT username FROM users WHERE id = $1", [userId]);
        const userName = userResult.rows[0]?.username;

        const followers = await pool.query(
            "SELECT follower_id FROM user_following WHERE followed_id = $1",
            [userId]
        );

        const postCreatedTime = formatDate(newPost.created_at);

        for (const { follower_id } of followers.rows) {
            await createNotification(
                follower_id,
                `User ${userName} created a new post: ${title} at ${postCreatedTime}.`,
                'post'
            );
        }

        const mentions = extractUserMentions(content);
        for (const username of mentions) {
            const mentionedUser = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
            if (mentionedUser.rows.length > 0) {
                await createNotification(
                    mentionedUser.rows[0].id,
                    `User ${userName} mentioned you in a post: "${title}".`,
                    'mention',
                    newPost.id
                );
            }
        }

        res.status(201).json({
            message: "Post created successfully",
            post: newPost,
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error creating post:", error);
        res.status(500).json({ message: "Internal Server Error" });
    } finally {
        client.release();
    }
};

// Delete Own Post (Registered Users)
const deletePost = async (req: Request<{ postId: string }, {}, {}>, res: Response) => {
    const userId = req.user!.id;
    const postId = Number(req.params.postId);

    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1 AND user_id = $2", [postId, userId]);
        if (postResult.rows.length === 0) {
            res.status(404).json({ message: "Post not found" });
            return;
        }

        await pool.query("DELETE FROM posts WHERE id = $1", [postId]);
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const viewUserPosts = async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);

    try {
        const result = await pool.query(`
            SELECT p.* ,
                u.id AS author_id,
                u.username AS author_username,
                u.profile_image AS author_profile_image,
                u.is_admin AS author_is_admin,
                u.registration_date AS author_registration_date,
                u.gender AS author_gender
            FROM posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE u.id = $1
            ORDER BY p.created_at DESC
            `, [userId]);
        res.status(200).json({ publicUserPosts: result.rows });
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export { viewAllPosts, viewPost, searchPosts, viewPostsByCategory, viewAllOwnPosts, createPost, deletePost, viewUserPosts };