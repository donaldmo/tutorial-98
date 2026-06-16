const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  '123456',
  '12345678',
  'qwerty',
  'admin',
  'admin123',
  'letmein',
  'welcome',
]);

export const validatePasswordStrength = (password, { email } = {}) => {
  const value = String(password || '');

  if (value.length < 12) return 'Password must be at least 12 characters long';
  if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
  if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
  if (!/[0-9]/.test(value)) return 'Password must include a number';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Password must include a special character';

  const lower = value.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower)) return 'Password is too common';

  const normalizedEmail = String(email || '').toLowerCase().trim();
  const emailPrefix = normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : normalizedEmail;
  if (emailPrefix && emailPrefix.length >= 3 && lower.includes(emailPrefix)) {
    return 'Password must not contain your email name';
  }

  return null;
};
