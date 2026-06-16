/**
 * @param {{ name?: string, pin: string, expiryLabel?: string, accountType?: 'admin'|'staff', redirectPath?: string, firmName?: string }} opts
 * @returns {string}
 */
export const resetPasswordPinEmailTemplate = ({
  name,
  pin,
  expiryLabel = process.env.RESET_PASSWORD_PIN_TOKEN_TTL || process.env.VERIFY_PIN_TOKEN_TTL || '15m',
  accountType = 'staff',
  redirectPath = '/auth/staff-reset-password',
  firmName = 'Brendmo Workflow',
}) => {
  const base = String(process.env.APP_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
  const resetUrl = `${base}${redirectPath}`;
  const audience = accountType === 'admin' ? 'admin account' : 'staff account';
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password reset code - ${firmName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif;color:#171717;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#171717;padding:24px 28px;text-align:center;color:#fafafa;font-size:18px;font-weight:700;">
              ${firmName}
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:20px;font-weight:700;">Reset your password</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#525252;">
                Hi ${name || 'there'}, we received a request to reset your ${audience} password.
                Enter the 4-digit code below on the reset password page.
              </p>

              <div style="background:#f5f5f5;border:1px solid #e5e5e5;border-radius:10px;padding:20px;text-align:center;">
                <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#737373;margin-bottom:10px;font-weight:600;">Reset PIN</div>
                <div style="font-size:44px;font-weight:700;letter-spacing:14px;color:#e2704a;padding-left:14px;">${pin}</div>
                <div style="margin-top:10px;font-size:13px;color:#737373;">Expires in <strong>${expiryLabel}</strong></div>
              </div>

              <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#525252;">
                Reset page: <a href="${resetUrl}" style="color:#e2704a;text-decoration:none;">${resetUrl}</a>
              </p>

              <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#737373;">
                If you did not request this reset, you can ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f5f5f5;border-top:1px solid #e5e5e5;padding:14px 28px;text-align:center;font-size:12px;color:#737373;">
              © ${year} ${firmName}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
