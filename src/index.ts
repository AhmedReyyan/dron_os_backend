import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
export const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import authRouter from "./routes/auth";
dotenv.config();

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Create user
app.use("/auth", authRouter);

// Get users
app.get("/users", async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.get("/health", (req, res) => {
  res.json({ message: "Server is running!" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
