import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import adminRoutes from "./routes/adminRoutes";
import postRoutes from "./routes/postRoutes";
import commentRoutes from "./routes/commentRoutes";
import parentCategoriesRoutes from "./routes/parentCategoryRoutes";
import categoriesRoutes from "./routes/categoryRoutes";
import userFollowingRoutes from "./routes/userFollowerRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import reportRoutes from "./routes/reportRoutes";
import userBlockedRoutes from "./routes/userBlockedRoutes"

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT;

//Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Base API path
const API_BASE_PATH = "/api/v1";

// Routes
app.use(`${API_BASE_PATH}/admin`, adminRoutes)
app.use(`${API_BASE_PATH}/auth`, authRoutes);
app.use(`${API_BASE_PATH}/users`, userRoutes);
app.use(`${API_BASE_PATH}/posts`, postRoutes);
app.use(`${API_BASE_PATH}/comments`, commentRoutes);
app.use(`${API_BASE_PATH}/parent-categories`, parentCategoriesRoutes);
app.use(`${API_BASE_PATH}/categories`, categoriesRoutes);
app.use(`${API_BASE_PATH}/user-following`, userFollowingRoutes);
app.use(`${API_BASE_PATH}/notifications`, notificationRoutes);
app.use(`${API_BASE_PATH}/reports`, reportRoutes);
app.use(`${API_BASE_PATH}/user-blocked`, userBlockedRoutes);

app.get("/health", (req: Request, res: Response) => {
  res.status(200).send({ message: "Server is healthy!!!" });
  console.log("Server is healthy!!!");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});