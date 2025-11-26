import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Tweet interface matching twitter-scraper schema
export interface Tweet {
    id?: number;
    tweet_id: string;
    username: string;
    content: string;
    tweet_timestamp: string;
    images: string[];
    videos?: string[];
    all_related_images?: string[];
    all_related_videos?: string[];
    tweet_type: string;
    source: string;
    coin_launched?: boolean;
    contract_address?: string;
    launch_attempted_at?: string;
    launch_error?: string;
    created_at?: string;
}

// Launched token data for database
export interface LaunchedTokenData {
    tweet_id: string;
    contract_address: string;
    token_name: string;
    token_symbol: string;
    token_description: string;
    metadata_url: string;
    image_url: string;
    ipfs_image_hash: string;
    ipfs_metadata_hash: string;
    deploy_signature?: string;
    buy_signature?: string;
    sell_signature?: string;
    initial_buy_amount?: number;
    sol_spent?: number;
    sol_received?: number;
    profit_loss?: number;
    ai_prompt?: string;
    ai_response?: string;
    ai_model?: string;
    ai_confidence?: number;
    status: 'launched' | 'sold' | 'failed';
    launch_timestamp?: string;
    sell_timestamp?: string;
}

/**
 * Supabase Service for Token Launcher
 * Handles database operations for tweets and launched tokens
 */
export class SupabaseService {
    private client!: SupabaseClient;
    private isInitialized: boolean = false;

    constructor() {
        this.initializeClient();
    }

    /**
     * Initialize Supabase client
     */
    private initializeClient(): void {
        const supabaseUrl = process.env.SUPABASE_URL?.trim();
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

        if (!supabaseUrl || !supabaseServiceKey) {
            console.warn('⚠️  Supabase credentials not found in environment variables');
            console.warn('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
            this.isInitialized = false;
            return;
        }

        try {
            this.client = createClient(supabaseUrl, supabaseServiceKey);
            this.isInitialized = true;
            console.log('✅ Supabase client initialized');
        } catch (error) {
            console.error('❌ Error initializing Supabase:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Test database connection
     */
    async testConnection(): Promise<boolean> {
        if (!this.isInitialized) {
            console.error('❌ Supabase not initialized');
            return false;
        }

        try {
            const { data, error } = await this.client
                .from('tweets')
                .select('count')
                .limit(1);

            if (error) {
                console.error('❌ Database connection test failed:', error);
                return false;
            }

            console.log('✅ Database connection test successful');
            return true;
        } catch (error) {
            console.error('❌ Exception testing database connection:', error);
            return false;
        }
    }

    /**
     * Get tweet by ID
     * @param tweetId - Tweet ID to fetch
     * @returns Tweet object or null
     */
    async getTweetById(tweetId: string): Promise<Tweet | null> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { data, error } = await this.client
                .from('tweets')
                .select('*')
                .eq('tweet_id', tweetId)
                .single();

            if (error) {
                console.error(`Error fetching tweet ${tweetId}:`, error);
                return null;
            }

            return data as Tweet;

        } catch (error) {
            console.error(`Exception fetching tweet ${tweetId}:`, error);
            return null;
        }
    }

    /**
     * Get unlaunched tweets with images
     * @param limit - Maximum number of tweets to fetch
     * @returns Array of tweets
     */
    async getUnlaunchedTweetsWithImages(limit: number = 50): Promise<Tweet[]> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { data, error } = await this.client
                .from('tweets')
                .select('*')
                .eq('coin_launched', false)
                .not('images', 'eq', '[]')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Error fetching unlaunched tweets:', error);
                return [];
            }

            // Filter tweets that actually have images
            const tweetsWithImages = (data as Tweet[]).filter(tweet =>
                tweet.images && tweet.images.length > 0
            );

            return tweetsWithImages;

        } catch (error) {
            console.error('Exception fetching unlaunched tweets:', error);
            return [];
        }
    }

    /**
     * Update tweet launch status
     * @param tweetId - Tweet ID
     * @param contractAddress - Deployed token contract address
     */
    async updateTweetLaunchStatus(tweetId: string, contractAddress: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { error } = await this.client
                .from('tweets')
                .update({
                    coin_launched: true,
                    contract_address: contractAddress,
                    launch_attempted_at: new Date().toISOString()
                })
                .eq('tweet_id', tweetId);

            if (error) {
                console.error(`Error updating tweet ${tweetId}:`, error);
                throw error;
            }

            console.log(`✅ Tweet ${tweetId} marked as launched with CA: ${contractAddress}`);

        } catch (error) {
            console.error(`Exception updating tweet ${tweetId}:`, error);
            throw error;
        }
    }

    /**
     * Mark launch as failed
     * @param tweetId - Tweet ID
     * @param errorMessage - Error message
     */
    async markLaunchFailed(tweetId: string, errorMessage: string): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { error } = await this.client
                .from('tweets')
                .update({
                    launch_attempted_at: new Date().toISOString(),
                    launch_error: errorMessage
                })
                .eq('tweet_id', tweetId);

            if (error) {
                console.error(`Error marking tweet ${tweetId} as failed:`, error);
                throw error;
            }

            console.log(`❌ Tweet ${tweetId} marked as failed: ${errorMessage}`);

        } catch (error) {
            console.error(`Exception marking tweet ${tweetId} as failed:`, error);
            throw error;
        }
    }

    /**
     * Save launched token data
     * @param data - Launched token data
     */
    async saveLaunchedToken(data: LaunchedTokenData): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { error } = await this.client
                .from('launched_tokens')
                .insert([data]);

            if (error) {
                console.error('Error saving launched token:', error);
                throw error;
            }

            console.log(`✅ Launched token saved: ${data.token_symbol} (${data.contract_address})`);

        } catch (error) {
            console.error('Exception saving launched token:', error);
            throw error;
        }
    }

    /**
     * Get launched tokens
     * @param limit - Maximum number of tokens to fetch
     * @returns Array of launched tokens
     */
    async getLaunchedTokens(limit: number = 50): Promise<any[]> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { data, error } = await this.client
                .from('launched_tokens')
                .select('*')
                .order('launch_timestamp', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Error fetching launched tokens:', error);
                return [];
            }

            return data || [];

        } catch (error) {
            console.error('Exception fetching launched tokens:', error);
            return [];
        }
    }

    /**
     * Get launch statistics
     * @returns Statistics object
     */
    async getLaunchStatistics(): Promise<any> {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }

        try {
            const { data, error } = await this.client
                .from('launch_statistics')
                .select('*')
                .single();

            if (error) {
                console.error('Error fetching statistics:', error);
                return null;
            }

            return data;

        } catch (error) {
            console.error('Exception fetching statistics:', error);
            return null;
        }
    }

    /**
     * Get Supabase client (for advanced queries)
     */
    getClient(): SupabaseClient {
        if (!this.isInitialized) {
            throw new Error('Supabase not initialized');
        }
        return this.client;
    }
}

// Export singleton instance
export const supabaseService = new SupabaseService();

