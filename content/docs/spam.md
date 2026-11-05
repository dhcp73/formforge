# Spam protection

Every submission gets a **spam score from 0 to 100**, with reasons you can read in the record drawer.

| Signal | Effect |
|---|---|
| Honeypot field filled | Score 100: stored in the Spam folder (never rejected, so the bot still sees success) |
| Rate limit (per IP, per form, per minute) | `429 Too Many Requests` |
| Duplicate content within the window | Flagged as a duplicate |
| Links, spam keywords, ALL CAPS, gibberish | Adds to the score |
| Disposable email domain, invalid MX | Adds to the score |
| Bot user-agent, missing user-agent | Adds to the score |
| Submitted under 1.5 s after page load (send `_ts` = `Date.now()` at render) | Adds to the score |

When the score reaches the threshold (default **60**), the form either:

- **flags** the submission: it goes to the Spam folder and is excluded from webhooks and routing unless `includeSpam` is set, or
- **rejects** it with `422`.

You can configure all of this under **Form → Settings → Spam protection**. If you set **Allowed domains**, posts from any other `Origin`/`Referer` are refused with `403`.
