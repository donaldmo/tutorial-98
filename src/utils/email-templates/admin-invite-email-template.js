/**
 * Admin invite email template — sent when an org admin invites a new admin.
 *
 * Supports per-org branding:
 *   primaryColor  → header background  (fallback #171717)
 *   accentColor   → CTA button / accents (fallback #e2704a)
 *   logoUrl       → if truthy renders <img>, else letter-icon fallback
 *   firmName      → displayed in header and footer
 */

/**
 * @param {{
 *   invitedByName: string,
 *   organisationName: string,
 *   acceptLink: string,
 *   firmName?: string,
 *   logoUrl?: string | null,
 *   primaryColor?: string | null,
 *   accentColor?: string | null,
 * }} opts
 * @returns {string} HTML string
 */
export const adminInviteEmailTemplate = ({
  invitedByName,
  organisationName,
  acceptLink,
  firmName = 'Brendmo Workflow',
  logoUrl = null,
  primaryColor = null,
  accentColor = null,
}) => {
  const year = new Date().getFullYear();
  const headerBg = primaryColor || '#171717';
  const accent = accentColor || '#e2704a';

  const isLightColor = (hex) => {
    const h = String(hex).replace('#', '');
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 155;
  };
  const headerTextColor = isLightColor(headerBg) ? '#171717' : '#fafafa';
  const headerSubColor  = isLightColor(headerBg) ? '#555555' : '#a3a3a3';

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${firmName}" style="height:40px;max-width:200px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<div style="display:inline-flex;align-items:center;gap:10px;">
        <span style="width:36px;height:36px;background-color:${accent};border-radius:8px;display:inline-block;vertical-align:middle;font-size:18px;font-weight:700;color:#fafafa;line-height:36px;text-align:center;">${String(firmName).charAt(0).toUpperCase()}</span>
        <span style="font-size:18px;font-weight:700;color:${headerTextColor};vertical-align:middle;letter-spacing:-0.3px;">${firmName}</span>
      </div>`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to join ${organisationName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #f5f5f5;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #171717;
    }
    .wrapper { width: 100%; background-color: #f5f5f5; padding: 40px 16px; }
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e5e5e5;
    }
    .header {
      background-color: ${headerBg};
      padding: 36px 40px 32px;
      text-align: center;
    }
    .header-tagline {
      margin-top: 10px;
      font-size: 13px;
      color: ${headerSubColor};
      letter-spacing: 0.4px;
    }
    .body { padding: 40px; }
    .greeting {
      font-size: 22px;
      font-weight: 700;
      color: #171717;
      margin-bottom: 10px;
      letter-spacing: -0.4px;
    }
    .lead {
      font-size: 15px;
      line-height: 1.7;
      color: #404040;
      margin-bottom: 28px;
    }
    .invite-card {
      background-color: #f5f5f5;
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 24px 28px;
      margin-bottom: 32px;
      text-align: center;
    }
    .invite-org {
      font-size: 20px;
      font-weight: 700;
      color: #171717;
      letter-spacing: -0.3px;
      margin-bottom: 6px;
    }
    .invite-role {
      display: inline-block;
      background-color: ${accent}1a;
      color: ${accent};
      border: 1px solid ${accent}44;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 4px 14px;
      margin-top: 4px;
    }
    .invite-by {
      margin-top: 14px;
      font-size: 13px;
      color: #737373;
    }
    .invite-by strong { color: #404040; }
    .cta-wrapper { text-align: center; margin-bottom: 32px; }
    .cta-button {
      display: inline-block;
      background-color: ${accent};
      color: #fafafa !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 40px;
      border-radius: 8px;
      letter-spacing: 0.2px;
    }
    .expiry {
      text-align: center;
      font-size: 12px;
      color: #a3a3a3;
      margin-top: 12px;
      margin-bottom: 32px;
    }
    .divider { height: 1px; background-color: #e5e5e5; margin: 0 0 28px; }
    .steps-title {
      font-size: 13px;
      font-weight: 600;
      color: #171717;
      margin-bottom: 14px;
    }
    .step {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }
    .step-number {
      width: 22px;
      height: 22px;
      background-color: ${accent};
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
      text-align: center;
      line-height: 22px;
    }
    .step-text {
      font-size: 13px;
      line-height: 1.6;
      color: #404040;
    }
    .security-notice {
      margin-top: 28px;
      background-color: #f5f5f5;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      padding: 14px 16px;
      font-size: 12px;
      line-height: 1.6;
      color: #737373;
    }
    .security-notice strong { color: #171717; }
    .footer {
      background-color: #f5f5f5;
      border-top: 1px solid #e5e5e5;
      padding: 24px 40px;
      text-align: center;
    }
    .footer-text { font-size: 12px; color: #737373; line-height: 1.6; }
    .footer-link { color: ${accent}; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header -->
      <div class="header">
        ${logoHtml}
        <p class="header-tagline">Admin Invitation</p>
      </div>

      <!-- Body -->
      <div class="body">
        <h1 class="greeting">You've been invited! 🎉</h1>
        <p class="lead">
          You have been invited to join <strong>${organisationName}</strong> as an administrator
          on ${firmName}. Click the button below to set up your account and get started.
        </p>

        <!-- Invite card -->
        <div class="invite-card">
          <p class="invite-org">${organisationName}</p>
          <span class="invite-role">Administrator</span>
          <p class="invite-by">Invited by <strong>${invitedByName}</strong></p>
        </div>

        <!-- CTA -->
        <div class="cta-wrapper">
          <a href="${acceptLink}" class="cta-button">Accept Invitation →</a>
        </div>
        <p class="expiry">⏱ This invitation expires in <strong>48 hours</strong></p>

        <div class="divider"></div>

        <!-- Steps -->
        <p class="steps-title">What happens next</p>
        <div class="step">
          <span class="step-number">1</span>
          <span class="step-text">Click <strong>Accept Invitation</strong> above to open the admin login page.</span>
        </div>
        <div class="step">
          <span class="step-number">2</span>
          <span class="step-text">Enter your name and create a secure password for your account.</span>
        </div>
        <div class="step">
          <span class="step-number">3</span>
          <span class="step-text">You'll be signed in automatically and taken to the <strong>${organisationName}</strong> dashboard.</span>
        </div>

        <!-- Security notice -->
        <div class="security-notice">
          <strong>Didn't expect this?</strong> If you did not request this invitation,
          you can safely ignore this email. The link will expire automatically after 48 hours.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          This invitation was sent on behalf of <strong>${organisationName}</strong>
          via ${firmName}.<br />
          &copy; ${year} ${firmName}. All rights reserved.
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
};
