import { imageService } from './services/imageService';
import { ipfsService } from './services/ipfsService';
import { aiService } from './services/aiService';
import { supabaseService, Tweet, LaunchedTokenData } from './services/supabaseService';
import { generateMetadata, validateMetadata, getCreatorAddress } from './services/metadataGenerator';
import { launchToken } from './launch';
import { sellToken } from './sell';

export interface LaunchResult {
    success: boolean;
    tokenAddress?: string;
    tokenSymbol?: string;
    tokenName?: string;
    deploySignature?: string;
    sellSignature?: string;
    solSpent?: number;
    solReceived?: number;
    profitLoss?: number;
    error?: string;
}

/**
 * Main Token Launch Orchestrator
 * Coordinates the entire flow from tweet to token launch
 */
export class TokenLaunchOrchestrator {
    private privateKey: string;

    constructor() {
        const privateKey = process.env.SOLANA_PRIVATE_KEY || process.env.PRIVATE_KEY;
        
        if (!privateKey) {
            throw new Error('SOLANA_PRIVATE_KEY or PRIVATE_KEY not set in environment');
        }

        this.privateKey = privateKey;
        console.log('✅ Token Launch Orchestrator initialized');
    }

    /**
     * Launch token from tweet
     * @param tweetId - Tweet ID to process
     * @returns Launch result
     */
    async launchTokenFromTweet(tweetId: string): Promise<LaunchResult> {
        const downloadedImages: string[] = [];

        try {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 Starting token launch from tweet: ${tweetId}`);
            console.log(`${'='.repeat(60)}\n`);

            // STEP 1: Fetch tweet from database
            console.log('📥 Step 1: Fetching tweet from database...');
            const tweet = await supabaseService.getTweetById(tweetId);
            
            if (!tweet) {
                throw new Error(`Tweet ${tweetId} not found in database`);
            }

            console.log(`✅ Tweet fetched: @${tweet.username}`);
            console.log(`   Content: ${tweet.content.substring(0, 100)}...`);
            console.log(`   Images: ${tweet.images?.length || 0}`);
            console.log(`   All related images: ${tweet.all_related_images?.length || 0}`);

            // Check if already launched
            if (tweet.coin_launched) {
                throw new Error(`Tweet ${tweetId} already has a token launched: ${tweet.contract_address}`);
            }

            // STEP 2: Get all images (main + quoted + reply)
            console.log('\n📸 Step 2: Collecting all images...');
            const allImageUrls = this.getAllImages(tweet);
            
            if (allImageUrls.length === 0) {
                throw new Error('No images found in tweet');
            }

            console.log(`✅ Found ${allImageUrls.length} image(s) to analyze`);

            // STEP 3: Download all images for AI analysis
            console.log('\n⬇️  Step 3: Downloading images...');
            const downloadedPaths = await imageService.downloadAllImages(allImageUrls);
            downloadedImages.push(...downloadedPaths);

            if (downloadedPaths.length === 0) {
                throw new Error('Failed to download any images');
            }

            console.log(`✅ Downloaded ${downloadedPaths.length} image(s)`);

            // STEP 4: Validate images
            console.log('\n✔️  Step 4: Validating images...');
            for (const imagePath of downloadedPaths) {
                const validation = await imageService.validateImage(imagePath);
                if (!validation.valid) {
                    console.warn(`⚠️  Image validation warning: ${validation.error}`);
                }
            }

            // STEP 5: Analyze with AI (send ALL images)
            console.log('\n🤖 Step 5: Analyzing with Gemini AI...');
            const aiSuggestion = await aiService.analyzeImagesForToken(
                downloadedPaths,
                tweet.content
            );

            console.log(`✅ AI Suggestion:`);
            console.log(`   Name: ${aiSuggestion.name}`);
            console.log(`   Ticker: ${aiSuggestion.ticker}`);
            console.log(`   Description: ${aiSuggestion.description}`);
            console.log(`   Confidence: ${aiSuggestion.confidence}%`);

            // STEP 6: Check ticker uniqueness
            console.log('\n🔍 Step 6: Checking ticker uniqueness...');
            const isUnique = await aiService.checkTickerUniqueness(
                aiSuggestion.ticker,
                supabaseService.getClient()
            );

            if (!isUnique) {
                console.warn(`⚠️  Ticker ${aiSuggestion.ticker} already exists, continuing anyway...`);
            }

            // STEP 7: Upload FIRST image to IPFS
            console.log('\n📤 Step 7: Uploading image to IPFS...');
            const firstImagePath = downloadedPaths[0];
            const imageUpload = await ipfsService.uploadImageToIPFS(
                firstImagePath,
                `${aiSuggestion.ticker}-image`
            );

            console.log(`✅ Image uploaded to IPFS: ${imageUpload.ipfsHash}`);
            console.log(`   URL: ${imageUpload.url}`);

            // STEP 8: Generate metadata
            console.log('\n📝 Step 8: Generating metadata...');
            const creatorAddress = getCreatorAddress();
            const metadata = generateMetadata(
                aiSuggestion.ticker,
                aiSuggestion.name,
                aiSuggestion.description,
                imageUpload.url,
                creatorAddress
            );

            // Validate metadata
            validateMetadata(metadata);

            // STEP 9: Upload metadata to IPFS
            console.log('\n📤 Step 9: Uploading metadata to IPFS...');
            const metadataUpload = await ipfsService.uploadMetadataToIPFS(
                metadata,
                `${aiSuggestion.ticker}-metadata`
            );

            console.log(`✅ Metadata uploaded to IPFS: ${metadataUpload.ipfsHash}`);
            console.log(`   URL: ${metadataUpload.url}`);

            // STEP 10: Launch token on pump.fun
            console.log('\n🚀 Step 10: Launching token on pump.fun...');
            const launchConfig = {
                name: aiSuggestion.name,
                symbol: aiSuggestion.ticker,
                metadataUrl: metadataUpload.url,
                initialBuy: 0.01,    // 0.01 SOL
                slippage: 10,         // 10%
                priorityFee: 0.0001  // 0.0001 SOL
            };

            const launchResult = await launchToken(launchConfig, this.privateKey);

            if (!launchResult.success) {
                throw new Error(`Token launch failed: ${launchResult.error}`);
            }

            console.log(`✅ Token launched successfully!`);
            console.log(`   Token Address: ${launchResult.tokenAddress}`);
            console.log(`   Transaction: ${launchResult.signature}`);

            // STEP 11: Wait 15 seconds
            console.log('\n⏳ Step 11: Waiting 15 seconds...');
            await this.sleep(15000);
            console.log(`✅ Wait complete`);

            // STEP 12: Sell token
            console.log('\n💰 Step 12: Selling token...');
            const sellConfig = {
                tokenMint: launchResult.tokenAddress!,
                tokenAmount: 0,      // Sell all
                minSolOut: 0.04,     // Min 0.04 SOL
                slippage: 5,         // 5%
                priorityFee: 0.0001  // 0.0001 SOL
            };

            const sellResult = await sellToken(sellConfig, this.privateKey);

            let solReceived = 0;
            let sellSignature = '';

            if (sellResult.success) {
                solReceived = sellResult.solReceived || 0;
                sellSignature = sellResult.signature || '';
                console.log(`✅ Token sold successfully!`);
                console.log(`   SOL Received: ${solReceived}`);
                console.log(`   Transaction: ${sellSignature}`);
            } else {
                console.warn(`⚠️  Sell failed: ${sellResult.error}`);
            }

            // STEP 13: Calculate profit/loss
            const solSpent = 0.01 + 0.0001 + 0.0001; // buy + fees
            const profitLoss = solReceived - solSpent;

            console.log(`\n💵 Financial Summary:`);
            console.log(`   SOL Spent: ${solSpent.toFixed(4)}`);
            console.log(`   SOL Received: ${solReceived.toFixed(4)}`);
            console.log(`   Profit/Loss: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(4)} SOL`);

            // STEP 14: Save to database
            console.log('\n💾 Step 13: Saving to database...');
            
            const launchedTokenData: LaunchedTokenData = {
                tweet_id: tweetId,
                contract_address: launchResult.tokenAddress!,
                token_name: aiSuggestion.name,
                token_symbol: aiSuggestion.ticker,
                token_description: aiSuggestion.description,
                metadata_url: metadataUpload.url,
                image_url: imageUpload.url,
                ipfs_image_hash: imageUpload.ipfsHash,
                ipfs_metadata_hash: metadataUpload.ipfsHash,
                deploy_signature: launchResult.signature,
                buy_signature: launchResult.signature, // Same transaction
                sell_signature: sellSignature,
                initial_buy_amount: 0.01,
                sol_spent: solSpent,
                sol_received: solReceived,
                profit_loss: profitLoss,
                ai_prompt: `Analyzed ${downloadedPaths.length} images`,
                ai_response: JSON.stringify(aiSuggestion),
                ai_model: 'gemini-2.5-flash',
                ai_confidence: aiSuggestion.confidence,
                status: sellResult.success ? 'sold' : 'launched',
                launch_timestamp: new Date().toISOString(),
                sell_timestamp: sellResult.success ? new Date().toISOString() : undefined
            };

            await supabaseService.saveLaunchedToken(launchedTokenData);

            // STEP 15: Update tweet status
            console.log('\n✅ Step 14: Updating tweet status...');
            await supabaseService.updateTweetLaunchStatus(tweetId, launchResult.tokenAddress!);

            // STEP 16: Cleanup images
            console.log('\n🗑️  Step 15: Cleaning up temporary files...');
            await imageService.cleanupAllImages(downloadedImages);

            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ TOKEN LAUNCH COMPLETE!`);
            console.log(`   Token: ${aiSuggestion.ticker} (${launchResult.tokenAddress})`);
            console.log(`   Profit/Loss: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(4)} SOL`);
            console.log(`${'='.repeat(60)}\n`);

            return {
                success: true,
                tokenAddress: launchResult.tokenAddress,
                tokenSymbol: aiSuggestion.ticker,
                tokenName: aiSuggestion.name,
                deploySignature: launchResult.signature,
                sellSignature: sellSignature,
                solSpent: solSpent,
                solReceived: solReceived,
                profitLoss: profitLoss
            };

        } catch (error) {
            console.error(`\n❌ Token launch failed:`, error);

            // Mark as failed in database
            try {
                await supabaseService.markLaunchFailed(
                    tweetId,
                    error instanceof Error ? error.message : String(error)
                );
            } catch (dbError) {
                console.error('Failed to mark launch as failed in database:', dbError);
            }

            // Cleanup images on error
            if (downloadedImages.length > 0) {
                console.log('🗑️  Cleaning up temporary files...');
                await imageService.cleanupAllImages(downloadedImages);
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get all images from tweet (main + quoted + reply)
     * @param tweet - Tweet object
     * @returns Array of image URLs
     */
    private getAllImages(tweet: Tweet): string[] {
        const images: string[] = [];

        // Use all_related_images if available (includes all sources)
        if (tweet.all_related_images && tweet.all_related_images.length > 0) {
            images.push(...tweet.all_related_images);
        } else {
            // Fallback: collect from individual fields
            if (tweet.images && tweet.images.length > 0) {
                images.push(...tweet.images);
            }
        }

        // Remove duplicates
        return [...new Set(images)];
    }

    /**
     * Sleep helper
     * @param ms - Milliseconds to sleep
     */
    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const orchestrator = new TokenLaunchOrchestrator();

