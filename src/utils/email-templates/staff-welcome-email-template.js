/**
 * Staff welcome email template — sent when an admin creates a new staff member.
 *
 * Supports per-org branding:
 *   primaryColor  → header background  (fallback #171717)
 *   accentColor   → CTA button / accents (fallback #e2704a)
 *   logoUrl       → if truthy renders <img>, else letter-icon fallback
 *   firmName      → displayed in header and footer
 */

/**
 * @param {{
 *   name: string,
 *   email: string,
 *   password: string,
 *   firmName?: string,
 *   logoUrl?: string | null,
 *   primaryColor?: string | null,
 *   accentColor?: string | null,
 *   appUrl?: string
 * }} opts
 * @returns {string} HTML string
 */
export const staffWelcomeEmailTemplate = ({
  name,
  email,
  password,
  firmName = 'Brendmo Workflow',
  logoUrl = null,
  primaryColor = null,
  accentColor = null,
  acceptLink = null,
  appUrl = process.env.APP_BASE_URL || '',
}) => {
  const loginUrl = `${String(appUrl).replace(/\/$/, '')}/auth/login`;
  const year = new Date().getFullYear();
  const headerBg = primaryColor || '#171717';
  const accent = accentColor || '#e2704a';

  // Determine a readable text colour for the header based on luminance.
  // Simple heuristic: if the color is light (starts with #f or similar) use dark text.
  const isLightColor = (hex) => {
    const h = String(hex).replace('#', '');
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 155;
  };
  const headerTextColor = isLightColor(headerBg) ? '#171717' : '#fafafa';
  const headerSubColor = isLightColor(headerBg) ? '#555555' : '#a3a3a3';

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${firmName}" style="height:40px;max-width:200px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<div style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;">
        <span style="width:36px;height:36px;background-color:${accent};border-radius:8px;display:inline-block;vertical-align:middle;font-size:18px;font-weight:700;color:#fafafa;line-height:36px;text-align:center;">${String(firmName).charAt(0).toUpperCase()}</span>
        <span style="font-size:18px;font-weight:700;color:${headerTextColor};vertical-align:middle;letter-spacing:-0.3px;">${firmName}</span>
      </div>`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${firmName}</title>
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
      line-height: 1.65;
      color: #404040;
      margin-bottom: 28px;
    }
    .credentials-card {
      background-color: #f5f5f5;
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 24px 28px;
      margin-bottom: 28px;
    }
    .credentials-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: #737373;
      margin-bottom: 16px;
    }
    .credential-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .credential-row:last-child { margin-bottom: 0; }
    .credential-label {
      font-size: 13px;
      color: #737373;
      width: 90px;
      flex-shrink: 0;
      padding-top: 1px;
    }
    .credential-value {
      font-size: 14px;
      font-weight: 500;
      color: #171717;
      word-break: break-all;
    }
    .credential-value.password {
      font-family: 'Courier New', Courier, monospace;
      background-color: #ffffff;
      border: 1px solid #e5e5e5;
      border-radius: 5px;
      padding: 2px 8px;
      font-size: 13px;
      letter-spacing: 0.5px;
    }
    .cta-wrapper { text-align: center; margin-bottom: 32px; }
    .cta-button {
      display: inline-block;
      background-color: ${accent};
      color: #fafafa !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 13px 32px;
      border-radius: 8px;
      letter-spacing: 0.2px;
    }
    .tip {
      background-color: #fff8f6;
      border-left: 3px solid ${accent};
      border-radius: 0 6px 6px 0;
      padding: 14px 16px;
      font-size: 13px;
      line-height: 1.55;
      color: #595959;
      margin-bottom: 28px;
    }
    .tip strong { color: #171717; }
    .divider { height: 1px; background-color: #e5e5e5; margin: 28px 0; }
    .security-notice {
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
        <p class="header-tagline">Workflow Management</p>
      </div>

      <!-- Body -->
      <div class="body">
        <h1 class="greeting">Welcome, ${name || 'there'}! 👋</h1>
        <p class="lead">
          Your staff account at <strong>${firmName}</strong> has been created.
          Use the credentials below to sign in for the first time.
        </p>

        <!-- Credentials card -->
        <div class="credentials-card">
          <p class="credentials-title">Your Login Credentials</p>
          <div class="credential-row">
            <span class="credential-label">Portal</span>
            <span class="credential-value"><a href="${loginUrl}" style="color:${accent};text-decoration:none;">${loginUrl}</a></span>
          </div>
          <div class="credential-row">
            <span class="credential-label">Email</span>
            <span class="credential-value">${email}</span>
          </div>
          <div class="credential-row">
            <span class="credential-label">Password</span>
            <span class="credential-value password">${password}</span>
          </div>
        </div>

        <!-- CTA -->
        <div class="cta-wrapper">
          <a href="${acceptLink || loginUrl}" class="cta-button">${acceptLink ? 'Activate My Account →' : 'Log in to your account →'}</a>
        </div>

        <!-- Tip -->
        <div class="tip">
          <strong>🔒 Action required:</strong> ${acceptLink
            ? 'Click the button above to activate your account. You will be asked to set a new password on first login.'
            : 'You will be prompted to change your password when you first log in. Please do this immediately to keep your account secure.'}
        </div>

        <div class="divider"></div>

        <!-- Security notice -->
        <div class="security-notice">
          <strong>Security reminder:</strong> Never share your password with anyone.
          If you did not expect this email, please contact your system administrator immediately.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          This email was sent to <strong>${email}</strong> because a staff account was
          created for you on ${firmName}.<br />
          &copy; ${year} ${firmName}. All rights reserved.<br />
          <a href="${loginUrl}" class="footer-link">Sign in to your account</a>
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
};
