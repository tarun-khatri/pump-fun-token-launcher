-- Token Launch Automation Database Schema
-- Run this SQL in your Supabase SQL editor

-- ==========================================
-- PHASE 1: Add columns to tweets table
-- ==========================================

ALTER TABLE tweets 
ADD COLUMN IF NOT EXISTS coin_launched BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS contract_address VARCHAR(100),
ADD COLUMN IF NOT EXISTS launch_attempted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS launch_error TEXT;

-- ==========================================
-- PHASE 2: Create launched_tokens table
-- ==========================================

CREATE TABLE IF NOT EXISTS launched_tokens (
    id BIGSERIAL PRIMARY KEY,
    tweet_id VARCHAR(50) REFERENCES tweets(tweet_id),
    contract_address VARCHAR(100) UNIQUE NOT NULL,
    token_name VARCHAR(50) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    token_description TEXT,
    metadata_url TEXT NOT NULL,
    image_url TEXT NOT NULL,
    ipfs_image_hash TEXT,
    ipfs_metadata_hash TEXT,
    
    -- Launch details
    deploy_signature VARCHAR(100),
    buy_signature VARCHAR(100),
    sell_signature VARCHAR(100),
    
    initial_buy_amount DECIMAL(10, 4),
    sol_spent DECIMAL(10, 4),
    sol_received DECIMAL(10, 4),
    profit_loss DECIMAL(10, 4),
    
    -- AI generation details
    ai_prompt TEXT,
    ai_response TEXT,
    ai_model VARCHAR(50),
    ai_confidence INTEGER,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'launched', -- launched, sold, failed
    launch_timestamp TIMESTAMPTZ DEFAULT NOW(),
    sell_timestamp TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- PHASE 3: Create indexes for performance
-- ==========================================

-- Tweets table indexes
CREATE INDEX IF NOT EXISTS idx_tweets_coin_launched ON tweets(coin_launched);
CREATE INDEX IF NOT EXISTS idx_tweets_contract_address ON tweets(contract_address);
CREATE INDEX IF NOT EXISTS idx_tweets_launch_attempted ON tweets(launch_attempted_at DESC);

-- Launched tokens table indexes
CREATE INDEX IF NOT EXISTS idx_launched_tokens_tweet_id ON launched_tokens(tweet_id);
CREATE INDEX IF NOT EXISTS idx_launched_tokens_contract_address ON launched_tokens(contract_address);
CREATE INDEX IF NOT EXISTS idx_launched_tokens_status ON launched_tokens(status);
CREATE INDEX IF NOT EXISTS idx_launched_tokens_launch_timestamp ON launched_tokens(launch_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_launched_tokens_profit_loss ON launched_tokens(profit_loss DESC);

-- ==========================================
-- PHASE 4: Create update trigger
-- ==========================================

CREATE TRIGGER update_launched_tokens_updated_at 
    BEFORE UPDATE ON launched_tokens 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- PHASE 5: Create helper views
-- ==========================================

-- View for unlaunched tweets with images
CREATE OR REPLACE VIEW unlaunched_tweets_with_images AS
SELECT 
    id,
    tweet_id,
    username,
    content,
    tweet_timestamp,
    images,
    videos,
    all_related_images,
    tweet_type,
    created_at
FROM tweets 
WHERE coin_launched = FALSE 
  AND jsonb_array_length(COALESCE(images, '[]'::jsonb)) > 0
ORDER BY created_at DESC;

-- View for launch statistics
CREATE OR REPLACE VIEW launch_statistics AS
SELECT 
    COUNT(*) as total_launches,
    COUNT(CASE WHEN status = 'sold' THEN 1 END) as successful_sells,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_launches,
    SUM(sol_spent) as total_sol_spent,
    SUM(sol_received) as total_sol_received,
    SUM(profit_loss) as total_profit_loss,
    AVG(profit_loss) as average_profit_loss,
    MAX(profit_loss) as best_profit,
    MIN(profit_loss) as worst_loss
FROM launched_tokens;

-- ==========================================
-- PHASE 6: Verification queries
-- ==========================================

-- Verify tweets table columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'tweets' 
AND column_name IN ('coin_launched', 'contract_address', 'launch_attempted_at', 'launch_error')
ORDER BY column_name;

-- Verify launched_tokens table exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'launched_tokens' 
ORDER BY ordinal_position;

-- Test views
SELECT * FROM unlaunched_tweets_with_images LIMIT 5;
SELECT * FROM launch_statistics;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database schema migration completed successfully!';
    RAISE NOTICE '📊 New columns added to tweets table';
    RAISE NOTICE '📊 launched_tokens table created';
    RAISE NOTICE '📊 Indexes and views created';
END $$;

