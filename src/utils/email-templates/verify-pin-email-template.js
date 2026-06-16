/**
 * Email verification PIN template — sent after firm self-registration.
 *
 * Colours match the client theme (see admin-welcome-email-template.js):
 *   #171717  primary / header background
 *   #fafafa  primary foreground
 *   #f5f5f5  muted background
 *   #e5e5e5  border
 *   #737373  muted foreground
 *   #e2704a  accent / CTA (chart-1)
 */

/**
 * @param {{ name: string, pin: string, firmName?: string, appUrl?: string, expiryLabel?: string }} opts
 * @returns {string} HTML string
 */
export const verifyPinEmailTemplate = ({
  name,
  pin,
  firmName = 'Brendmo Workflow',
  appUrl = process.env.APP_BASE_URL || '',
  expiryLabel = process.env.VERIFY_PIN_TOKEN_TTL || '15m',
}) => {
  const loginUrl = `${String(appUrl).replace(/\/$/, '')}/auth/login`;
  const year = new Date().getFullYear();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email – ${firmName}</title>
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
      max-width: 520px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e5e5e5;
    }
    .header {
      background-color: #171717;
      padding: 32px 40px 28px;
      text-align: center;
    }
    .header-brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .header-icon {
      width: 36px;
      height: 36px;
      background-color: #e2704a;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      color: #fafafa;
      flex-shrink: 0;
    }
    .header-name {
      font-size: 18px;
      font-weight: 700;
      color: #fafafa;
      letter-spacing: -0.3px;
    }
    .body { padding: 40px 40px 32px; }
    .greeting {
      font-size: 22px;
      font-weight: 700;
      color: #171717;
      letter-spacing: -0.4px;
      margin-bottom: 12px;
    }
    .subtitle {
      font-size: 15px;
      color: #737373;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .pin-card {
      background-color: #f5f5f5;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      padding: 32px 24px;
      text-align: center;
      margin-bottom: 28px;
    }
    .pin-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #737373;
      margin-bottom: 16px;
    }
    .pin-digits {
      font-size: 52px;
      font-weight: 700;
      letter-spacing: 20px;
      color: #e2704a;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      padding-left: 20px; /* offset letter-spacing on last char */
    }
    .pin-expiry {
      margin-top: 14px;
      font-size: 13px;
      color: #737373;
    }
    .notice {
      font-size: 12px;
      color: #737373;
      line-height: 1.6;
      margin-top: 28px;
      padding: 16px;
      background-color: #f5f5f5;
      border-radius: 8px;
      border: 1px solid #e5e5e5;
    }
    .footer {
      background-color: #f5f5f5;
      border-top: 1px solid #e5e5e5;
      padding: 20px 40px;
      text-align: center;
    }
    .footer-text { font-size: 12px; color: #737373; line-height: 1.7; }
    .footer-link { color: #e2704a; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header -->
      <div class="header">
        <a href="${loginUrl}" class="header-brand">
          <span class="header-icon">B</span>
          <span class="header-name">${firmName}</span>
        </a>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Verify your email address</p>
        <p class="subtitle">
          Hi ${name || 'there'}, thanks for registering with ${firmName}.<br />
          Use the 4-digit code below to verify your email and activate your account.
        </p>

        <!-- PIN card -->
        <div class="pin-card">
          <p class="pin-label">Your verification code</p>
          <p class="pin-digits">${pin}</p>
          <p class="pin-expiry">⏱ This code expires in <strong>${expiryLabel}</strong></p>
        </div>

        <!-- Security notice -->
        <div class="notice">
          <strong>Didn't register?</strong> You can safely ignore this email. Someone may have entered your address by mistake.
          If you're concerned, <a href="${loginUrl}" style="color:#e2704a;">contact support</a>.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          © ${year} ${firmName}. All rights reserved.<br />
          <a href="${loginUrl}" class="footer-link">Sign in to your account</a>
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
};
