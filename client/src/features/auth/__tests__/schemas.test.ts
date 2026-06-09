/**
 * Validates that the Zod auth schemas match the server's password policy and
 * catch the most common user mistakes.
 */
import {
  loginSchema,
  signupSchema,
  resetSchema,
  changePasswordSchema,
} from '@/features/auth/schemas';

describe('auth zod schemas', () => {
  describe('signup', () => {
    it('rejects weak passwords', () => {
      const r = signupSchema.safeParse({ email: 'a@b.co', password: 'short' });
      expect(r.success).toBe(false);
    });
    it('rejects passwords missing complexity', () => {
      const r = signupSchema.safeParse({ email: 'a@b.co', password: 'alllower1' });
      expect(r.success).toBe(false);
    });
    it('accepts a compliant password', () => {
      const r = signupSchema.safeParse({ email: 'a@b.co', password: 'Aabcdef1' });
      expect(r.success).toBe(true);
    });
    it('rejects malformed emails', () => {
      expect(signupSchema.safeParse({ email: 'not-an-email', password: 'Aabcdef1' }).success).toBe(false);
    });
  });

  describe('login', () => {
    it('requires both fields', () => {
      expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false);
      expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    });
  });

  describe('resetSchema', () => {
    it('rejects mismatching confirmation', () => {
      const r = resetSchema.safeParse({ password: 'Aabcdef1', confirm: 'Aabcdef2' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toContain('confirm');
    });
    it('accepts matching strong passwords', () => {
      expect(resetSchema.safeParse({ password: 'Aabcdef1', confirm: 'Aabcdef1' }).success).toBe(true);
    });
  });

  describe('changePasswordSchema', () => {
    it('requires current password', () => {
      const r = changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'Aabcdef1',
        confirm: 'Aabcdef1',
      });
      expect(r.success).toBe(false);
    });
    it('enforces new password complexity', () => {
      const r = changePasswordSchema.safeParse({
        currentPassword: 'whatever',
        newPassword: 'weak',
        confirm: 'weak',
      });
      expect(r.success).toBe(false);
    });
  });
});
