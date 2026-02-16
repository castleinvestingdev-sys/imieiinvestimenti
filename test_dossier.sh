#!/bin/bash
# Test all Credit Agricole Dossier Titoli PDFs
# Usage: ./test_dossier.sh [account_number]

BASE_DIR="/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli"
API_URL="http://localhost:3000/api/parse-pdf"
RESULTS_DIR="/tmp/dossier_test_results"
mkdir -p "$RESULTS_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TOTAL=0
SUCCESS=0
ERRORS=0
COHERENCE_ISSUES=0

test_pdf() {
    local pdf_path="$1"
    local filename
    filename=$(basename "$pdf_path")
    local result_file="$RESULTS_DIR/${filename%.pdf}.json"

    TOTAL=$((TOTAL + 1))
    printf "[%d] Testing: %s ... " "$TOTAL" "$filename"

    # Upload with dryRun
    local HTTP_CODE
    HTTP_CODE=$(curl -s -o "$result_file" -w "%{http_code}" \
        -X POST "$API_URL" \
        -F "file=@${pdf_path}" \
        -F "guestEmail=test@test.com" \
        -F "dryRun=true" \
        --max-time 300 2>/dev/null)

    if [ "$HTTP_CODE" != "200" ]; then
        printf "${RED}FAIL (HTTP %s)${NC}\n" "$HTTP_CODE"
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

    local holdings movements period coh_errors
    holdings=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('holdingsCount', 0))" 2>/dev/null)
    movements=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('movementsCount', 0))" 2>/dev/null)
    period=$(python3 -c "import json; d=json.load(open('$result_file')); print(d.get('period', '?'))" 2>/dev/null)
    coh_errors=$(python3 -c "import json; d=json.load(open('$result_file')); print(len(d.get('coherenceErrors', [])))" 2>/dev/null)

    if [ "$coh_errors" -gt 0 ] 2>/dev/null; then
        printf "${YELLOW}WARN${NC} - %s | %s titoli, %s mov | ${YELLOW}%s coherence errors${NC}\n" "$period" "$holdings" "$movements" "$coh_errors"
        COHERENCE_ISSUES=$((COHERENCE_ISSUES + coh_errors))
        python3 -c "
import json
d = json.load(open('$result_file'))
for e in d.get('coherenceErrors', []):
    print(f\"  ⚠️  {e['isin']} ({e.get('name','?')[:30]}): calcInit={e['calcInit']:.2f}, buys={e['buys']:.0f}, sells={e['sells']:.0f}\")
" 2>/dev/null
    else
        printf "${GREEN}OK${NC} - %s | %s titoli, %s mov\n" "$period" "$holdings" "$movements"
        SUCCESS=$((SUCCESS + 1))
    fi
}

# Determine which accounts to test
if [ -n "$1" ]; then
    ACCOUNTS=("$1")
else
    ACCOUNTS=()
    while IFS= read -r d; do
        name=$(basename "$d")
        [[ "$name" == .* ]] && continue
        ACCOUNTS+=("$name")
    done < <(find "$BASE_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
fi

echo "========================================"
echo "  DOSSIER TITOLI TEST SUITE"
echo "========================================"
echo ""

for account in "${ACCOUNTS[@]}"; do
    account_dir="$BASE_DIR/$account"
    if [ ! -d "$account_dir" ]; then
        echo "Account dir not found: $account_dir"
        continue
    fi

    echo ""
    echo "--- Account: $account ---"

    # Find PDFs and sort chronologically
    while IFS= read -r pdf; do
        test_pdf "$pdf"
    done < <(find "$account_dir" -maxdepth 1 -name "*.pdf" -type f | sort)
done

echo ""
echo "========================================"
echo "  RISULTATI"
echo "========================================"
printf "Totale: %d | ${GREEN}OK: %d${NC} | ${RED}Errori: %d${NC} | ${YELLOW}Coerenza: %d issues${NC}\n" "$TOTAL" "$SUCCESS" "$ERRORS" "$COHERENCE_ISSUES"
echo "Risultati JSON in: $RESULTS_DIR/"
