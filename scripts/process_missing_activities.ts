import { createClient } from '@supabase/supabase-js';
import { parsePdf } from '../src/lib/pavilion/parser';
import { importOccupations } from '../src/lib/pavilion/importer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('Checking for missing schedules...');
  
  const { data: sheets, error: sheetsErr } = await supabase.from('pavilion_activity_sheets').select('activity_date, file_path, original_filename');
  if (sheetsErr) throw sheetsErr;
  
  const { data: occs, error: occsErr } = await supabase.from('activity_occurrences').select('activity_date');
  if (occsErr) throw occsErr;
  
  const occDates = new Set(occs.map(o => o.activity_date));
  
  const missing = sheets.filter(s => !occDates.has(s.activity_date));
  
  console.log(`Total PDFs: ${sheets.length}`);
  console.log(`Total parsed days: ${occDates.size}`);
  console.log(`Missing to process: ${missing.length}`);
  
  for (const sheet of missing) {
    console.log(`\nProcessing ${sheet.activity_date} (${sheet.file_path})...`);
    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('pavilion_activities')
        .download(sheet.file_path);

      if (downloadError || !fileData) {
        console.error(`  -> Failed to download PDF:`, downloadError);
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const pdfBase64 = buffer.toString('base64');

      const { occupations } = await parsePdf(pdfBase64, sheet.original_filename || undefined);
      
      const dateToUse = sheet.activity_date;
      const occupationsWithDate = occupations.map(o => ({ ...o, date: dateToUse }));
      
      if (occupationsWithDate.length > 0) {
        await importOccupations(supabase, occupationsWithDate);
        console.log(`  -> Successfully imported ${occupationsWithDate.length} occupations for ${dateToUse}`);
      } else {
        console.log(`  -> Warning: No occupations found in PDF for ${dateToUse}`);
      }
    } catch (e) {
      console.error(`  -> Error processing ${sheet.activity_date}:`, e);
    }
  }
  
  console.log('\nDone!');
}

run().catch(console.error);
