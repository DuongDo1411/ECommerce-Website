import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Gửi mail dùng chung (tái dùng transporter sẵn có, đừng tạo connection pool thứ hai).
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}) {
  await transporter.sendMail({
    from: `"${opts.fromName ?? "Ecoshop"}" <${process.env.GMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

export async function sendDeliveryOtpEmail(email: string, otp: string) {
  await transporter.sendMail({
    from: `"Order Delivery" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Your Delivery OTP",
    html: `
      <div style="font-family:Arial,sans-serif">
        <h2>Delivery Verification</h2>
        <p>Your order delivery OTP is:</p>
        <h1 style="letter-spacing:4px">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
      </div>
    `,
  });
}
