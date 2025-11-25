import { launchToken, TokenLaunchConfig, validateTokenConfig } from './src';
import { Keypair } from '@solana/web3.js';

// Example configuration
const tokenConfig: TokenLaunchConfig = {
  name: "DEMOCRAT",
  symbol: "DEMOCRAT",
  metadataUrl: "https://tomato-defensive-kiwi-610.mypinata.cloud/ipfs/bafkreiahq57emge23vqwkx7w3y72egtkh27acnsrfkhg6nf4xno4srvcyu",
  mintKeypair: undefined, // Optional: use a custom mint keypair if needed, otherwise it will be generated automatically
  initialBuy: 0.05, // 0.1 SOL initial buy
  slippage: 10,     // 5% slippage tolerance
  priorityFee: 0.0001 // 0.001 SOL priority fee
};

async function main() {
  try {
    // Validate configuration first
    console.log("Validating token configuration...");
    validateTokenConfig(tokenConfig);
    console.log("✅ Configuration is valid");

    // Replace with your actual private key (base64 encoded)
    // Or use environment variable: process.env.PRIVATE_KEY
    const privateKey = "2dCmq3WEmTteYSnVxKnbMmnf6hoxfbos4efRv7WnnAQibinh3JS5trgC5dV8VBMw4e1ECLY9KniKqqZq61PKp2q7";
    
    // Alternative: Generate a new keypair for testing
    // const keyPair = Keypair.generate();
    // console.log("Generated new keypair:", keyPair.publicKey.toString());

    console.log("Launching token...");
    console.log("Config:", tokenConfig);

    // Launch the token
    const result = await launchToken(
      tokenConfig,
      privateKey,
      // Optional: specify custom RPC URL
      // "https://your-custom-rpc-url.com"
    );

    if (result.success) {
      console.log("🎉 Token launched successfully!");
      console.log("Token Address:", result.tokenAddress);
      console.log("Transaction Signature:", result.signature);
      console.log("View on Solscan:", `https://solscan.io/tx/${result.signature}`);
    } else {
      console.error("❌ Token launch failed:");
      console.error(result.error);
    }

  } catch (error) {
    console.error("❌ Error occurred:", error);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export default main;
