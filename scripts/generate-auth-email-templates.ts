/**
 * Generates the Supabase Auth email templates (sign-up confirmation, password
 * reset, magic link, email change, invite) from the same layout as the booking
 * notification emails, so every email nokta sends looks the same.
 *
 *   npx tsx scripts/generate-auth-email-templates.ts
 *
 * Writes supabase/templates/<name>.html and supabase/templates/auth-email-templates.json.
 * The JSON is the Management API payload that scripts/apply-auth-email.sh sends
 * to a project. `{{ .ConfirmationURL }}` and friends are Supabase template
 * variables, filled in by Supabase when it sends the email.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderEmail, type EmailContent } from "../supabase/functions/send-notification-email/email";

const outDir = resolve("supabase/templates");
const IGNORE = "If you didn't ask for this, you can ignore this email.";

const templates: Record<"confirmation" | "recovery" | "magic_link" | "email_change" | "invite", EmailContent> = {
  confirmation: {
    subject: "Confirm your nokta account",
    status: { label: "One step left", tone: "neutral" },
    title: "Confirm your email",
    intro: "Tap the button to confirm {{ .Email }} and finish setting up your nokta account.",
    sections: [],
    action: { label: "Confirm email", url: "{{ .ConfirmationURL }}" },
    footer: "If you didn't sign up for nokta, you can ignore this email.",
  },
  recovery: {
    subject: "Reset your nokta password",
    status: { label: "Password reset", tone: "neutral" },
    title: "Reset your password",
    intro: "Tap the button to choose a new password for {{ .Email }}. The link works once, for one hour.",
    sections: [],
    action: { label: "Choose a new password", url: "{{ .ConfirmationURL }}" },
    footer: "If you didn't ask to reset your password, ignore this email. Your password won't change.",
  },
  magic_link: {
    subject: "Your nokta sign-in link",
    status: { label: "Sign in", tone: "neutral" },
    title: "Sign in to nokta",
    intro: "Tap the button to sign in as {{ .Email }}. The link works once, for one hour.",
    sections: [],
    action: { label: "Sign in", url: "{{ .ConfirmationURL }}" },
    footer: IGNORE,
  },
  email_change: {
    subject: "Confirm your new email for nokta",
    status: { label: "Email change", tone: "neutral" },
    title: "Confirm your new email",
    intro: "Confirm you want your nokta account to use {{ .NewEmail }} instead of {{ .Email }}.",
    sections: [],
    action: { label: "Confirm new email", url: "{{ .ConfirmationURL }}" },
    footer: IGNORE,
  },
  invite: {
    subject: "You're invited to nokta",
    status: { label: "Invitation", tone: "info" },
    title: "You're invited to nokta",
    intro: "Tap the button to accept and set up your account for {{ .Email }}.",
    sections: [],
    action: { label: "Accept invitation", url: "{{ .ConfirmationURL }}" },
    footer: IGNORE,
  },
};

mkdirSync(outDir, { recursive: true });
const payload: Record<string, string> = {};
for (const [name, content] of Object.entries(templates)) {
  const { subject, html } = renderEmail(content);
  writeFileSync(join(outDir, `${name}.html`), html);
  payload[`mailer_subjects_${name}`] = subject;
  payload[`mailer_templates_${name}_content`] = html;
}
writeFileSync(join(outDir, "auth-email-templates.json"), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${Object.keys(templates).length} auth templates to ${outDir}`);
