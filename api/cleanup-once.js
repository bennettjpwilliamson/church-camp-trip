// One-shot cleanup — removes the smoke-test row from Supabase. Will be deleted.
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.query.token !== process.env.DIAGNOSTIC_TOKEN) return res.status(404).end();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase
    .from('signups')
    .delete()
    .ilike('name', '%smoke test%')
    .select();
  res.status(200).json({ deleted: data?.length || 0, error: error?.message || null, rows: data });
}
