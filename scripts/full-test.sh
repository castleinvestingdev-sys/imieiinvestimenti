#!/bin/bash
# Full end-to-end test: uploads ALL PDFs and checks for errors
# Simulates exactly what a human does through the browser

set -e

# ── Auth ─────────────────────────────────────────────────────────────────────
AUTH_FILE="/tmp/supabase_auth.json"
if [ ! -f "$AUTH_FILE" ]; then
    echo "ERROR: Run auth first"
    exit 1
fi

USER_ID=$(python3 -c "import json; print(json.load(open('$AUTH_FILE'))['user_id'])")
ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('$AUTH_FILE'))['access_token'])")
AUTH_COOKIE=$(cat /tmp/auth_cookie.txt)
SUPABASE_URL="https://xmgsashgwntaslnweisr.supabase.co"
SUPABASE_KEY="sb_publishable_WNHOZBnuo4IN5DoGHjXa3w_diwL415j"
API_URL="http://localhost:3000/api/parse-pdf"
RESULTS_FILE="/tmp/test_results.json"
LOG_FILE="/tmp/test_upload.log"

echo "[]" > "$RESULTS_FILE"
> "$LOG_FILE"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

# ── Step 1: Delete ALL existing analyses ─────────────────────────────────────
log "🗑️  Cancello tutte le analisi esistenti..."

# Get all analysis IDs
ANALYSIS_IDS=$(curl -s "${SUPABASE_URL}/rest/v1/analyses?user_id=eq.${USER_ID}&select=id&deleted_at=is.null" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -c "
import json,sys
data=json.load(sys.stdin)
if isinstance(data,list):
    for a in data: print(a['id'])
")

COUNT=0
for ID in $ANALYSIS_IDS; do
    curl -s -X PATCH "${SUPABASE_URL}/rest/v1/analyses?id=eq.${ID}" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"deleted_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /dev/null 2>&1
    COUNT=$((COUNT + 1))
done
log "✅ Cancellate $COUNT analisi"

# ── Step 2: Collect and sort all PDFs ────────────────────────────────────────
log "📂 Raccolgo tutti i PDF..."

BASE="/Users/leon/Desktop/banche EC"

# Collect all PDFs with their sort keys (date from filename)
python3 << 'PYEOF' > /tmp/sorted_pdfs.txt
import os, re, sys

base = "/Users/leon/Desktop/banche EC"
pdfs = []

for root, dirs, files in os.walk(base):
    # Skip Archivio folder
    if "Archivio" in root:
        continue
    for f in files:
        if f.lower().endswith('.pdf'):
            path = os.path.join(root, f)
            # Extract date for sorting: try YYMMDD at start or YYYYMMDD
            m = re.match(r'^(\d{6})\b', f)
            if m:
                date_key = m.group(1)
            else:
                m = re.match(r'^(\d{8})', f)
                if m:
                    # YYYYMMDD -> YYMMDD
                    date_key = m.group(1)[2:]
                else:
                    date_key = "999999"

            # Determine bank/account group
            if "Credit Agricole" in root:
                if "Dossier" in root:
                    m2 = re.search(r'/(\d{3})/', root)
                    group = f"CA-DT-{m2.group(1)}" if m2 else "CA-DT-unknown"
                elif "Liquidit" in root:
                    group = "CA-LIQ"
                else:
                    group = "CA-OTHER"
            elif "INTESA" in root:
                if "Dossier" in root or "deposito" in f.lower():
                    group = "INTESA-DT"
                elif "Liquidit" in root or "Estratt" in root:
                    group = "INTESA-LIQ"
                else:
                    group = "INTESA-OTHER"
            elif "generali" in root.lower():
                group = "GENERALI-DT"
            else:
                group = "OTHER"

            pdfs.append((group, date_key, path))

# Sort by group, then by date within group
pdfs.sort(key=lambda x: (x[0], x[1]))

for group, date_key, path in pdfs:
    print(f"{group}\t{date_key}\t{path}")
PYEOF

TOTAL=$(wc -l < /tmp/sorted_pdfs.txt | tr -d ' ')
log "📋 Trovati $TOTAL PDF da caricare"

# Show summary by group
python3 -c "
from collections import Counter
groups = Counter()
for line in open('/tmp/sorted_pdfs.txt'):
    g = line.split('\t')[0]
    groups[g] += 1
for g, c in sorted(groups.items()):
    print(f'  {g}: {c} PDF')
" | tee -a "$LOG_FILE"

# ── Auth refresh function ─────────────────────────────────────────────────────
refresh_auth() {
    log "🔄 Refreshing auth token..."
    REFRESH_RESULT=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -d '{"email":"leonrivas27@gmail.com","password":"123456"}')

    NEW_TOKEN=$(echo "$REFRESH_RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if 'access_token' in data:
    auth = {'user_id': data['user']['id'], 'access_token': data['access_token'], 'refresh_token': data['refresh_token']}
    import json as j
    with open('/tmp/supabase_auth.json', 'w') as f: j.dump(auth, f)
    cookie_val = j.dumps({'access_token': data['access_token'], 'refresh_token': data['refresh_token'], 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': 9999999999, 'user': {'id': data['user']['id']}})
    with open('/tmp/auth_cookie.txt', 'w') as f: f.write(f'sb-xmgsashgwntaslnweisr-auth-token={cookie_val}')
    print('OK')
else:
    print('FAIL')
" 2>&1)

    if [ "$NEW_TOKEN" = "OK" ]; then
        ACCESS_TOKEN=$(python3 -c "import json; print(json.load(open('$AUTH_FILE'))['access_token'])")
        AUTH_COOKIE=$(cat /tmp/auth_cookie.txt)
        log "✅ Token refreshed"
    else
        log "⚠️  Token refresh failed, continuing with old token"
    fi
}

# ── Step 3: Upload all PDFs sequentially ─────────────────────────────────────
log "🚀 Inizio caricamento..."

SUCCESS=0
ERRORS=0
CURRENT=0
LAST_REFRESH=0

while IFS=$'\t' read -r GROUP DATE_KEY PDF_PATH; do
    CURRENT=$((CURRENT + 1))
    FILENAME=$(basename "$PDF_PATH")

    # Refresh auth every 40 uploads to avoid JWT expiry
    if [ $((CURRENT - LAST_REFRESH)) -ge 40 ]; then
        refresh_auth
        LAST_REFRESH=$CURRENT
    fi

    log "[$CURRENT/$TOTAL] ($GROUP) $FILENAME"

    START_TIME=$(date +%s)

    # Upload exactly like the browser does
    RESPONSE=$(curl -s -X POST "$API_URL" \
        -H "Cookie: $AUTH_COOKIE" \
        -F "file=@$PDF_PATH" \
        -F "userId=$USER_ID" \
        --max-time 600 2>&1)

    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    # Parse response
    RESULT=$(echo "$RESPONSE" | ELAPSED="$ELAPSED" python3 -c "
import json, sys, os
text = sys.stdin.read()
elapsed = os.environ.get('ELAPSED', '?')
try:
    d = json.loads(text)
    if d.get('success'):
        aid = d.get('analysisId','?')[:12]
        print(f'OK|{aid}|{elapsed}s')
    elif d.get('isDuplicate'):
        eid = d.get('existingAnalysisId','?')[:12]
        print(f'DUP|{eid}|replaced')
    else:
        err = d.get('error','unknown error')
        print(f'ERR|{err[:100]}')
except Exception as e:
    print(f'ERR|parse error: {str(e)[:50]} raw: {text[:100]}')
" 2>&1)

    STATUS=$(echo "$RESULT" | cut -d'|' -f1)
    DETAILS=$(echo "$RESULT" | cut -d'|' -f2-)

    if [ "$STATUS" = "OK" ] || [ "$STATUS" = "DUP" ]; then
        SUCCESS=$((SUCCESS + 1))
        log "  ✅ $STATUS ($DETAILS) [${ELAPSED}s]"
    else
        ERRORS=$((ERRORS + 1))
        log "  ❌ $STATUS: $DETAILS [${ELAPSED}s]"
        log ""
        log "🛑 STOP ON FIRST ERROR — fix and restart!"
        log "  File: $PDF_PATH"
        log "  Group: $GROUP"
        log "  Response: $RESPONSE"
        break
    fi

    # Save result
    python3 -c "
import json
with open('$RESULTS_FILE') as f: results = json.load(f)
results.append({'file': '$FILENAME', 'group': '$GROUP', 'status': '$STATUS', 'details': '''$DETAILS''', 'elapsed': $ELAPSED})
with open('$RESULTS_FILE', 'w') as f: json.dump(results, f, indent=2)
"

    # Small delay between uploads to avoid overwhelming
    sleep 1

done < /tmp/sorted_pdfs.txt

log ""
log "════════════════════════════════════════════════════════"
log "📊 RISULTATO UPLOAD: $SUCCESS OK, $ERRORS errori su $TOTAL totali"
log "════════════════════════════════════════════════════════"

# ── Step 4: Check coherence ──────────────────────────────────────────────────
log ""
log "🔍 Controllo coerenza tra periodi..."

# Refresh token before coherence check
refresh_auth

python3 << 'PYEOF'
import json, sys

SUPABASE_URL = "https://xmgsashgwntaslnweisr.supabase.co"
SUPABASE_KEY = "sb_publishable_WNHOZBnuo4IN5DoGHjXa3w_diwL415j"

with open("/tmp/supabase_auth.json") as f:
    auth = json.load(f)

import urllib.request

# Fetch all analyses
url = f"{SUPABASE_URL}/rest/v1/analyses?user_id=eq.{auth['user_id']}&deleted_at=is.null&order=period_end.asc&select=id,period_start,period_end,holdings,costs_breakdown,benchmark_comparison,account_type,bank_name,portfolio_value"
req = urllib.request.Request(url, headers={
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {auth['access_token']}"
})
with urllib.request.urlopen(req) as resp:
    analyses = json.loads(resp.read())

print(f"\n📋 Analisi caricate: {len(analyses)}")

# Group by account
def normalize_acc(acc_str):
    """benchmark_comparison is stored as a string like '3100/1000811'"""
    if not acc_str or not isinstance(acc_str, str) or acc_str == 'N/D':
        return 'ND'
    import re
    parts = re.split(r'[/\-]', str(acc_str))
    parts = [re.sub(r'[^\d]', '', p) for p in parts]
    parts = [p.lstrip('0') or '0' for p in parts if p]
    if not parts:
        return 'ND'
    # Use last 2 segments for comparison (matches dashboard logic)
    return '/'.join(parts[-2:]) if len(parts) >= 2 else parts[-1]

# Build coherence check
dossiers = [a for a in analyses if a.get('account_type') == 'DOSSIER']
print(f"📊 Dossier Titoli: {len(dossiers)}")

# Group by account
accounts = {}
for d in dossiers:
    acc = normalize_acc(d.get('benchmark_comparison'))
    if acc not in accounts:
        accounts[acc] = []
    accounts[acc].append(d)

# Sort each account by period_end
for acc in accounts:
    accounts[acc].sort(key=lambda a: a.get('period_end', ''))

total_checks = 0
ok_checks = 0
fail_checks = 0
missing_checks = 0
failures = []

for acc, docs in sorted(accounts.items()):
    print(f"\n  Account {acc}: {len(docs)} periodi")

    for i in range(1, len(docs)):
        prev_doc = docs[i-1]
        curr_doc = docs[i]
        total_checks += 1

        # Check period adjacency
        from datetime import datetime
        try:
            prev_end = datetime.strptime(prev_doc['period_end'], '%Y-%m-%d')
            curr_end = datetime.strptime(curr_doc['period_end'], '%Y-%m-%d')
            days_gap = (curr_end - prev_end).days
        except:
            missing_checks += 1
            continue

        if days_gap > 200 or days_gap <= 0:
            missing_checks += 1
            continue

        # Build prev holdings
        prev_h = {}
        for h in (prev_doc.get('holdings') or []):
            isin = h.get('isin', '')
            if isin:
                prev_h[isin] = h.get('quantity', 0)

        # Build current movements
        cb = curr_doc.get('costs_breakdown') or {}
        sec_movements = cb.get('securityMovements') or []
        has_mov = cb.get('hasMovementsSection', True)

        if not has_mov and len(sec_movements) == 0:
            ok_checks += 1
            continue

        # Skip coherence if movements exist but none have valid operationType (scanned PDFs)
        has_typed = any(m.get('operationType') in ('Acquisto', 'Vendita') for m in sec_movements)
        if len(sec_movements) > 0 and not has_typed:
            ok_checks += 1
            continue

        mov_d = {}
        for m in sec_movements:
            isin = m.get('isin', '')
            if not isin:
                continue
            if isin not in mov_d:
                mov_d[isin] = {'b': 0, 's': 0}
            if m.get('operationType') == 'Acquisto':
                mov_d[isin]['b'] += m.get('quantity', 0)
            elif m.get('operationType') == 'Vendita':
                mov_d[isin]['s'] += m.get('quantity', 0)

        # Back-calculate initial
        calc_init = {}
        curr_h = {}
        for h in (curr_doc.get('holdings') or []):
            isin = h.get('isin', '')
            if not isin:
                continue
            curr_h[isin] = h.get('quantity', 0)
            d = mov_d.get(isin, {'b': 0, 's': 0})
            calc_init[isin] = curr_h[isin] - d['b'] + d['s']

        for isin, d in mov_d.items():
            if isin not in calc_init:
                q = 0 - d['b'] + d['s']
                if q != 0:
                    calc_init[isin] = q

        # Compare
        all_isins = set(list(prev_h.keys()) + list(calc_init.keys()))
        mismatches = []

        for isin in all_isins:
            ci = calc_init.get(isin, 0)
            ph = prev_h.get(isin, 0)
            if abs(ci - ph) >= 0.0001:
                # Check exemptions
                mov = mov_d.get(isin)
                has_no_mov = not mov or (mov['b'] == 0 and mov['s'] == 0)
                fully_disappeared = ph > 0 and curr_h.get(isin, 0) == 0
                fully_appeared = ph == 0 and curr_h.get(isin, 0) > 0
                if has_no_mov and (fully_disappeared or fully_appeared):
                    continue
                mismatches.append((isin, ci, ph))

        if len(mismatches) == 0:
            ok_checks += 1
        else:
            fail_checks += 1
            period_label = f"{prev_doc['period_end']} → {curr_doc['period_end']}"
            failures.append({
                'account': acc,
                'period': period_label,
                'mismatches': [(m[0], f"calcInit={m[1]:.2f} vs prevQty={m[2]:.2f}") for m in mismatches]
            })
            print(f"    ❌ {period_label}: {len(mismatches)} mismatch")
            for isin, ci, ph in mismatches[:5]:
                print(f"       {isin}: calcInit={ci:.4f} vs prevQty={ph:.4f} (diff={abs(ci-ph):.4f})")

print(f"\n{'='*60}")
print(f"📊 RISULTATO COERENZA:")
print(f"  ✅ OK: {ok_checks}")
print(f"  ❌ FAIL: {fail_checks}")
print(f"  ⚠️  SKIP (no predecessor): {missing_checks}")
print(f"  📋 Totale: {total_checks}")
print(f"{'='*60}")

if fail_checks > 0:
    print(f"\n❌ FALLIMENTI DETTAGLIATI:")
    for f in failures:
        print(f"\n  Account {f['account']} | {f['period']}:")
        for isin, detail in f['mismatches']:
            print(f"    {isin}: {detail}")

# Also check for upload errors
with open('/tmp/test_results.json') as f:
    results = json.load(f)
upload_errors = [r for r in results if r['status'] == 'ERR']
if upload_errors:
    print(f"\n❌ ERRORI UPLOAD ({len(upload_errors)}):")
    for e in upload_errors:
        print(f"  {e['group']} | {e['file']}: {e['details']}")

# Save full report
report = {
    'total_uploads': len(results),
    'upload_ok': len([r for r in results if r['status'] in ('OK', 'DUP')]),
    'upload_errors': len(upload_errors),
    'coherence_total': total_checks,
    'coherence_ok': ok_checks,
    'coherence_fail': fail_checks,
    'coherence_skip': missing_checks,
    'failures': failures,
    'upload_errors_detail': upload_errors,
}
with open('/tmp/test_report.json', 'w') as f:
    json.dump(report, f, indent=2)
print(f"\n📝 Report completo salvato in /tmp/test_report.json")
PYEOF

log ""
log "🏁 Test completato!"
