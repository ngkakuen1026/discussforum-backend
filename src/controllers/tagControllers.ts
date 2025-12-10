import { Request, Response } from 'express';
import pool from '../db/db';

const getTags = async (req: Request, res: Response) => {
    try {
        const tagsResult = await pool.query("SELECT * FROM tags WHERE approved = TRUE");
        res.status(200).json({
            message: "Tag fetched successfully",
            tags: tagsResult.rows
        });
    } catch (error) {
        console.error("Error fetching tags:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const getPostTags = async (req: Request, res: Response) => {
    const { postId } = req.params;

    try {
        const result = await pool.query(`
        SELECT tags.id, tags.name
        FROM post_tags
        JOIN tags ON post_tags.tag_id = tags.id
        WHERE post_tags.post_id = $1 AND tags.approved = TRUE
    `, [postId]);

        res.json({ tags: result.rows });
    } catch (error) {
        console.error("Error fetching tags:", error);
        res.status(500).json({ message: "Failed to fetch tags" });
    }
};

export { getTags, getPostTags };