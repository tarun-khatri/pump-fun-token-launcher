# How to Run Pump.Fun Token Launcher

This guide explains how to set up and run the Pump.Fun Token Launcher automation.

## Prerequisites

1.  **Node.js**: Version 16 or higher.
2.  **Solana Wallet**: A wallet with some SOL (at least 0.05 SOL recommended for testing).
3.  **Supabase Project**: A Supabase project with a `tweets` table (populated by a scraper).
4.  **Pinata Account**: For IPFS uploads.
5.  **Gemini API Key**: For AI analysis.

## Step 1: Install Dependencies

Open a terminal in the project directory and run:

```bash
npm install
```

## Step 2: Environment Setup

Create a `.env` file in the root directory (copy from `.env.example` if available, or create new) with the following variables:

```env
# Solana Configuration
SOLANA_PRIVATE_KEY=your_base58_private_key_here
RPC_URL=https://api.mainnet-beta.solana.com

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# IPFS Configuration (Pinata)
PINATA_JWT=your_pinata_jwt_token
PINATA_GATEWAY=your_gateway_domain (optional, e.g., gateway.pinata.cloud)
```

> **Note:** Your private key is sensitive. Never commit `.env` to version control.

## Step 3: Database Migration

You need to set up the database schema in Supabase.
1.  Go to your Supabase project dashboard.
2.  Open the **SQL Editor**.
3.  Copy the content of `migrations/001-token-launch-schema.sql`.
4.  Run the SQL query.

This will create the necessary tables and columns to track launched tokens.

## Step 4: Running the Automation

The project provides a CLI tool to manage launches.

### List Unlaunched Tweets
To see tweets that are ready to be processed:

```bash
npm run launch:list
```

### Preview AI Suggestion
To see what the AI would generate for a specific tweet (without launching):

```bash
npm run launch:preview -- --tweet-id=YOUR_TWEET_ID
```

### Launch a Token
To launch a token based on a tweet:

```bash
npm run launch:execute -- --tweet-id=YOUR_TWEET_ID
```
*This will ask for confirmation before proceeding.*

### View Launch History
To see past launches and their performance:

```bash
npm run launch:history
```

### Run Full Automation
To run the automated background process (if applicable):

```bash
npm run start:automation
```

## Troubleshooting

-   **Transaction Failed**: Ensure you have enough SOL for fees and the initial buy amount (default 0.01 SOL).
-   **Pinata Error**: Check your JWT token and ensure you have storage limit available.
-   **AI Error**: Check your Gemini API key.
-   **Database Error**: Ensure you ran the migration script.

## Important Notes

-   **Hardcoded Values**: The code uses specific Pump.fun program IDs and fee recipients. These are currently valid but may change in the future.
-   **Risks**: This tool performs real transactions on the Solana mainnet. Use with caution and at your own risk.
