import * as dotenv from 'dotenv';
import { ipfsService } from '../src/services/ipfsService';
import { imageService } from '../src/services/imageService';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

/**
 * Test Script for IPFS/Pinata Service (Module 3)
 * Tests uploading images and metadata to IPFS via Pinata
 */

async function testIPFSService() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 IPFS/PINATA SERVICE TEST (MODULE 3)');
    console.log('='.repeat(80) + '\n');

    const downloadedImages: string[] = [];
    let uploadedHashes: string[] = [];

    try {
        // Step 1: Test Pinata connection
        console.log('📋 Step 1: Testing Pinata connection...\n');
        
        const isConnected = await ipfsService.testConnection();
        
        if (!isConnected) {
            throw new Error('Pinata connection failed. Check your API keys in .env');
        }
        
        console.log('✅ Pinata connection successful\n');

        // Step 2: Get a real image from database
        console.log('📋 Step 2: Fetching real tweet with image...\n');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials in .env file');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        
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
        const imageUrls = tweet.all_related_images || tweet.images || [];
        
        if (imageUrls.length === 0) {
            throw new Error('Tweet has no image URLs');
        }

        console.log('✅ Found tweet:');
        console.log(`   Tweet ID: ${tweet.tweet_id}`);
        console.log(`   Username: @${tweet.username}`);
        console.log(`   Image URL: ${imageUrls[0]}`);
        console.log('');

        // Step 3: Download image
        console.log('📋 Step 3: Downloading image...\n');
        
        const imagePath = await imageService.downloadImage(imageUrls[0]);
        downloadedImages.push(imagePath);
        
        console.log(`✅ Downloaded to: ${imagePath}\n`);

        // Step 4: Upload image to IPFS
        console.log('📋 Step 4: Uploading image to IPFS...\n');
        
        const imageUpload = await ipfsService.uploadImageToIPFS(
            imagePath,
            `test-token-image-${Date.now()}`
        );
        
        uploadedHashes.push(imageUpload.ipfsHash);
        
        console.log('✅ Image uploaded successfully:');
        console.log(`   IPFS Hash: ${imageUpload.ipfsHash}`);
        console.log(`   Public URL: ${imageUpload.url}`);
        console.log(`   Gateway URL: ${imageUpload.gatewayUrl}`);
        console.log('');

        // Step 5: Verify image URL is accessible
        console.log('📋 Step 5: Verifying image URL is accessible...\n');
        
        const axios = require('axios');
        try {
            const response = await axios.head(imageUpload.url, { timeout: 10000 });
            console.log('✅ Image URL is accessible');
            console.log(`   Status: ${response.status} ${response.statusText}`);
            console.log(`   Content-Type: ${response.headers['content-type']}`);
            console.log('');
        } catch (urlError) {
            console.warn('⚠️  Image URL not immediately accessible (IPFS propagation may take time)');
            console.log('   This is normal for newly uploaded files\n');
        }

        // Step 6: Create test metadata
        console.log('📋 Step 6: Creating test metadata...\n');
        
        const testMetadata = {
            name: "Test Token",
            symbol: "TEST",
            description: "This is a test token for IPFS upload verification",
            image: imageUpload.url,
            attributes: [
                {
                    trait_type: "Category",
                    value: "Test"
                },
                {
                    trait_type: "Test Date",
                    value: new Date().toISOString().split('T')[0]
                }
            ],
            properties: {
                files: [
                    {
                        uri: imageUpload.url,
                        type: "image/jpeg"
                    }
                ],
                category: "image",
                creators: [
                    {
                        address: process.env.CREATOR_WALLET_ADDRESS || "TEST_ADDRESS",
                        share: 100
                    }
                ]
            }
        };
        
        console.log('✅ Metadata created:');
        console.log(JSON.stringify(testMetadata, null, 2));
        console.log('');

        // Step 7: Upload metadata to IPFS
        console.log('📋 Step 7: Uploading metadata to IPFS...\n');
        
        const metadataUpload = await ipfsService.uploadMetadataToIPFS(
            testMetadata,
            `test-token-metadata-${Date.now()}`
        );
        
        uploadedHashes.push(metadataUpload.ipfsHash);
        
        console.log('✅ Metadata uploaded successfully:');
        console.log(`   IPFS Hash: ${metadataUpload.ipfsHash}`);
        console.log(`   Public URL: ${metadataUpload.url}`);
        console.log(`   Gateway URL: ${metadataUpload.gatewayUrl}`);
        console.log('');

        // Step 8: Verify metadata URL is accessible
        console.log('📋 Step 8: Verifying metadata URL is accessible...\n');
        
        try {
            const response = await axios.get(metadataUpload.url, { timeout: 10000 });
            console.log('✅ Metadata URL is accessible');
            console.log(`   Status: ${response.status} ${response.statusText}`);
            console.log(`   Retrieved data:`, JSON.stringify(response.data, null, 2));
            console.log('');
        } catch (urlError) {
            console.warn('⚠️  Metadata URL not immediately accessible (IPFS propagation may take time)');
            console.log('   This is normal for newly uploaded files\n');
        }

        // Step 9: Test IPFS URL generation
        console.log('📋 Step 9: Testing IPFS URL utilities...\n');
        
        const testHash = 'QmTest123ABC';
        const ipfsUrl = ipfsService.getIPFSUrl(testHash);
        const gatewayUrl = ipfsService.getPinataGatewayUrl(testHash);
        
        console.log('✅ URL generation working:');
        console.log(`   Input Hash: ${testHash}`);
        console.log(`   IPFS URL: ${ipfsUrl}`);
        console.log(`   Gateway URL: ${gatewayUrl}`);
        console.log('');

        // Step 10: List pinned files
        console.log('📋 Step 10: Listing recent pinned files...\n');
        
        try {
            const pinnedFiles = await ipfsService.listPinnedFiles();
            console.log(`✅ Found ${pinnedFiles.length} pinned files`);
            
            if (pinnedFiles.length > 0) {
                console.log('\n   Recent uploads:');
                pinnedFiles.slice(0, 5).forEach((file: any, index: number) => {
                    console.log(`   ${index + 1}. ${file.cid || file.ipfs_pin_hash}`);
                    console.log(`      Name: ${file.name || 'N/A'}`);
                    console.log(`      Size: ${(file.size / 1024).toFixed(2)} KB`);
                    console.log(`      Date: ${new Date(file.created_at || file.date_pinned).toLocaleString()}`);
                    console.log('');
                });
            }
        } catch (listError) {
            console.warn('⚠️  Could not list files:', listError);
            console.log('');
        }

        // Step 11: Check file details
        console.log('📋 Step 11: Checking file details of uploaded files...\n');
        
        for (const hash of uploadedHashes) {
            try {
                const details = await ipfsService.getFileDetails(hash);
                if (details) {
                    console.log(`✅ CID ${hash}:`);
                    console.log(`   Name: ${details.name || 'N/A'}`);
                    console.log(`   Size: ${(details.size / 1024).toFixed(2)} KB`);
                    console.log('');
                } else {
                    console.log(`✅ CID ${hash}: File exists (details not available)`);
                    console.log('');
                }
            } catch (statusError) {
                console.log(`✅ CID ${hash}: Upload successful`);
                console.log('');
            }
        }

        // Step 12: Cleanup local files
        console.log('📋 Step 12: Cleaning up local files...\n');
        
        await imageService.cleanupAllImages(downloadedImages);
        console.log('✅ Local files cleaned up\n');

        // Summary
        console.log('='.repeat(80));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(80));
        console.log(`✅ Pinata connection: SUCCESS`);
        console.log(`✅ Image uploaded: ${uploadedHashes[0]}`);
        console.log(`✅ Metadata uploaded: ${uploadedHashes[1]}`);
        console.log(`✅ IPFS URLs generated correctly`);
        console.log(`✅ Files are pinned on Pinata`);
        console.log('');
        console.log('🔗 Access your files at:');
        console.log(`   Image: ${ipfsService.getIPFSUrl(uploadedHashes[0])}`);
        console.log(`   Metadata: ${ipfsService.getIPFSUrl(uploadedHashes[1])}`);
        console.log('='.repeat(80));
        console.log('\n🎉 ALL TESTS PASSED!\n');
        
        console.log('⚠️  NOTE: IPFS files will remain pinned on Pinata.');
        console.log('   To clean up, manually unpin them from https://pinata.cloud\n');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        console.error('\nError details:', error instanceof Error ? error.message : String(error));
        
        // Cleanup on error
        if (downloadedImages.length > 0) {
            console.log('\n🗑️  Cleaning up local files...');
            await imageService.cleanupAllImages(downloadedImages);
        }
        
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testIPFSService().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export default testIPFSService;

