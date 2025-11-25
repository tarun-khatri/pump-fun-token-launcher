/**
 * Token Metadata Generator
 * Creates properly formatted metadata for pump.fun tokens
 */

export interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    attributes: Array<{
        trait_type: string;
        value: string;
    }>;
    properties: {
        files: Array<{
            uri: string;
            type: string;
        }>;
        category: string;
        creators: Array<{
            address: string;
            share: number;
        }>;
    };
}

/**
 * Generate token metadata
 * @param ticker - Token ticker symbol
 * @param name - Token name
 * @param description - Token description
 * @param ipfsImageUrl - IPFS URL of the token image
 * @param creatorAddress - Solana wallet address of creator
 * @returns Formatted metadata object
 */
export function generateMetadata(
    ticker: string,
    name: string,
    description: string,
    ipfsImageUrl: string,
    creatorAddress: string
): TokenMetadata {
    
    const metadata: TokenMetadata = {
        name: name,
        symbol: ticker,
        description: description,
        image: ipfsImageUrl,
        attributes: [
            {
                trait_type: "Category",
                value: "AI Generated Meme Token"
            },
            {
                trait_type: "Launch Date",
                value: new Date().toISOString().split('T')[0]
            },
            {
                trait_type: "Source",
                value: "Twitter"
            },
            {
                trait_type: "Launch Method",
                value: "Automated"
            }
        ],
        properties: {
            files: [
                {
                    uri: ipfsImageUrl,
                    type: "image/png"
                }
            ],
            category: "image",
            creators: [
                {
                    address: creatorAddress,
                    share: 100
                }
            ]
        }
    };

    console.log('✅ Metadata generated:', {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description.substring(0, 50) + '...'
    });

    return metadata;
}

/**
 * Validate metadata format
 * @param metadata - Metadata object to validate
 * @returns True if valid, throws error if invalid
 */
export function validateMetadata(metadata: TokenMetadata): boolean {
    // Check required fields
    if (!metadata.name || typeof metadata.name !== 'string') {
        throw new Error('Metadata missing required field: name');
    }

    if (!metadata.symbol || typeof metadata.symbol !== 'string') {
        throw new Error('Metadata missing required field: symbol');
    }

    if (!metadata.description || typeof metadata.description !== 'string') {
        throw new Error('Metadata missing required field: description');
    }

    if (!metadata.image || typeof metadata.image !== 'string') {
        throw new Error('Metadata missing required field: image');
    }

    // Validate symbol length
    if (metadata.symbol.length > 10) {
        throw new Error(`Symbol too long: ${metadata.symbol.length} chars (max: 10)`);
    }

    // Validate symbol format (uppercase letters only)
    if (!/^[A-Z]+$/.test(metadata.symbol)) {
        throw new Error(`Invalid symbol format: ${metadata.symbol}. Must be uppercase letters only.`);
    }

    // Validate image URL
    if (!metadata.image.startsWith('http')) {
        throw new Error(`Invalid image URL: ${metadata.image}`);
    }

    // Check properties structure
    if (!metadata.properties || !metadata.properties.creators) {
        throw new Error('Metadata missing properties.creators');
    }

    if (!Array.isArray(metadata.properties.creators) || metadata.properties.creators.length === 0) {
        throw new Error('Metadata must have at least one creator');
    }

    // Validate creator address
    const creator = metadata.properties.creators[0];
    if (!creator.address || typeof creator.address !== 'string') {
        throw new Error('Creator address missing or invalid');
    }

    // Validate share
    if (creator.share !== 100) {
        throw new Error('Creator share must be 100 for single creator');
    }

    console.log('✅ Metadata validation passed');
    return true;
}

/**
 * Get creator address from environment or use default
 * @returns Creator wallet address
 */
export function getCreatorAddress(): string {
    const address = process.env.CREATOR_WALLET_ADDRESS;
    
    if (!address) {
        console.warn('⚠️  CREATOR_WALLET_ADDRESS not set in environment');
        console.warn('   Using placeholder address');
        return 'DT2CKYDuas49sJukYmHTbiBPjhH3pp48j5p52h6hTKQA'; // Placeholder
    }

    return address;
}

/**
 * Create metadata JSON string
 * @param metadata - Metadata object
 * @returns Formatted JSON string
 */
export function metadataToJSON(metadata: TokenMetadata): string {
    return JSON.stringify(metadata, null, 2);
}

/**
 * Estimate metadata size
 * @param metadata - Metadata object
 * @returns Size in bytes
 */
export function getMetadataSize(metadata: TokenMetadata): number {
    const jsonString = metadataToJSON(metadata);
    return Buffer.byteLength(jsonString, 'utf8');
}

