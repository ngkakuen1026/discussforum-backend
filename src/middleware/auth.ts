import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload as JWTDecodedPayload, VerifyErrors } from "jsonwebtoken";
import { JwtPayload } from "../types/jwtPayLoadTypes";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const isAuthenticated = ( req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies.accessToken;

  if (!token) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  if (!process.env.ACCESS_TOKEN_SECRET) {
    res.status(500).json({ message: "ACCESS_TOKEN_SECRET is not defined" });
    return;
  }

  jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET as string,
    (err: VerifyErrors | null, decoded: string | JWTDecodedPayload | undefined) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          res.status(401).json({ message: "Access token expired" });
        } else {
          res.status(403).json({ message: "Token no longer valid" });
        }
        return;
      }

      req.user = decoded as JwtPayload;
      next();
    }
  );
};

export { isAuthenticated };