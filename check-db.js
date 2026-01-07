const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function checkAnalyses() {
    let url = '';
    let key = '';
    try {
        const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
        url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
        key = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
    } catch (e) {
        console.error('Error reading .env.local:', e);
        return;
    }

    const supabase = createClient(url, key);

    const { data, error } = await supabase
        .from('analyses')
        .select('*');

    if (error) {
        console.error('Error fetching analyses:', error);
        return;
    }

    console.log(`\n=== RIEPILOGO ANALISI NEL DATABASE ===`);
    console.log(`Totale record trovati: ${data.length}\n`);

    data.forEach(a => {
        const idStr = a.id ? a.id.substring(0, 8) : 'N/D';
        const dateStr = a.period_start && a.period_end ? `${a.period_start} -> ${a.period_end}` : 'Periodo non trovato';
        console.log(`- ID: ${idStr}... | Banca: ${(a.bank_name || 'N/D').padEnd(25)} | Periodo: ${dateStr}`);
    });
    console.log(`\n======================================\n`);
}

checkAnalyses();
