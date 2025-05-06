const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const extractChunks = require('png-chunks-extract');
const extractText = require('png-chunk-text').decode;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware configuration
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Validate JSON structure
function isValidContactJSON(json) {
  return (
    json &&
    typeof json.name === 'string' &&
    typeof json.organization === 'string' &&
    typeof json.address === 'string' &&
    typeof json.mobile === 'string'
  );
}

// Enhanced JSON extraction
function extractJSONFromBuffer(buffer) {
  try {
    // Method 1: Extract from PNG chunks (primary method)
    const chunks = extractChunks(buffer);
    
    for (const chunk of chunks) {
      if (chunk.name === 'tEXt' || chunk.name === 'iTXt') {
        try {
          const textData = chunk.name === 'tEXt' 
            ? { keyword: 'data', text: chunk.data.toString('utf8') }
            : extractText(chunk);
          
          // Try parsing as JSON
          try {
            const json = JSON.parse(textData.text);
            if (isValidContactJSON(json)) {
              return json;
            }
          } catch (e) {
            // If not JSON, check if it's the raw data we need
            if (isValidContactJSON(textData)) {
              return textData;
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    // Method 2: Search for JSON in raw buffer (fallback)
    const dataString = buffer.toString('utf8', 0, 10000); // Limit search to first 10KB
    const jsonMatch = dataString.match(/\{[\s\S]*?\}(?=\s*$)/);
    
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0]);
        if (isValidContactJSON(json)) {
          return json;
        }
      } catch (e) {
        console.log('Fallback JSON parse error:', e.message);
      }
    }
  } catch (error) {
    console.error('Extraction error:', error.message);
  }

  return null;
}

// API endpoint
app.post('/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'No image data provided'
      });
    }

    // Clean and decode base64
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Extract and validate JSON
    const extractedJson = extractJSONFromBuffer(buffer);

    if (extractedJson) {
      return res.status(200).json({
        success: true,
        data: extractedJson,
        message: 'Successfully extracted JSON from image'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Could not extract valid JSON data from the image'
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'JSON Extraction API is operational',
    endpoint: 'POST /extract with { imageBase64 }'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});