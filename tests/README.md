# Module Tests

Individual test scripts for each module using real data from Supabase.

## Available Tests

| Module | Test File | Command | What It Tests |
|--------|-----------|---------|---------------|
| Module 2 | `test-image-service.ts` | `npm run test:module2` | Image download, validation, base64, cleanup |
| Module 3 | `test-ipfs-service.ts` | `npm run test:module3` | IPFS upload (images + metadata), Pinata connection |

## Quick Start

### 1. Set Up Environment

```bash
# Copy and edit .env file
cp env.example .env
```

Required variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PINATA_API_KEY` (for Module 3)
- `PINATA_SECRET_KEY` (for Module 3)

### 2. Run Tests

```bash
# Test Module 2 (Image Service)
npm run test:module2

# Test Module 3 (IPFS Service)
npm run test:module3
```

## Test Features

✅ **Real Data** - Fetches actual tweets from your Supabase database  
✅ **Complete Coverage** - Tests all functions in each module  
✅ **Auto Cleanup** - Removes temp files automatically  
✅ **Clear Output** - Step-by-step results with emojis  
✅ **Error Handling** - Shows detailed errors if something fails  

## Test Results

Each test shows:
- Step-by-step progress
- Success/failure for each operation
- Detailed results (file sizes, URLs, etc.)
- Summary at the end

Example:
```
🎉 ALL TESTS PASSED!

✅ Tweet fetched: 1234567890
✅ Images found: 1
✅ Images downloaded: 1
✅ All validations passed: 1
✅ Cleanup successful: YES
```

## Prerequisites

### For All Tests
- Node.js installed
- Dependencies installed (`npm install`)
- Supabase configured in `.env`
- Tweets with images in database

### For Module 3 Only
- Pinata account (free tier works)
- Pinata API keys in `.env`

## Troubleshooting

**"No tweets with images found"**
- Run your Twitter scraper first
- Ensure tweets have `images` or `all_related_images` populated

**"Missing credentials"**
- Check your `.env` file exists
- Verify all required keys are set

**"Pinata authentication failed"**
- Sign up at https://pinata.cloud
- Create API keys with pinning permissions
- Add to `.env` file

## File Structure

```
tests/
├── README.md                    (this file)
├── test-image-service.ts        (Module 2 test)
└── test-ipfs-service.ts         (Module 3 test)
```

## What Each Test Does

### Module 2: Image Service
1. Connects to Supabase
2. Fetches real tweet with images
3. Downloads image from Twitter URL
4. Validates format, size, dimensions
5. Converts to base64
6. Gets MIME type
7. Batch downloads all images
8. Validates all images
9. Cleans up temp files
10. Verifies cleanup

### Module 3: IPFS Service
1. Tests Pinata connection
2. Fetches real tweet with image
3. Downloads image locally
4. Uploads image to IPFS
5. Verifies image URL accessible
6. Creates test metadata (token format)
7. Uploads metadata to IPFS
8. Verifies metadata URL accessible
9. Tests URL generation utilities
10. Lists pinned files
11. Checks pinning status
12. Cleans up local files

## Next Steps

After both tests pass:
1. Test Module 4 (AI Service - coming soon)
2. Test full orchestrator with `npm run launch:preview`
3. Try manual launch with `npm run launch:execute`

## Documentation

For detailed expected output and troubleshooting, see:
- `../TESTING.md` - Complete testing guide
- `../AUTOMATION-GUIDE.md` - Full setup guide

---

**Ready to test? Run `npm run test:module2` to start!** 🚀

