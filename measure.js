const fs = require('fs');
const path = require('path');


function getJpgSize(buffer) {
  // JPEG: SOI marker (FFD8) is 2 bytes, then segments follow
  let offset = 2;
  while (offset < buffer.length - 1) {
    // Find next marker (0xFF followed by non-zero byte)
    if (buffer[offset] !== 0xFF) { offset++; continue; }
    const marker = buffer[offset + 1];

    // Skip padding FF bytes
    if (marker === 0xFF) { offset++; continue; }
    // Skip standalone markers (RST, SOI, EOI, TEM)
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { offset += 2; continue; }

    // Ensure we can read segment length
    if (offset + 3 >= buffer.length) break;
    const segLen = buffer.readUInt16BE(offset + 2);

    // SOF markers (0xC0-0xCF except 0xC4 DHT and 0xCC DAC)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      if (offset + 8 < buffer.length) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
    }

    offset += 2 + segLen;
  }
  return { width: 0, height: 0 };
}

function getPngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const dir = path.join(__dirname, 'özgü-görseller');
const files = fs.readdirSync(dir).filter(f => f.match(/\.(jpg|jpeg|png)$/i));

const results = [];
for(const file of files) {
   const buffer = fs.readFileSync(path.join(dir, file));
   const isPng = file.toLowerCase().endsWith('.png');
   const size = isPng ? getPngSize(buffer) : getJpgSize(buffer);
   
   let ratio = '';
   if(size.width && size.height) {
     const r = size.width / size.height;
     if(r > 0.95 && r < 1.05) ratio = 'Kare';
     else if(r <= 0.60) ratio = 'Story';
     else if(r > 0.60 && r < 0.95) ratio = 'Dikey';
     else if(r >= 1.05) ratio = 'Yatay';
     else ratio = 'Bilinmiyor';
   }
   
   results.push({ file, width: size.width, height: size.height, category: ratio });
}

fs.writeFileSync('template-catalog.json', JSON.stringify(results, null, 2));
console.log('Done measuring ' + results.length + ' files');
