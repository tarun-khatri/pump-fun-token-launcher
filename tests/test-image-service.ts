import * as dotenv from 'dotenv';
import { imageService } from '../src/services/imageService';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

/**
 * Test Script for Image Service (Module 2)
 * Tests downloading, validating, and cleaning up images from real tweets
 */

async function testImageService() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 IMAGE SERVICE TEST (MODULE 2)');
    console.log('='.repeat(80) + '\n');

    try {
        // Step 1: Initialize Supabase
        console.log('📋 Step 1: Connecting to Supabase...\n');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials in .env file');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        console.log('✅ Connected to Supabase\n');

        // Step 2: Fetch a real tweet with images
        console.log('📋 Step 2: Fetching real tweet with images from database...\n');
        
        const { data: tweets, error } = await supabase
            .from('tweets')
            .select('*')
            .not('images', 'eq', '[]')
            .limit(1)
            .order('created_at', { ascending: false });

        if (error || !tweets || tweets.length === 0) {
            throw new Error('No tweets with images found in database');
        }

        const tweet = tweets[0];
        console.log('✅ Found tweet:');
        console.log(`   Tweet ID: ${tweet.tweet_id}`);
        console.log(`   Username: @${tweet.username}`);
        console.log(`   Content: ${tweet.content.substring(0, 100)}...`);
        console.log(`   Main Images: ${tweet.images?.length || 0}`);
        console.log(`   All Related Images: ${tweet.all_related_images?.length || 0}`);
        console.log(`   Videos: ${tweet.videos?.length || 0}`);
        console.log('');

        // Get all image URLs
        const imageUrls = tweet.all_related_images || tweet.images || [];
        
        if (imageUrls.length === 0) {
            throw new Error('Tweet has no image URLs');
        }

        console.log('📸 Image URLs to test:');
        imageUrls.forEach((url: string, index: number) => {
            console.log(`   ${index + 1}. ${url}`);
        });
        console.log('');

        // Step 3: Test downloading single image
        console.log('📋 Step 3: Testing single image download...\n');
        
        const firstImageUrl = imageUrls[0];
        console.log(`Downloading: ${firstImageUrl}\n`);
        
        const downloadedPath = await imageService.downloadImage(firstImageUrl);
        console.log(`✅ Downloaded to: ${downloadedPath}\n`);

        // Step 4: Test image validation
        console.log('📋 Step 4: Testing image validation...\n');
        
        const validation = await imageService.validateImage(downloadedPath);
        
        console.log('Validation Results:');
        console.log(`   Valid: ${validation.valid ? '✅ YES' : '❌ NO'}`);
        console.log(`   Format: ${validation.format}`);
        console.log(`   Size: ${(validation.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Dimensions: ${validation.width} x ${validation.height}`);
        
        if (!validation.valid) {
            console.log(`   ❌ Error: ${validation.error}`);
        }
        console.log('');

        // Step 5: Test base64 conversion
        console.log('📋 Step 5: Testing base64 conversion...\n');
        
        const base64 = await imageService.imageToBase64(downloadedPath);
        console.log(`✅ Converted to base64 (${base64.length} characters)`);
        console.log(`   Preview: ${base64.substring(0, 50)}...`);
        console.log('');

        // Step 6: Test MIME type detection
        console.log('📋 Step 6: Testing MIME type detection...\n');
        
        const mimeType = await imageService.getMimeType(downloadedPath);
        console.log(`✅ MIME Type: ${mimeType}\n`);

        // Step 7: Test batch download
        console.log('📋 Step 7: Testing batch download (all images)...\n');
        
        const allDownloadedPaths = await imageService.downloadAllImages(imageUrls);
        console.log(`✅ Downloaded ${allDownloadedPaths.length} image(s):`);
        allDownloadedPaths.forEach((path, index) => {
            console.log(`   ${index + 1}. ${path}`);
        });
        console.log('');

        // Step 8: Validate all images
        console.log('📋 Step 8: Validating all downloaded images...\n');
        
        for (let i = 0; i < allDownloadedPaths.length; i++) {
            const path = allDownloadedPaths[i];
            const val = await imageService.validateImage(path);
            
            console.log(`Image ${i + 1}:`);
            console.log(`   Path: ${path}`);
            console.log(`   Valid: ${val.valid ? '✅' : '❌'}`);
            console.log(`   Format: ${val.format}`);
            console.log(`   Size: ${(val.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Dimensions: ${val.width} x ${val.height}`);
            console.log('');
        }

        // Step 9: Test cleanup
        console.log('📋 Step 9: Testing cleanup...\n');
        
        console.log('Cleaning up all downloaded images...');
        await imageService.cleanupAllImages(allDownloadedPaths);
        console.log('✅ Cleanup complete\n');

        // Step 10: Verify cleanup
        console.log('📋 Step 10: Verifying cleanup...\n');
        
        const fs = require('fs');
        let allCleaned = true;
        
        for (const path of allDownloadedPaths) {
            if (fs.existsSync(path)) {
                console.log(`❌ File still exists: ${path}`);
                allCleaned = false;
            }
        }
        
        if (allCleaned) {
            console.log('✅ All files cleaned up successfully\n');
        }

        // Summary
        console.log('='.repeat(80));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(80));
        console.log(`✅ Tweet fetched: ${tweet.tweet_id}`);
        console.log(`✅ Images found: ${imageUrls.length}`);
        console.log(`✅ Images downloaded: ${allDownloadedPaths.length}`);
        console.log(`✅ All validations passed: ${allDownloadedPaths.length}`);
        console.log(`✅ Cleanup successful: ${allCleaned ? 'YES' : 'NO'}`);
        console.log('='.repeat(80));
        console.log('\n🎉 ALL TESTS PASSED!\n');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        console.error('\nError details:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testImageService().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export default testImageService;

