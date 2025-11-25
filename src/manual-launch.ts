import 'dotenv/config';
import { Command } from 'commander';
import * as readline from 'readline';
import { orchestrator } from './orchestrator';
import { supabaseService } from './services/supabaseService';
import { aiService } from './services/aiService';
import { imageService } from './services/imageService';

// Load environment variables
// dotenv.config(); // Already loaded at top

const program = new Command();

/**
 * Manual Token Launch CLI
 * Provides commands for manual token launches with approval
 */

program
    .name('manual-launch')
    .description('Manual token launch interface with approval')
    .version('1.0.0');

console.log('Debug argv:', process.argv);

// LIST command - Show unlaunched tweets with images
program
    .command('list')
    .description('List tweets with images that haven not been launched')
    .option('-l, --limit <number>', 'Maximum number of tweets to show', '20')
    .action(async (options) => {
        try {
            console.log('\n📋 Fetching unlaunched tweets with images...\n');

            const limit = parseInt(options.limit);
            const tweets = await supabaseService.getUnlaunchedTweetsWithImages(limit);

            if (tweets.length === 0) {
                console.log('✨ No unlaunched tweets with images found.');
                return;
            }

            console.log(`Found ${tweets.length} tweet(s):\n`);
            console.log('='.repeat(80));

            tweets.forEach((tweet, index) => {
                console.log(`\n${index + 1}. Tweet ID: ${tweet.tweet_id}`);
                console.log(`   Username: @${tweet.username}`);
                console.log(`   Content: ${tweet.content.substring(0, 100)}${tweet.content.length > 100 ? '...' : ''}`);
                console.log(`   Images: ${tweet.images?.length || 0} main, ${tweet.all_related_images?.length || 0} total`);
                console.log(`   Type: ${tweet.tweet_type}`);
                console.log(`   Created: ${new Date(tweet.created_at || '').toLocaleString()}`);

                // Show first image URL
                if (tweet.images && tweet.images.length > 0) {
                    console.log(`   First Image: ${tweet.images[0].substring(0, 60)}...`);
                }

                console.log('   ' + '-'.repeat(78));
            });

            console.log('\n='.repeat(80));
            console.log(`\n💡 To preview AI suggestion: npm run launch:preview -- --tweet-id=<ID>`);
            console.log(`💡 To launch a token: npm run launch:execute -- --tweet-id=<ID>\n`);

        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// PREVIEW command - Show AI suggestion without launching
program
    .command('preview')
    .description('Preview AI suggestion for a tweet without launching')
    .requiredOption('--tweet-id <id>', 'Tweet ID to preview')
    .action(async (options) => {
        try {
            console.log(`\n🔍 Previewing AI suggestion for tweet: ${options.tweetId}\n`);

            // Fetch tweet
            const tweet = await supabaseService.getTweetById(options.tweetId);
            if (!tweet) {
                console.error(`❌ Tweet ${options.tweetId} not found`);
                process.exit(1);
            }

            console.log('📄 Tweet Details:');
            console.log(`   Username: @${tweet.username}`);
            console.log(`   Content: ${tweet.content}`);
            console.log(`   Images: ${tweet.images?.length || 0} main, ${tweet.all_related_images?.length || 0} total`);
            console.log(`   Type: ${tweet.tweet_type}\n`);

            // Get all images
            const allImages = tweet.all_related_images || tweet.images || [];
            if (allImages.length === 0) {
                console.error('❌ No images found in tweet');
                process.exit(1);
            }

            // Download images
            console.log('⬇️  Downloading images...');
            const downloadedPaths = await imageService.downloadAllImages(allImages);

            if (downloadedPaths.length === 0) {
                console.error('❌ Failed to download images');
                process.exit(1);
            }

            // Get AI suggestion
            console.log('🤖 Getting AI suggestion...\n');
            const suggestion = await aiService.analyzeImagesForToken(downloadedPaths, tweet.content);

            console.log('='.repeat(80));
            console.log('🎯 AI SUGGESTION:');
            console.log('='.repeat(80));
            console.log(`   Token Name: ${suggestion.name}`);
            console.log(`   Ticker: ${suggestion.ticker}`);
            console.log(`   Description: ${suggestion.description}`);
            console.log(`   Confidence: ${suggestion.confidence}%`);
            console.log(`   Reasoning: ${suggestion.reasoning}`);
            console.log('='.repeat(80));

            // Cleanup
            await imageService.cleanupAllImages(downloadedPaths);

            console.log(`\n💡 To launch this token: npm run launch:execute -- --tweet-id=${options.tweetId}\n`);

        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// EXECUTE command - Launch token with confirmation
program
    .command('execute')
    .description('Launch token from tweet (requires confirmation)')
    .requiredOption('--tweet-id <id>', 'Tweet ID to launch')
    .option('--skip-confirm', 'Skip confirmation prompt (use with caution!)')
    .action(async (options) => {
        try {
            console.log(`\n🚀 Preparing to launch token from tweet: ${options.tweetId}\n`);

            // Fetch tweet
            const tweet = await supabaseService.getTweetById(options.tweetId);
            if (!tweet) {
                console.error(`❌ Tweet ${options.tweetId} not found`);
                process.exit(1);
            }

            // Check if already launched
            if (tweet.coin_launched) {
                console.error(`❌ Tweet already has a token launched: ${tweet.contract_address}`);
                process.exit(1);
            }

            console.log('📄 Tweet Details:');
            console.log(`   Username: @${tweet.username}`);
            console.log(`   Content: ${tweet.content.substring(0, 200)}...`);
            console.log(`   Images: ${tweet.images?.length || 0}\n`);

            // Confirmation
            if (!options.skipConfirm) {
                const confirmed = await askConfirmation('Do you want to launch this token?');
                if (!confirmed) {
                    console.log('\n❌ Launch cancelled by user\n');
                    process.exit(0);
                }
            }

            console.log('\n🚀 Launching token...\n');

            // Launch token
            const result = await orchestrator.launchTokenFromTweet(options.tweetId);

            if (result.success) {
                console.log('\n✅ TOKEN LAUNCH SUCCESSFUL!\n');
                console.log('='.repeat(80));
                console.log(`   Token: ${result.tokenName} (${result.tokenSymbol})`);
                console.log(`   Contract Address: ${result.tokenAddress}`);
                console.log(`   Deploy Signature: ${result.deploySignature}`);
                console.log(`   Sell Signature: ${result.sellSignature || 'N/A'}`);
                console.log(`   SOL Spent: ${result.solSpent?.toFixed(4)} SOL`);
                console.log(`   SOL Received: ${result.solReceived?.toFixed(4)} SOL`);
                console.log(`   Profit/Loss: ${result.profitLoss && result.profitLoss >= 0 ? '+' : ''}${result.profitLoss?.toFixed(4)} SOL`);
                console.log('='.repeat(80));
                console.log('');
            } else {
                console.error('\n❌ TOKEN LAUNCH FAILED!');
                console.error(`   Error: ${result.error}\n`);
                process.exit(1);
            }

        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// HISTORY command - Show recent launches
program
    .command('history')
    .description('Show recent token launches')
    .option('-l, --limit <number>', 'Maximum number of launches to show', '20')
    .action(async (options) => {
        try {
            console.log('\n📊 Fetching launch history...\n');

            const limit = parseInt(options.limit);
            const launches = await supabaseService.getLaunchedTokens(limit);

            if (launches.length === 0) {
                console.log('✨ No launches found.');
                return;
            }

            console.log(`Found ${launches.length} launch(es):\n`);
            console.log('='.repeat(80));

            let totalProfit = 0;
            let successfulSells = 0;

            launches.forEach((launch, index) => {
                console.log(`\n${index + 1}. ${launch.token_symbol} - ${launch.token_name}`);
                console.log(`   Contract: ${launch.contract_address}`);
                console.log(`   Tweet ID: ${launch.tweet_id}`);
                console.log(`   Status: ${launch.status}`);
                console.log(`   Launched: ${new Date(launch.launch_timestamp).toLocaleString()}`);
                console.log(`   SOL Spent: ${launch.sol_spent?.toFixed(4)} SOL`);
                console.log(`   SOL Received: ${launch.sol_received?.toFixed(4)} SOL`);
                console.log(`   Profit/Loss: ${launch.profit_loss >= 0 ? '+' : ''}${launch.profit_loss?.toFixed(4)} SOL`);
                console.log(`   AI Confidence: ${launch.ai_confidence}%`);
                console.log('   ' + '-'.repeat(78));

                if (launch.profit_loss) {
                    totalProfit += launch.profit_loss;
                }
                if (launch.status === 'sold') {
                    successfulSells++;
                }
            });

            console.log('\n='.repeat(80));
            console.log('📈 SUMMARY:');
            console.log(`   Total Launches: ${launches.length}`);
            console.log(`   Successful Sells: ${successfulSells}`);
            console.log(`   Total Profit/Loss: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(4)} SOL`);
            console.log(`   Average Profit/Loss: ${(totalProfit / launches.length).toFixed(4)} SOL`);
            console.log('='.repeat(80));
            console.log('');

        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

/**
 * Ask user for confirmation
 * @param question - Question to ask
 * @returns Promise resolving to true/false
 */
function askConfirmation(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${question} (y/n): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

// Parse and execute
program.parse();

