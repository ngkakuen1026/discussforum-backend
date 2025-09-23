import { NextFunction, Request, Response } from "express";

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    if (!user?.is_admin) {
        res.status(403).json({ message: "Forbidden, No access right" });
        return;
    }
    next();
}