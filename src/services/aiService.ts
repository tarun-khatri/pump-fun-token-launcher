import { GoogleGenAI, Type } from '@google/genai';
import { imageService } from './imageService';
import * as fs from 'fs';

export interface TokenSuggestion {
    name: string;           // Token name
    ticker: string;         // Max 10 chars, uppercase
    description: string;    // 2-line description, max 100 chars
    confidence: number;     // 0-100
    reasoning: string;      // Why this ticker
}

/**
 * Gemini AI Integration Service
 * Analyzes images and tweet content to generate viral token suggestions
 */
export class AIService {
    private genAI: GoogleGenAI | null = null;
    private isInitialized: boolean = false;
    private initAttempted: boolean = false;

    constructor() {
        // Don't initialize here - wait for first use
    }

    /**
     * Initialize Gemini AI (lazy initialization)
     */
    private initializeGemini(): void {
        // Only try to initialize once
        if (this.initAttempted) {
            return;
        }

        this.initAttempted = true;

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            console.warn('⚠️  Gemini API key not found in environment variables');
            console.warn('   Please set GEMINI_API_KEY');
            this.isInitialized = false;
            return;
        }

        try {
            this.genAI = new GoogleGenAI({ apiKey });
            this.isInitialized = true;
            console.log('✅ Gemini AI initialized');
        } catch (error) {
            console.error('❌ Error initializing Gemini:', error);
            this.isInitialized = false;
        }
    }

    /**
     * Ensure Gemini is initialized before use
     */
    private ensureInitialized(): void {
        if (!this.initAttempted) {
            this.initializeGemini();
        }
    }

    /**
     * Analyze images and tweet content to generate token suggestion
     * @param imagePaths - Array of local image file paths
     * @param tweetContent - Tweet text content
     * @returns Token suggestion with ticker and description
     */
    async analyzeImagesForToken(
        imagePaths: string[],
        tweetContent: string
    ): Promise<TokenSuggestion> {
        this.ensureInitialized();

        if (!this.isInitialized || !this.genAI) {
            throw new Error('Gemini AI not initialized. Check your API key.');
        }

        try {
            console.log(`🤖 Analyzing ${imagePaths.length} image(s) with Gemini AI...`);
            console.log(`📝 Tweet content: ${tweetContent.substring(0, 100)}...`);

            // Convert images to base64
            const imageParts = await Promise.all(
                imagePaths.map(async (imagePath) => {
                    const base64 = await imageService.imageToBase64(imagePath);
                    const mimeType = await imageService.getMimeType(imagePath);
                    return {
                        inlineData: {
                            data: base64,
                            mimeType: mimeType
                        }
                    };
                })
            );

            // Create the prompt
            const prompt = this.createPrompt(tweetContent);

            // Define the response schema for structured output
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    name: {
                        type: Type.STRING,
                        description: "Full token name (2-3 words max)"
                    },
                    ticker: {
                        type: Type.STRING,
                        description: "Short ticker symbol (3-6 characters, uppercase letters only)"
                    },
                    description: {
                        type: Type.STRING,
                        description: "Funny 2-line description (max 100 characters)"
                    },
                    confidence: {
                        type: Type.INTEGER,
                        description: "Confidence level (0-100)"
                    },
                    reasoning: {
                        type: Type.STRING,
                        description: "Why this ticker will go viral"
                    }
                },
                required: ["name", "ticker", "description", "confidence", "reasoning"],
                propertyOrdering: ["name", "ticker", "description", "confidence", "reasoning"]
            };

            // Call Gemini API with structured output
            const response = await this.genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [prompt, ...imageParts],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema
                }
            });

            console.log('🤖 AI Response:', response.text);

            // Parse JSON response
            if (!response.text) {
                throw new Error('AI response text is empty');
            }
            const suggestion = JSON.parse(response.text) as TokenSuggestion;

            // Validate the suggestion
            if (!this.validateTicker(suggestion.ticker)) {
                throw new Error(`Invalid ticker generated: ${suggestion.ticker}`);
            }

            console.log(`✅ AI Suggestion: ${suggestion.ticker} - ${suggestion.description}`);
            return suggestion;

        } catch (error) {
            console.error('❌ Error analyzing images with AI:', error);

            // Fallback to generic suggestion
            console.log('⚠️  Using fallback token suggestion');
            return this.getFallbackSuggestion(tweetContent);
        }
    }

    /**
     * Create AI prompt for token generation
     * @param tweetContent - Tweet text
     * @returns Formatted prompt
     */
    private createPrompt(tweetContent: string): string {
        return `Analyze these images and the tweet content to create a VIRAL meme token that could go VIRAL easily.

Tweet Content: "${tweetContent}"

Your task:
1. Look at ALL the images provided
2. Consider the tweet content as context
3. Create a token that's FUNNY, MEMORABLE, and has HIGH VIRAL POTENTIAL
4. The token should be related to crypto/meme culture

Generate:
1. A catchy token NAME (full name, 2-3 words max)
2. A SHORT ticker symbol (max 10 characters, preferably 3-6, ALL CAPS, NO SPECIAL CHARACTERS)
3. A funny 2-line description (max 100 characters total, make it catchy and viral-worthy)

Rules:
- Ticker must be UPPERCASE letters only (A-Z)
- Ticker max 10 characters (shorter is better: 3-6 chars ideal)
- Description must be appropriate (no offensive content)
- Description should be humorous and viral-worthy
- Both ticker and description must relate to the images/tweet
- Think like a successful meme coin creator

Respond ONLY with valid JSON in this EXACT format (no markdown, no code blocks):
{
  "name": "Full Token Name",
  "ticker": "TICKER",
  "description": "Short funny description here",
  "confidence": 85,
  "reasoning": "Why this ticker will go viral"
}`;
    }

    /**
     * Parse AI response to extract token suggestion
     * @param responseText - Raw AI response
     * @returns Parsed token suggestion
     */
    private parseAIResponse(responseText: string): TokenSuggestion {
        try {
            // Remove markdown code blocks if present
            let cleanText = responseText.trim();
            cleanText = cleanText.replace(/```json\n?/g, '');
            cleanText = cleanText.replace(/```\n?/g, '');
            cleanText = cleanText.trim();

            // Parse JSON
            const parsed = JSON.parse(cleanText);

            // Validate and clean ticker
            let ticker = (parsed.ticker || '').toUpperCase().replace(/[^A-Z]/g, '');
            if (ticker.length > 10) {
                ticker = ticker.substring(0, 10);
            }

            // Validate and clean description
            let description = parsed.description || '';
            if (description.length > 100) {
                description = description.substring(0, 97) + '...';
            }

            return {
                name: parsed.name || ticker,
                ticker: ticker,
                description: description,
                confidence: parsed.confidence || 50,
                reasoning: parsed.reasoning || 'AI generated suggestion'
            };

        } catch (error) {
            console.error('Error parsing AI response:', error);
            throw new Error(`Failed to parse AI response: ${responseText}`);
        }
    }

    /**
     * Validate ticker format
     * @param ticker - Ticker symbol
     * @returns True if valid
     */
    validateTicker(ticker: string): boolean {
        if (!ticker || typeof ticker !== 'string') {
            return false;
        }

        // Must be 1-10 characters
        if (ticker.length < 1 || ticker.length > 10) {
            return false;
        }

        // Must be uppercase letters only
        if (!/^[A-Z]+$/.test(ticker)) {
            return false;
        }

        return true;
    }

    /**
     * Check if ticker is unique (not already used)
     * @param ticker - Ticker to check
     * @param supabase - Supabase client
     * @returns True if unique
     */
    async checkTickerUniqueness(ticker: string, supabase: any): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from('launched_tokens')
                .select('token_symbol')
                .eq('token_symbol', ticker)
                .limit(1);

            if (error) {
                console.error('Error checking ticker uniqueness:', error);
                return true; // Assume unique if check fails
            }

            const isUnique = !data || data.length === 0;

            if (!isUnique) {
                console.warn(`⚠️  Ticker ${ticker} already exists`);
            }

            return isUnique;

        } catch (error) {
            console.error('Error checking ticker uniqueness:', error);
            return true; // Assume unique if check fails
        }
    }

    /**
     * Get fallback suggestion if AI fails
     * @param tweetContent - Tweet content
     * @returns Fallback token suggestion
     */
    private getFallbackSuggestion(tweetContent: string): TokenSuggestion {
        // Extract words from tweet and create a simple ticker
        const words = tweetContent.toUpperCase().match(/\b[A-Z]{3,}\b/g) || [];
        const ticker = words[0]?.substring(0, 6) || 'MEME';

        return {
            name: ticker,
            ticker: ticker,
            description: 'A viral meme token from Twitter',
            confidence: 30,
            reasoning: 'Fallback suggestion (AI failed)'
        };
    }

    /**
     * Test AI service
     */
    async testAI(): Promise<boolean> {
        this.ensureInitialized();

        if (!this.isInitialized || !this.genAI) {
            console.error('❌ Gemini AI not initialized');
            return false;
        }

        try {
            const response = await this.genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: "Say 'Hello'"
            });

            console.log('✅ AI test successful:', response.text);
            return true;
        } catch (error) {
            console.error('❌ AI test failed:', error);
            return false;
        }
    }
}

// Export singleton instance
export const aiService = new AIService();

