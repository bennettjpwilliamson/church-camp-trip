// One-shot cleanup — removes the smoke-test row from BOTH Supabase and Sheet.
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.query.token !== process.env.DIAGNOSTIC_TOKEN) return res.status(404).end();

  // Supabase
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: dbDeleted, error: dbError } = await supabase
    .from('signups')
    .delete()
    .ilike('name', '%smoke test%')
    .select();

  // Sheet — find rows containing "smoke test" and delete them
  let sheetDeleted = 0;
  let sheetError = null;
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Sheet1!A1:G1000',
    });
    const rows = r.data.values || [];
    // Find indexes (0-based) of rows matching "smoke test" in Name column (index 1)
    const matchIdxs = [];
    rows.forEach((row, i) => {
      if (i === 0) return; // header
      if ((row[1] || '').toLowerCase().includes('smoke test')) matchIdxs.push(i);
    });
    // Delete from the bottom up so indices stay valid
    matchIdxs.sort((a, b) => b - a);
    for (const idx of matchIdxs) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId: 0, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 },
            },
          }],
        },
      });
      sheetDeleted++;
    }
  } catch (e) {
    sheetError = e?.message || String(e);
  }

  res.status(200).json({
    supabaseDeleted: dbDeleted?.length || 0,
    supabaseError: dbError?.message || null,
    sheetDeleted,
    sheetError,
  });
}
