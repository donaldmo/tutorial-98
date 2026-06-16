import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resolveResendClient = () => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
};

const resolveFromAddress = () => {
  const fromEmail = String(process.env.FROM_RESEND_EMAIL || '').trim();
  if (!fromEmail) {
    throw new Error('FROM_RESEND_EMAIL is not configured');
  }
  return `Brendmo <${fromEmail}>`;
};

/**
 * Service function to send emails using Resend.
 *
 * @param {string} to - Recipient email address(es), comma-separated if multiple.
 * @param {string} subject - Subject line of the email.
 * @param {string} html - HTML content of the email body.
 * @returns {Promise<Object>} - Resolves with Resend API response data on success.
 * @throws {Error} - Throws an error if the email fails to send or if there's an API error.
 *
 * Usage:
 * await resendService('recipient@example.com', 'Subject Line', '<p>Email body</p>');
 */
export const resendService = async (to, subject, html) => {
  try {
    const resend = resolveResendClient();

    const { data, error } = await resend.emails.send({
      from: resolveFromAddress(),
      to,
      subject,
      html,
    });

    if (error) {
      console.log(':: resendService :: API error details:', error);
      throw new Error(error.message);
    }

    console.log(':: resendService :: Email sent successfully to %s', to);
    return data;
  } catch (err) {
    console.error(':: resendService :: Error details:', err);
    throw err;
  }
};