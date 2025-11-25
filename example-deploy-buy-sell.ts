import { launchToken } from './src/launch';
import { sellToken } from './src/sell';

async function main() {
    // Configuration for token launch
    const launchConfig = {
        name: 'DEMOCRAT',
        symbol: 'DEMOCRAT',
        metadataUrl: 'https://tomato-defensive-kiwi-610.mypinata.cloud/ipfs/bafkreiahq57emge23vqwkx7w3y72egtkh27acnsrfkhg6nf4xno4srvcyu',
        mintKeypair: undefined, // Will generate new keypair
        initialBuy: 0.01, // Buy 0.01 SOL worth of tokens
        slippage: 10, // 10% slippage tolerance
        priorityFee: 0.0001 // Priority fee in SOL
    };

    // Configuration for selling (will be updated after successful launch)
    const sellConfig = {
        tokenMint: '', // Will be set after successful launch
        tokenAmount: 0, // Will be calculated based on tokens received
        minSolOut: 0.04, // Minimum SOL to receive
        slippage: 5, // 5% slippage tolerance
        priorityFee: 0.0001 // Priority fee in SOL
    };

    // Your private key (same as successful deploy)
    const privateKey = '4DQ8zK9PmXUgjoLntm38846eo7zJn1r5MojNKSdcBdfptede9jreDRc8TNJsLhjVHT6GB6fmuc9hrmTN9HZcA3Ee';

    try {
        console.log('🚀 Starting deploy + buy + sell sequence...');
        
        // Step 1: Deploy and buy token
        console.log('\n📦 Step 1: Deploying and buying token...');
        const launchResult = await launchToken(launchConfig, privateKey);
        
        if (!launchResult.success) {
            console.error('❌ Launch failed:', launchResult.error);
            return;
        }
        
        console.log('✅ Token deployed and bought successfully!');
        console.log('Token Address:', launchResult.tokenAddress);
        console.log('Transaction Signature:', launchResult.signature);
        
        // Step 2: Update sell config with token address
        sellConfig.tokenMint = launchResult.tokenAddress!;
        sellConfig.tokenAmount = 0; // Will be calculated automatically (100% of holdings)
        
        // Step 3: Wait a moment for blockchain state to propagate
        console.log('\n⏳ Waiting for blockchain state to propagate...');
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        // Step 4: Sell tokens
        console.log('\n💰 Step 2: Selling tokens...');
        const sellResult = await sellToken(sellConfig, privateKey);
        
        if (sellResult.success) {
            console.log('✅ Sell successful!');
            console.log('Transaction Signature:', sellResult.signature);
            console.log('SOL Received:', sellResult.solReceived);
            
            console.log('\n🎉 Complete sequence successful!');
            console.log('Deploy + Buy Signature:', launchResult.signature);
            console.log('Sell Signature:', sellResult.signature);
        } else {
            console.log('❌ Sell failed:', sellResult.error);
        }
        
    } catch (error) {
        console.error('Error in sequence:', error);
    }
}

main().catch(console.error);
