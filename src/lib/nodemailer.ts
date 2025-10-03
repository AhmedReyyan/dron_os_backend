import nodemailer from "nodemailer";
import { SENDER_EMAIL, SENDER_PASSWORD } from "../env";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_PASSWORD,
  },
});

export const sendEmail = async (mailOptions: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) => {
  try {
    const info = await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
