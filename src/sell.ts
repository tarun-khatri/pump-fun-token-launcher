import { createTransaction, sendAndConfirmTransactionWrapper, bufferFromUInt64, getKeyPairFromPrivateKey } from './utils';
import web3, { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { COMPUTE_BUDGET_PROGRAM_ID, GLOBAL, PUMP_FUN_PROGRAM, FEE_CONFIG, FEE_PROGRAM } from './constants';
import BN from 'bn.js';

/**
 * Configuration for selling tokens
 */
export interface SellConfig {
    tokenMint: string;           // Token mint address to sell
    tokenAmount: number;         // Amount of tokens to sell (in token units)
    minSolOut: number;          // Minimum SOL to receive (in lamports)
    slippage: number;           // Slippage tolerance (percentage)
    priorityFee: number;        // Priority fee in SOL
}

/**
 * Result of a sell operation
 */
export interface SellResult {
    success: boolean;
    signature?: string;
    solReceived?: number;
    error?: string;
}

/**
 * Sell tokens on pump.fun
 * @param config - Sell configuration
 * @param privateKey - Base58 encoded private key or Keypair instance
 * @param rpcUrl - Solana RPC URL (optional, defaults to mainnet)
 * @returns Promise<SellResult> - Result of the sell operation
 */
export async function sellToken(
    config: SellConfig,
    privateKey: string | Keypair,
    rpcUrl?: string
): Promise<SellResult> {
    try {
        // Setup connection and keypair
        const connection = new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com');
        const payer = typeof privateKey === 'string' ?
            await getKeyPairFromPrivateKey(privateKey) : privateKey;
        const owner = payer.publicKey;

        // Validate configuration (skip tokenAmount validation as we'll use actual balance)
        const configToValidate = { ...config, tokenAmount: 1 }; // Temporary value for validation
        validateSellConfig(configToValidate);

        console.log('Selling token...');
        console.log('Config:', config);

        // Get token mint
        const tokenMint = new PublicKey(config.tokenMint);

        // First check if the token mint exists with retry logic for timing issues
        let tokenMintAccountInfo = null;
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 2000; // 2 seconds

        while (!tokenMintAccountInfo && retryCount < maxRetries) {
            tokenMintAccountInfo = await connection.getAccountInfo(tokenMint);
            if (!tokenMintAccountInfo) {
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`Token mint not found, retrying in ${retryDelay}ms... (attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        if (!tokenMintAccountInfo) {
            throw new Error(`Token mint ${config.tokenMint} does not exist after ${maxRetries} attempts`);
        }
        console.log('Token mint exists:', tokenMint.toString());

        // Calculate PDAs - matching Python script exactly
        const [bondingCurve] = await PublicKey.findProgramAddress(
            [Buffer.from("bonding-curve"), tokenMint.toBuffer()], // Python: b"bonding-curve"
            PUMP_FUN_PROGRAM
        );
        console.log('Bonding curve address:', bondingCurve.toString());

        const [associatedBondingCurve] = await PublicKey.findProgramAddress(
            [bondingCurve.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()], // Python order
            new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program
        );

        // The creator is the wallet that created the token (current wallet)
        // This matches how pump.fun works - the creator is set to the wallet that creates the token
        const creator = owner; // Use the current wallet as the creator
        console.log('Using wallet as creator:', creator.toString());

        // Now derive creator vault using the creator wallet - matching Python script
        const [creatorVault] = await PublicKey.findProgramAddress(
            [Buffer.from("creator-vault"), creator.toBuffer()], // Python: b"creator-vault"
            PUMP_FUN_PROGRAM
        );

        const [globalVolumeAccumulator] = await PublicKey.findProgramAddress(
            [Buffer.from("global_volume_accumulator")],
            PUMP_FUN_PROGRAM
        );

        const [userVolumeAccumulator] = await PublicKey.findProgramAddress(
            [Buffer.from("user_volume_accumulator"), owner.toBuffer()],
            PUMP_FUN_PROGRAM
        );

        const [eventAuthority] = await PublicKey.findProgramAddress(
            [Buffer.from("__event_authority")],
            PUMP_FUN_PROGRAM
        );

        // Calculate fee config PDA like Python script
        const [feeConfigPDA] = await PublicKey.findProgramAddress(
            [Buffer.from("fee_config"), PUMP_FUN_PROGRAM.toBuffer()],
            FEE_PROGRAM
        );

        // Get user's token account
        const userTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            owner
        );

        // Use the first fee recipient from successful transactions
        // From successful transactions: 62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV, CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM
        const feeRecipient = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");

        // Get actual token balance (100% of holdings)
        const solanaConnection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'));
        const tokenBalance = await solanaConnection.getTokenAccountBalance(userTokenAccount);
        const actualTokenAmount = new BN(tokenBalance.value.amount);

        console.log(`Actual token balance: ${actualTokenAmount.toString()}`);
        console.log(`Token balance (with decimals): ${tokenBalance.value.uiAmount}`);
        console.log(`Token decimals: ${tokenBalance.value.decimals}`);

        // Calculate sell amounts - use 100% like Python script
        const tokenAmountLamports = actualTokenAmount; // Use 100% of actual balance
        const minSolOutLamports = 0; // Use 0 like successful transactions

        // Build transaction
        const txBuilder = new web3.Transaction();

        // Add compute budget instructions - matching Python script
        txBuilder.add(
            web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: 100000 // Add compute unit limit
            })
        );

        txBuilder.add(
            web3.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 1000 // Python script uses 1_000
            })
        );

        // Sell instruction - exact match to successful transactions (14 accounts)
        const sellKeys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },                    // #1 - Global
            { pubkey: feeRecipient, isSigner: false, isWritable: true },               // #2 - Fee Recipient
            { pubkey: tokenMint, isSigner: false, isWritable: false },                 // #3 - Mint
            { pubkey: bondingCurve, isSigner: false, isWritable: true },               // #4 - Bonding Curve
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },     // #5 - Associated Bonding Curve
            { pubkey: userTokenAccount, isSigner: false, isWritable: true },           // #6 - Associated User
            { pubkey: owner, isSigner: true, isWritable: true },                       // #7 - User
            { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false }, // #8 - System Program
            { pubkey: creatorVault, isSigner: false, isWritable: true },               // #9 - Creator Vault
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },          // #10 - Token Program
            { pubkey: eventAuthority, isSigner: false, isWritable: false },            // #11 - Event Authority
            { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },          // #12 - Program
            { pubkey: feeConfigPDA, isSigner: false, isWritable: false },             // #13 - Fee Config (calculated PDA)
            { pubkey: FEE_PROGRAM, isSigner: false, isWritable: false }                // #14 - Fee Program
        ];

        // Sell instruction data - using correct sell discriminator
        const sellData = Buffer.concat([
            bufferFromUInt64('12502976635542562355'), // Correct sell discriminator from Python script
            bufferFromUInt64(tokenAmountLamports.toString()), // amount: "153285714285714"
            bufferFromUInt64(minSolOutLamports) // min_sol_output: "0"
        ]);

        txBuilder.add(new web3.TransactionInstruction({
            keys: sellKeys,
            programId: PUMP_FUN_PROGRAM,
            data: sellData
        }));

        // Send transaction
        const transaction = await createTransaction(connection, txBuilder.instructions, owner);
        const signature = await sendAndConfirmTransactionWrapper(connection, transaction, [payer]);

        if (signature) {
            console.log('🎉 Token sold successfully!');
            console.log('Transaction Signature:', signature);
            console.log('View on Solscan:', `https://solscan.io/tx/${signature}`);

            // Calculate actual SOL received
            let actualSolReceived = 0;
            try {
                // Wait a bit for RPC to index
                await new Promise(resolve => setTimeout(resolve, 2000));

                const txInfo = await connection.getParsedTransaction(signature, {
                    maxSupportedTransactionVersion: 0,
                    commitment: 'confirmed'
                });

                if (txInfo && txInfo.meta) {
                    const accountIndex = txInfo.transaction.message.accountKeys.findIndex(
                        key => key.pubkey.toString() === owner.toString()
                    );

                    if (accountIndex !== -1) {
                        const preBalance = txInfo.meta.preBalances[accountIndex];
                        const postBalance = txInfo.meta.postBalances[accountIndex];
                        // Calculate difference (post - pre) and convert to SOL
                        // Note: This includes transaction fees, so it's net change
                        const diff = postBalance - preBalance;
                        // Add back the approximate fee (0.000005 SOL) to get gross received, or just use net
                        // For PnL, net change is actually more accurate
                        actualSolReceived = diff > 0 ? diff / 1e9 : 0;
                        console.log(`   Actual SOL Change: ${actualSolReceived.toFixed(6)} SOL`);
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch transaction details for SOL calculation:', err);
            }

            return {
                success: true,
                signature: signature,
                solReceived: actualSolReceived || (minSolOutLamports / 1e9) // Fallback
            };
        } else {
            return {
                success: false,
                error: 'Transaction failed to confirm'
            };
        }

    } catch (error: any) {
        console.error('Error selling token:', error);
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }
}

/**
 * Validate sell configuration
 * @param config - Sell configuration to validate
 * @returns boolean - true if valid, throws error if invalid
 */
function validateSellConfig(config: SellConfig): boolean {
    if (!config.tokenMint) {
        throw new Error('Token mint address is required');
    }

    if (!config.tokenAmount || config.tokenAmount <= 0) {
        throw new Error('Token amount must be greater than 0');
    }

    if (config.minSolOut < 0) {
        throw new Error('Minimum SOL output must be non-negative');
    }

    if (config.slippage < 0 || config.slippage > 100) {
        throw new Error('Slippage must be between 0 and 100');
    }

    if (config.priorityFee < 0) {
        throw new Error('Priority fee must be non-negative');
    }

    return true;
}


