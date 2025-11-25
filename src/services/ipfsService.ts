import { PinataSDK } from 'pinata';
import * as fs from 'fs';
import * as path from 'path';

export interface IPFSUploadResult {
    ipfsHash: string;
    url: string;
    gatewayUrl: string;
}

/**
 * IPFS/Pinata Upload Service
 * Handles uploading images and metadata to IPFS via Pinata
 */
export class IPFSService {
    private pinata: PinataSDK | null = null;
    private isInitialized: boolean = false;
    private gateway: string = '';
    private initAttempted: boolean = false;

    constructor() {
        // Don't initialize here - wait for first use
    }

    /**
     * Initialize Pinata client (lazy initialization)
     */
    private initializePinata(): void {
        // Only try to initialize once
        if (this.initAttempted) {
            return;
        }
        
        this.initAttempted = true;
        
        const pinataJwt = process.env.PINATA_JWT;
        const pinataGateway = process.env.PINATA_GATEWAY;

        if (!pinataJwt) {
            console.warn('⚠️  Pinata JWT not found in environment variables');
            console.warn('   Please set PINATA_JWT (get from https://pinata.cloud/keys)');
            this.isInitialized = false;
            return;
        }

        try {
            this.pinata = new PinataSDK({
                pinataJwt: pinataJwt,
                pinataGateway: pinataGateway || 'gateway.pinata.cloud'
            });
            this.gateway = pinataGateway || 'gateway.pinata.cloud';
            this.isInitialized = true;
            console.log('✅ Pinata client initialized');
        } catch (error) {
            console.error('❌ Error initializing Pinata:', error);
            this.isInitialized = false;
        }
    }
    
    /**
     * Ensure Pinata is initialized before use
     */
    private ensureInitialized(): void {
        if (!this.initAttempted) {
            this.initializePinata();
        }
    }

    /**
     * Test Pinata connection
     */
    async testConnection(): Promise<boolean> {
        this.ensureInitialized();
        
        if (!this.isInitialized || !this.pinata) {
            console.error('❌ Pinata not initialized');
            return false;
        }

        try {
            // Test by listing files (will work if JWT is valid)
            await this.pinata.files.public.list().limit(1);
            console.log('✅ Pinata authentication successful');
            return true;
        } catch (error) {
            console.error('❌ Pinata authentication failed:', error);
            return false;
        }
    }

    /**
     * Upload image file to IPFS
     * @param filePath - Local file path
     * @param name - Optional name for the file
     * @returns IPFS hash and URLs
     */
    async uploadImageToIPFS(filePath: string, name?: string): Promise<IPFSUploadResult> {
        this.ensureInitialized();
        
        if (!this.isInitialized || !this.pinata) {
            throw new Error('Pinata not initialized. Check your JWT token.');
        }

        try {
            console.log(`📤 Uploading image to IPFS: ${filePath}`);

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Read file as buffer
            const fileBuffer = fs.readFileSync(filePath);
            const fileName = name || path.basename(filePath);
            
            // Create File object (Blob)
            const file = new File([fileBuffer], fileName, {
                type: this.getMimeTypeFromPath(filePath)
            });

            // Upload to Pinata using new SDK
            const result = await this.pinata.upload.public.file(file);

            const ipfsHash = result.cid;
            const url = this.getIPFSUrl(ipfsHash);
            const gatewayUrl = this.getPinataGatewayUrl(ipfsHash);

            console.log(`✅ Image uploaded to IPFS: ${ipfsHash}`);
            console.log(`   URL: ${url}`);

            return {
                ipfsHash,
                url,
                gatewayUrl
            };

        } catch (error) {
            console.error('❌ Error uploading image to IPFS:', error);
            throw new Error(`Failed to upload image to IPFS: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Upload JSON metadata to IPFS
     * @param metadata - Metadata object
     * @param name - Optional name for the metadata
     * @returns IPFS hash and URLs
     */
    async uploadMetadataToIPFS(metadata: object, name?: string): Promise<IPFSUploadResult> {
        this.ensureInitialized();
        
        if (!this.isInitialized || !this.pinata) {
            throw new Error('Pinata not initialized. Check your JWT token.');
        }

        try {
            console.log(`📤 Uploading metadata to IPFS`);

            // Upload JSON to Pinata using new SDK
            const result = await this.pinata.upload.public.json(metadata);

            const ipfsHash = result.cid;
            const url = this.getIPFSUrl(ipfsHash);
            const gatewayUrl = this.getPinataGatewayUrl(ipfsHash);

            console.log(`✅ Metadata uploaded to IPFS: ${ipfsHash}`);
            console.log(`   URL: ${url}`);

            return {
                ipfsHash,
                url,
                gatewayUrl
            };

        } catch (error) {
            console.error('❌ Error uploading metadata to IPFS:', error);
            throw new Error(`Failed to upload metadata to IPFS: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get MIME type from file path
     * @param filePath - File path
     * @returns MIME type
     */
    private getMimeTypeFromPath(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    /**
     * Convert IPFS hash to public URL
     * @param hash - IPFS hash
     * @returns Public IPFS URL
     */
    getIPFSUrl(hash: string): string {
        return `https://ipfs.io/ipfs/${hash}`;
    }

    /**
     * Convert IPFS hash to Pinata gateway URL
     * @param hash - IPFS hash
     * @returns Pinata gateway URL
     */
    getPinataGatewayUrl(hash: string): string {
        return `https://${this.gateway}/ipfs/${hash}`;
    }

    /**
     * Unpin file from IPFS
     * @param fileId - File ID to unpin (from upload result)
     */
    async unpinFile(fileId: string): Promise<void> {
        this.ensureInitialized();
        
        if (!this.isInitialized || !this.pinata) {
            throw new Error('Pinata not initialized');
        }

        try {
            await this.pinata.files.public.delete([fileId]);
            console.log(`✅ Unpinned: ${fileId}`);
        } catch (error) {
            console.error(`❌ Error unpinning ${fileId}:`, error);
            throw error;
        }
    }

    /**
     * List all pinned files
     */
    async listPinnedFiles(): Promise<any[]> {
        this.ensureInitialized();
        
        if (!this.isInitialized || !this.pinata) {
            throw new Error('Pinata not initialized');
        }

        try {
            const result = await this.pinata.files.public.list().limit(100);
            return result.files || [];
        } catch (error) {
            console.error('❌ Error listing pinned files:', error);
            throw error;
        }
    }

    /**
     * Get file details by CID
     * @param cid - IPFS CID
     */
    async getFileDetails(cid: string): Promise<any> {
        this.ensureInitialized();
        
        if (!this.isInitialized || !this.pinata) {
            throw new Error('Pinata not initialized');
        }

        try {
            const files = await this.pinata.files.public.list().cid(cid).limit(1);
            return files.files && files.files.length > 0 ? files.files[0] : null;
        } catch (error) {
            console.error('❌ Error getting file details:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const ipfsService = new IPFSService();

