# UCAL availability notice list

`/ucal/` accepts an email and a separate, unchecked consent to the availability notice. It does not create an account or university connection. The visitor must click the confirmation button from their email before becoming eligible for the notice.

## Provisioning

Apply the additive `ucal-waitlist.sql` migration on an isolated schema-only branch first, then on the authorized database. Use a dedicated login role for the deployed endpoint: `USAGE` on `campus_growth` and `EXECUTE` on `request_ucal(text,text,text,text,uuid)`, `ucal_confirmation_delivery(uuid,uuid,boolean)`, `confirm_ucal(text)`, and `remove_ucal(uuid)`. The writer must have no table access or membership in an owner role.

Configure Vercel Production with `CAMPUS_UCAL_DATABASE_URL` for that writer and `CAMPUS_UCAL_SECRET` (32 random bytes as 64 hex characters). Keep a private, mode-0600 backup outside the checkout before configuring the sensitive Vercel variable (`CAMPUS_UCAL_KEY_BACKUP_PATH` for the provisioning script). Sensitive values cannot be read back from Vercel. Preserve this key for the future dispatch; it encrypts addresses and signs unsubscribe capabilities. The existing `RESEND_API_KEY` delivers mail from the verified `Campus <info@campuscli.com>` sender. Never expose these variables as `PUBLIC_*`.

Confirmation links expire after 48 hours; a delivered confirmation is not resent more than once an hour per email. Public requests are limited to five per connection per ten minutes. Addresses are encrypted; rate-limit buckets and duplicate-email indexes are HMACs. GET requests never confirm or unsubscribe. The token page disables analytics and removes its query string before actions. No address, token or provider response is logged.

## Notify students when access is actually available

The news integration date does not establish when students can connect their accounts. Verify the product and university access before dispatching. There is no date-triggered mailing.

Use a private environment with `CAMPUS_UCAL_ADMIN_DATABASE_URL` (owner/operator connection), `CAMPUS_UCAL_SECRET`, and the existing `RESEND_API_KEY`:

```sh
# Shows active counts only. No write or email is sent.
node scripts/notify-ucal-waitlist.mjs
# Explicit operational release, only after availability has been verified.
node scripts/notify-ucal-waitlist.mjs --send --confirm-ready
```

The sender claims confirmed, unexpired records with a lease and a fixed provider idempotency key. It ignores pending and unsubscribed records. It sends at most 100 per invocation and removes the encrypted address after successful delivery. For an ambiguous provider result, retry within the 23-hour window; inspect provider delivery before attempting recovery outside that window. The script will not automatically resend ambiguous attempts after that window or after three attempts.

Run `--purge-only` during list operations to delete records whose 180-day authorization has expired. Expired records are also purged on new subscriptions. The visible unsubscribe link and one-click provider endpoint delete the subscription immediately. A support deletion can use the private operator database; do not export addresses into issues or logs.

## Checks

`node --test scripts/ucal-waitlist.test.mjs` tests request validation, encryption, duplicate privacy, provider failures, consent, confirmation and signed deletion without sending real emails. `ucal-waitlist.integration.mjs` runs the SQL behavior and notification selection on an isolated branch with an injected sender.
