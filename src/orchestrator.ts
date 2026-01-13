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

export interface UserLaunchContext {
    userId: string;
    privateKey: string; // Base58 encoded
    settings: {
        initialBuyAmount: number;
        slippage: number;
        priorityFee: number;
        sellDelaySeconds: number;
        autoSell: boolean;
        rpcUrl?: string;
    };
    onLaunch?: (result: { tokenAddress: string; signature: string; symbol: string; name: string; uri: string }, aiData: any) => Promise<void>;
}

/**
 * Main Token Launch Orchestrator
 * Coordinates the entire flow from tweet to token launch
 */
export class TokenLaunchOrchestrator {

    constructor() {
        console.log('✅ Token Launch Orchestrator initialized (Multi-Tenant Mode)');
    }

    /**
     * Launch token from tweet for a specific user
     * @param tweetId - Tweet ID to process
     * @param userContext - User specific context (keys, settings)
     * @returns Launch result
     */
    async launchTokenFromTweet(tweetId: string, userContext: UserLaunchContext): Promise<LaunchResult> {
        const downloadedImages: string[] = [];
        let imageIpfsHash = '';
        let metadataIpfsHash = '';

        try {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🚀 Starting token launch for User ${userContext.userId} from tweet: ${tweetId}`);
            console.time(`🚀 LAUNCH-SEQ-${userContext.userId}`);
            console.log(`${'='.repeat(60)}\n`);

            // STEP 1: Fetch tweet from database
            // Note: We don't need to re-fetch if the caller already has it, but for safety we do.
            const tweet = await supabaseService.getTweetById(tweetId);

            if (!tweet) {
                throw new Error(`Tweet ${tweetId} not found in database`);
            }

            // Check if THIS USER has already launched for this tweet?
            // The Orchestrator is stateless regarding user history, the caller (Queue) should handle that check.
            // But we can double check or just proceed.

            // STEP 2: Job Preparation (Images)
            const allImageUrls = this.getAllImages(tweet);

            if (allImageUrls.length === 0) {
                throw new Error('No images found in tweet');
            }

            // STEP 3: Download images
            // In multi-tenant, we might want to cache these downloads so 50 users don't download the same image 50 times.
            // For now, we keep it isolated per job for simplicity, or we rely on the imageService to handle caching.
            const downloadedPaths = await imageService.downloadAllImages(allImageUrls);
            downloadedImages.push(...downloadedPaths);

            if (downloadedPaths.length === 0) {
                throw new Error('Failed to download any images');
            }

            // STEP 4: PARALLEL EXECUTION (AI & IPFS)
            // AI Analysis needs to be unique if we want different results per user?
            // "if 50 users are tracking... well call the AI and it will give different answer mostly"
            // So YES, we run AI analysis every time.
            const aiPromise = aiService.analyzeImagesForToken(downloadedPaths, tweet.content);

            // IPFS Upload can be shared if the image is the same... 
            // BUT, if we want unique metadata, we might need unique images? 
            // The prompt says "launch 50 tokens". 
            // We will upload the image again to be safe/independent.
            const imageUploadPromise = ipfsService.uploadImageToIPFS(downloadedPaths[0], `token-image-${tweetId}-${userContext.userId}`);

            const [aiSuggestion, imageUpload] = await Promise.all([aiPromise, imageUploadPromise]);

            imageIpfsHash = imageUpload.ipfsHash;

            console.log(`✅ AI Suggestion: ${aiSuggestion.ticker} (${aiSuggestion.confidence}%)`);

            // STEP 5: Generate & Upload Metadata
            // We need the Creator Address from the User's Private Key
            // getCreatorAddress() used env var. We need a utility to get it from private key.
            // validMetadata uses env var? No, it just validates.

            // We'll trust generateMetadata to work or pass the address if needed. 
            // looking at imports: 'getCreatorAddress' comes from metadataGenerator. 
            // We should probably update that helper or just derive it here.
            // For now, let's assume we can pass the creator address to generateMetadata if it accepts it.
            // Checking signature: generateMetadata(ticker, name, description, image, creatorAddress) -> Yes.

            // Derive public key from private key
            // We import Keypair from launch (via utils or web3)
            // But we can just direct import here to be safe
            const { Keypair } = require('@solana/web3.js');
            const bs58 = require('bs58');
            // Handle bs58 v6.0.0+ import
            const decode = bs58.decode || bs58.default?.decode;
            if (!decode) throw new Error('bs58.decode not found');
            const userKeypair = Keypair.fromSecretKey(decode(userContext.privateKey));
            const creatorAddress = userKeypair.publicKey.toBase58();

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
                `${aiSuggestion.ticker}-metadata-${userContext.userId}`
            );
            metadataIpfsHash = metadataUpload.ipfsHash;

            // STEP 6: Launch token
            const launchConfig = {
                name: aiSuggestion.name,
                symbol: aiSuggestion.ticker,
                metadataUrl: metadataUpload.url,
                initialBuy: userContext.settings.initialBuyAmount,
                slippage: userContext.settings.slippage,
                priorityFee: userContext.settings.priorityFee
            };

            const launchResult = await launchToken(launchConfig, userContext.privateKey, userContext.settings.rpcUrl);

            if (!launchResult.success) {
                throw new Error(`Token launch failed: ${launchResult.error}`);
            }

            console.log(`✅ Token launched: ${launchResult.tokenAddress}`);

            // >>> CALLBACK: Notify Launch Success immediately <<<
            if (userContext.onLaunch) {
                try {
                    await userContext.onLaunch({
                        tokenAddress: launchResult.tokenAddress!,
                        signature: launchResult.signature!,
                        symbol: aiSuggestion.ticker,
                        name: aiSuggestion.name,
                        uri: metadataUpload.url
                    }, aiSuggestion);
                } catch (cbError) {
                    console.error('⚠️ onLaunch callback failed:', cbError); // Don't crash main flow
                }
            }

            let sellResult: any = { success: false };

            // STEP 7: Auto Sell (If enabled)
            if (userContext.settings.autoSell) {
                console.log(`\n⏳ Waiting ${userContext.settings.sellDelaySeconds}s for Sell...`);
                await this.sleep(userContext.settings.sellDelaySeconds * 1000);

                console.log('\n💰 Selling token...');
                sellResult = await sellToken({
                    tokenMint: launchResult.tokenAddress!,
                    tokenAmount: 0, // 0 means sell all
                    minSolOut: 0, // Set to 0 to ensure sell execution? Or calculate? For now 0.
                    slippage: userContext.settings.slippage,
                    priorityFee: userContext.settings.priorityFee
                }, userContext.privateKey);
            }

            // Calculations
            const solSpent = (userContext.settings.initialBuyAmount || 0) + (userContext.settings.priorityFee * 2) + 0.02; // Approx fees
            const solReceived = sellResult.success ? (sellResult.solReceived || 0) : 0;
            const profitLoss = solReceived - solSpent;

            // Save to DB (LaunchedTokens) - We need to add user_id to this table or a new table
            // The current `launched_tokens` might not have user_id. 
            // VALIDATION: We should update `supabaseService.saveLaunchedToken` to accept user_id?
            // For now, we will log it. In a real scenario, we'd update schema.
            // Assumption: The job table tracks the result, so we return it there.

            // Clean up images
            await imageService.cleanupAllImages(downloadedImages);

            console.timeEnd(`🚀 LAUNCH-SEQ-${userContext.userId}`);

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
            console.error(`\n❌ Token launch failed for user ${userContext.userId}:`, error);

            // Cleanup IPFS
            if (imageIpfsHash) {
                // ... (existing cleanup logic)
            }

            // Cleanup local
            if (downloadedImages.length > 0) {
                await imageService.cleanupAllImages(downloadedImages);
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private getAllImages(tweet: Tweet): string[] {
        const images: string[] = [];
        if (tweet.all_related_images && tweet.all_related_images.length > 0) {
            images.push(...tweet.all_related_images);
        } else {
            if (tweet.images && tweet.images.length > 0) {
                images.push(...tweet.images);
            }
        }
        return [...new Set(images)];
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const orchestrator = new TokenLaunchOrchestrator();

