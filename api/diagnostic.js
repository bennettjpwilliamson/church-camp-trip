// Diagnostic endpoint — checks that each external service is reachable
// and configured correctly. Returns a JSON report. NO secrets returned.
// Protected by a query-string token so randoms can't hit it.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export default async function handler(req, res) {
  const token = req.query.token;
  if (token !== process.env.DIAGNOSTIC_TOKEN) {
    return res.status(404).end();
  }

  const report = {
    timestamp: new Date().toISOString(),
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? `set (${process.env.SUPABASE_URL.length} chars)` : 'MISSING',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `set (${process.env.SUPABASE_SERVICE_KEY.length} chars)` : 'MISSING',
      RESEND_API_KEY: process.env.RESEND_API_KEY ? `set (${process.env.RESEND_API_KEY.length} chars)` : 'MISSING',
      NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL ? process.env.NOTIFICATION_EMAIL : 'MISSING',
      RESEND_DOMAIN: process.env.RESEND_DOMAIN || 'not set (will use resend.dev)',
      GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID ? 'set' : 'not set (sheets disabled)',
    },
    supabase: { ok: false, error: null, signupCount: null, latestSignup: null },
    resend: { ok: false, error: null, domains: null },
  };

  // Test Supabase
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
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

  // Test Resend — list domains to confirm key is valid and check verification status
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.domains.list();
      if (error) {
        report.resend.error = error.message || JSON.stringify(error);
      } else {
        report.resend.ok = true;
        report.resend.domains = (data?.data || []).map(d => ({
          name: d.name,
          status: d.status,
          region: d.region,
        }));
      }
    } catch (e) {
      report.resend.error = e.message;
    }
  } else {
    report.resend.error = 'RESEND_API_KEY missing';
  }

  res.status(200).json(report);
}
