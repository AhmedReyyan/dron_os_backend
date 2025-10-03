import express, { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { JWT_SECRET, SENDER_EMAIL } from "../env";
import { generateOtp } from "../utils/otpGenerator";
import { resetPasswordOtpTemplate } from "../static/resetPasswordTemplate";
import { sendEmail } from "../lib/nodemailer";
const authRouter = Router();
const prisma = new PrismaClient();

const getUserFromToken = async (token: string) => {
  const decoded = jwt.verify(token, JWT_SECRET) as any;
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });
  return user;
};

authRouter.post("/me", async (req, res) => {
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

authRouter.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
      },
    });

    if (!user) throw new Error("user not found!");

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: {
        email: user.email,
      },
      data: {
        password: hashedPassword,
      },
    });
    // generate password reset link and sent to user
    res.status(200).json({ message: "sent password reset email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

authRouter.post("/verify-reset-password-request", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({
      where: {
        id: decoded.userId,
      },
      data: {
        password: hashedPassword,
      },
    });
    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

authRouter.post("/verify-otp", async (req, res) => {
  try {
    const { otp, email } = req.body;
    
    const user = await prisma.user.findUnique({
      where: {
        email,
        resetPasswordOtp: Number(otp),
      },
    });

    if (!user) {
      return res.status(401).json({ message: "invalid request" });
    }

    const newToken = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "5m",
    });
    res.status(200).json({ token: newToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

authRouter.post("/send-reset-password-mail", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const otp = generateOtp();
    const parseOtp = parseInt(otp);
    await prisma.user.update({
      where: {
        email,
      },
      data: {
        resetPasswordOtp: parseOtp,
      },
    });
    const html = resetPasswordOtpTemplate(Number(otp));
    const mailOptions = {
      from: SENDER_EMAIL, // sender
      to: user.email, // recipient
      subject: "Password reset OTP",
      text: "Password reset OTP",
      html: html,
    };
    console.log({ otp });

    // await sendEmail(mailOptions);
    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    await prisma.user.findMany({});
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

authRouter.post("/login", async (req, res) => {
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
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "12h",
    });
    res.json({ message: "Login successful", token, email, id: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: (error as Error).message });
  }
});

export default authRouter;
