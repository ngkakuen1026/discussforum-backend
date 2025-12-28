import pool from '../db/db';
import { Request, Response } from 'express';
import { CreatePostDraftRequestBody } from '../types/postTypes';

const viewOwnPostDrafts = async (req: Request, res: Response) => {
    const userId = req.user?.id;

    try {
        const result = await pool.query(
            `SELECT id, title, content, category_id AS "categoryId", tag, updated_at AS "updatedAt"
            FROM post_drafts
            WHERE user_id = $1
            ORDER BY updated_at DESC
            LIMIT 10`, [userId]
        )

        res.status(200).json({ drafts: result.rows });
    } catch (error) {
        console.error("Load drafts error:", error);
        res.status(500).json({ message: "Failed to load drafts" });
    }
}

const viewSinglePostDraft = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const draftId = parseInt(req.params.draftId);

    try {
        const result = await pool.query(
            `SELECT 
            id, title, content, category_id AS "categoryId", tag, updated_at AS "updatedAt"
            FROM post_drafts 
            WHERE id = $1 AND user_id = $2`,
            [draftId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Draft not found" });
        }

        res.status(200).json({ draft: result.rows[0] });
    } catch (error) {
        console.error("Load single draft error:", error);
        res.status(500).json({ message: "Failed to load draft" });
    }
}

const createDraft = async (req: Request<{}, {}, CreatePostDraftRequestBody>, res: Response) => {
    const userId = req.user!.id;
    const { title, content, categoryId, tag } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO post_drafts 
            (user_id, title, content, category_id, tag)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING 
            id, title, content, category_id AS "categoryId", tag, updated_at AS "updatedAt"`,
            [userId, title || null, content || "", categoryId || null, tag || null]
        );

        res.json({
            message: "Draft saved",
            draft: result.rows[0],
        });
    } catch (error) {
        console.error("Save draft error:", error);
        res.status(500).json({ message: "Failed to save draft" });
    }
};

const updateDraft = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const draftId = Number(req.params.draftId);
    const { title, content, categoryId, tag } = req.body;

    try {
        const result = await pool.query(
            `UPDATE post_drafts 
            SET title = $1, content = $2, category_id = $3, tag = $4, updated_at = NOW()
            WHERE id = $5 AND user_id = $6
            RETURNING id, title, content, category_id AS "categoryId", tag, updated_at AS "updatedAt"`,
            [title || null, content || "", categoryId || null, tag || null, draftId, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Draft not found" });
        }

        res.json({ draft: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Failed to update draft" });
    }
};

const deleteMultiplePostDrafts = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { draftIds } = req.body;

    if (!Array.isArray(draftIds) || draftIds.length === 0) {
        res.status(400).json({ message: "Invalid drafts IDs" });
        return;
    }

    try {
        const result = await pool.query(
            "DELETE FROM post_drafts WHERE user_id = $1 AND id = ANY($2::int[])",
            [userId, draftIds]
        );

        res.status(200).json({ message: "Drafts deleted", deletedCount: result.rowCount });
    } catch (error) {
        console.error("Save draft error:", error);
        res.status(500).json({ message: "Failed to delete draft" });
    }
};

export { viewOwnPostDrafts, viewSinglePostDraft, createDraft, updateDraft, deleteMultiplePostDrafts };
