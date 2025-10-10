import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/jwtPayLoadTypes";

const attachUserIfExists = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.accessToken;
  if (token && process.env.ACCESS_TOKEN_SECRET) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET) as JwtPayload;
      req.user = decoded;
    } catch {
        
    }
  }
  next();
};

export default attachUserIfExists;