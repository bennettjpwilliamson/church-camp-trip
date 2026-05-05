import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { google } from 'googleapis';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

function getSetupLabel(value) {
  const labels = {
    tent: 'Tent in the group site',
    rv: 'RV or trailer in the group site',
    cabin: 'Cabin or A-frame (booked with the Plunge)',
    undecided: 'Still deciding',
  };
  return labels[value] || value;
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
    requestBody: {
      values: [row],
    },
  });
}

async function sendNotificationEmail(data) {
  const notificationEmail = process.env.NOTIFICATION_EMAIL;
  if (!notificationEmail) return;

  await resend.emails.send({
    from: 'Camp Trip <noreply@' + (process.env.RESEND_DOMAIN || 'resend.dev') + '>',
    to: [notificationEmail],
    subject: `New sign-up: ${data.name} (party of ${data.party})`,
    html: `
      <h2>New camping trip sign-up</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
        <tr><td style="padding:6px 12px;font-weight:bold">Name</td><td style="padding:6px 12px">${data.name}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Email</td><td style="padding:6px 12px">${data.email}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Phone</td><td style="padding:6px 12px">${data.phone || '—'}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Party size</td><td style="padding:6px 12px">${data.party}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Staying</td><td style="padding:6px 12px">${getSetupLabel(data.setup)}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold">Notes</td><td style="padding:6px 12px">${data.notes || '—'}</td></tr>
      </table>
    `,
  });
}

async function sendConfirmationEmail(data) {
  await resend.emails.send({
    from: 'Table Rock Camp Trip <noreply@' + (process.env.RESEND_DOMAIN || 'resend.dev') + '>',
    to: [data.email],
    subject: "You're signed up for the camping trip!",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1A1F2A">
        <h2 style="margin-bottom:4px">You're in, ${data.name}!</h2>
        <p style="color:#3F4754">We've got you down for the Table Rock Church camping trip at Silver Creek.</p>
        <table style="border-collapse:collapse;font-size:15px;margin:16px 0">
          <tr><td style="padding:6px 12px;font-weight:bold">Dates</td><td style="padding:6px 12px">August 28–30, 2026</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Party size</td><td style="padding:6px 12px">${data.party}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Staying</td><td style="padding:6px 12px">${getSetupLabel(data.setup)}</td></tr>
        </table>
        <p style="color:#3F4754;font-size:14px">Questions? Reply to <a href="mailto:bennettandkaris@gmail.com">bennettandkaris@gmail.com</a>.</p>
      </div>
    `,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, party, setup, notes } = req.body;

  // Server-side validation
  if (!name || !email || !party || !setup) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (party < 1 || party > 20) {
    return res.status(400).json({ error: 'Party size must be between 1 and 20.' });
  }

  const validSetups = ['tent', 'rv', 'cabin', 'undecided'];
  if (!validSetups.includes(setup)) {
    return res.status(400).json({ error: 'Please select a valid lodging option.' });
  }

  const timestamp = new Date().toISOString();

  try {
    // 1. Save to Supabase (primary datastore)
    const { error: dbError } = await supabase
      .from('signups')
      .insert({
        name,
        email,
        phone: phone || null,
        party_size: party,
        setup,
        notes: notes || null,
        created_at: timestamp,
      });

    if (dbError) {
      console.error('Supabase insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save your sign-up. Please try again.' });
    }

    // 2. Append to Google Sheet (best-effort)
    try {
      await appendToSheet([timestamp, name, email, phone || '', party, getSetupLabel(setup), notes || '']);
    } catch (sheetErr) {
      console.error('Google Sheets append error:', sheetErr);
    }

    // 3. Send notification email to organizer (best-effort)
    try {
      await sendNotificationEmail({ name, email, phone, party, setup, notes });
    } catch (emailErr) {
      console.error('Notification email error:', emailErr);
    }

    // 4. Send confirmation email to signer (best-effort)
    try {
      await sendConfirmationEmail({ name, email, party, setup });
    } catch (emailErr) {
      console.error('Confirmation email error:', emailErr);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Signup handler error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
