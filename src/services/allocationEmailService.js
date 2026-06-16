import Organisation from '../models/Organisation.js';
import Setting from '../models/Setting.js';
import Staff from '../models/Staff.js';
import Admin from '../models/Admin.js';
import { sendEmailMessage } from './emailService.js';
import {
  allocationAssignedEmailTemplate,
  allocationComponentCompletedEmailTemplate,
  allocationReassignedEmailTemplate,
} from '../utils/email-templates/allocation-notification-email-template.js';
import { createNotification } from '../controllers/notificationsController.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resolveBaseUrl = () => String(process.env.APP_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');

const buildAllocationLink = ({ jobId, allocationId }) => {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return null;
  if (jobId) return `${baseUrl}/jobs/${encodeURIComponent(String(jobId))}`;
  if (allocationId) return `${baseUrl}/allocations/${encodeURIComponent(String(allocationId))}`;
  return baseUrl;
};

const buildWarning = ({ code, message, allocationId = null, staffId = null, reason = null, error = null }) => ({
  code,
  message,
  allocationId: allocationId ? String(allocationId) : null,
  staffId: staffId ? String(staffId) : null,
  reason,
  error,
});

const getBrandingPayload = async (organisationId) => {
  if (!organisationId) {
    return {
      organisation: null,
      settings: null,
    };
  }

  const [organisation, settings] = await Promise.all([
    Organisation.findById(organisationId).lean(),
    Setting.findOne({ organisation_id: organisationId }).lean(),
  ]);

  return { organisation, settings };
};

export const sendAllocationNotificationEmail = async ({
  allocation,
  job,
  staff,
  actorName,
  organisationId,
  variant = 'assigned',
  previousStaffName = null,
}) => {
  const staffId = staff?._id || allocation?.staff_id || null;
  const allocationId = allocation?._id || null;
  const recipient = String(staff?.email || '').trim().toLowerCase();

  if (!recipient) {
    return {
      sent: false,
      warning: buildWarning({
        code: 'ALLOCATION_EMAIL_RECIPIENT_MISSING',
        message: 'Allocation saved but email was not sent because staff has no email address.',
        allocationId,
        staffId,
        reason: 'missing_recipient',
      }),
    };
  }

  if (!EMAIL_PATTERN.test(recipient)) {
    return {
      sent: false,
      warning: buildWarning({
        code: 'ALLOCATION_EMAIL_RECIPIENT_INVALID',
        message: 'Allocation saved but email was not sent because staff email is invalid.',
        allocationId,
        staffId,
        reason: 'invalid_recipient',
      }),
    };
  }

  const { organisation, settings } = await getBrandingPayload(organisationId);
  const firmName = settings?.firm_name || organisation?.firm_name || 'Brendmo Workflow';
  const payload = {
    recipientName: staff?.name || 'there',
    actorName: actorName || 'Your manager',
    previousStaffName: previousStaffName || null,
    jobName: job?.name || 'Untitled Job',
    clientName: job?.client_name || 'Unknown Client',
    jobType: job?.job_type_label || 'General',
    month: allocation?.month || null,
    percentage: Number(allocation?.percentage || 0),
    adjustedHours: Number(allocation?.adjusted_hours || 0),
    allocatedFee: Number(allocation?.allocated_fee || 0),
    deadline: job?.deadline || null,
    notes: allocation?.notes || null,
    currency: settings?.currency || 'ZAR',
    appLink: buildAllocationLink({ jobId: job?._id, allocationId }),
    firmName,
    logoUrl: settings?.logo_url || null,
    primaryColor: settings?.primary_color || null,
    accentColor: settings?.accent_color || null,
    supportEmail: settings?.company_email || organisation?.email || null,
    supportPhone: settings?.company_phone || organisation?.phone || null,
    supportWebsite: settings?.company_website || null,
  };

  const html = variant === 'reassigned'
    ? allocationReassignedEmailTemplate(payload)
    : allocationAssignedEmailTemplate(payload);

  const subjectPrefix = variant === 'reassigned' ? 'Reassigned allocation' : 'New allocation';
  const result = await sendEmailMessage({
    to: recipient,
    subject: `${subjectPrefix}: ${payload.jobName}`,
    html,
    orgEmailConfig: settings?.emailConfig || null,
  });

  if (result?.sent) {
    return { sent: true, warning: null };
  }

  return {
    sent: false,
    warning: buildWarning({
      code: 'ALLOCATION_EMAIL_SEND_FAILED',
      message: 'Allocation saved but notification email could not be delivered.',
      allocationId,
      staffId,
      reason: result?.reason || 'delivery_failed',
      error: result?.error || null,
    }),
  };
};

// Helper function to send acceptance confirmation notification
export const sendAllocationAcceptanceNotification = async ({
  allocation,
  job,
  organisationId,
}) => {
  const staff = await Staff.findById(allocation?.staff_id).lean();
  if (!staff) {
    return {
      sent: false,
      warning: {
        code: 'ALLOCATION_ACCEPTANCE_NOTIFICATION_FAILED',
        message: 'Could not find staff member for acceptance notification',
      },
    };
  }

  const activeAdmins = await Admin.find({
    organisation_id: organisationId,
    status: 'active',
  }).lean();

  if (!activeAdmins.length) {
    return {
      sent: false,
      warning: {
        code: 'ALLOCATION_COMPLETION_ADMIN_MISSING',
        message: 'No active admins were found for completion notification.',
      },
    };
  }

  const jobName = job?.name || 'Untitled Job';
  const completionMessage = `${staff.name || 'A staff member'} closed an allocated component for ${jobName}.`;

  for (const admin of activeAdmins) {
    try {
      await createNotification({
        userId: admin._id,
        organisationId,
        type: 'allocation_component_completed',
        title: 'Allocated Component Closed',
        message: completionMessage,
        relatedJobId: job?._id,
        relatedAllocationId: allocation?._id,
      });
    } catch (notificationError) {
      console.warn('[allocationEmailService] Failed to create completion notification:', notificationError);
    }

    try {
      await sendAllocationAcceptanceEmail({
        allocation,
        job,
        staff,
        admin,
        organisationId,
      });
    } catch (err) {
      console.warn('[allocationEmailService] Failed to send completion email:', err?.message || err);
    }
  }

  return { sent: true, warning: null };
};

// Email to admin when staff closes a component on an allocation
export const sendAllocationAcceptanceEmail = async ({ allocation, job, staff, admin, organisationId }) => {
  const recipient = (admin?.email || '').trim().toLowerCase();
  if (!recipient) {
    return {
      sent: false,
      warning: buildWarning({
        code: 'ALLOCATION_ACCEPTANCE_EMAIL_RECIPIENT_MISSING',
        message: 'Acceptance notification email was not sent because admin email is missing.',
        allocationId: allocation?._id,
        staffId: staff?._id,
        reason: 'missing_recipient',
      }),
    };
  }

  if (!EMAIL_PATTERN.test(recipient)) {
    return {
      sent: false,
      warning: buildWarning({
        code: 'ALLOCATION_ACCEPTANCE_EMAIL_RECIPIENT_INVALID',
        message: 'Acceptance notification email was not sent because admin email is invalid.',
        allocationId: allocation?._id,
        staffId: staff?._id,
        reason: 'invalid_recipient',
      }),
    };
  }

  const { organisation, settings } = await getBrandingPayload(organisationId);
  const firmName = settings?.firm_name || organisation?.firm_name || 'Brendmo Workflow';
  const jobName = job?.name || 'Untitled Job';
  const html = allocationComponentCompletedEmailTemplate({
    recipientName: admin?.name || 'there',
    staffName: staff?.name || 'A staff member',
    jobName,
    clientName: job?.client_name || 'Unknown Client',
    jobType: job?.job_type_label || 'General',
    completedAt: allocation?.completed_at || new Date(),
    percentage: Number(allocation?.percentage || 0),
    adjustedHours: Number(allocation?.adjusted_hours || 0),
    deadline: job?.deadline || null,
    appLink: buildAllocationLink({ jobId: job?._id, allocationId: allocation?._id }),
    firmName,
    logoUrl: settings?.logo_url || null,
    primaryColor: settings?.primary_color || null,
    accentColor: settings?.accent_color || null,
    supportEmail: settings?.company_email || organisation?.email || null,
    supportPhone: settings?.company_phone || organisation?.phone || null,
    supportWebsite: settings?.company_website || null,
  });

  const result = await sendEmailMessage({
    to: recipient,
    subject: `Allocated component closed: ${jobName}`,
    html,
    orgEmailConfig: settings?.emailConfig || null,
  });

  if (result?.sent) return { sent: true, warning: null };

  return {
    sent: false,
    warning: buildWarning({
      code: 'ALLOCATION_ACCEPTANCE_EMAIL_SEND_FAILED',
      message: 'Acceptance email could not be delivered.',
      allocationId: allocation?._id,
      staffId: staff?._id,
      reason: result?.reason || 'delivery_failed',
      error: result?.error || null,
    }),
  };
};
