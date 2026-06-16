export const paymentSuccessEmailTemplate = ({
  name,
  organisationName,
  planName,
  billingCycle,
  amountLabel,
  reference,
  nextRenewalLabel,
  settingsUrl,
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscription payment confirmed</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <div style="background:#171717;padding:28px 32px;text-align:center;">
        <div style="display:inline-block;background:#2563eb;color:#ffffff;border-radius:8px;padding:10px 14px;font-weight:700;">
          Brendmo Workflow
        </div>
        <p style="margin:12px 0 0;color:#d4d4d8;font-size:13px;">Payment confirmed</p>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;">Hi ${name || 'there'}, your subscription is now active.</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#404040;">
          We have confirmed your Paystack payment${organisationName ? ` for <strong>${organisationName}</strong>` : ''}.
        </p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Receipt Summary</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Plan:</strong> ${planName || 'Subscription plan'}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Billing cycle:</strong> ${billingCycle || 'Monthly'}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Amount:</strong> ${amountLabel || 'ZAR 0.00'}</p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Reference:</strong> ${reference || '—'}</p>
          <p style="margin:0;font-size:14px;"><strong>Next renewal:</strong> ${nextRenewalLabel || '—'}</p>
        </div>

        <div style="text-align:center;margin-bottom:24px;">
          <a href="${settingsUrl}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;">
            View Subscription Settings
          </a>
        </div>

        <p style="margin:0;font-size:13px;line-height:1.6;color:#737373;">
          Your plan is now active and your payment history is available under Subscription &amp; Billing.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
