/**
 * Admin welcome email template — sent when the admin account is first seeded.
 *
 * Colours are derived from the client theme (client/src/index.css):
 *   --primary          hsl(0 0% 9%)    → #171717
 *   --primary-fg       hsl(0 0% 98%)   → #fafafa
 *   --background       hsl(0 0% 100%)  → #ffffff
 *   --muted            hsl(0 0% 96.1%) → #f5f5f5
 *   --muted-fg         hsl(0 0% 45.1%) → #737373
 *   --border           hsl(0 0% 89.8%) → #e5e5e5
 *   --chart-1          hsl(12 76% 61%) → #e2704a  (accent / CTA)
 */

/**
 * @param {{ name: string, email: string, password: string, orgName: string, appUrl?: string }} opts
 * @returns {string} HTML string
 */
export const adminWelcomeEmailTemplate = ({
  name,
  email,
  password,
  orgName,
  appUrl = process.env.APP_BASE_URL || '',
}) => {
  const loginUrl = `${appUrl.replace(/\/$/, '')}/auth/login`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Brendmo Workflow</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: #f5f5f5;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #171717;
    }

    .wrapper {
      width: 100%;
      background-color: #f5f5f5;
      padding: 40px 16px;
    }

    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e5e5e5;
    }

    /* ── Header ── */
    .header {
      background-color: #171717;
      padding: 36px 40px 32px;
      text-align: center;
    }

    .header-logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .logo-icon {
      width: 36px;
      height: 36px;
      background-color: #e2704a;
      border-radius: 8px;
      display: inline-block;
      vertical-align: middle;
    }

    .logo-text {
      font-size: 20px;
      font-weight: 700;
      color: #fafafa;
      vertical-align: middle;
      letter-spacing: -0.3px;
    }

    .header-tagline {
      margin-top: 10px;
      font-size: 13px;
      color: #737373;
      letter-spacing: 0.4px;
    }

    /* ── Body ── */
    .body {
      padding: 40px;
    }

    .greeting {
      font-size: 22px;
      font-weight: 700;
      color: #171717;
      margin-bottom: 10px;
    }

    .lead {
      font-size: 15px;
      line-height: 1.65;
      color: #404040;
      margin-bottom: 28px;
    }

    /* ── Credentials card ── */
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

    .credential-row:last-child {
      margin-bottom: 0;
    }

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

    /* ── CTA button ── */
    .cta-wrapper {
      text-align: center;
      margin-bottom: 32px;
    }

    .cta-button {
      display: inline-block;
      background-color: #171717;
      color: #fafafa !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      padding: 13px 32px;
      border-radius: 8px;
      letter-spacing: 0.2px;
    }

    /* ── Steps ── */
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
      background-color: #e2704a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .step-text {
      font-size: 13px;
      line-height: 1.55;
      color: #404040;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background-color: #e5e5e5;
      margin: 32px 0;
    }

    /* ── Security notice ── */
    .security-notice {
      background-color: #fff8f6;
      border-left: 3px solid #e2704a;
      border-radius: 0 6px 6px 0;
      padding: 14px 16px;
      font-size: 13px;
      line-height: 1.55;
      color: #595959;
    }

    .security-notice strong {
      color: #171717;
    }

    /* ── Footer ── */
    .footer {
      background-color: #f5f5f5;
      border-top: 1px solid #e5e5e5;
      padding: 24px 40px;
      text-align: center;
    }

    .footer-text {
      font-size: 12px;
      color: #737373;
      line-height: 1.6;
    }

    .footer-link {
      color: #404040;
      text-decoration: none;
      border-bottom: 1px solid #e5e5e5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header -->
      <div class="header">
        <div class="header-logo">
          <span class="logo-icon"></span>
          <span class="logo-text">Brendmo Workflow</span>
        </div>
        <p class="header-tagline">Accounting Firm Workflow Management</p>
      </div>

      <!-- Body -->
      <div class="body">
        <h1 class="greeting">Welcome, ${name}! 👋</h1>
        <p class="lead">
          Your admin account for <strong>${orgName}</strong> has been created and is ready to use.
          Below are your login credentials — keep them safe.
        </p>

        <!-- Credentials -->
        <div class="credentials-card">
          <p class="credentials-title">Account Credentials</p>

          <div class="credential-row">
            <span class="credential-label">Organisation</span>
            <span class="credential-value">${orgName}</span>
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
          <a href="${loginUrl}" class="cta-button">Log in to your dashboard →</a>
        </div>

        <!-- Next steps -->
        <p class="steps-title">Next steps</p>

        <div class="step">
          <span class="step-number">1</span>
          <span class="step-text">Log in and <strong>change your password</strong> — you'll be prompted on first login.</span>
        </div>
        <div class="step">
          <span class="step-number">2</span>
          <span class="step-text">Add your team members under <strong>Settings → Staff</strong>.</span>
        </div>
        <div class="step">
          <span class="step-number">3</span>
          <span class="step-text">Set up your clients and job types to start planning work.</span>
        </div>

        <div class="divider"></div>

        <!-- Security notice -->
        <div class="security-notice">
          <strong>Security reminder:</strong> Never share your password with anyone.
          If you did not request this account, please contact support immediately.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          This email was sent to <strong>${email}</strong> because an admin account was
          created on Brendmo Workflow.<br />
          &copy; ${new Date().getFullYear()} Brendmo Workflow. All rights reserved.
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
};
