import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

// export const systemEmailTransporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: Number(process.env.SMTP_PORT) || 465,
//   secure: process.env.SMTP_SECURE === 'true',
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS,
//   },
//   tls: {
//     rejectUnauthorized: false,
//   },
// });

export const systemEmailTransporter = nodemailer.createTransport({
  host: 'mail.codegarden.co.za',
  port: 587, // or 587
  secure: false, // use SSL
  auth: {
    user: 'donald@codegarden.co.za',
    pass: '!@passw0$1234',
  },
  tls: {
    rejectUnauthorized: false, // Disables certificate verification
  },
});

// custom transporter with setting from the database configuration
export async function createCustomEmailTransporter(config) {
  if (!config || !config.host || !config.port || !config.auth || !config.auth.user || !config.auth.pass) {
    throw new Error('Invalid email configuration');
  }

  return nodemailer.createTransport({
    host: config.host,
    port: Number(config.port),
    secure: true,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}