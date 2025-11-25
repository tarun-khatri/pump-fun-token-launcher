import { sellToken } from './src/sell';

async function main() {
    // Example: Sell tokens immediately after deploy and buy
    const sellConfig = {
        tokenMint: '64Z7q1TqEt9sqfo2DaMyPZr3r6V2wowEsvw72iMc4dwc', // Token from previous successful deploy
        tokenAmount: 0, // Will be overridden with actual balance (100% of holdings)
        minSolOut: 0, // Minimum SOL to receive (in SOL, not lamports) - no minimum like successful transaction
        slippage: 5, // 5% slippage tolerance
        priorityFee: 0.0001 // Priority fee in SOL
    };

    // Your private key (same as successful deploy)
    const privateKey = '2dCmq3WEmTteYSnVxKnbMmnf6hoxfbos4efRv7WnnAQibinh3JS5trgC5dV8VBMw4e1ECLY9KniKqqZq61PKp2q7';

    try {
        console.log('Starting token sell...');
        const result = await sellToken(sellConfig, privateKey);
        
        if (result.success) {
            console.log('✅ Sell successful!');
            console.log('Transaction Signature:', result.signature);
            console.log('SOL Received:', result.solReceived);
        } else {
            console.log('❌ Sell failed:', result.error);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
