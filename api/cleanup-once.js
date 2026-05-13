// One-shot cleanup. Will be deleted after use.
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.query.token !== process.env.DIAGNOSTIC_TOKEN) return res.status(404).end();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const emails = ['sheets-test@example.com', 'audit-test@example.com'];
  const { data, error } = await supabase.from('signups').delete().in('email', emails).select();
  res.status(200).json({ deleted: data?.length || 0, error: error?.message || null, rows: data });
}
