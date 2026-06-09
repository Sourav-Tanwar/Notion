import { env } from '../config/env';

/**
 * Email service is abstracted so a future SES/Resend/SMTP driver is a one-file
 * swap. The default `console` driver logs to stdout — perfect for development
 * and integration tests, and unmistakably safe in production (it does nothing
 * "real" by accident).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailService {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleEmailService implements EmailService {
  async send(msg: EmailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('\n📧 [email]', msg.to, '—', msg.subject, '\n', msg.text, '\n');
  }
}

let _service: EmailService | null = null;
export function getEmailService(): EmailService {
  if (_service) return _service;
  switch (env.emailDriver) {
    case 'smtp':
      // TODO: lazy-require nodemailer + create transport from env. Kept out
      // until a deployment actually needs it.
      throw new Error('SMTP driver not yet wired');
    case 'console':
    default:
      _service = new ConsoleEmailService();
  }
  return _service;
}

/* ---------- Templates ---------- */

export function verifyEmailTemplate(name: string, link: string): EmailMessage {
  return {
    to: '',
    subject: 'Verify your email',
    text: `Hi ${name || 'there'},\n\nConfirm your email by opening this link (valid 24h):\n${link}\n\nIf you didn't sign up, ignore this message.`,
    html: `<p>Hi ${escapeHtml(name) || 'there'},</p><p>Confirm your email by clicking the link below (valid 24h):</p><p><a href="${link}">${link}</a></p>`,
  };
}

export function passwordResetTemplate(name: string, link: string): EmailMessage {
  return {
    to: '',
    subject: 'Reset your password',
    text: `Hi ${name || 'there'},\n\nA password reset was requested. The link is valid for 30 minutes:\n${link}\n\nIf you didn't request this, you can safely ignore the email.`,
    html: `<p>Hi ${escapeHtml(name) || 'there'},</p><p>A password reset was requested. The link is valid for 30 minutes:</p><p><a href="${link}">${link}</a></p>`,
  };
}

export function passwordSetupTemplate(name: string, link: string): EmailMessage {
  return {
    to: '',
    subject: 'Set a password for your account',
    text: `Hi ${name || 'there'},\n\nFinish setting up a password for your account (link valid 60 minutes):\n${link}\n\nIf you didn't request this, you can ignore the email and keep signing in with your social account.`,
    html: `<p>Hi ${escapeHtml(name) || 'there'},</p><p>Finish setting up a password for your account (link valid 60 minutes):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, ignore the email and keep signing in with your social account.</p>`,
  };
}

/**
 * Sent when someone tries to sign up with an email that is already in use.
 *
 * Anti-enumeration: the HTTP signup endpoint returns the SAME response
 * regardless of whether the email is new. The information about "this email
 * already exists" travels through the side channel of the user's inbox, where
 * only the legitimate account owner can read it. An attacker spraying email
 * addresses sees an indistinguishable success either way.
 */
export function accountAlreadyExistsTemplate(name: string, loginLink: string, resetLink: string): EmailMessage {
  return {
    to: '',
    subject: 'Someone tried to sign up with your email',
    text: `Hi ${name || 'there'},\n\nSomeone — possibly you — just tried to create a new account with this email.\n\nIf it was you, just sign in:\n${loginLink}\n\nForgot your password? Reset it here:\n${resetLink}\n\nIf it wasn't you, you can safely ignore this email. Your account is unchanged.`,
    html: `<p>Hi ${escapeHtml(name) || 'there'},</p><p>Someone — possibly you — just tried to create a new account with this email.</p><p>If it was you:</p><p><a href="${loginLink}">Sign in</a> &nbsp;·&nbsp; <a href="${resetLink}">Reset password</a></p><p>If it wasn't you, you can ignore this email. Your account is unchanged.</p>`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Workspace invitation. `inviterName` may be empty (system invite); the copy
 * gracefully degrades. The link is single-use and expires in 7 days — the
 * caller stores only its SHA-256 hash, so we can never re-derive the raw
 * URL after this email leaves the process. Resending invalidates the link
 * and emits a new one.
 */
export function workspaceInviteTemplate(
  inviterName: string,
  workspaceName: string,
  role: string,
  link: string,
): EmailMessage {
  const from = inviterName ? `${inviterName} invited you` : `You've been invited`;
  return {
    to: '',
    subject: `${from} to ${workspaceName}`,
    text: `${from} to join the workspace "${workspaceName}" as ${role}.\n\nAccept the invitation (link valid 7 days):\n${link}\n\nIf you don't recognise this, you can ignore the message.`,
    html: `<p>${escapeHtml(from)} to join the workspace <strong>${escapeHtml(workspaceName)}</strong> as <em>${escapeHtml(role)}</em>.</p><p><a href="${link}">Accept invitation</a> (valid 7 days)</p><p>If you don't recognise this, you can ignore the email.</p>`,
  };
}
