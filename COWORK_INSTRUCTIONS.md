# Cowork Task: Finish Wiring Up the Church Camp Trip Site

## Context

A Church camp trip website has been built and deployed. You need to finish the production setup by creating the backing services and connecting them via environment variables.

**What's already done:**
- GitHub repo: https://github.com/bennettjpwilliamson/church-camp-trip
- Vercel project: `church-camp-trip` (deployed at https://church-camp-trip.vercel.app)
- Local code: `/Users/bennettwilliamson/Desktop/church-camp-trip/`
- Vercel CLI is installed and logged in
- GitHub CLI (`gh`) is installed and logged in as `bennettjpwilliamson`

**What still needs to happen:**
1. Create a Supabase project + run the schema
2. Create a Resend account + get an API key
3. (Optional) Set up Google Sheets API
4. Add all environment variables to Vercel
5. Trigger a redeploy and verify the form end-to-end

The user's notification email is `bennettandkaris@gmail.com`.

---

## Step 1 — Supabase (database)

Use the `claude-in-chrome` MCP (or `computer-use` if Chrome MCP is not available) to navigate the browser. Ask the user to authenticate when needed — do not attempt to create accounts yourself.

1. Navigate to https://supabase.com/dashboard
2. Ask the user to sign in (GitHub auth is fastest)
3. Click **New project**, name it `church-camp-trip`, pick a strong DB password (save it for the user), choose a region close to them (US West is fine), and create
4. Wait for provisioning (~2 minutes)
5. Open **SQL Editor**, click **New query**, paste the entire contents of `/Users/bennettwilliamson/Desktop/church-camp-trip/supabase-setup.sql`, and click **Run**
6. Confirm the `signups` table appears in **Table Editor**
7. Go to **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role secret** (NOT the anon key — use the one labeled `service_role`)

Save these locally as `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

---

## Step 2 — Resend (email)

1. Navigate to https://resend.com/signup
2. Ask the user to sign up with `bennettandkaris@gmail.com`
3. Once in the dashboard, go to **API Keys → Create API Key**
4. Name it `church-camp-trip`, give it `Full access`, and copy the key (starts with `re_`)

Save it as `RESEND_API_KEY`.

**Domain note:** By default, Resend lets you send from `noreply@resend.dev` to *verified email addresses only* on the free tier. The site needs to send confirmation emails to *anyone* who signs up, so the user has two options:

- **Option A (recommended):** Have the user add and verify a domain in Resend (Resend → Domains → Add Domain). If they own `tablerock.church` or have one to use, set up the DNS records Resend provides. Then set env var `RESEND_DOMAIN` to that domain.
- **Option B (testing only):** Skip domain verification for now. The notification email to `bennettandkaris@gmail.com` will work since that's the account owner. Confirmation emails to other signers will fail silently until a domain is verified.

Note in your handoff to the user which option you went with.

---

## Step 3 — Google Sheets (optional, do only if user confirms)

This is the most fiddly step. Skip it if the user is good with just Supabase + email — the site works fine without Sheets.

If they want it:

1. Go to https://console.cloud.google.com/
2. Create a new project (e.g., "church-camp-trip")
3. **APIs & Services → Library** → search for "Google Sheets API" → Enable
4. **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `camp-trip-sheets`
   - Skip role assignment (not needed for Sheets)
   - Click **Done**
5. Click the new service account → **Keys → Add Key → Create new key → JSON** → downloads a JSON file
6. Open the JSON. Copy two values:
   - `client_email` → save as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → save as `GOOGLE_PRIVATE_KEY` (preserve the literal `\n` newlines as-is)
7. Create a new Google Sheet at https://sheets.new
   - Title it "Church Camp Trip Signups"
   - Add header row in row 1: `Timestamp | Name | Email | Phone | Party Size | Staying | Notes`
   - Click **Share**, paste the service account email, give **Editor** access, uncheck "Notify people", Share
8. Copy the spreadsheet ID from the URL (the long string between `/d/` and `/edit`) → save as `GOOGLE_SHEETS_ID`

---

## Step 4 — Add env vars to Vercel

Use the Vercel CLI (already installed and logged in). From the project directory:

```bash
cd /Users/bennettwilliamson/Desktop/church-camp-trip
```

Add each variable to the `production`, `preview`, and `development` environments. Use `vercel env add <NAME>` — it will prompt for the value and which environments. Pick all three for each.

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `RESEND_API_KEY`
- `NOTIFICATION_EMAIL` → `bennettandkaris@gmail.com`

Optional (only if Step 2 Option A was done):
- `RESEND_DOMAIN` → the verified domain

Optional (only if Step 3 was done):
- `GOOGLE_SHEETS_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY` — when prompted, paste the full key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, with `\n` characters literal (don't expand them). The serverless function code handles unescaping.

For the private key specifically, you may need to use stdin redirection because of multiline content:
```bash
printf '%s' "$GOOGLE_PRIVATE_KEY_VALUE" | vercel env add GOOGLE_PRIVATE_KEY production
```

After all are added, trigger a redeploy:
```bash
vercel --prod
```

---

## Step 5 — End-to-end test

1. Open https://church-camp-trip.vercel.app in a browser
2. Scroll to Sign Up, fill out the form with a real email you can check
3. Submit it
4. Verify all of the following:
   - Success message appears on the page
   - A row appears in the Supabase `signups` table (use Table Editor)
   - A row appears in the Google Sheet (if configured)
   - `bennettandkaris@gmail.com` receives a notification email
   - The email used in the form receives a confirmation email (only works if domain verified, otherwise skip)
5. Check Vercel function logs for any errors: `vercel logs --prod`

If anything fails, look at the function logs (`vercel logs church-camp-trip.vercel.app`) for the actual error and fix the corresponding env var.

---

## Reporting back

When done, give the user a short summary:
- Which services were set up (Supabase: yes, Resend: yes, Sheets: yes/no)
- Which Resend option was used (verified domain vs. resend.dev)
- A confirmation that the test submission worked
- Any credentials or important values they need to know (Supabase DB password, Resend dashboard URL, Sheet URL)

Do NOT save Supabase service keys, Resend API keys, or Google private keys to memory — those are secrets. The user can retrieve them from each service's dashboard if they need them again.
