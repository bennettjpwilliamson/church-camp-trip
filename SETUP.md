# Church Camp Trip — Deployment Setup

## Quick Start

1. Push this folder to a GitHub repo
2. Connect the repo to Vercel
3. Set up the services below and add their env vars in Vercel

---

## 1. Vercel (hosting)

- Go to [vercel.com](https://vercel.com) and sign in with GitHub
- Click "Add New Project" → import the GitHub repo
- Framework preset: "Other"
- Root directory: (leave blank)
- Output directory: `public`
- Deploy

## 2. Supabase (database)

- Go to [supabase.com](https://supabase.com) and create a free project
- Open SQL Editor → run the contents of `supabase-setup.sql`
- Go to Settings → API and copy:
  - **Project URL** → `SUPABASE_URL`
  - **service_role key** (not anon key!) → `SUPABASE_SERVICE_KEY`

## 3. Resend (email)

- Go to [resend.com](https://resend.com) and create a free account
- Create an API key → `RESEND_API_KEY`
- (Optional) Add and verify your own domain for custom "from" addresses → `RESEND_DOMAIN`
- Free tier: 100 emails/day, 3,000/month — plenty for sign-ups

## 4. Google Sheets (optional but recommended)

- Go to [Google Cloud Console](https://console.cloud.google.com)
- Create a project (or use existing)
- Enable the **Google Sheets API**
- Create a **Service Account** (IAM → Service Accounts → Create)
- Download the JSON key file
- From the JSON, copy:
  - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `private_key` → `GOOGLE_PRIVATE_KEY`
- Create a Google Sheet, add headers in row 1: `Timestamp | Name | Email | Phone | Party Size | Staying | Notes`
- Share the sheet with the service account email (Editor access)
- Copy the spreadsheet ID from the URL → `GOOGLE_SHEETS_ID`
  (the long string between /d/ and /edit in the sheet URL)

## 5. Environment Variables in Vercel

Go to your project in Vercel → Settings → Environment Variables. Add:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJ...` |
| `RESEND_API_KEY` | `re_...` |
| `NOTIFICATION_EMAIL` | `bennettandkaris@gmail.com` |
| `GOOGLE_SHEETS_ID` | spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `xxx@xxx.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` |

Optional:
| `RESEND_DOMAIN` | your verified domain (defaults to `resend.dev`) |

---

## Testing locally

```bash
npm install
cp .env.example .env.local   # fill in real values
npx vercel dev
```

Open http://localhost:3000

---

## What happens on form submit

1. Client POST → `/api/signup`
2. Server validates all fields
3. Row inserted into Supabase `signups` table (primary backup)
4. Row appended to Google Sheet (for easy viewing/sharing)
5. Notification email sent to you
6. Confirmation email sent to the person who signed up
7. Client shows success message

Steps 3–6 are fault-tolerant: if Sheets or email fails, the DB write still succeeds and the user sees success. Errors are logged in Vercel's function logs.
