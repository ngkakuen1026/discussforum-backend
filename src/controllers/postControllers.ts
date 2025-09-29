import pool from '../db/db';
import { Request, Response } from 'express';
import { CreatePostRequestBody } from '../types/postTypes';

// View All Posts
const viewAllPosts = async (req: Request, res: Response) => {
    try {
        const postsResult = await pool.query("SELECT * FROM posts ORDER BY created_at DESC");
        res.status(200).json({ posts: postsResult.rows });
    } catch (error) {
        console.error("Error fetching posts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

// View Single Post
const viewPost = async (req: Request<{postId: string}, {}, {}>, res: Response) => {
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
    const { title, content, categoryId } = req.body;

    try {
        if (!title || !content) {
            res.status(400).json({ message: "Title and content are required." });
            return;
        }

        const newPost = await pool.query(
            "INSERT INTO posts (user_id, title, content, category_id, created_at) VALUES ($1, $2, $3, $4,NOW()) RETURNING *",
            [userId, title, content, categoryId]
        );

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

export { viewAllPosts, viewPost, searchPosts, viewAllOwnPosts, createPost, deletePost };