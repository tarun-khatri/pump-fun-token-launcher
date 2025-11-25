import { Keypair } from '@solana/web3.js';

// Main entry point for the pump-fun-token-launcher package
export { launchToken } from './launch';
export { sellToken } from './sell';
export * from './constants';
export * from './utils';

// Type definitions for the package
export interface TokenLaunchConfig {
  name: string;
  symbol: string;
  mintKeypair?: Keypair;
  metadataUrl: string;
  initialBuy?: number;
  slippage?: number;
  priorityFee?: number;
}

export interface LaunchResult {
  success: boolean;
  signature?: string;
  tokenAddress?: string;
  error?: string;
}

export interface SellConfig {
  tokenMint: string;
  tokenAmount: number;
  minSolOut: number;
  slippage: number;
  priorityFee: number;
}

export interface SellResult {
  success: boolean;
  signature?: string;
  solReceived?: number;
  error?: string;
}

// Re-export the main function with better typing
export { launchToken as default } from './launch';
export { validateTokenConfig } from './launch';