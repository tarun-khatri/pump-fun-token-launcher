import { supabaseService, Tweet } from './supabaseService';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Supabase Realtime Listener
 * Listens for new tweets and triggers token launch queue
 */
export class LaunchListener {
    private channel: RealtimeChannel | null = null;
    private isListening: boolean = false;
    private onNewTweetCallback: ((tweet: Tweet) => void) | null = null;

    constructor() {
        console.log('✅ Launch Listener initialized');
    }

    /**
     * Start listening for new tweets
     * @param callback - Function to call when new tweet detected
     */
    startListening(callback: (tweet: Tweet) => void): void {
        if (this.isListening) {
            console.warn('⚠️  Listener already running');
            return;
        }

        this.onNewTweetCallback = callback;

        const client = supabaseService.getClient();

        console.log('👂 Starting realtime listener for new tweets...');

        this.channel = client
            .channel('tweets-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'tweets'
                },
                async (payload) => {
                    console.log('\n🔔 New tweet detected!');
                    const newTweet = payload.new as Tweet;

                    if (this.shouldProcessTweet(newTweet)) {
                        console.log(`✅ Tweet ${newTweet.tweet_id} passes filters, processing...`);

                        if (this.onNewTweetCallback) {
                            this.onNewTweetCallback(newTweet);
                        }
                    } else {
                        console.log(`⏭️  Tweet ${newTweet.tweet_id} does not meet criteria, skipping`);
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.isListening = true;
                    console.log('✅ Realtime listener subscribed successfully');
                    console.log('   Waiting for new tweets...\n');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Realtime listener error');
                    this.isListening = false;
                } else if (status === 'TIMED_OUT') {
                    console.error('❌ Realtime listener timed out');
                    this.isListening = false;
                } else {
                    console.log(`   Listener status: ${status}`);
                }
            });
    }

    /**
     * Stop listening
     */
    async stopListening(): Promise<void> {
        if (this.channel) {
            await supabaseService.getClient().removeChannel(this.channel);
            this.channel = null;
            this.isListening = false;
            console.log('🛑 Realtime listener stopped');
        }
    }

    /**
     * Check if tweet should be processed
     * @param tweet - Tweet object
     * @returns True if should process
     */
    private shouldProcessTweet(tweet: Tweet): boolean {
        // 1. Must have at least one image (check both direct images and related images)
        const hasDirectImages = tweet.images && tweet.images.length > 0;
        const hasRelatedImages = tweet.all_related_images && tweet.all_related_images.length > 0;

        if (!hasDirectImages && !hasRelatedImages) {
            console.log(`   ❌ No images found (direct: ${tweet.images?.length || 0}, related: ${tweet.all_related_images?.length || 0})`);
            return false;
        }

        // 2. Not already launched
        if (tweet.coin_launched) {
            console.log(`   ❌ Already launched`);
            return false;
        }

        // 3. Not a retweet (optional - can be configured)
        // if (tweet.tweet_type === 'retweet') {
        //     console.log(`   ❌ Is a retweet`);
        //     return false;
        // }

        // 4. From target users only
        const targetUsers = this.getTargetUsers();
        if (targetUsers.length > 0 && !targetUsers.includes(tweet.username.toLowerCase())) {
            console.log(`   ❌ Not from target user (${tweet.username})`);
            return false;
        }

        // 5. Minimum engagement (optional - can be configured)
        // const minLikes = parseInt(process.env.MIN_LIKES || '0');
        // if (minLikes > 0 && (!tweet.like_count || tweet.like_count < minLikes)) {
        //     console.log(`   ❌ Insufficient likes (${tweet.like_count || 0} < ${minLikes})`);
        //     return false;
        // }

        console.log(`   ✅ Passes all filters:`);
        console.log(`      - Has ${tweet.images.length} image(s)`);
        console.log(`      - From @${tweet.username}`);
        console.log(`      - Type: ${tweet.tweet_type}`);

        return true;
    }

    /**
     * Get target users from environment
     * @returns Array of usernames (lowercase)
     */
    private getTargetUsers(): string[] {
        const usersEnv = process.env.TARGET_USERS || '';
        if (!usersEnv) {
            return []; // Empty means accept all users
        }

        return usersEnv
            .split(',')
            .map(u => u.trim().toLowerCase())
            .filter(u => u.length > 0);
    }

    /**
     * Check if listening
     */
    isActive(): boolean {
        return this.isListening;
    }

    /**
     * Get listener status
     */
    getStatus(): string {
        return this.isListening ? 'LISTENING' : 'STOPPED';
    }
}

// Export singleton instance
export const launchListener = new LaunchListener();

