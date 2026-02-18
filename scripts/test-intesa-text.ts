import { extractPortfolioFromText, parseMovimentiFromText, extractConsistenzaSection } from '../lib/pdf-text-parser';
import { PDFParse } from 'pdf-parse';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const dir = '/Users/leon/Desktop/banche EC/BANCA INTESA/BANCA INTESA/Dossier titoli/';
const files = readdirSync(dir).filter(f => f.endsWith('.pdf')).sort();

async function main() {
  for (const f of files) {
    const buf = readFileSync(path.join(dir, f));
    const p = new PDFParse(new Uint8Array(buf));
    const t = await p.getText();
    const text = t?.text || '';
    const result = extractPortfolioFromText(text);
    const mov = parseMovimentiFromText(text);
    console.log(
      f.substring(0, 30).padEnd(32) +
      'text=' + String(text.length).padStart(6) +
      ' h=' + String(result.holdings.length).padStart(2) +
      ' v=' + String(result.holdings.filter(h => h.verified).length).padStart(2) +
      ' sum=' + result.holdingsSum.toFixed(2).padStart(12) +
      ' total=' + String(result.total).padStart(10) +
      ' mov=' + String(mov.movements.length).padStart(2)
    );
  }
}

main().catch(console.error);
