const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createCanvas, loadImage } = require('canvas');
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
    } catch (pngError) {}

    try {
      const image = await loadImage(buffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      let binaryString = '';
      for (let i = 0; i < pixels.length; i += 4) {
        binaryString += (pixels[i] & 1).toString();
        binaryString += (pixels[i + 1] & 1).toString();
        binaryString += (pixels[i + 2] & 1).toString();
        if (binaryString.length > 24 && binaryString.slice(-24).includes('00000000')) {
          break;
        }
      }
      let extractedText = '';
      for (let i = 0; i < binaryString.length; i += 8) {
        if (i + 8 > binaryString.length) break;
        const byte = binaryString.substr(i, 8);
        const charCode = parseInt(byte, 2);
        if (charCode === 0) break;
        if (charCode < 32 && charCode !== 10 && charCode !== 13 && charCode !== 9) continue;
        extractedText += String.fromCharCode(charCode);
      }
      const jsonPattern = /{[\s\S]*?}/;
      const match = extractedText.match(jsonPattern);
      if (match) {
        const jsonStr = match[0];
        try {
          const extractedJson = JSON.parse(jsonStr);
          return res.status(200).json({
            success: true,
            data: extractedJson,
            message: 'Successfully extracted JSON from image using LSB method'
          });
        } catch (parseError) {}
      }
    } catch (lsbError) {}

    try {
      const dataString = buffer.toString();
      const jsonPattern = /{[\s\S]*?}/;
      const match = dataString.match(jsonPattern);
      if (match) {
        const jsonStr = match[0];
        try {
          const extractedJson = JSON.parse(jsonStr);
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
        } catch (parseError) {}
      }
    } catch (rawDataError) {}

    return res.status(400).json({
      success: false,
      data: {},
      message: 'Could not extract valid JSON data from the image'
    });
    
  } catch (err) {
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
