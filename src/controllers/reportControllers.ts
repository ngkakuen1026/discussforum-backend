import pool from '../db/db';
import { Request, Response } from 'express';
import { ReportRequestBody } from '../types/reportTypes';

// Report content (post or comment)
const reportContent = async (req: Request<{ contentId: string }, {}, ReportRequestBody>, res: Response) => {
    const userId = req.user!.id;
    const contentId = Number(req.params.contentId);
    const { contentType, reason, customReason, additionalComments } = req.body;

    try {
        if (!reason) {
            return res.status(400).json({ message: "Reporting reason is required." });
        }

        if (reason === 'other' && !customReason) {
            return res.status(400).json({ message: "Custom reason is required when 'Other' is selected." });
        }

        const reportResult = await pool.query(
            `INSERT INTO reports (user_id, content_id, content_type, reason, custom_reason, additional_comments, created_at) 
             VALUES ($1, $2, $3::content_type, $4::report_reason, $5, $6, NOW()) RETURNING *`,
            [userId, contentId, contentType, reason, (reason === 'other') ? customReason : null, additionalComments]
        );

        return res.status(201).json({
            message: "Report submitted successfully.",
            report: reportResult.rows[0],
        });
    } catch (error) {
        console.error("Error reporting content:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export { reportContent };