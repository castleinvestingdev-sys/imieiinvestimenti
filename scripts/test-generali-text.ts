import { PDFParse } from 'pdf-parse';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { extractPortfolioFromText, parseMovimentiFromText, extractGeneraliCCData, isGeneraliCC } from '../lib/pdf-text-parser';

const DIRS = [
  { label: 'Condorelli DT', dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Condorelli Zanacca Zanacca)/DT', type: 'DT' as const },
  { label: 'Condorelli CC', dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Condorelli Zanacca Zanacca)/CC', type: 'CC' as const },
  { label: 'Zanacca DT', dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Zanacca)/DT', type: 'DT' as const },
  { label: 'Zanacca CC', dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Zanacca)/CC', type: 'CC' as const },
  { label: 'Ughetti DT', dir: '/Users/leon/Desktop/Banca Generali/Banca generali (ughetti)/Dossier Titoli', type: 'DT' as const },
  { label: 'Ughetti LIQ', dir: '/Users/leon/Desktop/Banca Generali/Banca generali (ughetti)/Liquidità', type: 'LIQ' as const },
];

async function run() {
  let totalPdfs = 0;
  let dtOk = 0, dtFail = 0, dtEmpty = 0;
  let ccOk = 0, ccFail = 0, ccCompMissing = 0;
  let totalWithMov = 0;

  for (const { label, dir, type } of DIRS) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🏦 ${label} (${type})`);
    console.log('='.repeat(70));

    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
    } catch {
      console.log('Directory not found, skipping');
      continue;
    }

    for (const fileName of files) {
      totalPdfs++;
      const filePath = path.join(dir, fileName);
      const buf = readFileSync(filePath);
      const parser = new PDFParse(new Uint8Array(buf));
      const textResult = await parser.getText();
      let text = textResult.text || '';
      text = text.replace(/(\d)[\u0019\u001a\u001b\u001c\u001d\u001e\u001f](\d)/g, '$1$2');

      const shortName = fileName.substring(0, 6);

      if (type === 'CC' || type === 'LIQ') {
        // CC/LIQ: test extractGeneraliCCData
        const ccResult = extractGeneraliCCData(text);
        if (!ccResult) {
          console.log(`❌ ${shortName}: CC parser returned null! isGeneraliCC=${isGeneraliCC(text)}, textLen=${text.length}`);
          ccFail++;
          continue;
        }

        const expectedDelta = ccResult.saldoFinale - ccResult.saldoIniziale;
        const movSum = ccResult.movementsSum;
        const error = Math.abs(expectedDelta - movSum);
        const errorPct = Math.abs(expectedDelta) > 0 ? (error / Math.abs(expectedDelta) * 100).toFixed(2) : '0.00';
        const status = error < 1 ? '✅' : (error < 10 ? '⚠️' : '❌');

        if (error < 1) ccOk++;
        else ccFail++;

        const comp = ccResult.competenze;
        const compStatus = comp ? '✅' : '❌';
        console.log(`${status} ${shortName}: saldoIniz=${ccResult.saldoIniziale.toFixed(2)}, saldoFin=${ccResult.saldoFinale.toFixed(2)}, delta=${expectedDelta.toFixed(2)}, movSum=${movSum.toFixed(2)}, err=${error.toFixed(2)}€ (${errorPct}%), mov=${ccResult.movements.length}, period=${ccResult.periodStart || '?'}→${ccResult.periodEnd || '?'}, bank=${ccResult.bankDetected || '?'}`);
        if (comp) {
          console.log(`   ${compStatus} COMPETENZE: numCred=${comp.numeriCreditori.toFixed(2)}, numDeb=${comp.numeriDebitori.toFixed(2)}, intCred=${comp.interessiCreditoriLordi.toFixed(2)}, intDeb=${comp.interessiDebitoriLordi.toFixed(2)}, spese=${comp.speseTotali.toFixed(2)}, ritenuta=${comp.ritenutaFiscale.toFixed(2)}, tasso=${comp.tassoAttivo || 'n/a'}/${comp.tassoPassivo || 'n/a'}`);
        } else {
          console.log(`   ${compStatus} COMPETENZE: not found`);
          ccCompMissing++;
        }

        if (error >= 1) {
          console.log(`   ⚠️  Expected delta: ${expectedDelta.toFixed(2)}, Got movSum: ${movSum.toFixed(2)}, Diff: ${(movSum - expectedDelta).toFixed(2)}€`);
          // Show first few movements for debugging
          for (const m of ccResult.movements.slice(0, 5)) {
            console.log(`      ${m.date} ${m.amount > 0 ? '+' : ''}${m.amount.toFixed(2)} ${m.description.substring(0, 60)}${m.category ? ' [' + m.category + ']' : ''}`);
          }
          if (ccResult.movements.length > 5) {
            console.log(`      ... (${ccResult.movements.length - 5} more movements)`);
          }
        }
      } else {
        // DT: test extractPortfolioFromText + parseMovimentiFromText
        const portfolio = extractPortfolioFromText(text);
        const movResult = parseMovimentiFromText(text);

        const holdings = portfolio.holdings.length;
        const total = portfolio.total || 0;
        const sum = portfolio.holdingsSum;
        const gap = total > 0 ? Math.abs(sum - total) : 0;
        const gapPct = total > 0 ? (gap / total * 100).toFixed(2) : '0.00';
        const movCount = movResult.movements.length;
        const startCount = Object.keys(movResult.startQuantities).length;
        const endCount = Object.keys(movResult.endQuantities).length;

        const status = (holdings === 0 && total === 0) ? '⬜' : (gap < 1 ? '✅' : '❌');

        if (holdings === 0 && total === 0) dtEmpty++;
        else if (gap < 1) dtOk++;
        else dtFail++;
        if (movCount > 0) totalWithMov++;

        console.log(`${status} ${shortName}: holdings=${holdings}, total=${total.toFixed(0)}, sum=${sum.toFixed(0)}, gap=${gap.toFixed(2)}€ (${gapPct}%), mov=${movCount}, startQty=${startCount}, endQty=${endCount}, bank=${portfolio.bankDetected || '?'}, textLen=${text.length}`);

        if (gap >= 1 && holdings > 0) {
          console.log(`   ⚠️  Gap: sum=${sum.toFixed(2)} vs total=${total.toFixed(2)}`);
        }
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RIEPILOGO: ${totalPdfs} PDF totali`);
  console.log(`   DT: ✅ ${dtOk} OK | ⬜ ${dtEmpty} vuoti | ❌ ${dtFail} con gap`);
  console.log(`   CC/LIQ: ✅ ${ccOk} OK (err < 1€) | ❌ ${ccFail} con errore | COMPETENZE mancanti: ${ccCompMissing}`);
  console.log(`   📋 ${totalWithMov} DT con movimenti estratti`);
  console.log('='.repeat(70));
}

run().catch(console.error);
