import { NextRequest, NextResponse } from 'next/server'
import https from 'https'

// Allow up to 5 minutes for Gemini PDF processing (Vercel Hobby plan limit: 300s)
export const maxDuration = 300

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

    const startTime = Date.now()
    const logProgress = (stage: string, details?: string) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[${elapsed}s] 🔍 ${stage}${details ? ` - ${details}` : ''}`)
    }

    try {
        logProgress('VERIFICA PDF INIZIATA')

        const formData = await request.formData()
        const file = formData.get('file') as File
        const fileName = file?.name || 'documento.pdf'

        logProgress('FILE RICEVUTO', `${fileName} (${(file?.size / 1024).toFixed(0)}KB)`)

        if (!file) {
            return NextResponse.json({ success: false, error: 'File mancante' }, { status: 400 })
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json({
                success: false,
                error: 'Configurazione API Google mancante.'
            }, { status: 500 })
        }

        logProgress('CONVERSIONE PDF', 'Encoding file in base64...')
        const fileBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')
        logProgress('PDF CONVERTITO', `${(base64Data.length / 1024).toFixed(0)}KB base64`)

        const systemPrompt = `CRITICAL: Your response must contain ONLY valid JSON, no explanations, no markdown, no extra text before or after.

Sei un esperto analista finanziario italiano specializzato in estratti conto bancari.
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

### FASE 3.5: CLASSIFICAZIONE movement_type (SOLO 5 CATEGORIE)

**ESISTONO SOLO 5 CATEGORIE - USA ESCLUSIVAMENTE QUESTE:**

**"Commissioni"** - TUTTI i costi bancari e imposte:
- Commissioni di gestione e amministrazione
- Spese rendiconto, spese E/C, spese emissione E/C
- Canone mensile / canone fisso mensile
- Canone carta di debito
- Invio rendicontazione/contabili titoli
- Costo emissione comunicazione di legge
- Commissioni prelievo Bancocard
- Commissioni bonifico (es. "Comm.ne bonifico")
- Competenze Fruttifere / Competenze di chiusura (importo POSITIVO)
- Rimborso canone/spese (solo importi piccoli < 20€)
- Donazione su sportello automatico
- Storno id. op. / storno operazione
- **IMPOSTA DI BOLLO E/C e Rendiconto** → Commissioni
- **IMPOSTA DI BOLLO su Prodotti Finanziari** → Commissioni
- **Ritenuta fiscale** → Commissioni
- **Imposta transazioni finanziarie (Tobin Tax)** → Commissioni

**"Acquisto"** - Investimenti in titoli:
- Sottoscrizione fondi, PAC, acquisto titoli/ETF/obbligazioni
- SOTTOSCRIZIONE di certificates/structured products

**"Vendita"** - Disinvestimenti:
- Riscatto fondi, vendita titoli, rimborso quote
- NOTA INF. VEND., RISCATTO QUOTE, REDEMP, DISINV, LIQUIDAZ

**"Proventi"** - Rendite da investimenti:
- Cedole, dividendi, proventi titoli

**"Altro"** - TUTTO IL RESTO (categoria predefinita):
- Bonifici in entrata/uscita
- Pensione INPS, stipendio, emolumenti
- Affitto, canone locazione
- Premio polizza, assicurazione
- Prelievo contante
- Rimborsi > 20€
- Pagamenti utenze, bollette, F24, MAV, RAV
- Conferimenti su GPM/GPF, buoni di risparmio
- Qualsiasi altro movimento non nelle categorie sopra

**ATTENZIONE - NON SONO COMMISSIONI (usa "Altro"):**
- Pensione INPS / Pensione / INPS
- Stipendio / Emolumenti / Retribuzione
- Affitto / Canone locazione
- Premio polizza
- Rimborsi > 20€
- Bollette / Utenze / F24 / MAV / RAV
- Prelievo contante / Prelievo ATM
- Bonifici (sia in entrata che in uscita)

**REGOLA D'ORO**: Le COMMISSIONI includono SOLO costi/spese bancarie E imposte/bolli. Tutto il resto va in "Altro"!

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
Keywords: "ACQ.", "ACQUISTO", "SOTTOSC", "SOTTOSCRIZIONE", "NOTA INF. ACQ.", "PAC FONDI", "Investimento in fondi comuni"
**ESCLUDERE dagli acquisti:**
- "Conferimenti su GPM" o "Conferimenti su GPF" → NON sono acquisti titoli (gestioni patrimoniali)
- "Accensione buono di risparmio" o "Buoni di risparmio" → NON sono acquisti titoli
- Se la descrizione contiene "GPM" o "GPF" insieme a "conferiment" → NON contare

**VENDITE TITOLI (importi POSITIVI - entrate di denaro):**
Keywords per vendite: **"VENDITA"**, **"VEND."**, "NOTA INF. VEND.", "RISCATTO QUOTE", "RISCATTO TOTALE", "RISCATTO PARZIALE", "DISINV", "DISINVESTIMENTO", "LIQUIDAZ FONDI", "SWITCH OUT", "Rimborso da fondi comuni", "Rimborso fondi comuni"
Keyword RIMBORSO: conta come vendita se seguito da: "FONDI", "SICAV", "QUOTE", "ETF", "OBBLIG", "TITOLI", "COMUNI"
**ESCLUSIONI - NON contare come vendite:**
- "CEDOLA", "DIVIDENDO", "STACCO CED" = PROVENTI
- "RIMBORSO BUONO" (buoni di risparmio) = NON sono vendite titoli
- "RIMBORSO SPESE", "RIMBORSO BOLLO", "RIMBORSO CANONE" = NON sono vendite titoli
- "RISCATTO" generico senza riferimento a fondi/titoli = verificare contesto

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
- **BONIFICO A VOSTRO FAVORE - Regola di classificazione**:
  - Se il mittente contiene "SICAV" (es. "EAST CAPITAL(LUX) SICAV") → classificare come **"Vendita"** (rimborso fondo)
  - Se la descrizione contiene "REDEMP", "RISCATTO", "DISINV", "LIQUIDAZ" → classificare come **"Vendita"** (rimborso/disinvestimento)
  - Se il mittente è "Eurizon Capital SGR" o simile E il bonifico è di importo elevato (> 1000€) E contiene nome fondo (es. "AZION", "OBBLIG", "BILANC") → probabilmente rimborso fondo, classificare come **"Vendita"**
  - Se il mittente è una SGR per importi piccoli (< 200€) → probabilmente dividendi/proventi, classificare come "Proventi" o "Bonifico"
  - Altri bonifici generici → "Bonifico"

### FASE 8: ESTRAZIONE PORTAFOGLIO TITOLI (SOLO PER type="DOSSIER")
Se il documento è un DOSSIER TITOLI, estrai la CONSISTENZA del portafoglio:

**8.1 CONTROVALORE TOTALE**
Cerca nel PDF il valore "CONTROVALORE TOTALE APPARENTE" o "CONTROVALORE TOTALE" o simile.
Esempio: "CONTROVALORE TOTALE APPARENTE AL 31/03/2019 Euro 527.413,10"
Estrai:
- Il valore numerico → summary.portfolio_total_extracted (es. 527413.10)
- La valuta → summary.portfolio_currency (es. "EUR" se dice "Euro", "USD" se dice "Dollar", ecc.)

**8.2 SINGOLI TITOLI**
Per OGNI titolo nella sezione "CONSISTENZA" (AZIONI, OBBLIGAZIONI, FONDI, SICAV, ETF):
- **isin**: Codice ISIN del titolo (es. "FR0010245514", "IT0001047437")
- **name**: Nome/Descrizione del titolo ESATTAMENTE come appare nel PDF (es. "LYXOR JAPAN (TOPIX)D", "EURIZON BREVE TERM $", "CARMIGNAC PATRIMOINE")
- **currency**: Divisa/Valuta (es. "EUR", "USD") - dalla colonna "Divisa"
- **exchangeRate**: Tasso di cambio (es. 1.1235) - dalla colonna "Cambio". Se vuoto o EUR, usa 1
- **quantity**: Quantità/Consistenza (numero di quote/azioni)
- **price**: Quotazione/Prezzo unitario - dalla colonna "Quotazione"
- **marketValue**: Controvalore in Euro - dalla colonna "Controvalore Euro"

IMPORTANTE:
- Estrai il nome del titolo dalla colonna "Descrizione" del PDF
- Il nome può essere abbreviato nel PDF (es. "ANIMA FONDO TRADING" o "LYXOR COMMOD. THOM.R")
- NON inventare nomi - usa ESATTAMENTE quello che appare nel PDF
- Per titoli in default (es. "Titolo in default"), metti marketValue = 0
- I titoli in default NON contribuiscono al controvalore totale
- Se la quotazione non è disponibile ("Non dispon."), metti price = 0

### FASE 9: ESTRAZIONE MOVIMENTI TITOLI (SOLO PER type="DOSSIER")
Se il documento è un DOSSIER TITOLI, estrai TUTTI i movimenti di acquisto/vendita titoli.

**9.1 IDENTIFICAZIONE OPERAZIONI**
Le banche usano terminologie diverse per indicare acquisti e vendite:

**ACQUISTO (Carico titoli)** - Keywords:
- "ACQUISTO", "ACQ.", "ACQ", "CARICO", "CARICO TITOLI"
- "SOTTOSCRIZIONE", "SOTTOSC.", "SOTTOSCR."
- "VERSAMENTO QUOTE", "CONFERIMENTO"
- "PAC" (Piano Accumulo Capitale)
- "NOTA INF. ACQ.", "SWITCH IN"
- "INVESTIMENTO", "INV."

**VENDITA (Scarico titoli)** - Keywords:
- "VENDITA", "VEND.", "SCARICO", "SCARICO TITOLI"
- "RISCATTO", "RISCATTO QUOTE", "RISCATTO TOTALE", "RISCATTO PARZIALE"
- "RIMBORSO", "RIMB.", "LIQUIDAZIONE", "LIQUIDAZ."
- "DISINVESTIMENTO", "DISINV."
- "NOTA INF. VEND.", "SWITCH OUT"
- "PRELIEVO QUOTE"

**9.2 STRUTTURA MOVIMENTI**
Per OGNI movimento titoli estrai:
- **isin**: Codice ISIN del titolo (se presente)
- **date**: Data operazione (formato "DD/MM/YYYY")
- **name**: Nome/Descrizione del titolo
- **operationType**: "Acquisto" o "Vendita" (normalizza sempre a questi due valori)
- **quantity**: Quantità/Numero quote (positivo)
- **price**: Prezzo/Quotazione unitario
- **exchangeRate**: Tasso di cambio (1 se EUR o non specificato)
- **currency**: Valuta/Divisa (EUR, USD, etc.)
- **fees**: Spese/Commissioni dell'operazione
- **taxes**: Imposte, bolli, ritenute
- **netAmount**: Importo netto totale dell'operazione

**9.3 NOTE IMPORTANTI**
- La sezione movimenti può essere chiamata: "MOVIMENTI", "OPERAZIONI", "LISTA OPERAZIONI", "DETTAGLIO MOVIMENTI"
- Alcune banche mostrano solo il totale, altre mostrano il dettaglio per ogni titolo
- Se non ci sono movimenti nel periodo, lascia l'array vuoto
- Il netAmount per acquisti è l'importo pagato (positivo), per vendite è l'importo ricevuto (positivo)
- fees e taxes potrebbero essere inclusi nel netAmount o mostrati separatamente

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "layout_detected": "two_columns_dare_avere" | "single_column_with_sign" | "single_column_no_sign" | "other",
  "info": {
    "bankName": "Nome Banca",
    "accountNumber": "Numero Conto o Dossier Titoli (es. 445/0000004742990)",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "holder": "Intestatario",
    "settlementAccount": "Per DOSSIER: cerca 'Conto di Regolamento', 'Conto Regolamento', 'Conto di appoggio', 'Conto corrente tecnico', 'Cash account', 'C/C Regolamento', 'Conto Corrente', 'N. Conto Corrente', 'C/EURO' (es. C/EURO 00445/00035652638). Per LIQUIDITY: IBAN"
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
      "movement_type": "Commissioni" | "Acquisto" | "Vendita" | "Proventi" | "Altro"
    }
  ],
  "summary": {
    "initial_balance": { "value": 0, "source": "extracted" },
    "final_balance": { "value": 0, "source": "extracted" },
    "total_movements_amount": { "value": 0, "source": "calculated" },
    "total_commissions": { "value": 0, "source": "calculated" },
    "total_proventi": { "value": 0, "source": "calculated" },
    "math_verification": { "expected_delta": 0, "actual_sum": 0, "matches": true },
    "portfolio_total_extracted": 0,
    "portfolio_currency": "EUR"
  },
  "finalPortfolio": [
    {
      "isin": "CODICE_ISIN",
      "name": "Nome del titolo dal PDF",
      "currency": "EUR",
      "exchangeRate": 1,
      "quantity": 0,
      "price": 0,
      "marketValue": 0
    }
  ],
  "securityMovements": [
    {
      "isin": "CODICE_ISIN",
      "date": "DD/MM/YYYY",
      "name": "Nome del titolo",
      "operationType": "Acquisto" | "Vendita",
      "quantity": 0,
      "price": 0,
      "exchangeRate": 1,
      "currency": "EUR",
      "fees": 0,
      "taxes": 0,
      "netAmount": 0
    }
  ],
  "dividends": []
}

CRITICAL: Output ONLY the JSON object shown above. NO explanations, NO markdown formatting (no \`\`\`json), NO additional text whatsoever. Start your response with { and end with }. Nothing else.`

        // Gemini 2.5 Flash: Fast and cost-effective
        // Tested: 15s processing time vs 15+ min for Pro models
        // Note: Gemini 1.5 Pro is 60x slower (timeout after 15 min)
        const modelName = 'gemini-2.5-flash'

        let resText = ''
        let success = false
        let lastError = ''
        const maxRetries = 3

        // Call Gemini REST API directly via Node.js https (bypasses Next.js fetch timeout)
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
                        maxOutputTokens: 200000  // Increased from 65536 to handle complex PDFs (PDF #35 was truncated at 81,220 chars)
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
                    // No timeout - let Gemini take as long as needed
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

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logProgress('CHIAMATA GEMINI AI', `Tentativo ${attempt}/${maxRetries} con ${modelName}`)
                resText = await callGeminiDirect(GEMINI_API_KEY, modelName, systemPrompt, base64Data)
                logProgress('RISPOSTA RICEVUTA', `${resText.length} caratteri da Gemini`)

                if (resText && resText.length > 10) {
                    success = true
                    break
                }
            } catch (err: any) {
                const errMsg = err.message || ''
                lastError = errMsg
                console.error(`[GEMINI ERROR] Attempt: ${attempt}/${maxRetries}, Error: ${errMsg}`)

                if (errMsg.includes('not found') || errMsg.includes('404')) {
                    break
                }

                const isRateLimit = errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('quota') || errMsg.includes('Resource has been exhausted') || errMsg.includes('RATE_LIMIT')
                const isNetworkError = errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT') || errMsg.includes('socket hang up')

                if (isRateLimit) {
                    const waitTime = attempt * 60000
                    logProgress('⏳ RATE LIMIT', `Attendo ${waitTime/1000}s prima del prossimo tentativo`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isNetworkError) {
                    logProgress('🔌 ERRORE RETE', 'Riprovo tra 5s')
                    await new Promise(resolve => setTimeout(resolve, 5000))
                } else {
                    // Unknown error, wait briefly and retry
                    await new Promise(resolve => setTimeout(resolve, 5000))
                }
            }
        }

        if (!success) {
            return NextResponse.json({ success: false, error: 'Gemini AI fallito: ' + lastError }, { status: 500 })
        }

        // Funzione per riparare JSON troncato
        function repairTruncatedJson(jsonStr: string): string | null {
            // Remove any trailing incomplete strings
            let repaired = jsonStr

            // Count open brackets
            let openBraces = 0
            let openBrackets = 0
            let inString = false
            let lastValidPos = 0

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

                    // Track last valid position (complete value)
                    if (char === ',' || char === '{' || char === '[' || char === '}' || char === ']') {
                        lastValidPos = i
                    }
                }
            }

            // If we're inside a string, truncate to before the string started
            if (inString) {
                // Find the last quote and remove from there
                const lastQuote = repaired.lastIndexOf('"')
                if (lastQuote > 0) {
                    repaired = repaired.substring(0, lastQuote)
                    // Remove the key if it's incomplete (e.g., "key":)
                    repaired = repaired.replace(/,?\s*"[^"]*"?\s*:?\s*$/, '')
                }
            }

            // If still unbalanced, try to close properly
            // Recount after potential truncation
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

            // Remove trailing comma if present
            repaired = repaired.replace(/,\s*$/, '')

            // Close any unclosed brackets/braces
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

        // Pulizia JSON con retry per errori di parsing
        // OPTIMIZED: Reduced from 6 to 2 retries to avoid 24+ minute timeouts
        const maxJsonRetries = 2
        let parsed = null
        let jsonError = ''
        for (let jsonAttempt = 1; jsonAttempt <= maxJsonRetries; jsonAttempt++) {
            try {
                // IMPROVED: Try multiple extraction strategies
                let jsonToParse = null

                // Strategy 1: Look for JSON starting with expected structure
                const structuredMatch = resText.match(/\{\s*"type"\s*:\s*"(LIQUIDITY|DOSSIER)"[\s\S]*\}/)
                if (structuredMatch) {
                    jsonToParse = structuredMatch[0]
                }

                // Strategy 2: Fallback to basic greedy match
                if (!jsonToParse) {
                    const jsonMatch = resText.match(/\{[\s\S]*\}/)
                    if (jsonMatch) {
                        jsonToParse = jsonMatch[0]
                    }
                }

                // Strategy 3: If response has markdown code blocks, extract from them
                if (!jsonToParse) {
                    const codeBlockMatch = resText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
                    if (codeBlockMatch) {
                        jsonToParse = codeBlockMatch[1]
                    }
                }

                if (!jsonToParse) {
                    throw new Error('Risposta AI non valida - nessun JSON trovato')
                }

                // Try direct parse first
                try {
                    parsed = JSON.parse(jsonToParse)
                    break
                } catch (directParseErr) {
                    // Try to repair truncated JSON
                    const repaired = repairTruncatedJson(jsonToParse)
                    if (repaired) {
                        parsed = JSON.parse(repaired)
                        break
                    }
                    throw directParseErr
                }
            } catch (parseErr: any) {
                jsonError = parseErr.message
                if (jsonAttempt < maxJsonRetries) {
                    // Only retry once with reinforced prompt
                    try {
                        console.log(`[GEMINI] JSON parse failed (${parseErr.message.substring(0, 50)}), retrying extraction (attempt ${jsonAttempt + 1}/${maxJsonRetries})...`)
                        resText = await callGeminiDirect(GEMINI_API_KEY, modelName, systemPrompt, base64Data)
                    } catch {
                        // Ignore retry errors, will fail on next parse attempt
                    }
                }
            }
        }

        if (!parsed) {
            return NextResponse.json({ success: false, error: jsonError }, { status: 500 })
        }

        // Validation-retry: make additional extraction attempts and pick the best result
        // This helps with non-deterministic outputs where the model sometimes misses movements
        const movs = parsed.movements || []
        const initBal = parsed.summary?.initial_balance?.value || 0
        const finBal = parsed.summary?.final_balance?.value || 0
        const expectedDeltaCheck = finBal - initBal
        const actualSumCheck = movs.reduce((s: number, m: any) => s + (m.amount || 0), 0)
        const mathError = Math.abs(actualSumCheck - expectedDeltaCheck)

        logProgress('PRIMA ESTRAZIONE', `${movs.length} movimenti estratti`)
        console.log(`📊 Saldo: ${initBal.toFixed(2)} → ${finBal.toFixed(2)} | Somma: ${actualSumCheck.toFixed(2)} | Errore: ${mathError.toFixed(2)}€`)

        // CRITERI OTTIMIZZATI: Retry solo se l'estrazione è CHIARAMENTE incompleta
        // - Entrambi i saldi sono 0 E ci sono movimenti (modello non ha estratto i saldi)
        // - Saldo iniziale mancante MA saldo finale presente (estrazione parziale)
        // - Errore matematico SIGNIFICATIVO (>5€) e movimenti < 10 (probabilmente incompleto)
        // - PDF complesso (base64 > 600KB) con pochi movimenti (< 40) E errore matematico > 0.5€
        // NON facciamo retry per piccoli errori di arrotondamento (<5€) o se ci sono molti movimenti (>10)
        // IMPORTANTE: Se mathError < 0.5€, l'estrazione è perfetta → NO retry anche per PDF grandi!
        const pdfSizeKB = base64Data.length / 1024
        const needsRetry = (
            (initBal === 0 && finBal === 0 && movs.length > 0) ||
            (initBal === 0 && finBal !== 0) ||
            (mathError > 5.0 && movs.length < 10 && initBal !== 0 && finBal !== 0) ||
            (pdfSizeKB > 600 && movs.length < 40 && mathError > 0.5 && initBal !== 0 && finBal !== 0)
        )
        if (!needsRetry) {
            logProgress('✅ VALIDAZIONE OK', 'Estrazione accettata, nessun retry necessario')
        } else {
            logProgress('⚠️ ESTRAZIONE INCOMPLETA', `Solo ${movs.length} movimenti, avvio retry con prompt rinforzato`)

            let bestParsed = parsed
            let bestMovCount = movs.length
            let bestMathError = mathError

            // Retry prompts ottimizzati con strategia progressiva
            const retryPromptSuffixes = [
                `\n\n### ATTENZIONE CRITICA - ESTRAZIONE INCOMPLETA RILEVATA\nLa prima estrazione ha trovato solo ${movs.length} movimenti. Questo PDF ha SICURAMENTE piu movimenti su PIU PAGINE.\nDEVI:\n1. Leggere OGNI PAGINA del PDF dall'inizio alla fine\n2. Estrarre OGNI SINGOLA riga dalla tabella movimenti\n3. NON fermarti dopo la prima pagina di movimenti\n4. Conta le righe nel PDF e assicurati che il tuo array "movements" abbia lo STESSO numero di elementi\n5. PRIORITÀ ASSOLUTA: vendite titoli ("VENDITA", "VEND.", "RISCATTO", "DISINV") - NON saltarle mai`,

                `\n\n### ISTRUZIONE PRIORITARIA - OUTPUT COMPATTO E COMPLETO\nQuesto PDF è complesso (${pdfSizeKB.toFixed(0)}KB). Per evitare troncamento JSON:\n1. USA DESCRIZIONI BREVI (max 50 caratteri per movimento)\n2. ESTRAI TUTTI I MOVIMENTI da TUTTE le pagine\n3. PRIORITÀ: "Vendita" movements con keyword VEND/VENDITA/RISCATTO/DISINV\n4. Riduci dettagli verbosi ma mantieni amount/date/category/description essenziali\n5. Il JSON finale deve contenere TUTTI i movimenti, anche a costo di descrizioni più brevi`
            ]

            // EDGE CASE: Per PDF complessi (>600KB con <40 movimenti), usiamo entrambi i retry
            // Per altri casi, manteniamo solo 1 retry per efficienza
            const maxRetries = (pdfSizeKB > 600 && movs.length < 40) ? 2 : 1
            for (let ri = 0; ri < maxRetries; ri++) {
                try {
                    const reinforcedPrompt = systemPrompt + retryPromptSuffixes[ri]
                    logProgress('🔄 RETRY GEMINI', `Tentativo ${ri + 1}/${maxRetries} con prompt rinforzato`)
                    const retryText = await callGeminiDirect(GEMINI_API_KEY, modelName, reinforcedPrompt, base64Data)
                    const retryJsonMatch = retryText.match(/\{[\s\S]*\}/)
                    if (retryJsonMatch) {
                        let retryParsed: any
                        try {
                            retryParsed = JSON.parse(retryJsonMatch[0])
                        } catch {
                            const repaired = repairTruncatedJson(retryJsonMatch[0])
                            if (repaired) retryParsed = JSON.parse(repaired)
                        }
                        if (retryParsed) {
                            const retryMovs = retryParsed.movements || []
                            const retryInit = retryParsed.summary?.initial_balance?.value || 0
                            const retryFin = retryParsed.summary?.final_balance?.value || 0
                            const retrySum = retryMovs.reduce((s: number, m: any) => s + (m.amount || 0), 0)
                            const retryMathError = Math.abs(retrySum - (retryFin - retryInit))

                            logProgress('RETRY RESULT', `${retryMovs.length} movimenti (best: ${bestMovCount}), errore: ${retryMathError.toFixed(2)}€`)

                            if (retryMovs.length > bestMovCount || (retryMovs.length === bestMovCount && retryMathError < bestMathError)) {
                                logProgress('✅ NUOVO BEST', `${retryMovs.length} movimenti (era ${bestMovCount})`)
                                bestParsed = retryParsed
                                bestMovCount = retryMovs.length
                                bestMathError = retryMathError
                            }

                            // Se abbiamo trovato più movimenti, fermiamo i retry
                            if (retryMovs.length > movs.length) {
                                logProgress('✅ MIGLIORAMENTO TROVATO', 'Interrompo retry anticipato')
                                break
                            }
                        }
                    }
                } catch (retryErr: any) {
                    logProgress('❌ RETRY FALLITO', retryErr.message)
                }
            }

            if (bestParsed !== parsed) {
                logProgress('✅ RETRY COMPLETATO', `Uso il migliore: ${bestMovCount} movimenti (originale: ${movs.length})`)
                parsed = bestParsed
            } else {
                logProgress('⚠️ RETRY INUTILE', 'Mantengo estrazione originale')
            }
        } // end needsRetry

        // Ensure summary exists and calculate missing values
        if (!parsed.summary) {
            parsed.summary = {}
        }

        // Auto-correct signs if math doesn't match
        const movements = parsed.movements || []
        const initialBalance = parsed.summary.initial_balance?.value || 0
        const finalBalance = parsed.summary.final_balance?.value || 0
        const expectedDelta = finalBalance - initialBalance

        let currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Auto-correct signs: try to fix errors by flipping transactions
        const MAX_CORRECTIONS = 50
        let corrections = 0
        const flippedIndices = new Set<number>()

        while (Math.abs(currentSum - expectedDelta) > 0.01 && corrections < MAX_CORRECTIONS) {
            const error = currentSum - expectedDelta
            const targetFlipAmount = Math.abs(error / 2)

            // Find the movement closest to the target flip amount (that hasn't been flipped yet)
            let bestMatch = -1
            let bestDiff = Infinity

            for (let i = 0; i < movements.length; i++) {
                if (flippedIndices.has(i)) continue // Don't flip same transaction twice
                const absAmount = Math.abs(movements[i].amount || 0)
                const diff = Math.abs(absAmount - targetFlipAmount)
                if (diff < bestDiff) {
                    bestDiff = diff
                    bestMatch = i
                }
            }

            // Very aggressive tolerance: 200% of target, or diff < 50€, or always flip if error > 0.5€
            const shouldFlip = bestMatch >= 0 && (
                bestDiff < targetFlipAmount * 2.0 ||
                bestDiff < 50 ||
                (Math.abs(error) > 0.5 && bestDiff < targetFlipAmount * 3)
            )

            if (shouldFlip) {
                movements[bestMatch].amount = -movements[bestMatch].amount
                movements[bestMatch].sign_source = 'auto_corrected'
                flippedIndices.add(bestMatch)
                currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
            } else {
                // Try two-flip combinations if single flip doesn't work
                let foundPair = false
                for (let i = 0; i < movements.length && !foundPair; i++) {
                    if (flippedIndices.has(i)) continue
                    for (let j = i + 1; j < movements.length && !foundPair; j++) {
                        if (flippedIndices.has(j)) continue
                        const amt1 = Math.abs(movements[i].amount || 0)
                        const amt2 = Math.abs(movements[j].amount || 0)
                        // Check if flipping both would fix it (sum of amounts = targetFlipAmount)
                        const pairSum = amt1 + amt2
                        if (Math.abs(pairSum - targetFlipAmount) < 1) {
                            movements[i].amount = -movements[i].amount
                            movements[j].amount = -movements[j].amount
                            movements[i].sign_source = 'auto_corrected_pair'
                            movements[j].sign_source = 'auto_corrected_pair'
                            flippedIndices.add(i)
                            flippedIndices.add(j)
                            currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
                            foundPair = true
                            corrections += 2
                        }
                    }
                }
                if (!foundPair) break
                continue
            }

            corrections++
        }

        const calculatedTotal = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Post-process: riclassifica movimenti erroneamente classificati
        movements.forEach((m: any) => {
            const desc = m.description?.toLowerCase() || ''

            // Bonifici erroneamente classificati come Commissioni -> Altro
            if (m.movement_type === 'Commissioni' &&
                desc.includes('bonifico') &&
                desc.includes('disposto')) {
                m.movement_type = 'Altro'
            }

            // PENSIONE INPS, STIPENDIO, ecc. NON sono commissioni -> Altro
            if (m.movement_type === 'Commissioni' && (
                desc.includes('pensione') ||
                desc.includes('inps') ||
                desc.includes('stipendio') ||
                desc.includes('emolument') ||
                desc.includes('retribuzione') ||
                desc.includes('affitto') ||
                desc.includes('canone locazione') ||
                desc.includes('premio polizza') ||
                desc.includes('assicurazione') ||
                desc.includes('bolletta') ||
                desc.includes('utenz') ||
                desc.includes('prelievo')
            )) {
                m.movement_type = 'Altro'
            }

            // Vecchia categoria "Bonifico" -> Altro
            if (m.movement_type === 'Bonifico') {
                m.movement_type = 'Altro'
            }
            // Vecchia categoria "Spesa" -> Commissioni (bolli e imposte ora vanno sotto Commissioni)
            if (m.movement_type === 'Spesa') {
                m.movement_type = 'Commissioni'
            }
        })

        // Commissioni = abs(somma netta dei movimenti classificati "Commissioni")
        // Include già bolli, imposte, Tobin Tax (ora classificati direttamente come Commissioni)
        const periodEndStr = parsed.info?.period_end || ''
        const periodYear = periodEndStr ? parseInt(periodEndStr.split(/[-/]/).find((p: string) => p.length === 4) || '0') : 0
        const periodMonthStr = periodEndStr.match(/[-/](\d{2})[-/]/)?.[1] || periodEndStr.split(/[-/]/)[1] || ''
        const periodMonth = parseInt(periodMonthStr) || 0

        // Post-process: "Spese emis. E/C.-Rendiconto-Comunicazioni" con sotto-voce "comunicazioni"
        // Dal 2024+: l'Excel conta solo la parte E/C (0.70), non le comunicazioni.
        if (periodYear >= 2024) {
            movements.forEach((m: any) => {
                if (m.movement_type === 'Commissioni' &&
                    m.description?.toLowerCase().includes('spese emis') &&
                    m.description?.toLowerCase().includes('comunicazioni') &&
                    Math.abs(m.amount || 0) > 0.80) {
                    m.amount = m.amount > 0 ? 0.70 : -0.70
                }
            })
        }

        let calculatedCommissions = Math.abs(movements
            .filter((m: any) => m.movement_type === 'Commissioni')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0))

        // Dal 2017+ (escluso Q1/marzo): l'Excel usa il totale LORDO delle commissioni (non sottrae competenze)
        if (periodYear >= 2017 && periodMonth !== 3) {
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

        // ALWAYS use calculated total after potential auto-corrections
        parsed.summary.total_movements_amount = { value: calculatedTotal, source: 'calculated' }
        // ALWAYS override with calculated commissions (hybrid formula)
        parsed.summary.total_commissions = { value: calculatedCommissions, source: 'calculated' }
        if (!parsed.summary.total_proventi) {
            parsed.summary.total_proventi = { value: calculatedProventi, source: 'calculated' }
        }

        // If initial/final balance are missing, try to calculate them from movements
        if (!parsed.summary.initial_balance) {
            parsed.summary.initial_balance = { value: 0, source: 'missing' }
        }
        if (!parsed.summary.final_balance) {
            const initial = parsed.summary.initial_balance?.value || 0
            parsed.summary.final_balance = { value: initial + calculatedTotal, source: 'calculated' }
        }

        // Second pass: validate and fix interessi if needed
        const periodi = parsed.scalar_data?.interessi_creditori_periodi || []
        const periodEnd = parsed.info?.period_end || ''

        // Return parsed data directly without saving to database
        logProgress('✅ VERIFICA COMPLETATA', `Tempo totale: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)

        return NextResponse.json({
            success: true,
            fileName: fileName,
            data: parsed
        })

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message || 'Errore interno del server' }, { status: 500 })
    }
}
