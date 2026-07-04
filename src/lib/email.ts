// Transactional email sending via Resend's HTTP API.
//
// Secret-free by design: every send* function is a no-op returning
// {sent:false} when RESEND_API_KEY is unset, so CI/build/tests never need
// the secret. Render functions are pure (no I/O, no env access) so they can
// be tested without touching the network or the environment.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  sent: boolean;
}

export function renderVerificationEmail(link: string): RenderedEmail {
  return {
    subject: "Verify your Bragboard email",
    html: `<p>Welcome to Bragboard! Please verify your email by clicking the link below.</p><p><a href="${link}">${link}</a></p>`,
    text: `Welcome to Bragboard! Please verify your email by visiting: ${link}`,
  };
}

export function renderPasswordResetEmail(link: string): RenderedEmail {
  return {
    subject: "Reset your Bragboard password",
    html: `<p>We received a request to reset your Bragboard password. Click the link below to choose a new one.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
    text: `We received a request to reset your Bragboard password. Visit this link to choose a new one: ${link}\n\nIf you didn't request this, you can safely ignore this email.`,
  };
}

export function renderAdminJoinNotification(playerName: string, email: string): RenderedEmail {
  return {
    subject: "New player joined Bragboard",
    html: `<p>A new player joined Bragboard.</p><ul><li>Name: ${playerName}</li><li>Email: ${email}</li></ul>`,
    text: `A new player joined Bragboard.\nName: ${playerName}\nEmail: ${email}`,
  };
}

/**
 * Sends an email via Resend's HTTP API. Returns {sent:false} (and logs a
 * warning) without making any network call when RESEND_API_KEY is unset.
 */
async function sendEmail(to: string, rendered: RenderedEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY is unset; skipping email send (no-op).");
    return { sent: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  });

  if (!response.ok) {
    console.warn(`Resend API responded with status ${response.status}; email not sent.`);
    return { sent: false };
  }

  return { sent: true };
}

export async function sendVerificationEmail(to: string, link: string): Promise<SendResult> {
  return sendEmail(to, renderVerificationEmail(link));
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<SendResult> {
  return sendEmail(to, renderPasswordResetEmail(link));
}

export async function sendAdminJoinNotification(
  playerName: string,
  email: string,
): Promise<SendResult> {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) {
    console.warn("ADMIN_NOTIFY_EMAIL is unset; skipping admin join notification (no-op).");
    return { sent: false };
  }
  return sendEmail(adminEmail, renderAdminJoinNotification(playerName, email));
}
