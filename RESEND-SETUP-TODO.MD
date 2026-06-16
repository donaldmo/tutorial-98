## ✅ Resend + DNS Setup Checklist

### Prerequisites
- [ ] Resend account created (resend.com/signup)
- [ ] Domain name confirmed
- [ ] DNS management access available

---

### Setup Steps

#### 1. Add Domain to Resend
- [ ] Log/Register into Resend dashboard: https://resend.com/emails
- [ ] Go to Domains → Add Domain
- [ ] Enter your domain name
- [ ] Copy the DNS records provided (5 TXT records)

#### 2. Configure DNS Records
- [ ] Access DNS provider (registrar/Cloudflare/Route53): https://www.brendmo.com
- [ ] Add SPF record (TXT)
- [ ] Add 3 DKIM records (TXT)
- [ ] Add DMARC record (TXT)
- [ ] Save all changes

#### 3. Verify Domain
- [ ] Wait 15-60 min for DNS propagation
- [ ] Return to Resend dashboard
- [ ] Click "Verify" on your domain
- [ ] Confirm all records show green checkmarks

#### 4. Create API Key
- [ ] Go to API Keys → Create API Key
- [ ] Name it (e.g., "Production")
- [ ] Set permissions (Sending access)
- [ ] Copy and store key securely