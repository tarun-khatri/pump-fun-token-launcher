import * as fs from 'fs';
import * as path from 'path';
import { orchestrator } from '../orchestrator';

export interface QueueStatus {
    queueSize: number;
    isProcessing: boolean;
    launchesThisHour: number;
    hourlyLimit: number;
    budgetUsed: number;
    budgetLimit: number;
    isPaused: boolean;
    totalProcessed: number;
    totalFailed: number;
}

/**
 * Launch Queue Manager
 * Manages token launch queue with rate limiting and budget controls
 */
export class QueueManager {
    private queue: string[] = [];
    private processing: boolean = false;
    private paused: boolean = false;
    
    // Rate limiting
    private launchesThisHour: number = 0;
    private hourlyLimit: number;
    private hourResetTime: Date;
    
    // Budget tracking
    private budgetUsed: number = 0;
    private budgetLimit: number;
    private budgetResetTime: Date;
    
    // Launch delay
    private launchDelaySeconds: number;
    
    // Statistics
    private totalProcessed: number = 0;
    private totalFailed: number = 0;
    
    // Queue persistence file
    private queueFile: string = path.join(process.cwd(), 'queue.json');

    constructor() {
        // Load configuration from environment
        this.hourlyLimit = parseInt(process.env.HOURLY_LAUNCH_LIMIT || '10');
        this.budgetLimit = parseFloat(process.env.DAILY_BUDGET_SOL || '1.0');
        this.launchDelaySeconds = parseInt(process.env.LAUNCH_DELAY_SECONDS || '120');
        
        // Initialize reset times
        this.hourResetTime = new Date(Date.now() + 3600000); // 1 hour from now
        this.budgetResetTime = new Date();
        this.budgetResetTime.setHours(24, 0, 0, 0); // Midnight
        
        // Load persisted queue
        this.loadQueue();
        
        console.log('✅ Queue Manager initialized');
        console.log(`   Hourly Limit: ${this.hourlyLimit} launches/hour`);
        console.log(`   Daily Budget: ${this.budgetLimit} SOL`);
        console.log(`   Launch Delay: ${this.launchDelaySeconds} seconds`);
    }

    /**
     * Add tweet to queue
     * @param tweetId - Tweet ID to add
     */
    addToQueue(tweetId: string): void {
        // Check if already in queue
        if (this.queue.includes(tweetId)) {
            console.log(`⚠️  Tweet ${tweetId} already in queue`);
            return;
        }

        this.queue.push(tweetId);
        console.log(`✅ Added to queue: ${tweetId}`);
        console.log(`   Queue size: ${this.queue.length}`);
        
        // Persist queue
        this.saveQueue();
        
        // Start processing if not already running
        if (!this.processing && !this.paused) {
            this.processQueue();
        }
    }

    /**
     * Process queue
     */
    async processQueue(): Promise<void> {
        if (this.processing) {
            console.log('⚠️  Queue already processing');
            return;
        }

        if (this.paused) {
            console.log('⏸️  Queue is paused');
            return;
        }

        this.processing = true;
        console.log('\n🚀 Starting queue processor...\n');

        while (this.queue.length > 0 && !this.paused) {
            // Reset counters if needed
            this.checkAndResetCounters();

            // Check rate limit
            if (this.launchesThisHour >= this.hourlyLimit) {
                const waitTime = this.hourResetTime.getTime() - Date.now();
                console.log(`⏳ Hourly limit reached (${this.hourlyLimit}). Waiting ${Math.ceil(waitTime / 60000)} minutes...`);
                await this.sleep(Math.min(waitTime, 300000)); // Wait up to 5 minutes, then check again
                continue;
            }

            // Check budget
            if (this.budgetUsed >= this.budgetLimit) {
                const waitTime = this.budgetResetTime.getTime() - Date.now();
                console.log(`💰 Budget limit reached (${this.budgetLimit} SOL). Waiting ${Math.ceil(waitTime / 3600000)} hours...`);
                await this.sleep(Math.min(waitTime, 300000)); // Wait up to 5 minutes, then check again
                continue;
            }

            // Get next tweet from queue
            const tweetId = this.queue.shift()!;
            this.saveQueue();

            console.log(`\n${'='.repeat(60)}`);
            console.log(`📤 Processing from queue: ${tweetId}`);
            console.log(`   Queue remaining: ${this.queue.length}`);
            console.log(`   Launches this hour: ${this.launchesThisHour}/${this.hourlyLimit}`);
            console.log(`   Budget used: ${this.budgetUsed.toFixed(4)}/${this.budgetLimit} SOL`);
            console.log(`${'='.repeat(60)}\n`);

            try {
                // Launch token
                const result = await orchestrator.launchTokenFromTweet(tweetId);

                // Update statistics
                this.launchesThisHour++;
                this.totalProcessed++;

                if (result.success) {
                    if (result.solSpent) {
                        this.budgetUsed += result.solSpent;
                    }
                    console.log(`✅ Launch successful: ${tweetId}`);
                } else {
                    this.totalFailed++;
                    console.error(`❌ Launch failed: ${tweetId}`);
                }

            } catch (error) {
                this.totalFailed++;
                console.error(`❌ Error processing ${tweetId}:`, error);
            }

            // Wait before next launch (unless queue is empty)
            if (this.queue.length > 0 && this.launchDelaySeconds > 0) {
                console.log(`\n⏳ Waiting ${this.launchDelaySeconds} seconds before next launch...`);
                await this.sleep(this.launchDelaySeconds * 1000);
            }
        }

        this.processing = false;
        console.log('\n✅ Queue processing complete\n');
    }

    /**
     * Pause queue processing
     */
    pauseQueue(): void {
        this.paused = true;
        console.log('⏸️  Queue paused');
    }

    /**
     * Resume queue processing
     */
    resumeQueue(): void {
        this.paused = false;
        console.log('▶️  Queue resumed');
        
        if (this.queue.length > 0 && !this.processing) {
            this.processQueue();
        }
    }

    /**
     * Clear queue
     */
    clearQueue(): void {
        const previousSize = this.queue.length;
        this.queue = [];
        this.saveQueue();
        console.log(`🗑️  Queue cleared (removed ${previousSize} items)`);
    }

    /**
     * Get queue status
     */
    getStatus(): QueueStatus {
        return {
            queueSize: this.queue.length,
            isProcessing: this.processing,
            launchesThisHour: this.launchesThisHour,
            hourlyLimit: this.hourlyLimit,
            budgetUsed: this.budgetUsed,
            budgetLimit: this.budgetLimit,
            isPaused: this.paused,
            totalProcessed: this.totalProcessed,
            totalFailed: this.totalFailed
        };
    }

    /**
     * Get queue items
     */
    getQueue(): string[] {
        return [...this.queue];
    }

    /**
     * Check and reset counters
     */
    private checkAndResetCounters(): void {
        const now = Date.now();

        // Reset hourly counter
        if (now >= this.hourResetTime.getTime()) {
            console.log(`🔄 Resetting hourly counter (was ${this.launchesThisHour})`);
            this.launchesThisHour = 0;
            this.hourResetTime = new Date(now + 3600000);
        }

        // Reset daily budget
        if (now >= this.budgetResetTime.getTime()) {
            console.log(`🔄 Resetting daily budget (was ${this.budgetUsed.toFixed(4)} SOL)`);
            this.budgetUsed = 0;
            this.budgetResetTime = new Date();
            this.budgetResetTime.setHours(24, 0, 0, 0);
        }
    }

    /**
     * Save queue to file
     */
    private saveQueue(): void {
        try {
            const data = {
                queue: this.queue,
                launchesThisHour: this.launchesThisHour,
                hourResetTime: this.hourResetTime.toISOString(),
                budgetUsed: this.budgetUsed,
                budgetResetTime: this.budgetResetTime.toISOString(),
                totalProcessed: this.totalProcessed,
                totalFailed: this.totalFailed,
                lastSaved: new Date().toISOString()
            };

            fs.writeFileSync(this.queueFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving queue:', error);
        }
    }

    /**
     * Load queue from file
     */
    private loadQueue(): void {
        try {
            if (fs.existsSync(this.queueFile)) {
                const data = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
                
                this.queue = data.queue || [];
                this.launchesThisHour = data.launchesThisHour || 0;
                this.hourResetTime = new Date(data.hourResetTime || Date.now() + 3600000);
                this.budgetUsed = data.budgetUsed || 0;
                this.budgetResetTime = new Date(data.budgetResetTime || Date.now());
                this.totalProcessed = data.totalProcessed || 0;
                this.totalFailed = data.totalFailed || 0;

                console.log(`📂 Loaded queue from file: ${this.queue.length} items`);
            }
        } catch (error) {
            console.error('Error loading queue:', error);
        }
    }

    /**
     * Sleep helper
     */
    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const queueManager = new QueueManager();

