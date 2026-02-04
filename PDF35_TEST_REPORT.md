# PDF #35 Test Report: Gemini 1.5 Pro vs 2.5 Flash

## Test Details
- **PDF**: `20240331_Estratto_conto_trimestrale.pdf` (PDF #35)
- **Date**: 2026-02-02
- **Test Objective**: Determine if Gemini 1.5 Pro can extract more movements than Gemini 2.5 Flash

## Previous Result (Gemini 2.5 Flash)
- **Movements extracted**: 20 / 28 expected (71%)
- **Sales (Vendita)**: 0 / 22 expected (0% - all missing!)
- **Purchases (Acquisto)**: 5 / 6 expected (83%)
- **Response length**: 81,220 chars (truncated)
- **Processing time**: ~15 seconds
- **Issues**:
  - Missing all 22 sale movements
  - Truncated JSON response
  - Math validation failed

## Test Attempt 1: gemini-3-pro
- **Model Name**: `gemini-3-pro` (attempted)
- **Result**: ⏱️ TIMEOUT after 10 minutes
- **Status**: Model doesn't exist or API error
- **Notes**: "gemini-3-pro" is not a valid Google model name

## Test Attempt 2: gemini-1.5-pro-latest
- **Model Name**: `gemini-1.5-pro-latest`
- **Result**: ⏱️ TIMEOUT after 15 minutes (900 seconds)
- **Status**: Processing too slow
- **Notes**:
  - Model started processing but didn't complete in 15 minutes
  - No response received from API
  - 60x slower than Gemini 2.5 Flash (15s)

## Root Cause Analysis

### Why Gemini Pro Models Are Too Slow
1. **Model Size**: Pro models have more parameters = slower inference
2. **PDF Complexity**: This PDF has:
   - Multiple pages with transaction tables
   - 28 movements to extract
   - Complex layout (Dare/Avere columns)
   - 700KB+ in size
3. **API Limitations**:
   - Next.js maxDuration: 600 seconds (10 minutes)
   - Python request timeout: 900 seconds (15 minutes)
   - Gemini Pro exceeded both limits

### Why Gemini 2.5 Flash Misses Movements
1. **JSON Truncation**: Response was truncated at 81,220 chars
2. **Output Token Limit**: Hit maxOutputTokens (65,536) or model limit
3. **Missing Sales**: All 22 sale movements were not extracted
4. **Possible Causes**:
   - Model stopped generating before reaching all movements
   - JSON truncation cut off the movements array
   - Model didn't read all pages of the PDF

## Recommendations

### Option 1: Increase Output Token Limit for Flash ✓ RECOMMENDED
```typescript
maxOutputTokens: 131072  // Double from 65,536 to 131,072
```
- **Pros**:
  - Fast (15s processing)
  - May fix truncation issue
  - Cost-effective
- **Cons**:
  - May still truncate on very large PDFs
  - Not guaranteed to extract all movements

### Option 2: Use Gemini 1.5 Flash with Retry Logic ✓ GOOD
```typescript
// Current implementation already has retry logic
// Enhance with:
// 1. Compactify descriptions if response is too long
// 2. Split PDF into pages if needed
// 3. Detect truncation and retry with compression
```
- **Pros**:
  - Already implemented
  - Can handle most cases
  - Fast enough (15-30s)
- **Cons**:
  - Extra API calls cost more
  - May still miss complex cases

### Option 3: Hybrid Approach - Flash First, Pro if Needed ✓ BEST
```typescript
// 1. Try Gemini 2.5 Flash first (fast, cheap)
// 2. Check if result is complete (math validation, expected movement count)
// 3. If incomplete: use Gemini 1.5 Pro with longer timeout
// 4. Accept Pro timeouts for edge cases
```
- **Pros**:
  - Fast for 90% of PDFs
  - Accurate for complex PDFs that Flash can handle
  - Only use slow Pro model when needed
- **Cons**:
  - More complex code
  - Some PDFs may still fail

### Option 4: Use Gemini 2.0 Flash Experimental
```typescript
const modelName = 'gemini-2.0-flash-exp'
```
- **Pros**:
  - Newer model (Feb 2025)
  - May have better extraction
  - Faster than 1.5 Pro
- **Cons**:
  - Experimental/preview status
  - May have breaking changes
  - Unknown reliability

### Option 5: Chunked Processing
```typescript
// Split PDF by pages, process separately, merge results
// Example: Process pages 1-3, 4-6, 7-9 independently
```
- **Pros**:
  - Can handle any PDF size
  - Avoids token limits
  - Parallel processing possible
- **Cons**:
  - Complex implementation
  - May lose context between pages
  - Need to merge/deduplicate results

## Conclusion

**Gemini 1.5 Pro is TOO SLOW** for this use case:
- ⏱️ 15 minutes timeout vs 15 seconds for Flash
- 60x slower is unacceptable for user experience
- No guarantee it would extract all movements even if it completed

**Recommendation**:
1. ✅ Stick with **Gemini 2.5 Flash** (or 2.0 Flash Exp)
2. ✅ **Increase maxOutputTokens** to 131,072 or 200,000
3. ✅ **Enhance retry logic** with:
   - Truncation detection
   - Compactified descriptions on retry
   - Math validation to trigger retries
4. ❓ **Consider hybrid approach** only if Flash consistently fails for specific PDFs

## Next Steps
1. Update `maxOutputTokens` in route.ts
2. Test PDF #35 again with increased token limit
3. Monitor token usage and costs
4. Document any remaining failures
