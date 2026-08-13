const DIGITS = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['010', '010', '111', '010', '010']
};

function normalizedUnreadCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function totalUnread(values) {
  return [...(values || [])].reduce((total, value) => total + normalizedUnreadCount(value), 0);
}

function indicatorLabel(count) {
  const normalized = normalizedUnreadCount(count);
  return normalized > 99 ? '99+' : String(normalized);
}

function spriteCellForUnread(count, cellSize = 64) {
  const normalized = normalizedUnreadCount(count);
  const index = normalized > 99 ? 99 : Math.max(0, normalized - 1);
  return {
    x: (index % 10) * cellSize,
    y: Math.floor(index / 10) * cellSize,
    width: cellSize,
    height: cellSize
  };
}

function setPixel(bitmap, width, height, x, y, red, green, blue, alpha = 255) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = ((y * width) + x) * 4;
  bitmap[offset] = blue;
  bitmap[offset + 1] = green;
  bitmap[offset + 2] = red;
  bitmap[offset + 3] = alpha;
}

function drawCircle(bitmap, width, height, centerX, centerY, radius, color) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (((x - centerX) ** 2) + ((y - centerY) ** 2) <= radius ** 2) {
        setPixel(bitmap, width, height, x, y, ...color);
      }
    }
  }
}

function drawGlyph(bitmap, width, height, glyph, startX, startY, scale = 1) {
  const rows = DIGITS[glyph] || DIGITS['+'];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((pixel, columnIndex) => {
      if (pixel !== '1') return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          setPixel(bitmap, width, height, startX + (columnIndex * scale) + dx, startY + (rowIndex * scale) + dy, 255, 255, 255);
        }
      }
    });
  });
}

function createOverlayBitmap(count, size = 16, badgeBitmap = null) {
  const expectedLength = size * size * 4;
  const bitmap = badgeBitmap?.length === expectedLength
    ? Buffer.from(badgeBitmap)
    : Buffer.alloc(expectedLength);
  if (!badgeBitmap || badgeBitmap.length !== expectedLength) {
    drawCircle(bitmap, size, size, Math.floor(size / 2), Math.floor(size / 2), Math.floor(size / 2) - 1, [225, 29, 72, 255]);
  }
  const normalized = normalizedUnreadCount(count);
  const glyphs = normalized > 99 ? ['+'] : [...String(Math.max(1, normalized))];
  const scale = glyphs.length === 1
    ? Math.max(2, Math.floor(size / 8))
    : glyphs.length === 2
      ? Math.max(1, Math.floor(size / 10))
      : Math.max(1, Math.floor(size / 14));
  const glyphWidth = 3 * scale;
  const gap = scale;
  const totalWidth = (glyphs.length * glyphWidth) + ((glyphs.length - 1) * gap);
  const startX = Math.floor((size - totalWidth) / 2);
  const startY = Math.floor((size - (5 * scale)) / 2);
  glyphs.forEach((glyph, index) => drawGlyph(bitmap, size, size, glyph, startX + (index * (glyphWidth + gap)), startY, scale));
  return bitmap;
}

function blendPixel(target, targetOffset, source, sourceOffset) {
  const sourceAlpha = source[sourceOffset + 3] / 255;
  if (sourceAlpha <= 0) return;
  const targetAlpha = target[targetOffset + 3] / 255;
  const outputAlpha = sourceAlpha + (targetAlpha * (1 - sourceAlpha));
  for (let channel = 0; channel < 3; channel += 1) {
    const sourceValue = source[sourceOffset + channel];
    const targetValue = target[targetOffset + channel];
    target[targetOffset + channel] = outputAlpha > 0
      ? Math.round(((sourceValue * sourceAlpha) + (targetValue * targetAlpha * (1 - sourceAlpha))) / outputAlpha)
      : 0;
  }
  target[targetOffset + 3] = Math.round(outputAlpha * 255);
}

function addUnreadBadge(sourceBitmap, width, height, badgeBitmap, badgeWidth, badgeHeight) {
  const bitmap = Buffer.from(sourceBitmap);
  if (!badgeBitmap || badgeBitmap.length !== badgeWidth * badgeHeight * 4) return bitmap;
  const startX = Math.max(0, width - badgeWidth);
  const startY = Math.max(0, height - badgeHeight);
  for (let y = 0; y < badgeHeight && startY + y < height; y += 1) {
    for (let x = 0; x < badgeWidth && startX + x < width; x += 1) {
      const targetOffset = (((startY + y) * width) + startX + x) * 4;
      const sourceOffset = ((y * badgeWidth) + x) * 4;
      blendPixel(bitmap, targetOffset, badgeBitmap, sourceOffset);
    }
  }
  return bitmap;
}

module.exports = {
  normalizedUnreadCount,
  totalUnread,
  indicatorLabel,
  spriteCellForUnread,
  createOverlayBitmap,
  addUnreadBadge
};
