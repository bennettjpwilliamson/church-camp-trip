// Diagnostic endpoint — checks each external service. Returns a JSON report.
// Protected by ?token=<DIAGNOSTIC_TOKEN>. No secrets ever returned in the body.
//
// Query params:
//   ?token=...                required
//   ?sendTestTo=email@x       send a real Resend test message to that address
//   ?deleteTestSignups=1      remove rows from Supabase where name='Test User'

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export default async function handler(req, res) {
  const token = req.query.token;
  if (token !== process.env.DIAGNOSTIC_TOKEN) {
    return res.status(404).end();
  }

  const sendTestTo = req.query.sendTestTo;
  const deleteTestSignups = req.query.deleteTestSignups === '1';

  const report = {
    timestamp: new Date().toISOString(),
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? `set (${process.env.SUPABASE_URL.length} chars)` : 'MISSING',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `set (${process.env.SUPABASE_SERVICE_KEY.length} chars)` : 'MISSING',
      RESEND_API_KEY: process.env.RESEND_API_KEY ? `set (${process.env.RESEND_API_KEY.length} chars)` : 'MISSING',
      NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL || 'MISSING',
      RESEND_DOMAIN: process.env.RESEND_DOMAIN || 'not set (will use resend.dev)',
      GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID ? 'set' : 'not set (sheets disabled)',
    },
    supabase: { ok: false, error: null, signupCount: null, latestSignup: null, deleted: null },
    resend: { ok: false, error: null, domains: null, sendTest: null },
  };

  // ---- Supabase ----
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

      if (deleteTestSignups) {
        const { data, error } = await supabase
          .from('signups')
          .delete()
          .eq('name', 'Test User')
          .select();
        if (error) report.supabase.deleted = { ok: false, error: error.message };
        else report.supabase.deleted = { ok: true, removedRows: data?.length || 0 };
      }

      const { data, error, count } = await supabase
        .from('signups')
        .select('id, name, email, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) {
        report.supabase.error = error.message;
      } else {
        report.supabase.ok = true;
        report.supabase.signupCount = count;
        report.supabase.latestSignup = data?.[0] || null;
      }
    } catch (e) {
      report.supabase.error = e.message;
    }
  } else {
    report.supabase.error = 'Supabase env vars missing';
  }

  // ---- Resend ----
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.domains.list();
      if (error) {
        report.resend.error = error.message || JSON.stringify(error);
      } else {
        report.resend.ok = true;
        report.resend.domains = (data?.data || []).map(d => ({ name: d.name, status: d.status }));
      }

      if (sendTestTo) {
        const from = process.env.RESEND_DOMAIN
          ? `Camp Trip <noreply@${process.env.RESEND_DOMAIN}>`
          : 'Camp Trip <onboarding@resend.dev>';
        const { data: sendData, error: sendError } = await resend.emails.send({
          from,
          to: [sendTestTo],
          subject: 'Diagnostic test — please ignore',
          html: '<p>If you received this, Resend can deliver to this address.</p>',
        });
        if (sendError) {
          report.resend.sendTest = { ok: false, to: sendTestTo, from, error: sendError.message || JSON.stringify(sendError), statusCode: sendError.statusCode };
        } else {
          report.resend.sendTest = { ok: true, to: sendTestTo, from, messageId: sendData?.id };
        }
      }
    } catch (e) {
      report.resend.error = e.message;
    }
  } else {
    report.resend.error = 'RESEND_API_KEY missing';
  }

  res.status(200).json(report);
}
