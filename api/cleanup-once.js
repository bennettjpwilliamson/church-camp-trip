// One-shot cleanup. Will be deleted right after use.
// Hits Supabase, deletes test/audit rows, returns count.
// Token-protected via DIAGNOSTIC_TOKEN.
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.query.token !== process.env.DIAGNOSTIC_TOKEN) return res.status(404).end();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const patterns = ['audit-test@example.com', 'rl1@test.com', 'rl2@test.com', 'rl3@test.com', 'rl4@test.com', 'rl5@test.com', 'rl6@test.com', 'rl7@test.com'];
  const { data, error } = await supabase.from('signups').delete().in('email', patterns).select();
  res.status(200).json({ deleted: data?.length || 0, error: error?.message || null, rows: data });
}
