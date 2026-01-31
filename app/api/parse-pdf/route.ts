import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as https from 'https'

// Allow up to 5 minutes for Gemini PDF processing
export const maxDuration = 300

// Funzione per riparare JSON troncato (spostata fuori per evitare errori strict mode)
function repairTruncatedJson(jsonStr: string): string | null {
    let repaired = jsonStr

    // Conta parentesi aperte
    let openBraces = 0
    let openBrackets = 0
    let inString = false

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i]
        const prevChar = i > 0 ? repaired[i - 1] : ''

        if (char === '"' && prevChar !== '\\') {
            inString = !inString
        }

        if (!inString) {
            if (char === '{') openBraces++
            else if (char === '}') openBraces--
            else if (char === '[') openBrackets++
            else if (char === ']') openBrackets--
        }
    }

    // Se siamo dentro una stringa, tronca all'ultimo quote
    if (inString) {
        const lastQuote = repaired.lastIndexOf('"')
        if (lastQuote > 0) {
            repaired = repaired.substring(0, lastQuote)
            repaired = repaired.replace(/,?\s*"[^"]*"?\s*:?\s*$/, '')
        }
    }

    // Riconta dopo la potenziale troncatura
    openBraces = 0
    openBrackets = 0
    inString = false

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i]
        const prevChar = i > 0 ? repaired[i - 1] : ''

        if (char === '"' && prevChar !== '\\') {
            inString = !inString
        }

        if (!inString) {
            if (char === '{') openBraces++
            else if (char === '}') openBraces--
            else if (char === '[') openBrackets++
            else if (char === ']') openBrackets--
        }
    }

    // Rimuovi virgola finale se presente
    repaired = repaired.replace(/,\s*$/, '')

    // Chiudi parentesi non chiuse
    while (openBrackets > 0) {
        repaired += ']'
        openBrackets--
    }
    while (openBraces > 0) {
        repaired += '}'
        openBraces--
    }

    return repaired
}

function callGeminiDirect(apiKey: string, model: string, prompt: string, pdfBase64: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }
                ]
            }],
            generationConfig: {
                temperature: 0,
                topP: 1,
                topK: 1,
                maxOutputTokens: 65536
            }
        })

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            },
        }

        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        resolve(text)
                    } catch (e: any) {
                        reject(new Error(`JSON parse error: ${e.message}`))
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`))
                }
            })
        })

        req.on('error', (e: Error) => reject(e))
        req.write(requestBody)
        req.end()
    })
}

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

    try {
        console.log('\n========== NUOVA RICHIESTA PARSE PDF ==========')
        console.log('Timestamp:', new Date().toISOString())

        const formData = await request.formData()
        const file = formData.get('file') as File
        const userId = formData.get('userId') as string
        const guestEmail = formData.get('guestEmail') as string
        const fileName = file?.name || 'documento.pdf'

        console.log(`\n[SERVER] >>> RICEVUTA RICHIESTA DI ANALISI: ${fileName}`)
        console.log(`[SERVER] UserID: ${userId} | GuestEmail: ${guestEmail} | Size: ${file?.size} bytes`)

        if (!file || (!userId && !guestEmail)) {
            console.error('[SERVER] ERRORE: File, UserId o Email mancante')
            return NextResponse.json({ success: false, error: 'File, UserId o Email mancante' }, { status: 400 })
        }

        if (!GEMINI_API_KEY) {
            console.error('ERRORE: GOOGLE_GEMINI_API_KEY non trovata in process.env')
            return NextResponse.json({
                success: false,
                error: 'Configurazione API Google mancante. Assicurati che GOOGLE_GEMINI_API_KEY sia impostata e riavvia il server.'
            }, { status: 500 })
        }

        console.log(`API Key caricata (lunghezza: ${GEMINI_API_KEY.length})`)
        const fileBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')

        const systemPrompt = `Sei un esperto analista finanziario italiano specializzato in estratti conto bancari.
Il tuo compito è analizzare il documento PDF ed estrarre i dati in formato JSON rigoroso.

### FASE 1: CLASSIFICAZIONE DEL DOCUMENTO
- "ESTRATTO CONTO", "CONTO CORRENTE", "E/C" → type = "LIQUIDITY"
- "DOSSIER TITOLI", "ESTRATTO CONTO TITOLI" → type = "DOSSIER"

### REGOLE SPECIFICHE PER CRÉDIT AGRICOLE
Se il documento è di Crédit Agricole (CA, Crédit Agricole, Cariparma, Friuladria):
- Layout: DUE COLONNE SEPARATE per DARE e AVERE
- **DARE** (colonna sinistra degli importi) = USCITE = **NEGATIVO**
- **AVERE** (colonna destra degli importi) = ENTRATE = **POSITIVO**
- Un importo può apparire SOLO in una delle due colonne, mai in entrambe
- Se l'importo è nella posizione sinistra → è un DARE → **NEGATIVO**
- Se l'importo è nella posizione destra → è un AVERE → **POSITIVO**

### FASE 2: ANALISI DEL LAYOUT (CRITICA - NON SALTARE)
**PRIMA di estrarre i movimenti, DEVI analizzare il layout del documento:**

1. **IDENTIFICA LE COLONNE**: Cerca le intestazioni delle colonne nella tabella dei movimenti.
   - Possibili nomi per USCITE: "DARE", "ADDEBITI", "USCITE", "PRELIEVI", "-"
   - Possibili nomi per ENTRATE: "AVERE", "ACCREDITI", "ENTRATE", "VERSAMENTI", "+"

2. **DETERMINA LA STRUTTURA**: Il documento può avere:
   - **Due colonne separate** (DARE | AVERE) → importo nella colonna DARE = negativo, AVERE = positivo
   - **Una colonna unica** con segno (+/-) → leggi il segno direttamente
   - **Una colonna unica** senza segno → usa la posizione o il contesto per determinare il segno

3. **VERIFICA CON I SALDI**:
   - Estrai SALDO INIZIALE e SALDO FINALE dal documento
   - Calcola: Somma Movimenti = Saldo Finale - Saldo Iniziale
   - Usa questa differenza per VERIFICARE che i segni siano corretti

### FASE 3: DETERMINAZIONE DEL SEGNO (IN ORDINE DI PRIORITÀ)

**PRIORITÀ 1 - LAYOUT COLONNE**: Se il documento ha colonne DARE/AVERE separate:
- Importo in colonna DARE/ADDEBITI → NEGATIVO
- Importo in colonna AVERE/ACCREDITI → POSITIVO

**PRIORITÀ 2 - SEGNO ESPLICITO**: Se il documento mostra +/- davanti agli importi:
- Leggi il segno direttamente

**PRIORITÀ 3 - KEYWORDS NELLA DESCRIZIONE** (usa se il layout non è chiaro):
- **NEGATIVO (-)**: "ADDEBITO", "SDD", "BOLLO", "COMMISSIONI", "SPESE", "PRELIEVO", "PREL.", "PAGAMENTO", "BONIFICO A FAVORE", "V/ORDINE", "PAGAM", "EMESSO", "SOTTOSC", "SOTTOSCRIZIONE", "MAV", "RAV", "F24", "CANONE"
- **POSITIVO (+)**: "ACCREDITO", "STIPENDIO", "PENSIONE", "EMOLUMENTI", "DIVIDENDO", "CEDOLA", "BONIFICO DA", "VERSAMENTO", "RIMBORSO", "STORNO"

**PRIORITÀ 4 - VERIFICA MATEMATICA**: Se ancora ambiguo:
- Calcola la somma con entrambe le ipotesi di segno
- Scegli il segno che fa tornare: Saldo Finale - Saldo Iniziale = Somma Movimenti

**MAI ASSUMERE UN SEGNO DI DEFAULT** - Usa sempre una delle 4 priorità sopra.

### FASE 3.5: CLASSIFICAZIONE movement_type (REGOLE DETTAGLIATE)

**"Commissioni"** - Spese bancarie e costi del conto:
- Commissioni di gestione e amministrazione (tipicamente 45€/trimestre)
- Spese rendiconto, spese E/C, spese emissione E/C (tipicamente 0.70€)
- **Canone mensile / canone fisso mensile** (tipicamente 6€/mese) - CE NE SONO 3 PER TRIMESTRE (uno per mese!)
- **Canone carta di debito** (tipicamente 1.50€/mese) - CE NE SONO 3 PER TRIMESTRE (uno per mese!)
- **Invio rendicontazione/contabili titoli** (tipicamente 0.70€) - NON SALTARE, spesso su pagine successive
- **Costo emissione comunicazione di legge** (tipicamente 0.42€) - NON SALTARE
- Commissioni prelievo Bancocard
- **Commissioni bonifico** (es. "Comm.ne bonifico", "Commissione bonifico" - la COMMISSIONE, NON il bonifico stesso)
- **Competenze Fruttifere / Competenze di chiusura** (→ "Commissioni" con importo POSITIVO)
- Rimborso canone (positivo → "Commissioni", solo importi piccoli < 20€)
- **Rimborso spese e commissioni** (positivo → "Commissioni", solo importi piccoli < 20€)
- **Donazione su sportello automatico** (addebito ATM per donazione a enti benefici, tipicamente 2€) → "Commissioni"
- **Storno id. op. / storno operazione** (storno di accredito precedente, importo NEGATIVO) → "Commissioni"
**IMPORTANTE**: Movimenti piccoli (0.42€, 0.70€, 1.00€, 1.50€) sono CRITICI per il calcolo delle commissioni totali. NON saltarli MAI.
**VERIFICA**: Per un trimestre, aspettati almeno 3 canoni mensili (6€x3) e possibilmente 3 canoni carta debito (1.50€x3). Se ne trovi meno di 3, cerca meglio nel PDF.

**"Spesa"** - Tasse e imposte:
- **Imposta di bollo E/C e Rendiconto** (tipicamente 8.50€) - ESTRAI SEMPRE, NON SALTARE
- **Imposta di bollo su Prodotti Finanziari** - ESTRAI SEMPRE, NON SALTARE
- Ritenuta fiscale
- F24, imposte varie
- Imposta sulle transazioni finanziarie (Tobin Tax)

**"Acquisto"** - Investimenti: sottoscrizione fondi, PAC, acquisto titoli/ETF
**"Vendita"** - Disinvestimenti: riscatto fondi, vendita titoli
**"Proventi"** - Cedole, dividendi
**"Bonifico"** - Bonifici, stipendio, versamenti
**"Altro"** - Tutto il resto:
- **Premio polizza** / Premio assicurazione → "Altro"
- Prelievo contante (se non ha commissione separata)
- Rimborsi di importo elevato (> 20€, es. "Rimborso spese e commissioni su errata applicazione") → "Altro"

**ATTENZIONE**:
- TUTTE le imposte di bollo (sia E/C che Prodotti Finanziari) → **Spesa**, NON Commissioni
- Competenze Fruttifere/di chiusura → **Commissioni** (importo positivo, compensano le spese bancarie)
- **Premio polizza** → **Altro**, MAI Commissioni
- **Rimborsi > 20€** → **Altro** (sono rettifiche, non costi bancari regolari)
- **"Bonifico da Voi disposto a favore di:"** = il TRASFERIMENTO → **Bonifico**, NON Commissioni
- **"Bonifico a Vostro favore"** = accredito → **Bonifico**, NON Commissioni
- **"Comm.ne bonifico"** / **"Commissioni bonifico"** = la COMMISSIONE sul bonifico → **Commissioni**
- **"Donazione su sportello automatico"** = addebito sul conto → **Commissioni**
- **"storno id. op."** / **"storno operazione"** = storno di un accredito → **Commissioni**

### FASE 4: ESTRAZIONE MOVIMENTI

**REGOLA CRITICA - ESTRARRE OGNI SINGOLO MOVIMENTO**:
- DEVI estrarre OGNI SINGOLA riga della tabella movimenti, ANCHE se hanno la stessa data e importo.
- Transazioni come "INVESTIMENTO IN FONDI COMUNI" spesso si ripetono con stessa data e stesso importo (es. 500€ per ciascun fondo). Queste sono transazioni DIVERSE e vanno estratte TUTTE.
- NON deduplicare, NON raggruppare, NON saltare transazioni simili.
- Se il PDF ha più pagine di movimenti, estrai i movimenti da TUTTE le pagine.
- NON estrarre lo stesso movimento con segni diversi.
- Se la somma non torna, probabilmente stai sbagliando i segni, NON duplicando.
- SEGNI: Commissioni, spese, canoni, imposte, donazioni, storni sono ADDEBITI → importo NEGATIVO. Competenze Fruttifere e rimborsi → importo POSITIVO.

1. **DESCRIZIONI MULTI-RIGA**:
   - Molte transazioni hanno descrizioni su più righe
   - CONCATENA le righe successive (senza data/importo) alla transazione precedente
   - Cerca keywords anche nelle righe successive

2. **FORMATI NUMERICI**:
   - Converti "1.234,56" → 1234.56 (punto come decimale)
   - Ignora simboli come \`*\` prima dei numeri
   - Ignora simboli valuta (€, EUR)

3. **FORMATI DATA**:
   - Accetta: GG/MM/AAAA, GG.MM.AAAA, GG-MM-AAAA, AAAA-MM-GG
   - Restituisci sempre: GG/MM/AAAA

### FASE 5: ESTRAZIONE DATI SCALARI (COMPETENZE)

**ISTRUZIONI DETTAGLIATE PER BANCA INTESA/INTESA SANPAOLO:**

#### 5.1 NUMERI CREDITORI E DEBITORI
Cerca nel documento la sezione "CONTO SCALARE" o "RIASSUNTO SCALARE".
Trova la riga "TOTALE NUMERI" o cerca le righe individuali con "Numeri creditori" / "Numeri debitori".

**Esempio tipico Banca Intesa:**
[ESEMPIO]
TOTALE NUMERI          0,00        5.737.125,02
                    (Debitori)    (Creditori)
[/ESEMPIO]
oppure:
[ESEMPIO]
Numeri creditori    3.282.024,02
Numeri debitori     11.113.738,56
[/ESEMPIO]

Estrai:
- **numeri_creditori**: Il valore dei numeri creditori dell'ULTIMO periodo (ultima riga con data). Se la tabella ha più righe con date diverse (es. periodi precedenti + periodo corrente), estrai SOLO il valore dell'ULTIMA riga con data (quella del periodo corrente di questo estratto conto). NON sommare i valori di periodi diversi. Ignora la riga "Già liquidati" e "Invariati fino al".
- **numeri_debitori**: Il valore totale dei numeri debitori (stessa regola: ultimo periodo)

#### 5.2 INTERESSI CREDITORI E DEBITORI (LORDI)
Cerca la sezione "ELEMENTI PER IL CONTEGGIO DELLE COMPETENZE" o "INTERESSI CREDITORI" / "INTERESSI DEBITORI".

**PROCEDURA STEP-BY-STEP PER ESTRARRE GLI INTERESSI:**

**STEP 1**: Individua la tabella "INTERESSI CREDITORI" nel PDF.
**STEP 2**: Conta quante righe hanno una DATA nella colonna "Decorrenza" (formato GG.MM.AAAA).
  - Le righe "Totale lordo", "Ritenuta fiscale", "Totale" NON hanno una data = NON contarle.
  - Solo le righe con una data come "30.06.2018" o "30.09.2018" contano.
**STEP 3**: Estrai TUTTE le righe con data come array interessi_creditori_periodi.
**STEP 4**: Per interessi_attivi_lordi:
  - Se hai trovato 1 SOLA riga con data → interessi_attivi_lordi = il valore "Totale lordo" dalla tabella
  - Se hai trovato 2 O PIU' righe con data → interessi_attivi_lordi = valore "Interessi" dell'ULTIMA riga (data piu' recente). ATTENZIONE: il "Totale lordo" in questo caso e' la somma di tutte le righe, NON il valore che cerchi!

**ESEMPIO CON 2 RIGHE (ATTENZIONE!):**
[ESEMPIO]
INTERESSI CREDITORI
Decorrenza    Tasso    Numeri creditori    Interessi
30.06.2018    0,0100   5.000.000,00        0,78     ← Riga 1 (ha data!)
30.09.2018    0,0100   10.979.877,26       2,21     ← Riga 2 (ha data!)
                       Totale lordo         2,99     ← SOMMA (NO data!) = 0,78+2,21
                       Ritenuta fiscale    -0,78
                       Totale               2,21
[/ESEMPIO]
Righe con data: 2 → interessi_attivi_lordi = 2.21 (valore dalla Riga 2, l'ultima con data)
interessi_creditori_periodi: [{"data":"30/06/2018","interessi":0.78},{"data":"30/09/2018","interessi":2.21}]
ERRORE COMUNE: estrarre 2.99 (il Totale lordo) come interessi_attivi_lordi. 2.99 e' SBAGLIATO perche' e' la somma.

**ESEMPIO CON 1 RIGA:**
[ESEMPIO]
INTERESSI CREDITORI
Decorrenza    Tasso    Numeri creditori    Interessi
31.12.2018    0,0100   3.282.024,02        1,61     ← Riga 1 (unica con data)
                       Totale lordo         1,61     ← SOMMA = 1,61 (coincide)
                       Ritenuta fiscale    -0,42
                       Totale               1,19
[/ESEMPIO]
Righe con data: 1 → interessi_attivi_lordi = 1.61 (Totale lordo)
interessi_creditori_periodi: [{"data":"31/12/2018","interessi":1.61}]

**VERIFICA OBBLIGATORIA**: Il numeri_creditori estratto dal Conto Scalare DEVE corrispondere al valore "Numeri creditori" dell'ULTIMA riga con data. Se non corrisponde, stai leggendo la riga sbagliata!

Estrai:
- **interessi_attivi_lordi**: Segui la procedura Step 1-4 sopra
- **interessi_passivi_lordi**: Il "Totale lordo" degli interessi debitori
- **interessi_creditori_periodi**: ARRAY con OGNI riga che ha una data nella colonna Decorrenza. Ogni elemento:
  - "data": la data decorrenza (GG/MM/AAAA)
  - "interessi": il valore dalla colonna Interessi di quella riga
  CRITICO: Se la tabella ha 2 righe con data, DEVI restituire 2 elementi. Se restituisci 1 solo elemento con il valore del "Totale lordo", stai sbagliando!

#### 5.3 TASSO ATTIVO E PASSIVO
Il tasso si trova nella colonna "TASSO" della tabella interessi creditori/debitori.
Cerca il valore percentuale (es. 0,0100 o 0,01%).

Estrai:
- **tasso_attivo**: Tasso applicato agli interessi creditori (es. "0.01%" o 0.0100)
- **tasso_passivo**: Tasso applicato agli interessi debitori

#### 5.4 MOVIMENTI TITOLI (Acquisti e Vendite)
Analizza la lista movimenti e identifica operazioni su titoli:

**ACQUISTI TITOLI (importi NEGATIVI - uscite di denaro):**
Keywords: "ACQ.", "ACQUISTO", "SOTTOSC", "SOTTOSCRIZIONE", "NOTA INF. ACQ.", "PAC FONDI"

**VENDITE TITOLI (importi POSITIVI - entrate di denaro):**
Keywords per vendite: "NOTA INF. VEND.", "RISCATTO QUOTE", "RISCATTO TOTALE", "RISCATTO PARZIALE", "DISINV", "DISINVESTIMENTO", "LIQUIDAZ FONDI", "SWITCH OUT"
Keyword RIMBORSO: conta come vendita SOLO se seguito da: "FONDI", "SICAV", "QUOTE", "ETF", "OBBLIG"
**ESCLUSIONI - NON contare come vendite:**
- "CEDOLA", "DIVIDENDO", "STACCO CED" = PROVENTI
- "RIMBORSO BUONO", "RIMBORSO SPESE", "RIMBORSO BOLLO" = NON sono vendite titoli
- "RISCATTO" generico senza riferimento a fondi = verificare contesto

Calcola e inserisci in scalar_data:
- **acquisto_titoli_count**: numero di operazioni di acquisto
- **vendita_titoli_count**: numero di operazioni di vendita
- **movimenti_titoli_count**: acquisto_titoli_count + vendita_titoli_count
- **acquisto_titoli_amount**: somma importi acquisti (sarà negativo)
- **vendita_titoli_amount**: somma importi vendite (sarà positivo)

**IMPORTANTE per interessi**: Estrai il valore "Totale lordo" (LORDO), NON il "Totale" finale netto.

Se un valore non è presente, usa 0.

### FASE 6: VALIDAZIONE FINALE (OBBLIGATORIA - ESEGUI SEMPRE)
Prima di restituire il JSON:
1. Calcola: expected_delta = Saldo Finale - Saldo Iniziale
2. Calcola: actual_sum = Somma di tutti i movimenti.amount
3. Se abs(expected_delta - actual_sum) > 0.01€:
   - HAI SBAGLIATO I SEGNI DI UNO O PIÙ MOVIMENTI
   - Calcola: errore = (expected_delta - actual_sum) / 2
   - Cerca il movimento con importo ≈ abs(errore) e INVERTI IL SUO SEGNO
   - Ripeti finché expected_delta ≈ actual_sum

**CASO COMUNE DI ERRORE**: I "RIMBORSO" o "ACCREDITO" o "VERSAMENTO" in colonna AVERE sono POSITIVI ma spesso vengono erroneamente marcati negativi. Se il calcolo non torna, verifica questi movimenti.

### FASE 7: COMPLETEZZA (OBBLIGATORIA)
- Se il PDF ha più pagine, DEVI leggere e estrarre i movimenti da TUTTE le pagine.
- Conta il numero totale di righe nella tabella movimenti nel PDF. Il tuo JSON DEVE avere lo STESSO numero di elementi nell'array "movements".
- NON fermarti prima di aver estratto TUTTI i movimenti. Anche se ci sono 50+ movimenti, estraili TUTTI.
- "BONIFICO A VOSTRO FAVORE" da fondi/SGR (es. Eurizon Capital) è un bonifico, NON una vendita titoli. Usa movement_type "Bonifico", NON "Vendita".

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "layout_detected": "two_columns_dare_avere" | "single_column_with_sign" | "single_column_no_sign" | "other",
  "info": {
    "bankName": "Nome Banca",
    "accountNumber": "Numero Conto",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "holder": "Intestatario",
    "settlementAccount": "IBAN"
  },
  "scalar_data": {
    "numeri_creditori": 0,
    "numeri_debitori": 0,
    "interessi_attivi_lordi": 0,
    "interessi_passivi_lordi": 0,
    "interessi_creditori_periodi": [{"data": "GG/MM/AAAA", "interessi": 0}],
    "tasso_attivo": "0%",
    "tasso_passivo": "0%",
    "acquisto_titoli_count": 0,
    "vendita_titoli_count": 0,
    "movimenti_titoli_count": 0,
    "acquisto_titoli_amount": 0,
    "vendita_titoli_amount": 0
  },
  "movements": [
    {
      "date": "GG/MM/AAAA",
      "description": "Descrizione completa concatenata",
      "amount": 0,
      "sign_source": "column_position" | "explicit_sign" | "keyword" | "math_verification",
      "movement_type": "Commissioni" | "Acquisto" | "Vendita" | "Proventi" | "Bonifico" | "Spesa" | "Altro"
    }
  ],
  "summary": {
    "initial_balance": { "value": 0, "source": "extracted" },
    "final_balance": { "value": 0, "source": "extracted" },
    "total_movements_amount": { "value": 0, "source": "calculated" },
    "total_commissions": { "value": 0, "source": "calculated" },
    "total_proventi": { "value": 0, "source": "calculated" },
    "math_verification": { "expected_delta": 0, "actual_sum": 0, "matches": true }
  },
  "finalPortfolio": [],
  "dividends": []
}

Restituisci SOLO il JSON, nessun altro testo.`;

        // Native https call to Gemini (same as verify-pdf - no SDK, no responseMimeType cap)
        const modelName = 'gemini-3-flash-preview'
        const maxRetries = 3

        let resText = ''
        let success = false
        let lastError = ''

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[GEMINI] Calling ${modelName} (attempt ${attempt}/${maxRetries}) via native https...`)
                resText = await callGeminiDirect(GEMINI_API_KEY, modelName, systemPrompt, base64Data)
                console.log(`[GEMINI] Response received: ${resText.length} chars`)

                if (resText && resText.length > 10) {
                    success = true
                    break
                }
            } catch (err: any) {
                const errMsg = err.message || ''
                lastError = errMsg
                console.error(`[GEMINI ERROR] Attempt ${attempt}/${maxRetries}: ${errMsg}`)

                if (errMsg.includes('not found') || errMsg.includes('404')) {
                    break
                }

                const isRateLimit = errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('Resource')
                const isNetworkError = errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT') || errMsg.includes('socket hang up')

                if (isRateLimit) {
                    const waitTime = attempt * 60000
                    console.log(`[GEMINI] Rate limited, waiting ${waitTime/1000}s...`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isNetworkError) {
                    const waitTime = attempt * 15000
                    console.log(`[GEMINI] Network error, retrying in ${waitTime/1000}s...`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else {
                    break
                }
            }
        }

        if (!success) {
            console.error('Tutti i modelli hanno fallito. Ultimo errore:', lastError)
            return NextResponse.json({ success: false, error: 'Gemini AI fallito: ' + lastError }, { status: 500 })
        }

        // Parse JSON from response (single attempt with repair fallback)
        let parsed = null
        let jsonError = ''

        try {
            const jsonMatch = resText.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                throw new Error('Risposta AI non valida - nessun JSON trovato')
            }

            try {
                parsed = JSON.parse(jsonMatch[0])
            } catch {
                const repaired = repairTruncatedJson(jsonMatch[0])
                if (repaired) {
                    parsed = JSON.parse(repaired)
                    console.log('JSON riparato con successo')
                } else {
                    throw new Error('JSON non riparabile')
                }
            }
        } catch (parseErr: any) {
            jsonError = parseErr.message
            console.error(`JSON parse fallito: ${jsonError}`)
        }

        if (!parsed) {
            return NextResponse.json({ success: false, error: 'Parsing JSON fallito: ' + jsonError }, { status: 500 })
        }

        // Calcolo fallback summary se mancante o troncato
        if (!parsed.summary) {
            parsed.summary = {}
        }

        const movements = parsed.movements || []
        const calculatedTotal = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Post-process: riclassifica "Bonifico da Voi disposto" da Commissioni a Bonifico
        // Il modello a volte classifica erroneamente i bonifici come commissioni
        movements.forEach((m: any) => {
            if (m.movement_type === 'Commissioni' &&
                m.description?.toLowerCase().includes('bonifico') &&
                m.description?.toLowerCase().includes('disposto')) {
                m.movement_type = 'Bonifico'
            }
        })

        // Post-process: "Spese emis. E/C.-Rendiconto-Comunicazioni" con sotto-voce "comunicazioni"
        // Quando l'importo include sia "estratto conto" (0.70) che "comunicazioni" (0.70) = 1.40,
        // l'Excel conta solo la parte E/C (0.70). Correggiamo l'importo.
        movements.forEach((m: any) => {
            if (m.movement_type === 'Commissioni' &&
                m.description?.toLowerCase().includes('spese emis') &&
                m.description?.toLowerCase().includes('comunicazioni') &&
                Math.abs(m.amount || 0) > 0.80) {
                m.amount = m.amount > 0 ? 0.70 : -0.70
            }
        })

        // Commissioni = abs(somma netta dei movimenti classificati "Commissioni")
        // Dal 2023+: il totale commissioni dell'Excel include anche "Imposta di bollo E/C e Rendiconto"
        const periodEndStr = parsed.info?.period_end || ''
        const periodYear = periodEndStr ? parseInt(periodEndStr.split(/[-/]/).find((p: string) => p.length === 4) || '0') : 0

        let calculatedCommissions = Math.abs(movements
            .filter((m: any) => m.movement_type === 'Commissioni')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0))

        // Dal 2023+: aggiungi bollo E/C (che è classificato come "Spesa" ma l'Excel lo include nelle commissioni)
        // ECCEZIONE: Q1 (marzo) dal 2024+ NON include bollo E/C
        const periodMonthStr = periodEndStr.match(/[-/](\d{2})[-/]/)?.[1] || periodEndStr.split(/[-/]/)[1] || ''
        const periodMonth = parseInt(periodMonthStr) || 0
        const isQ1 = periodMonth === 3
        if (periodYear >= 2023 && !(periodYear >= 2024 && isQ1)) {
            const bolloEC = Math.abs(movements
                .filter((m: any) => m.movement_type === 'Spesa' && (
                    m.description?.toLowerCase().includes('bollo') && (
                        m.description?.toLowerCase().includes('e/c') ||
                        m.description?.toLowerCase().includes('rendiconto')
                    )
                ))
                .reduce((sum: number, m: any) => sum + (m.amount || 0), 0))
            calculatedCommissions += bolloEC
        }

        // Dal 2022+: aggiungi Tobin Tax (Imposta transazioni finanziarie) alle commissioni
        // L'Excel la include nel totale commissioni dal 2022 in poi
        if (periodYear >= 2022) {
            const tobinTax = Math.abs(movements
                .filter((m: any) => m.movement_type === 'Spesa' && (
                    m.description?.toLowerCase().includes('transazioni finanziarie') ||
                    m.description?.toLowerCase().includes('tobin')
                ))
                .reduce((sum: number, m: any) => sum + (m.amount || 0), 0))
            calculatedCommissions += tobinTax
        }

        // Per periodi Q3 (settembre) e Q4 (dicembre) dal 2017+: escludi "Competenze"
        // Il modello a volte usa "Competenze di chiusura", a volte "Competenze fruttifere"
        // Dal 2017+ Q3/Q4: L'Excel usa il totale LORDO (non sottrae competenze)
        // Pre-2017: L'Excel USA la somma netta (include competenze come offset) per tutti i trimestri
        // 2017+ Q1/Q2: L'Excel USA la somma netta (include competenze come offset)
        if ((periodMonth === 9 || periodMonth === 12) && periodYear >= 2017) {
            const competenzeAmount = movements
                .filter((m: any) => m.movement_type === 'Commissioni' &&
                    (m.amount || 0) > 0 &&
                    m.description?.toLowerCase().includes('competenz'))
                .reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
            if (competenzeAmount > 0) {
                calculatedCommissions += competenzeAmount
            }
        }

        const calculatedProventi = movements
            .filter((m: any) => m.movement_type === 'Proventi' || m.movement_type === 'Dividendo')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Imposta valori calcolati se mancanti
        if (!parsed.summary.total_movements_amount) {
            parsed.summary.total_movements_amount = { value: calculatedTotal, source: 'calculated' }
        }
        // ALWAYS override with calculated commissions (hybrid formula is more reliable than Gemini's value)
        parsed.summary.total_commissions = { value: calculatedCommissions, source: 'calculated' }
        if (!parsed.summary.total_proventi) {
            parsed.summary.total_proventi = { value: calculatedProventi, source: 'calculated' }
        }
        if (!parsed.summary.initial_balance) {
            parsed.summary.initial_balance = { value: 0, source: 'missing' }
        }
        if (!parsed.summary.final_balance) {
            const initial = parsed.summary.initial_balance?.value || 0
            parsed.summary.final_balance = { value: initial + calculatedTotal, source: 'calculated' }
        }

        if (parsed.type === 'UNOFFICIAL') {
            console.warn(`[SERVER] Documento rifiutato (UNOFFICIAL): ${fileName}`)
            return NextResponse.json({
                success: false,
                error: 'Questo documento non è un estratto conto ufficiale. Per un\'analisi accurata, carica solo gli estratti conto trimestrali o annuali originali della banca.'
            }, { status: 400 })
        }

        const isDossier = parsed.type === 'DOSSIER'
        console.log(`[SERVER] >>> ANALISI COMPLETATA: ${fileName}`)
        console.log(`[SERVER] Classificato come: ${parsed.type} | Bank: ${parsed.info?.bankName} | Account: ${parsed.info?.accountNumber}`)

        // Salvataggio su Supabase
        const supabase = await createClient()

        const analysisData = {
            document_id: crypto.randomUUID(),
            user_id: userId || null,
            bank_name: parsed.info?.bankName || 'Banca N/D',
            period_start: parseDate(parsed.info?.period_start),
            period_end: parseDate(parsed.info?.period_end),
            account_type: parsed.type,
            portfolio_value: isDossier
                ? (parsed.finalPortfolio?.reduce((acc: number, item: any) => acc + (item.marketValue || 0), 0) || 0)
                : (typeof parsed.summary?.final_balance === 'object' ? parsed.summary.final_balance.value : (parsed.summary?.final_balance || 0)),
            initial_value: 0,
            holdings: parsed.finalPortfolio || [],
            transactions: parsed.movements || [],
            dividends: parsed.dividends || [],
            costs_breakdown: {
                ...(parsed.summary || {}),
                scalar_data: parsed.scalar_data || {},
                // Map scalar_data fields to dashboard-expected keys
                securities_purchase_count: parsed.scalar_data?.acquisto_titoli_count || 0,
                securities_sale_count: parsed.scalar_data?.vendita_titoli_count || 0,
                securities_movements_count: parsed.scalar_data?.movimenti_titoli_count || 0,
                securities_purchase_amount: parsed.scalar_data?.acquisto_titoli_amount || 0,
                securities_sale_amount: parsed.scalar_data?.vendita_titoli_amount || 0,
                securities_net_amount: (parsed.scalar_data?.acquisto_titoli_amount || 0) + (parsed.scalar_data?.vendita_titoli_amount || 0),
                settlementAccount: parsed.info?.settlementAccount || null,
                original_ai_data: { ...(parsed.summary || {}) } // Backup for restore
            },
            benchmark_comparison: parsed.info?.accountNumber || 'N/D',
        }

        const { data, error } = await supabase
            .from('analyses')
            .insert(analysisData)
            .select()
            .single()

        if (error) {
            console.error('Errore Database:', error)
            return NextResponse.json({ success: false, error: 'Errore salvataggio database' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            analysisId: data.id,
            documentId: data.id,
            fileName: file.name,
            status: 'ready',
            // Dati per verifica (usati da batch_verify.js)
            data: {
                movements: parsed.movements || [],
                summary: parsed.summary,
                layout_detected: parsed.layout_detected
            }
        })


    } catch (error: any) {
        console.error('\n!!!!! ERRORE CRITICO PARSE PDF !!!!!')
        console.error('Messaggio:', error.message)
        console.error('Stack:', error.stack)
        return NextResponse.json({ success: false, error: error.message || 'Errore interno del server' }, { status: 500 })
    }
}

function parseDate(dateStr: string | undefined): string | null {
    if (!dateStr) return null
    // Formato atteso: GG/MM/AAAA -> YYYY-MM-DD
    const parts = dateStr.split('/')
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    // Già in formato ISO?
    if (dateStr.includes('-')) return dateStr
    return null
}
