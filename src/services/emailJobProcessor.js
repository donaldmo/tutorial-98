import Staff from '../models/Staff.js';
import Setting from '../models/Setting.js';
import {
  EMAIL_JOB_TYPES,
} from '../jobs/emailQueue.js';
import { adminWelcomeEmailTemplate } from '../utils/email-templates/admin-welcome-email-template.js';
import {
  sendEmailMessage,
  sendOrgInviteEmail,
  sendResetPasswordPinEmail,
  sendStaffWelcomeEmail,
  sendVerificationPinEmail,
} from './emailService.js';

const applyStaffSendFailure = async ({ staffId, message }) => {
  await Staff.findByIdAndUpdate(staffId, {
    $set: {
      welcome_email_error: message,
      welcome_email_error_at: new Date(),
    },
  });
};

const applyStaffSendSuccess = async ({ staffId }) => {
  await Staff.findByIdAndUpdate(staffId, {
    $set: {
      welcome_email_sent_at: new Date(),
      welcome_email_error: null,
      welcome_email_error_at: null,
    },
  });
};

const processStaffWelcome = async ({ staffId, organisationId, password, acceptLink }) => {
  const staff = await Staff.findById(staffId).lean();
  if (!staff) throw new Error('Staff not found for welcome email job');

  const orgSettings = await Setting.findOne({ organisation_id: organisationId }).lean().catch(() => null);
  const emailResult = await sendStaffWelcomeEmail({
    to: staff.email,
    name: staff.name,
    email: staff.email,
    password,
    firmName: orgSettings?.firm_name || undefined,
    logoUrl: orgSettings?.logo_url || null,
    primaryColor: orgSettings?.primary_color || null,
    accentColor: orgSettings?.accent_color || null,
    acceptLink: acceptLink || null,
    orgEmailConfig: orgSettings?.emailConfig || null,
  });

  if (!emailResult?.sent) {
    const message = emailResult?.error || emailResult?.reason || 'Email delivery failed';
    await applyStaffSendFailure({ staffId, message });
    throw new Error(message);
  }

  await applyStaffSendSuccess({ staffId });
};

const processOrgAdminInvite = async ({ organisationId, email, token, invitedByName, organisationName }) => {
  const orgSettings = await Setting.findOne({ organisation_id: organisationId }).lean().catch(() => null);
  const emailResult = await sendOrgInviteEmail({
    to: email,
    token,
    invitedByName,
    organisationName,
    firmName: orgSettings?.firm_name || organisationName,
    logoUrl: orgSettings?.logo_url || null,
    primaryColor: orgSettings?.primary_color || null,
    accentColor: orgSettings?.accent_color || null,
    orgEmailConfig: orgSettings?.emailConfig || null,
  });

  if (!emailResult?.sent) {
    throw new Error(emailResult?.error || emailResult?.reason || 'Email delivery failed');
  }
};

const processOrgVerificationPin = async ({ email, name, pin, expiryLabel, firmName }) => {
  const emailResult = await sendVerificationPinEmail({
    to: email,
    name,
    pin,
    expiryLabel,
    firmName,
  });

  if (!emailResult?.sent) {
    throw new Error(emailResult?.error || emailResult?.reason || 'Email delivery failed');
  }
};

const processAdminSeedWelcome = async ({ email, name, password, orgName }) => {
  const emailResult = await sendEmailMessage({
    to: String(email),
    subject: 'Welcome to Brandmo Workflow',
    html: adminWelcomeEmailTemplate({
      name,
      email,
      password,
      orgName,
    }),
  });

  if (!emailResult?.sent) {
    throw new Error(emailResult?.error || emailResult?.reason || 'Email delivery failed');
  }
};

const processResetPasswordPin = async ({ email, name, pin, expiryLabel, accountType, redirectPath }) => {
  const emailResult = await sendResetPasswordPinEmail({
    to: email,
    name,
    pin,
    expiryLabel,
    accountType,
    redirectPath,
  });

  console.log(':: processResetPasswordPin :: Email result for %s: %o', email, emailResult);

  if (!emailResult?.sent) {
    throw new Error(emailResult?.error || emailResult?.reason || 'Email delivery failed');
  }
};

export const processEmailJob = async ({ jobType, payload }) => {
  if (jobType === EMAIL_JOB_TYPES.STAFF_WELCOME || jobType === EMAIL_JOB_TYPES.STAFF_WELCOME_RESEND) {
    await processStaffWelcome(payload);
    return;
  }

  if (jobType === EMAIL_JOB_TYPES.ORG_ADMIN_INVITE) {
    await processOrgAdminInvite(payload);
    return;
  }

  if (jobType === EMAIL_JOB_TYPES.ORG_VERIFICATION_PIN) {
    await processOrgVerificationPin(payload);
    return;
  }

  if (jobType === EMAIL_JOB_TYPES.ADMIN_SEED_WELCOME) {
    await processAdminSeedWelcome(payload);
    return;
  }

  if (jobType === EMAIL_JOB_TYPES.ADMIN_FORGOT_PASSWORD_PIN || jobType === EMAIL_JOB_TYPES.STAFF_FORGOT_PASSWORD_PIN) {
    await processResetPasswordPin(payload);
    return;
  }

  throw new Error(`Unsupported email job type: ${jobType}`);
};