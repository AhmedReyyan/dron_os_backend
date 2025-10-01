import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../env";
const authRoutes = express.Router();
const prisma = new PrismaClient();

authRoutes.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    await prisma.user.findMany({
      
    })
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword },
    });
    res.json({ message: "Signup successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

authRoutes.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

authRoutes.get("/me", async (req, res) => {
  try {
    const token = req.body.token;
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});
export default authRoutes;
