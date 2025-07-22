const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from root .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Now require the transformer after environment is loaded
const ImageDescriptionTransformer = require('../../src/transforms/transformers/ImageDescriptionTransformer');

describe('ImageDescriptionTransformer Integration Test', () => {
  it('should generate description for image using real Gemini API', async () => {
    // Skip this test if GEMINI_API_KEY is not set
    if (!process.env.GEMINI_API_KEY) {
      console.log('GEMINI_API_KEY is not set. Skipping ImageDescription integration test.');
      return;
    }

    // Get the path to the test image
    const imagePath = path.join(__dirname, '../fixtures/images/painting.jpg');
    
    // Ensure the fixture image exists
    expect(fs.existsSync(imagePath)).toBe(true);
    
    // Read the image file
    const imageContent = await fs.readFile(imagePath);
    const stats = await fs.stat(imagePath);
    
    // Create file object
    const file = {
      path: 'painting.jpg',
      content: imageContent,
      stats: stats
    };
    
    // Instantiate the ImageDescription transformer
    const transformer = new ImageDescriptionTransformer();
    
    // Check if transformer can handle this file
    expect(transformer.canTransform(file)).toBe(true);
    
    // Transform the image to get description
    const result = await transformer.doTransform(file);
    
    // Assert that result has expected structure
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('transformed', true);
    expect(result).toHaveProperty('transformedBy', 'ImageDescriptionTransformer');
    
    // Assert that description is not empty
    expect(result.content).toBeTruthy();
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(50); // Should have substantial description
    
    // The PHP test expects "cat" in the description
    const description = result.content.toLowerCase();
    
    // Log the description for debugging if test fails
    if (!description.includes('cat')) {
      console.log('Generated description:', result.content);
    }
    
    // The image contains a cat - this is what the PHP test validates
    expect(description).toContain('cat');
    
    // Also verify the transformer adds its signature
    expect(result.content).toContain('[AI-generated description by ImageDescriptionTransformer]');
  }, 30000); // Allow 30 seconds for API call
});