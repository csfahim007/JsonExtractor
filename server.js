const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const pngJS = require('pngjs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        data: {},
        message: 'No image data provided'
      });
    }

    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Method 1: Try to extract data using PNG chunks (tEXt, iTXt chunks)
    try {
      const png = pngJS.PNG.sync.read(buffer);
      if (png.text && png.text.json) {
        const extractedJson = JSON.parse(png.text.json);
        return res.status(200).json({
          success: true,
          data: extractedJson,
          message: 'Successfully extracted JSON from PNG text chunks'
        });
      }
    } catch (pngError) {
      console.log('PNG chunk extraction failed, trying raw data method next...');
    }

    // Method 2: Check if the data is directly embedded in the image data
    try {
      const dataString = buffer.toString();
      const jsonPattern = /{[\s\S]*?}/;
      const match = dataString.match(jsonPattern);
      
      if (match) {
        const jsonStr = match[0];
        try {
          const extractedJson = JSON.parse(jsonStr);
          
          // Validate that it has the expected fields
          const expectedKeys = ['name', 'organization', 'address', 'mobile'];
          const hasExpectedStructure = expectedKeys.every(key => 
            extractedJson.hasOwnProperty(key) && typeof extractedJson[key] === 'string'
          );
          
          if (hasExpectedStructure) {
            return res.status(200).json({
              success: true,
              data: extractedJson,
              message: 'Successfully extracted JSON from image data'
            });
          }
        } catch (parseError) {
          console.log('JSON parse error in raw data:', parseError);
        }
      }
    } catch (rawDataError) {
      console.log('Raw data extraction failed:', rawDataError);
    }

    return res.status(400).json({
      success: false,
      data: {},
      message: 'Could not extract valid JSON data from the image'
    });
    
  } catch (err) {
    console.error('Error processing image:', err);
    return res.status(500).json({
      success: false,
      data: {},
      message: `Server error: ${err.message}`
    });
  }
});

app.get('/', (req, res) => {
  res.send('JSON Extraction API is running! Send a POST request to /extract with an imageBase64 field.');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});