const DEFAULT_SAMPLE_SIZE = 24;

function isLikelyBlankBitmap(bitmap, options = {}) {
  if (!Buffer.isBuffer(bitmap) || bitmap.length < 4) return false;
  const pixelCount = Math.floor(bitmap.length / 4);
  const step = Math.max(1, Math.floor(pixelCount / (options.sampleSize || DEFAULT_SAMPLE_SIZE)));
  let sampled = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let lumaTotal = 0;
  let colorful = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    const blue = bitmap[offset];
    const green = bitmap[offset + 1];
    const red = bitmap[offset + 2];
    const alpha = bitmap[offset + 3];
    if (alpha === 0) continue;
    const luma = (red * 299 + green * 587 + blue * 114) / 1000;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    lumaTotal += luma;
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 12) colorful += 1;
    sampled += 1;
  }

  if (sampled < 4) return false;
  const average = lumaTotal / sampled;
  const nearlyUniform = maxLuma - minLuma < 9 && colorful / sampled < 0.08;
  return nearlyUniform && (average < 48 || (average > 65 && average < 205));
}

function isLikelyBlankImage(image) {
  if (!image || typeof image.isEmpty !== 'function' || image.isEmpty()) return true;
  const sampled = typeof image.resize === 'function'
    ? image.resize({ width: 32, height: 20, quality: 'good' })
    : image;
  return isLikelyBlankBitmap(sampled.toBitmap());
}

module.exports = { isLikelyBlankBitmap, isLikelyBlankImage };
