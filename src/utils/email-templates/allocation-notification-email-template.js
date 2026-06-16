const formatValue = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatCurrency = (value, currency = 'ZAR') => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency || 'ZAR',
    maximumFractionDigits: 2,
  }).format(amount);
};

const isLightColor = (hex) => {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
};

const allocationEmailLayout = ({
  title,
  preheader,
  headline,
  intro,
  ctaLabel,
  ctaUrl,
  details,
  note = null,
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
}) => {
  const year = new Date().getFullYear();
  const headerBg = primaryColor || '#171717';
  const accent = accentColor || '#e2704a';
  const headerTextColor = isLightColor(headerBg) ? '#171717' : '#fafafa';
  const headerSubColor = isLightColor(headerBg) ? '#555555' : '#a3a3a3';
  const footerLinks = [supportEmail, supportPhone, supportWebsite].filter(Boolean).join(' · ');

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${firmName}" style="height:40px;max-width:200px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<div style="display:inline-flex;align-items:center;gap:10px;">
        <span style="width:36px;height:36px;background-color:${accent};border-radius:8px;display:inline-block;vertical-align:middle;font-size:18px;font-weight:700;color:#fafafa;line-height:36px;text-align:center;">${String(firmName).charAt(0).toUpperCase()}</span>
        <span style="font-size:18px;font-weight:700;color:${headerTextColor};vertical-align:middle;letter-spacing:-0.3px;">${firmName}</span>
      </div>`;

  const detailRows = details.map((item) => `
    <tr>
      <td style="padding:10px 0;color:#737373;font-size:13px;vertical-align:top;width:38%;">${item.label}</td>
      <td style="padding:10px 0;color:#171717;font-size:14px;font-weight:600;vertical-align:top;">${item.value}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background-color: #f5f5f5;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #171717;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <span style="display:none;opacity:0;visibility:hidden;height:0;width:0;overflow:hidden;">${preheader}</span>
  <div style="width:100%;background:#f5f5f5;padding:28px 12px;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <div style="background:${headerBg};padding:30px 34px;text-align:center;">
        ${logoHtml}
        <div style="margin-top:10px;color:${headerSubColor};font-size:13px;">Workflow Notification</div>
      </div>
      <div style="padding:34px 34px 26px;">
        <h1 style="margin:0 0 10px;font-size:24px;letter-spacing:-0.4px;color:#171717;">${headline}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#404040;">${intro}</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e5e5e5;background:#fafafa;border-radius:10px;padding:0 18px;">
          <tbody>
            ${detailRows}
          </tbody>
        </table>

        ${note ? `<div style="margin-top:18px;padding:12px 14px;background:#fff8f6;border-left:3px solid ${accent};font-size:13px;line-height:1.6;color:#595959;">${note}</div>` : ''}

        ${ctaUrl ? `<div style="text-align:center;margin:26px 0 10px;"><a href="${ctaUrl}" style="display:inline-block;background:${accent};color:#fafafa;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${ctaLabel}</a></div>` : ''}
      </div>
      <div style="background:#f5f5f5;border-top:1px solid #e5e5e5;padding:18px 34px;text-align:center;color:#737373;font-size:12px;line-height:1.6;">
        Sent by ${firmName}<br />
        ${footerLinks ? `${footerLinks}<br />` : ''}
        &copy; ${year} ${firmName}. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;
};

export const allocationAssignedEmailTemplate = ({
  recipientName,
  actorName,
  jobName,
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
  appLink,
  month,
  percentage,
  adjustedHours,
  allocatedFee,
  currency,
  deadline,
  clientName,
  jobType,
  notes,
}) => allocationEmailLayout({
  title: `New job allocation: ${formatValue(jobName, 'Job')}`,
  preheader: `You have been assigned to ${formatValue(jobName, 'a job')}`,
  headline: `Hi ${formatValue(recipientName, 'there')}, you have a new allocation`,
  intro: `${formatValue(actorName, 'Your manager')} assigned you to ${formatValue(jobName, 'a job')}. Review the details below.`,
  ctaLabel: 'Open job in Brendmo',
  ctaUrl: appLink,
  details: [
    { label: 'Job', value: formatValue(jobName) },
    { label: 'Client', value: formatValue(clientName) },
    { label: 'Job type', value: formatValue(jobType) },
    { label: 'Month', value: formatValue(month) },
    { label: 'Allocation', value: `${Number(percentage || 0).toFixed(2)}%` },
    { label: 'Budgeted hours', value: Number(adjustedHours || 0).toFixed(2) },
    { label: 'Allocated fee', value: formatCurrency(allocatedFee, currency) },
    { label: 'Deadline', value: formatDate(deadline) },
  ],
  note: notes ? `Notes: ${notes}` : null,
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
});

export const allocationReassignedEmailTemplate = ({
  recipientName,
  actorName,
  previousStaffName,
  jobName,
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
  appLink,
  month,
  percentage,
  adjustedHours,
  allocatedFee,
  currency,
  deadline,
  clientName,
  jobType,
  notes,
}) => allocationEmailLayout({
  title: `Reassigned job allocation: ${formatValue(jobName, 'Job')}`,
  preheader: `${formatValue(jobName, 'A job')} has been reassigned to you`,
  headline: `Hi ${formatValue(recipientName, 'there')}, allocation reassigned to you`,
  intro: `${formatValue(actorName, 'Your manager')} reassigned ${formatValue(jobName, 'this job')}${previousStaffName ? ` from ${previousStaffName}` : ''} to you.`,
  ctaLabel: 'Review reassigned job',
  ctaUrl: appLink,
  details: [
    { label: 'Job', value: formatValue(jobName) },
    { label: 'Client', value: formatValue(clientName) },
    { label: 'Job type', value: formatValue(jobType) },
    { label: 'Month', value: formatValue(month) },
    { label: 'Allocation', value: `${Number(percentage || 0).toFixed(2)}%` },
    { label: 'Budgeted hours', value: Number(adjustedHours || 0).toFixed(2) },
    { label: 'Allocated fee', value: formatCurrency(allocatedFee, currency) },
    { label: 'Deadline', value: formatDate(deadline) },
  ],
  note: notes ? `Transition notes: ${notes}` : null,
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
});

export const allocationComponentCompletedEmailTemplate = ({
  recipientName,
  staffName,
  jobName,
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
  appLink,
  completedAt,
  percentage,
  adjustedHours,
  deadline,
  clientName,
  jobType,
}) => allocationEmailLayout({
  title: `Component completed: ${formatValue(jobName, 'Job')}`,
  preheader: `${formatValue(staffName, 'A staff member')} completed an allocated component`,
  headline: `Hi ${formatValue(recipientName, 'there')}, a component was completed`,
  intro: `${formatValue(staffName, 'A staff member')} has closed an allocated component for ${formatValue(jobName, 'this job')}.`,
  ctaLabel: 'Review completed job',
  ctaUrl: appLink,
  details: [
    { label: 'Staff', value: formatValue(staffName) },
    { label: 'Job', value: formatValue(jobName) },
    { label: 'Client', value: formatValue(clientName) },
    { label: 'Job type', value: formatValue(jobType) },
    { label: 'Allocation', value: `${Number(percentage || 0).toFixed(2)}%` },
    { label: 'Budgeted hours', value: Number(adjustedHours || 0).toFixed(2) },
    { label: 'Completed at', value: formatDateTime(completedAt) },
    { label: 'Deadline', value: formatDate(deadline) },
  ],
  note: 'A completion update was received from staff. Open the job to review time logs and next actions.',
  firmName,
  logoUrl,
  primaryColor,
  accentColor,
  supportEmail,
  supportPhone,
  supportWebsite,
});
