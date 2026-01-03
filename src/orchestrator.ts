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
        let imageIpfsHash = '';
        let metadataIpfsHash = '';
        let imageFileId = ''; // Need fileId for unpinning

        try {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 Starting token launch from tweet: ${tweetId}`);
            console.time('🚀 TOTAL LAUNCH SEQUENCE');
            console.log(`${'='.repeat(60)}\n`);

            // STEP 1: Fetch tweet from database
            console.log('📥 Step 1: Fetching tweet from database...');
            const tweet = await supabaseService.getTweetById(tweetId);

            if (!tweet) {
                throw new Error(`Tweet ${tweetId} not found in database`);
            }

            console.log(`✅ Tweet fetched: @${tweet.username}`);
            console.log(`   Content: ${tweet.content.substring(0, 100)}...`);

            // Check if already launched
            if (tweet.coin_launched) {
                throw new Error(`Tweet ${tweetId} already has a token launched: ${tweet.contract_address}`);
            }

            // STEP 2: Job Preparation (Images)
            console.log('\n📸 Step 2: Collecting images...');
            const allImageUrls = this.getAllImages(tweet);

            if (allImageUrls.length === 0) {
                throw new Error('No images found in tweet');
            }

            // STEP 3: Download images
            console.log('\n⬇️  Step 3: Downloading images...');
            const downloadedPaths = await imageService.downloadAllImages(allImageUrls);
            downloadedImages.push(...downloadedPaths);

            if (downloadedPaths.length === 0) {
                throw new Error('Failed to download any images');
            }

            // STEP 4: PARALLEL EXECUTION (AI & IPFS)
            console.log('\n⚡ Step 4: Parallel Processing (AI Analysis + IPFS Upload)...');

            const aiPromise = aiService.analyzeImagesForToken(downloadedPaths, tweet.content);
            const imageUploadPromise = ipfsService.uploadImageToIPFS(downloadedPaths[0], `token-image-${tweetId}`);

            // Wait for both
            const [aiSuggestion, imageUpload] = await Promise.all([aiPromise, imageUploadPromise]);

            imageIpfsHash = imageUpload.ipfsHash;
            // Note: Current uploadImageToIPFS returns IPFS hash, but we might need ID for unpinning.
            // Assuming we can find it or the service returns it. 
            // The current implementation of ipfsService returns {ipfsHash, url, gatewayUrl}.
            // Pinata SDK delete requires ID or CID? The SDK call used is `pinata.files.public.delete([fileId])`.
            // The `upload` method usually returns CID. We might need to query the file ID by CID if the upload response doesn't give it.
            // Optimization: Let's fetch the file ID immediately if we need to ensure deletion capability,
            // OR we just use the CID for deletion if the SDK Supports it? 
            // The docs say `delete([fileId])`. 
            // We will attempt to lookup file ID by CID if failure occurs.

            console.log(`✅ Parallel tasks complete!`);
            console.log(`   AI Suggestion: ${aiSuggestion.ticker} (${aiSuggestion.confidence}%)`);
            console.log(`   Image IPFS: ${imageIpfsHash}`);

            // STEP 5: Generate & Upload Metadata
            console.log('\n📝 Step 5: Generating & Uploading Metadata...');
            const creatorAddress = getCreatorAddress();
            const metadata = generateMetadata(
                aiSuggestion.ticker,
                aiSuggestion.name,
                aiSuggestion.description,
                imageUpload.url,
                creatorAddress
            );

            validateMetadata(metadata);

            const metadataUpload = await ipfsService.uploadMetadataToIPFS(
                metadata,
                `${aiSuggestion.ticker}-metadata`
            );
            metadataIpfsHash = metadataUpload.ipfsHash;

            console.log(`✅ Metadata IPFS: ${metadataIpfsHash}`);

            // STEP 6: Launch token
            console.log('\n🚀 Step 6: Launching token on pump.fun...');
            const launchConfig = {
                name: aiSuggestion.name,
                symbol: aiSuggestion.ticker,
                metadataUrl: metadataUpload.url,
                initialBuy: 0.01,
                slippage: 10,
                priorityFee: 0.0001
            };

            const launchResult = await launchToken(launchConfig, this.privateKey);

            if (!launchResult.success) {
                throw new Error(`Token launch failed: ${launchResult.error}`);
            }

            console.log(`✅ Token launched: ${launchResult.tokenAddress}`);

            // STEP 7: Post-Launch Sequence (Sell)
            console.log('\n⏳ Step 7: Waiting 15s for Sell...');
            await this.sleep(15000);

            console.log('\n💰 Step 8: Selling token...');
            const sellResult = await sellToken({
                tokenMint: launchResult.tokenAddress!,
                tokenAmount: 0,
                minSolOut: 0.04,
                slippage: 5,
                priorityFee: 0.0001
            }, this.privateKey);

            // ... (Rest of logic: DB Save, specific variables) ...
            const solSpent = 0.01 + 0.0001 + 0.0001;
            const solReceived = sellResult.success ? (sellResult.solReceived || 0) : 0;
            const profitLoss = solReceived - solSpent;

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
                buy_signature: launchResult.signature,
                sell_signature: sellResult.signature || '',
                initial_buy_amount: 0.01,
                sol_spent: solSpent,
                sol_received: solReceived,
                profit_loss: profitLoss,
                ai_prompt: `Analyzed ${downloadedPaths.length} images`,
                ai_response: JSON.stringify(aiSuggestion),
                ai_model: 'Gemini 2.5 Flash-Lite',
                ai_confidence: aiSuggestion.confidence,
                status: sellResult.success ? 'sold' : 'launched',
                launch_timestamp: new Date().toISOString(),
                sell_timestamp: sellResult.success ? new Date().toISOString() : undefined
            };

            await supabaseService.saveLaunchedToken(launchedTokenData);
            await supabaseService.updateTweetLaunchStatus(tweetId, launchResult.tokenAddress!);
            await imageService.cleanupAllImages(downloadedImages);

            return {
                success: true,
                tokenAddress: launchResult.tokenAddress,
                tokenSymbol: aiSuggestion.ticker,
                tokenName: aiSuggestion.name,
                deploySignature: launchResult.signature,
                sellSignature: sellResult.signature,
                solSpent,
                solReceived,
                profitLoss
            };

        } catch (error) {
            console.error(`\n❌ Token launch failed:`, error);

            // CLEANUP ON FAILURE: Unpin from Pinata
            if (imageIpfsHash) {
                console.log(`🧹 Cleanup: Attempting to unpin image ${imageIpfsHash}...`);
                try {
                    // Try to get File object to find ID
                    const fileDetails = await ipfsService.getFileDetails(imageIpfsHash);
                    if (fileDetails && fileDetails.id) {
                        await ipfsService.unpinFile(fileDetails.id);
                    }
                } catch (cleanupError) {
                    console.warn('Failed to unpin image:', cleanupError);
                }
            }
            if (metadataIpfsHash) {
                console.log(`🧹 Cleanup: Attempting to unpin metadata ${metadataIpfsHash}...`);
                try {
                    const fileDetails = await ipfsService.getFileDetails(metadataIpfsHash);
                    if (fileDetails && fileDetails.id) {
                        await ipfsService.unpinFile(fileDetails.id);
                    }
                } catch (cleanupError) {
                    console.warn('Failed to unpin metadata:', cleanupError);
                }
            }

            // DB Mark Failed
            try {
                await supabaseService.markLaunchFailed(
                    tweetId,
                    error instanceof Error ? error.message : String(error)
                );
            } catch (dbError) {
                console.error('Failed to mark launch as failed in database:', dbError);
            }

            // Local cleanup
            if (downloadedImages.length > 0) {
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

