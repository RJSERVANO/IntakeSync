export type PasswordRuleId = 'length' | 'uppercase' | 'lowercase' | 'number' | 'symbol';

export type PasswordRule = {
  id: PasswordRuleId;
  label: string;
  valid: boolean;
};

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    { id: 'length', label: 'At least 8 characters', valid: password.length >= 8 },
    { id: 'uppercase', label: 'One uppercase letter', valid: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'One lowercase letter', valid: /[a-z]/.test(password) },
    { id: 'number', label: 'One number', valid: /\d/.test(password) },
    { id: 'symbol', label: 'One symbol', valid: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isStrongPassword(password: string) {
  return getPasswordRules(password).every((rule) => rule.valid);
}

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.';
