# Church Camp Trip — Setup & Operations

Live site: **https://church-camp-trip.vercel.app**
Repo: https://github.com/bennettjpwilliamson/church-camp-trip

---

## What's wired up

- **Hosting**: Vercel (auto-deploys from GitHub `main`)
- **Database**: Supabase (`signups` table)
- **Email**: Resend
- **Form**: `POST /api/signup` saves to Supabase + sends notification email

## What still needs a decision before launch

### Resend domain verification (required for confirmation emails)
Right now, signers do NOT get a confirmation email — Resend rejects sends to anyone other than the account owner until a domain is verified.

To turn confirmation emails on:
1. Pick a domain you own (e.g. `tablerock.church` or any domain).
2. In [Resend → Domains](https://resend.com/domains), add it and follow the DNS steps.
3. Once verified, set `RESEND_DOMAIN=yourdomain.com` in Vercel env vars.
4. Redeploy. Confirmation emails will start going out.

### Where do organizer notifications go?
Set in `NOTIFICATION_EMAIL` env var. Currently: `williamsonimaging@gmail.com`. If you want them at a different address, update that env var in Vercel.

### (Optional) Google Sheets
Not configured. If you want a live Google Sheet that gets a row for each sign-up, follow the steps in the old README — set `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`.

---

## How to view sign-ups

Open the Supabase dashboard → Table Editor → `signups`. Every row is one person.

Each row has: name, email, phone, party_size, setup (tent / rv / cabin / undecided), notes, created_at.

If you'd rather have them in a spreadsheet you can sort and share, set up the Google Sheets piece above.

## How to test the form is working

```bash
curl -X POST https://church-camp-trip.vercel.app/api/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"you@example.com","party":1,"setup":"tent"}'
```

Should return `{"success":true, ...}`. If you see an error, check Vercel logs:
```bash
vercel logs --prod
```

## Form behavior (what users see)

- **First-time signer**: Saved to DB → "You're signed up. See you in August!"
- **Re-signing with same email**: Existing row is **updated** (not duplicated) → "We updated your sign-up."
- **Rate-limited**: 6+ submissions/min from same IP → 429.
- **Invalid input**: 400 with a specific message.
- **Confirmation email**: Only sent if `RESEND_DOMAIN` is set; success message reflects this.

---

## Local dev

```bash
npm install
cp .env.example .env.local      # fill in real values
npx vercel env pull .env.local  # or pull from Vercel
npx vercel dev
```

Open http://localhost:3000

---

## Schema changes

If you change the Supabase schema, the current SQL is in `supabase-setup.sql`. It's idempotent — safe to re-run.

## Files

- `public/index.html` — the only page
- `public/assets/` — photos
- `api/signup.js` — sign-up handler
- `vercel.json` — caching rules
- `supabase-setup.sql` — DB schema
