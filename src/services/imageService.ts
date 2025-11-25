import axios from 'axios';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const exists = promisify(fs.exists);

// Temp directory for downloaded images
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Maximum image size (20MB for Gemini)
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

export interface ImageValidationResult {
    valid: boolean;
    size: number;
    format: string;
    width?: number;
    height?: number;
    error?: string;
}

/**
 * Image Download and Validation Service
 * Handles downloading images from Twitter URLs and validating them
 */
export class ImageService {
    constructor() {
        this.ensureTempDir();
    }

    /**
     * Ensure temp directory exists
     */
    private async ensureTempDir(): Promise<void> {
        try {
            if (!fs.existsSync(TEMP_DIR)) {
                await mkdir(TEMP_DIR, { recursive: true });
                console.log(`✅ Created temp directory: ${TEMP_DIR}`);
            }
        } catch (error) {
            console.error('Error creating temp directory:', error);
            throw error;
        }
    }

    /**
     * Download image from URL
     * @param url - Image URL (Twitter or any valid URL)
     * @returns Local file path
     */
    async downloadImage(url: string): Promise<string> {
        try {
            await this.ensureTempDir();

            // Generate unique filename
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(7);
            const extension = this.getExtensionFromUrl(url);
            const filename = `image_${timestamp}_${random}${extension}`;
            const filepath = path.join(TEMP_DIR, filename);

            console.log(`⬇️  Downloading image from: ${url}`);

            // Download image with axios
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 second timeout
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            // Write to file
            fs.writeFileSync(filepath, response.data);

            console.log(`✅ Image downloaded to: ${filepath}`);
            return filepath;

        } catch (error) {
            console.error(`❌ Error downloading image from ${url}:`, error);
            throw new Error(`Failed to download image: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Download multiple images
     * @param urls - Array of image URLs
     * @returns Array of local file paths
     */
    async downloadAllImages(urls: string[]): Promise<string[]> {
        const downloadedPaths: string[] = [];

        for (const url of urls) {
            try {
                const filepath = await this.downloadImage(url);
                downloadedPaths.push(filepath);
            } catch (error) {
                console.error(`Failed to download image ${url}, skipping:`, error);
                // Continue with other images
            }
        }

        return downloadedPaths;
    }

    /**
     * Validate image format and size
     * @param filePath - Local file path
     * @returns Validation result with metadata
     */
    async validateImage(filePath: string): Promise<ImageValidationResult> {
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return {
                    valid: false,
                    size: 0,
                    format: 'unknown',
                    error: 'File does not exist'
                };
            }

            // Get file size
            const stats = fs.statSync(filePath);
            const fileSize = stats.size;

            // Check size limit
            if (fileSize > MAX_IMAGE_SIZE) {
                return {
                    valid: false,
                    size: fileSize,
                    format: 'unknown',
                    error: `Image too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max: 20MB)`
                };
            }

            // Get image metadata using sharp
            const metadata = await sharp(filePath).metadata();

            // Check format
            const validFormats = ['jpeg', 'jpg', 'png', 'webp', 'heic', 'heif'];
            const format = metadata.format?.toLowerCase() || 'unknown';

            if (!validFormats.includes(format)) {
                return {
                    valid: false,
                    size: fileSize,
                    format: format,
                    error: `Unsupported format: ${format}. Supported: ${validFormats.join(', ')}`
                };
            }

            return {
                valid: true,
                size: fileSize,
                format: format,
                width: metadata.width,
                height: metadata.height
            };

        } catch (error) {
            return {
                valid: false,
                size: 0,
                format: 'unknown',
                error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Clean up temporary image file
     * @param filePath - Path to file to delete
     */
    async cleanupImage(filePath: string): Promise<void> {
        try {
            if (fs.existsSync(filePath)) {
                await unlink(filePath);
                console.log(`🗑️  Cleaned up: ${filePath}`);
            }
        } catch (error) {
            console.error(`Error cleaning up ${filePath}:`, error);
            // Don't throw, just log
        }
    }

    /**
     * Clean up multiple images
     * @param filePaths - Array of file paths
     */
    async cleanupAllImages(filePaths: string[]): Promise<void> {
        for (const filepath of filePaths) {
            await this.cleanupImage(filepath);
        }
    }

    /**
     * Clean up entire temp directory
     */
    async cleanupTempDir(): Promise<void> {
        try {
            if (fs.existsSync(TEMP_DIR)) {
                const files = fs.readdirSync(TEMP_DIR);
                for (const file of files) {
                    const filepath = path.join(TEMP_DIR, file);
                    await this.cleanupImage(filepath);
                }
                console.log(`🗑️  Cleaned up temp directory`);
            }
        } catch (error) {
            console.error('Error cleaning temp directory:', error);
        }
    }

    /**
     * Get file extension from URL
     * @param url - Image URL
     * @returns File extension with dot (e.g., '.jpg')
     */
    private getExtensionFromUrl(url: string): string {
        try {
            const urlPath = new URL(url).pathname;
            const ext = path.extname(urlPath);
            return ext || '.jpg'; // Default to .jpg
        } catch {
            return '.jpg';
        }
    }

    /**
     * Convert image to base64 for API calls
     * @param filePath - Local file path
     * @returns Base64 string
     */
    async imageToBase64(filePath: string): Promise<string> {
        try {
            const imageBuffer = fs.readFileSync(filePath);
            return imageBuffer.toString('base64');
        } catch (error) {
            throw new Error(`Failed to convert image to base64: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get image mime type
     * @param filePath - Local file path
     * @returns Mime type string
     */
    async getMimeType(filePath: string): Promise<string> {
        const validation = await this.validateImage(filePath);
        const formatMap: Record<string, string> = {
            'jpeg': 'image/jpeg',
            'jpg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'heic': 'image/heic',
            'heif': 'image/heif'
        };
        return formatMap[validation.format] || 'image/jpeg';
    }
}

// Export singleton instance
export const imageService = new ImageService();

