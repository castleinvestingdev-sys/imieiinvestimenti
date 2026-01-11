
const fs = require('fs');
const path = require('path');

// Usage: node batch_verify.js <folder_path>
const folderPath = process.argv[2];

if (!folderPath) {
    console.error("Usage: node batch_verify.js <folder_path>");
    process.exit(1);
}

const API_URL = 'http://localhost:3000/api/parse-pdf';

async function processFile(filePath) {
    const fileName = path.basename(filePath);
    console.log(`Processing: ${fileName}...`);

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, fileName);

        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Check verification
        const summary = data.data.summary;
        const calcSum = summary.total_movements_amount?.value || 0;
        const initial = summary.initial_balance?.value || 0;
        const final = summary.final_balance?.value || 0;
        const calculatedDelta = Number((final - initial).toFixed(2));
        const extractedSum = Number(calcSum.toFixed(2));

        const diff = Math.abs(extractedSum - calculatedDelta);
        const isOk = diff < 0.001;

        if (isOk) {
            console.log(`✅ [OK] ${fileName}`);
            console.log(`    Movements: ${data.data.movements.length}`);
            console.log(`    Sum: ${extractedSum} € (Matches Delta ${calculatedDelta} €)`);
            return true;
        } else {
            console.log(`❌ [FAIL] ${fileName}`);
            console.log(`    Movements: ${data.data.movements.length}`);
            console.log(`    Sum: ${extractedSum} €`);
            console.log(`    Delta: ${calculatedDelta} €`);
            console.log(`    Diff: ${Number((extractedSum - calculatedDelta).toFixed(2))} €`);
            return false;
        }
    } catch (error) {
        console.error(`💥 [ERROR] ${fileName}:`, error.message);
        return false;
    }
}

async function main() {
    if (!fs.existsSync(folderPath)) {
        console.error(`Folder not found: ${folderPath}`);
        process.exit(1);
    }

    const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`Found ${files.length} PDF files in ${folderPath}`);

    let failureCount = 0;

    for (const file of files) {
        const success = await processFile(path.join(folderPath, file));
        if (!success) failureCount++;
        console.log('-'.repeat(40));
    }

    console.log(`Summary: ${files.length - failureCount} passed, ${failureCount} failed.`);

    if (failureCount > 0) {
        console.error("❌ Verification FAILED. Some files did not match.");
        process.exit(1);
    } else {
        console.log("✅ All PDF verifications PASSED.");
        process.exit(0);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
