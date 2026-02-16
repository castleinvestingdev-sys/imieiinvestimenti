#!/bin/bash
# Test coherence of Credit Agricole Dossier Titoli PDFs
# Uploads PDFs in chronological order (oldest first) WITHOUT dryRun
# so Phase B/C cross-period validation can run against saved data.
#
# Usage:
#   ./test_coherence.sh [account_number]   # test one account (591, 115, or 990)
#   ./test_coherence.sh                     # test all accounts in order

BASE_DIR="/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli"
API_URL="http://localhost:3000/api/parse-pdf"
DEBUG_URL="http://localhost:3000/api/debug-analyses"
SUPABASE_URL="https://xmgsashgwntaslnweisr.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_WNHOZBnuo4IN5DoGHjXa3w_diwL415j"
COOKIE_NAME="sb-xmgsashgwntaslnweisr-auth-token"
RESULTS_DIR="/tmp/coherence_test_results"
COOKIE_FILE="/tmp/coherence_cookie.txt"
mkdir -p "$RESULTS_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

TOTAL=0
SUCCESS=0
ERRORS=0
USER_ID=""

# Check if server is running
if ! curl -s -o /dev/null -w "%{http_code}" "$API_URL" --max-time 5 | grep -q "405\|200\|401"; then
    echo -e "${RED}Server not running at $API_URL${NC}"
    echo "Start with: npm run dev"
    exit 1
fi

# Login via Supabase API to get session cookie
login() {
    echo -e "${CYAN}Logging in via Supabase...${NC}"
    local login_result
    login_result=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
        -H "apikey: ${SUPABASE_ANON_KEY}" \
        -H "Content-Type: application/json" \
        -d '{"email":"leonrivas27@gmail.com","password":"123456"}' 2>/dev/null)

    USER_ID=$(python3 -c "import json; d=json.loads('''${login_result}'''); print(d.get('user',{}).get('id', ''))" 2>/dev/null)

    if [ -z "$USER_ID" ]; then
        echo -e "${RED}Login failed!${NC}"
        exit 1
    fi

    # Build Supabase SSR session cookie
    local session_json
    session_json=$(python3 -c "
import json
d = json.loads('''${login_result}''')
print(json.dumps({'access_token': d['access_token'], 'refresh_token': d['refresh_token'], 'expires_at': d.get('expires_at',0), 'expires_in': d.get('expires_in',3600), 'token_type': 'bearer', 'user': d['user']}))
" 2>/dev/null)

    # Write cookie file for curl -b
    echo "localhost	FALSE	/	FALSE	0	${COOKIE_NAME}	${session_json}" > "$COOKIE_FILE"

    echo -e "  Logged in as user ${USER_ID:0:8}..."
}

# Clean account data before re-testing
clean_account() {
    local account="$1"
    echo -e "${CYAN}Cleaning account $account...${NC}"
    local result_file="/tmp/clean_account_result.json"
    curl -s -o "$result_file" "$DEBUG_URL?action=clean-account&account=$account" \
        -b "$COOKIE_FILE" --max-time 30 2>/dev/null
    local deleted
    deleted=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('deleted', 0))" 2>/dev/null || echo "0")
    echo -e "  Deleted $deleted existing analyses"
}

upload_pdf() {
    local pdf_path="$1"
    local filename
    filename=$(basename "$pdf_path")
    local result_file="$RESULTS_DIR/${filename%.pdf}.json"

    TOTAL=$((TOTAL + 1))
    printf "[%d] Uploading: %s ... " "$TOTAL" "$filename"

    # Upload WITHOUT dryRun — saves to DB for cross-period validation
    local HTTP_CODE
    HTTP_CODE=$(curl -s -o "$result_file" -w "%{http_code}" \
        -X POST "$API_URL" \
        -F "file=@${pdf_path}" \
        -F "userId=${USER_ID}" \
        -b "$COOKIE_FILE" \
        --max-time 300 2>/dev/null)

    if [ "$HTTP_CODE" != "200" ]; then
        printf "${RED}FAIL (HTTP %s)${NC}\n" "$HTTP_CODE"
        python3 -c "import json; d=json.load(open('$result_file')); print('  ', d.get('error', '')[:100])" 2>/dev/null
        ERRORS=$((ERRORS + 1))
        return
    fi

    # Parse result
    local success
    success=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('success', False))" 2>/dev/null)
    if [ "$success" != "True" ]; then
        local err
        err=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('error', 'unknown'))" 2>/dev/null)
        printf "${RED}FAIL: %s${NC}\n" "$err"
        ERRORS=$((ERRORS + 1))
        return
    fi

    local holdings movements period
    holdings=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('holdingsCount', 0))" 2>/dev/null)
    movements=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('movementsCount', 0))" 2>/dev/null)
    period=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('period', '?'))" 2>/dev/null)

    printf "${GREEN}OK${NC} - %s | %s titoli, %s mov\n" "$period" "$holdings" "$movements"
    SUCCESS=$((SUCCESS + 1))
}

# Run coherence report for all data
run_coherence_report() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  COHERENCE REPORT${NC}"
    echo -e "${CYAN}========================================${NC}"

    local report_file="$RESULTS_DIR/coherence_report.json"
    curl -s -o "$report_file" "$DEBUG_URL?action=details" \
        -b "$COOKIE_FILE" --max-time 60 2>/dev/null

    local total_errors
    total_errors=$(python3 -c "
import json
d = json.load(open('$report_file'))
details = d.get('details', [])
print(len(details))
" 2>/dev/null || echo "?")

    if [ "$total_errors" = "0" ]; then
        echo -e "${GREEN}✅ Nessun errore di coerenza trovato!${NC}"
    else
        echo -e "${RED}❌ $total_errors documenti con errori di coerenza${NC}"
        echo ""
        python3 -c "
import json
d = json.load(open('$report_file'))
for det in d.get('details', []):
    print(f\"  Doc {det['id']} | {det['period']} | {det['mismatchCount']} mismatch, {det['totalMovements']} movimenti\")
    for m in det.get('mismatches', []):
        diff_str = f\"diff={m['diff']:+.2f}\"
        print(f\"    {m['isin']} ({m['name']}): prev={m['prevQty']:.2f}, curr={m['currQty']:.2f}, buys={m['buys']:.0f}, sells={m['sells']:.0f}, calcInit={m['calcInit']:.2f} | {diff_str} → {m['expectedOp']}\")
" 2>/dev/null
    fi

    echo ""
    echo "Full report: $report_file"
}

# Determine which accounts to test
if [ -n "$1" ]; then
    ACCOUNTS=("$1")
else
    # Test in order: 591 (smallest), 115 (medium), 990 (largest)
    ACCOUNTS=("591" "115" "990")
fi

login

echo "========================================"
echo "  COHERENCE TEST SUITE"
echo "  Mode: LIVE (saves to database)"
echo "========================================"

for account in "${ACCOUNTS[@]}"; do
    account_dir="$BASE_DIR/$account"
    if [ ! -d "$account_dir" ]; then
        echo -e "${RED}Account dir not found: $account_dir${NC}"
        continue
    fi

    echo ""
    echo -e "${CYAN}--- Account: $account ---${NC}"

    # Clean previous data for this account
    clean_account "$account"

    # Find PDFs and sort chronologically (oldest first — critical for Phase B/C)
    while IFS= read -r pdf; do
        upload_pdf "$pdf"
    done < <(find "$account_dir" -maxdepth 1 -name "*.pdf" -type f | sort)
done

echo ""
echo "========================================"
echo "  UPLOAD RESULTS"
echo "========================================"
printf "Totale: %d | ${GREEN}OK: %d${NC} | ${RED}Errori: %d${NC}\n" "$TOTAL" "$SUCCESS" "$ERRORS"

# Run coherence report after all uploads
run_coherence_report
