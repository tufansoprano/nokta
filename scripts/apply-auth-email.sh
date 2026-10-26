#!/usr/bin/env bash
# Sends a Supabase project's auth emails (sign-up confirmation, password reset,
# magic link, email change, invite) through Resend from notifications@nokta.uk,
# with the templates in supabase/templates.
#
#   scripts/apply-auth-email.sh qa
#   scripts/apply-auth-email.sh prod
#
# Asks for the Resend API key (the sending-only "supabase-auth" key) without
# echoing it, and passes it to the Supabase Management API over stdin, so it is
# never in shell history, the process list or the repo. Uses the Supabase CLI's
# stored login. Regenerate templates first if you changed them:
#   npx tsx scripts/generate-auth-email-templates.ts
set -euo pipefail

case "${1:-}" in
  qa) ref="wnghcabvzvitzrcpfvzs" ;;
  prod) ref="fsfkjfgzgtvdzfhqehel" ;;
  *) echo "Usage: $0 qa|prod" >&2; exit 1 ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
templates="$root/supabase/templates/auth-email-templates.json"
[ -f "$templates" ] || { echo "Missing $templates. Run: npx tsx scripts/generate-auth-email-templates.ts" >&2; exit 1; }

token="${SUPABASE_ACCESS_TOKEN:-$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null || true)}"
case "$token" in go-keyring-base64:*) token="$(printf '%s' "${token#go-keyring-base64:}" | base64 -d)" ;; esac
[ -n "$token" ] || { echo "No Supabase login found. Run: supabase login" >&2; exit 1; }

read -r -s -p "Resend API key for $1 ($ref): " resend_key
echo
[[ "$resend_key" == re_* ]] || { echo "That doesn't look like a Resend key (they start with re_)." >&2; exit 1; }

printf '%s\n%s\n' "$token" "$resend_key" | python3 -c '
import json, sys, urllib.request, urllib.error
token, resend_key = sys.stdin.read().splitlines()[:2]
ref, templates_path = sys.argv[1], sys.argv[2]
body = json.load(open(templates_path))
body.update({
    "smtp_host": "smtp.resend.com",
    "smtp_port": "465",
    "smtp_user": "resend",
    "smtp_pass": resend_key,
    "smtp_admin_email": "notifications@nokta.uk",
    "smtp_sender_name": "nokta",
    # The default 2 an hour only applies to Supabase'"'"'s shared sender.
    "rate_limit_email_sent": 30,
})
request = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/config/auth",
    data=json.dumps(body).encode(),
    method="PATCH",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(request) as response:
        config = json.load(response)
except urllib.error.HTTPError as error:
    sys.exit(f"Supabase rejected the update ({error.code}): {error.read().decode()[:300]}")
print("Updated:", ", ".join(f"{key}={config.get(key)}" for key in ["smtp_host", "smtp_admin_email", "smtp_sender_name", "rate_limit_email_sent"]))
print("Templates:", ", ".join(name for name in ["confirmation", "recovery", "magic_link", "email_change", "invite"] if config.get(f"mailer_templates_{name}_content") == body[f"mailer_templates_{name}_content"]))
' "$ref" "$templates"
