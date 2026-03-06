const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const png = new PNG({
  width: 128,
  height: 128,
  fill: true
});

// Fill with blue color (VS Code blue)
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (png.width * y + x) * 4;
    png.data[idx] = 66;      // R
    png.data[idx + 1] = 133; // G
    png.data[idx + 2] = 244; // B
    png.data[idx + 3] = 255; // A
  }
}

const outputPath = path.join(__dirname, '..', 'assets', 'icon-128.png');
png.pack().pipe(fs.createWriteStream(outputPath));

console.log('Icon created at:', outputPath);
