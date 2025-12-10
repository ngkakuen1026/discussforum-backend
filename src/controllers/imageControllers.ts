import { Request, Response } from 'express';
import cloudinary from "../config/cloudinary";
import fs from "fs";

export const uploadImage = async (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });

        const type = (req.body.type as string) || "post";
        if (!["post", "comment"].includes(type)) {
            return res.status(400).json({ message: "Invalid type" });
        }

        const folder = type === "comment" ? "comments" : "posts";

        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `/discuss-forum/${folder}`,
            transformation: [
                { width: 1200, crop: "limit" },
                { quality: "auto:good" },
            ],
        });

        fs.unlinkSync(req.file.path);

        res.json({ url: result.secure_url });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: "Upload failed" });
    }
};