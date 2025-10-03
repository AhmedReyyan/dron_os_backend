export const resetPasswordOtpTemplate = (otp: number) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f6f8;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 50px auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    h2 {
      color: #333333;
    }
    p {
      color: #555555;
      line-height: 1.5;
    }
    .otp {
      display: inline-block;
      margin: 20px 0;
      padding: 15px 25px;
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 5px;
      background-color: #f1f1f1;
      border-radius: 6px;
      color: #333333;
    }
    .footer {
      margin-top: 30px;
      font-size: 12px;
      color: #888888;
    }
    .button {
      display: inline-block;
      margin-top: 20px;
      padding: 12px 25px;
      background-color: #4CAF50;
      color: white;
      text-decoration: none;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Reset Your Password</h2>
    <p>Hello,</p>
    <p>We received a request to reset your password. Use the OTP below to reset it. This OTP is valid for 10 minutes.</p>

    <div class="otp">${otp}</div>

    <p>If you did not request a password reset, please ignore this email.</p>

    <a href="https://yourwebsite.com/reset-password" class="button">Reset Password</a>

    <div class="footer">
      &copy; 2025 Your Company. All rights reserved.
    </div>
  </div>
</body>
</html>
`;
};
