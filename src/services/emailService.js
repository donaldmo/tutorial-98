import { resendService } from './resendService.js';
import { verifyPinEmailTemplate } from '../utils/email-templates/verify-pin-email-template.js';
import { resetPasswordPinEmailTemplate } from '../utils/email-templates/reset-password-pin-email-template.js';
import { staffWelcomeEmailTemplate } from '../utils/email-templates/staff-welcome-email-template.js';
import { adminInviteEmailTemplate } from '../utils/email-templates/admin-invite-email-template.js';
import { paymentSuccessEmailTemplate } from '../utils/email-templates/payment-success-email-template.js';

const buildLink = (path, token) => {
  const base = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  return `${base}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

const sendWithTransport = async ({ to, subject, html, orgEmailConfig = null }) => {
  void orgEmailConfig;
  const recipient = String(to || '').toLowerCase().trim();
  if (!recipient) return { sent: false, reason: 'missing_recipient' };

  try {
    const info = await resendService(recipient, subject, html);
    return {
      sent: true,
      messageId: info?.id || info?.messageId || null,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[emailService] Failed to send email to ${recipient}: ${err.message}`);
    return { sent: false, reason: 'resend_error', error: err.message };
  }
};

export const sendEmailMessage = ({ to, subject, html, orgEmailConfig = null }) => sendWithTransport({
  to,
  subject,
  html,
  orgEmailConfig,
});

export const sendVerificationEmail = ({ to, token, name, orgEmailConfig = null }) => {
  const link = buildLink('/auth/verify?verify_token=true', token);
  return sendWithTransport({
    to,
    subject: 'Verify your email address',
    html: `<p>Hi ${name || 'there'},</p><p>Please verify your email by clicking the button below:</p><p><a href="${link}">Verify email</a></p><p>If you did not create this account, ignore this email.</p>`,
    orgEmailConfig,
  });
};

export const sendVerificationPinEmail = async ({ to, name, pin, firmName, expiryLabel, orgEmailConfig = null }) => {
  const recipient = String(to || '').toLowerCase().trim();
  if (!recipient) return { sent: false, reason: 'missing_recipient' };

  const subject = `${pin} is your ${firmName || 'Brandmo Workflow'} verification code`;
  const html = verifyPinEmailTemplate({ name, pin, firmName, expiryLabel });

  console.log(`[emailService] Sending verification PIN email to ${recipient} with subject "${subject}"`);
  const result = await sendWithTransport({ to: recipient, subject, html, orgEmailConfig });
  if (!result.sent) {
    console.warn(`[emailService] Failed to send verification email to ${recipient}: ${result.error || result.reason}`);
  }
  return result;
};

export const sendResetPasswordPinEmail = async ({
  to,
  name,
  pin,
  expiryLabel,
  accountType = 'staff',
  redirectPath = '/auth/staff-reset-password',
  firmName,
  orgEmailConfig = null,
}) => {
  const recipient = String(to || '').toLowerCase().trim();
  if (!recipient) return { sent: false, reason: 'missing_recipient' };

  const subject = `${pin} is your ${firmName || 'Brendmo Workflow'} password reset code`;
  const html = resetPasswordPinEmailTemplate({
    name,
    pin,
    expiryLabel,
    accountType,
    redirectPath,
    firmName,
  });

  const result = await sendWithTransport({ to: recipient, subject, html, orgEmailConfig });
  if (!result.sent) {
    console.warn(`[emailService] Failed to send password reset PIN email to ${recipient}: ${result.error || result.reason}`);
  }
  return result;
};

export const sendResetPasswordEmail = ({ to, token, name, orgEmailConfig = null }) => {
  const link = buildLink('/auth/login?reset_token=true', token);
  return sendWithTransport({
    to,
    subject: 'Reset your password',
    html: `<p>Hi ${name || 'there'},</p><p>We received a request to reset your password.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    orgEmailConfig,
  });
};

export const sendWelcomeEmail = ({ to, name, organisationName, orgEmailConfig = null }) =>
  sendWithTransport({
    to,
    subject: 'Welcome to Brendmo Workflow',
    html: `<p>Hi ${name || 'there'},</p><p>Welcome to Brendmo Workflow${organisationName ? ` for <strong>${organisationName}</strong>` : ''}.</p><p>Your account is ready.</p>`,
    orgEmailConfig,
  });

export const sendStaffWelcomeEmail = ({ to, name, email, password, firmName, logoUrl = null, primaryColor = null, accentColor = null, acceptLink = null, orgEmailConfig = null }) =>
  sendWithTransport({
    to,
    subject: `Welcome to ${firmName || 'Brendmo Workflow'} — activate your account`,
    html: staffWelcomeEmailTemplate({ name, email, password, firmName, logoUrl, primaryColor, accentColor, acceptLink }),
    orgEmailConfig,
  });

export const sendOrgInviteEmail = ({ to, token, invitedByName, organisationName, firmName = null, logoUrl = null, primaryColor = null, accentColor = null, orgEmailConfig = null }) => {
  const base = String(process.env.APP_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
  const acceptLink = `${base}/auth/login?invite_token=true&token=${encodeURIComponent(token)}`;
  return sendWithTransport({
    to,
    subject: `You're invited to join ${organisationName || 'an organisation'} as an admin`,
    html: adminInviteEmailTemplate({
      invitedByName: invitedByName || 'Organisation admin',
      organisationName: organisationName || 'your organisation',
      acceptLink,
      firmName: firmName || organisationName || 'Brendmo Workflow',
      logoUrl,
      primaryColor,
      accentColor,
    }),
    orgEmailConfig,
  });
};

export const sendPaymentSuccessEmail = ({
  to,
  name,
  organisationName,
  planName,
  billingCycle,
  amountLabel,
  reference,
  nextRenewalLabel,
  orgEmailConfig = null,
}) => {
  const base = String(process.env.APP_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
  const settingsUrl = `${base}/app/settings?tab=subscription`;
  return sendWithTransport({
    to,
    subject: 'Your subscription payment was successful',
    html: paymentSuccessEmailTemplate({
      name,
      organisationName,
      planName,
      billingCycle,
      amountLabel,
      reference,
      nextRenewalLabel,
      settingsUrl,
    }),
    orgEmailConfig,
  });
};
