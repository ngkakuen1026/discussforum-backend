import pool from '../db/db';
import { Request, Response } from 'express';
import { CreatePostRequestBody } from '../types/postTypes';
import { createNotification } from '../utils/notificationUtils';
import { formatDate } from '../utils/dateUtils';
import { extractUserMentions } from '../utils/extractUserMentions';

// View All Posts
const viewAllPosts = async (req: Request, res: Response) => {
    const userId = req.user?.id;

    try {
        let blockedUserIds = [];
        if (userId) {
            const blockedResult = await pool.query(
                "SELECT blocked_id FROM user_blocked WHERE blocker_id = $1",
                [userId]
            );
            blockedUserIds = blockedResult.rows.map(row => row.blocked_id);
        }

        const postsResult = await pool.query(
            `
            SELECT * FROM posts 
            ${userId && blockedUserIds.length > 0 ? "WHERE user_id != $1 AND user_id NOT IN (SELECT blocked_id FROM user_blocked WHERE blocker_id = $1)" : ""}
            ORDER BY created_at DESC
            `,
            userId ? [userId] : []
        );

        res.status(200).json({ posts: postsResult.rows });
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// View Single Post
const viewPost = async (req: Request<{ postId: string }, {}, {}>, res: Response) => {
    const postId = req.params.postId;
    try {
        const postResult = await pool.query("SELECT * FROM posts WHERE id = $1", [postId]);
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
        const searchResult = await pool.query(`SELECT * FROM posts WHERE posts.title ILIKE $1 OR posts.content ILIKE $1`, [`%${query}%`]);
        res.status(200).json({ posts: searchResult.rows });
    } catch (error) {
        console.error("Error searching posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

// View All Posts by Category
const viewPostsByCategory = async (req: Request<{ categoryId: string }, {}, {}>, res: Response) => {
    const categoryId = req.params.categoryId;

    try {
        const result = await pool.query("SELECT * FROM posts WHERE category_id = $1", [categoryId]);
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

    try {
        if (!title || !content || !categoryId) {
            res.status(400).json({ message: "Title, content and categoryId are required." });
            return;
        }

        const categoryResult = await pool.query(
            "SELECT * FROM categories WHERE id = $1",
            [categoryId]
        )

        if (categoryResult.rowCount === 0) {
            res.status(404).json({ message: "Category not found" });
            return;
        }

        const newPost = await pool.query(
            "INSERT INTO posts (user_id, title, content, category_id, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
            [userId, title, content, categoryId]
        );

        let tagId = null;

        if (tag) {
            const tagResult = await pool.query(
                "SELECT * FROM tags WHERE name = $1",
                [tag]
            );

            if (tagResult.rows.length > 0) {
                tagId = tagResult.rows[0].id;
            } else {
                const newTagResult = await pool.query(
                    "INSERT INTO tags (name, approved, user_id) VALUES ($1, FALSE, $2) RETURNING *",
                    [tag, userId]
                );
                tagId = newTagResult.rows[0].id; 
            }

            // Link the tag to the post
            await pool.query(
                "INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)",
                [newPost.rows[0].id, tagId]
            );
        }

        // Retrieve all the followers of the user who created the post 
        const followers = await pool.query(
            "SELECT follower_id FROM user_following WHERE followed_id = $1",
            [userId]
        );

        const userResult = await pool.query(
            "SELECT username FROM users WHERE id = $1",
            [userId]
        )

        const userName = userResult.rows[0]?.username;
        const postCreatedTime = formatDate(newPost.rows[0].created_at);

        for (const follower of followers.rows) {
            const followerId = follower.follower_id;
            const notificationMessage = `User ${userName} created a new post: ${title} at ${postCreatedTime}.`;

            await createNotification(followerId, notificationMessage, 'post');
        }

        const mentions = extractUserMentions(content);

        for (const username of mentions) {
            const userResult = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
            if (userResult.rows.length > 0) {
                const mentionedUserId = userResult.rows[0].id;
                const notificationMessage = `User ${userName} mentioned you in a post: "${title}".`;
                await createNotification(mentionedUserId, notificationMessage, 'mention', newPost.rows[0].id);
            }
        }

        res.status(201).json({
            message: "Post created successfully",
            post: newPost.rows[0],
        });
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Delete Own Post (Registered Users)
const deletePost = async (req: Request<{ postId: string }, {}, {}>, res: Response) => {
    const userId = req.user!.id;
    const postId = req.params.postId;

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

export { viewAllPosts, viewPost, searchPosts, viewPostsByCategory, viewAllOwnPosts, createPost, deletePost };