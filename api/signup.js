import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Gmail SMTP — sends from GMAIL_USER using an App Password.
// Free tier allows ~500 outbound emails/day, far more than we'll need.
let mailerCache = null;
function getMailer() {
  if (mailerCache) return mailerCache;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  mailerCache = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return mailerCache;
}

// In-memory rate limit. Cold starts reset it (that's fine — this is just to
// stop someone hammering the form from a single tab; real abuse would need
// edge middleware).
const rateLimit = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function rateLimited(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  rateLimit.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function setupLabel(value) {
  return {
    tent:      'Tent in the group site',
    rv:        'RV or trailer in the group site',
    cabin:     'Cabin or A-frame (booked with the Plunge)',
    undecided: 'Still deciding',
  }[value] || value;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

async function appendToSheet(row) {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_PRIVATE_KEY) return;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: 'Sheet1!A:G',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function sendNotificationEmail(data) {
  const mailer = getMailer();
  const to = process.env.NOTIFICATION_EMAIL;
  if (!mailer || !to) return;
  const from = process.env.GMAIL_USER;
  await mailer.sendMail({
    from: `Camp Trip Signups <${from}>`,
    to,
    replyTo: data.email,
    subject: `New sign-up: ${data.name} (party of ${data.party})`,
    html: `
      <h2 style="font-family:sans-serif">New camping trip sign-up</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
        <tr><td style="padding:6px 12px;font-weight:bold">Name</td><td style="padding:6px 12px">${escapeHtml(data.name)}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Email</td><td style="padding:6px 12px">${escapeHtml(data.email)}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Phone</td><td style="padding:6px 12px">${escapeHtml(data.phone || '—')}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Party size</td><td style="padding:6px 12px">${data.party}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Staying</td><td style="padding:6px 12px">${escapeHtml(setupLabel(data.setup))}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;vertical-align:top">Notes</td><td style="padding:6px 12px;white-space:pre-wrap">${escapeHtml(data.notes || '—')}</td></tr>
      </table>
    `,
  });
}

async function sendConfirmationEmail(data) {
  const mailer = getMailer();
  if (!mailer) return { skipped: 'no mailer configured' };
  const from = process.env.GMAIL_USER;
  await mailer.sendMail({
    from: `Table Rock Camp Trip <${from}>`,
    to: data.email,
    replyTo: from,
    subject: "You're signed up for the camping trip!",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1A1F2A">
        <h2 style="margin-bottom:4px">You're in, ${escapeHtml(data.name)}!</h2>
        <p style="color:#3F4754">We've got you down for the Table Rock Church camping trip at Silver Creek.</p>
        <table style="border-collapse:collapse;font-size:15px;margin:16px 0">
          <tr><td style="padding:6px 12px;font-weight:bold">Dates</td><td style="padding:6px 12px">August 28–30, 2026</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Party size</td><td style="padding:6px 12px">${data.party}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Staying</td><td style="padding:6px 12px">${escapeHtml(setupLabel(data.setup))}</td></tr>
        </table>
        <p style="color:#3F4754;font-size:14px">Don't forget: Venmo <strong>@TableRockChurch</strong> with "campout" in the note ($10/person or $20/family).</p>
        <p style="color:#3F4754;font-size:14px">Questions? Reply to this email.</p>
      </div>
    `,
  });
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Give it a minute and try again.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { name, email, phone, party, setup, notes } = body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const partyN = parseInt(party, 10);
  if (!partyN || partyN < 1 || partyN > 20) {
    return res.status(400).json({ error: 'Party size must be between 1 and 20.' });
  }
  const validSetups = ['tent', 'rv', 'cabin', 'undecided'];
  if (!validSetups.includes(setup)) {
    return res.status(400).json({ error: 'Please pick where you\'ll stay.' });
  }
  if (notes && String(notes).length > 1000) {
    return res.status(400).json({ error: 'Notes are too long (1000 character max).' });
  }
  if (name.length > 120 || email.length > 200 || (phone && phone.length > 40)) {
    return res.status(400).json({ error: 'One of your fields is too long. Please shorten it.' });
  }

  const cleaned = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: (phone || '').toString().trim() || null,
    party: partyN,
    setup,
    notes: (notes || '').toString().trim() || null,
  };

  const timestamp = new Date().toISOString();

  try {
    const { data: existing, error: lookupError } = await supabase
      .from('signups')
      .select('id')
      .eq('email', cleaned.email)
      .maybeSingle();
    if (lookupError) {
      console.error('Supabase lookup error:', lookupError);
      return res.status(500).json({ error: 'Could not save your sign-up. Please try again.' });
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('signups')
        .update({
          name: cleaned.name,
          phone: cleaned.phone,
          party_size: cleaned.party,
          setup: cleaned.setup,
          notes: cleaned.notes,
        })
        .eq('id', existing.id);
      if (updateError) {
        console.error('Supabase update error:', updateError);
        return res.status(500).json({ error: 'Could not save your sign-up. Please try again.' });
      }
    } else {
      const { error: insertError } = await supabase
        .from('signups')
        .insert({
          name: cleaned.name,
          email: cleaned.email,
          phone: cleaned.phone,
          party_size: cleaned.party,
          setup: cleaned.setup,
          notes: cleaned.notes,
          created_at: timestamp,
        });
      if (insertError) {
        console.error('Supabase insert error:', insertError);
        return res.status(500).json({ error: 'Could not save your sign-up. Please try again.' });
      }
    }

    try {
      await appendToSheet([timestamp, cleaned.name, cleaned.email, cleaned.phone || '', cleaned.party, setupLabel(cleaned.setup), cleaned.notes || '']);
    } catch (e) {
      console.error('Google Sheets append error:', e?.message || e);
    }

    let notificationSent = false;
    try {
      await sendNotificationEmail(cleaned);
      notificationSent = true;
    } catch (e) {
      console.error('Notification email error:', e?.message || e);
    }

    let confirmationSent = false;
    try {
      const result = await sendConfirmationEmail(cleaned);
      if (result?.ok) confirmationSent = true;
    } catch (e) {
      console.error('Confirmation email error:', e?.message || e);
    }

    return res.status(200).json({
      success: true,
      updated: !!existing,
      confirmationSent,
      notificationSent,
    });
  } catch (e) {
    console.error('Signup handler error:', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
