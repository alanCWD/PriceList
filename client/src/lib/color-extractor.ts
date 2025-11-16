/**
 * Extract dominant background color and appropriate text color from a logo image
 */
export async function getPaletteFromLogo(
  logoUrl: string
): Promise<{ backgroundColor: string; textColor: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Sample pixels to find dominant background color
        // Focus on edges (top, bottom, left, right) where background is most likely
        const edgeColors: { r: number; g: number; b: number; count: number }[] = [];
        const sampleSize = 10; // Sample every 10th pixel

        // Top edge
        for (let x = 0; x < canvas.width; x += sampleSize) {
          const i = (0 * canvas.width + x) * 4;
          addColorSample(edgeColors, pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
        }

        // Bottom edge
        for (let x = 0; x < canvas.width; x += sampleSize) {
          const i = ((canvas.height - 1) * canvas.width + x) * 4;
          addColorSample(edgeColors, pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
        }

        // Left edge
        for (let y = 0; y < canvas.height; y += sampleSize) {
          const i = (y * canvas.width + 0) * 4;
          addColorSample(edgeColors, pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
        }

        // Right edge
        for (let y = 0; y < canvas.height; y += sampleSize) {
          const i = (y * canvas.width + (canvas.width - 1)) * 4;
          addColorSample(edgeColors, pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
        }

        // Handle transparent logos - if no edge colors found, sample center area
        let dominantBgColor: { r: number; g: number; b: number };
        
        if (edgeColors.length === 0) {
          // Transparent logo - sample all non-transparent pixels
          const allColors: { r: number; g: number; b: number; count: number }[] = [];
          for (let y = 0; y < canvas.height; y += sampleSize) {
            for (let x = 0; x < canvas.width; x += sampleSize) {
              const i = (y * canvas.width + x) * 4;
              addColorSample(allColors, pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
            }
          }
          
          if (allColors.length > 0) {
            dominantBgColor = allColors.reduce((prev, current) =>
              current.count > prev.count ? current : prev
            );
          } else {
            // Completely transparent - use neutral default
            dominantBgColor = { r: 248, g: 249, b: 250 }; // #f8f9fa
          }
        } else {
          // Normal logo - use edge colors
          dominantBgColor = edgeColors.reduce((prev, current) =>
            current.count > prev.count ? current : prev
          );
        }

        const backgroundColor = rgbToHex(dominantBgColor.r, dominantBgColor.g, dominantBgColor.b);

        // Calculate luminance to determine text color
        const luminance = calculateLuminance(dominantBgColor.r, dominantBgColor.g, dominantBgColor.b);

        // Sample center area to find text/logo color
        const centerColors: { r: number; g: number; b: number; count: number }[] = [];
        const centerX = Math.floor(canvas.width / 2);
        const centerY = Math.floor(canvas.height / 2);
        const centerRadius = Math.min(canvas.width, canvas.height) / 4;

        for (let y = centerY - centerRadius; y < centerY + centerRadius; y += sampleSize) {
          for (let x = centerX - centerRadius; x < centerX + centerRadius; x += sampleSize) {
            if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
              const i = (y * canvas.width + x) * 4;
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              const a = pixels[i + 3];
              
              // Only sample if significantly different from background
              if (a > 200 && (
                Math.abs(r - dominantBgColor.r) > 30 ||
                Math.abs(g - dominantBgColor.g) > 30 ||
                Math.abs(b - dominantBgColor.b) > 30
              )) {
                addColorSample(centerColors, r, g, b, a);
              }
            }
          }
        }

        let textColor: string;
        
        if (centerColors.length > 0) {
          // Use dominant center color as text color
          const dominantTextColor = centerColors.reduce((prev, current) =>
            current.count > prev.count ? current : prev
          );
          textColor = rgbToHex(dominantTextColor.r, dominantTextColor.g, dominantTextColor.b);
        } else {
          // Fallback: Use high-contrast text color based on background luminance
          textColor = luminance > 0.5 ? '#1a1a1a' : '#f8f9fa';
        }

        resolve({ backgroundColor, textColor });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = logoUrl;
  });
}

function addColorSample(
  colors: { r: number; g: number; b: number; count: number }[],
  r: number,
  g: number,
  b: number,
  a: number
) {
  // Skip transparent pixels
  if (a < 200) return;

  // Find existing similar color (within threshold)
  const threshold = 30;
  const existing = colors.find(
    c =>
      Math.abs(c.r - r) < threshold &&
      Math.abs(c.g - g) < threshold &&
      Math.abs(c.b - b) < threshold
  );

  if (existing) {
    existing.count++;
    // Update running average
    existing.r = Math.round((existing.r * (existing.count - 1) + r) / existing.count);
    existing.g = Math.round((existing.g * (existing.count - 1) + g) / existing.count);
    existing.b = Math.round((existing.b * (existing.count - 1) + b) / existing.count);
  } else {
    colors.push({ r, g, b, count: 1 });
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function calculateLuminance(r: number, g: number, b: number): number {
  // Convert to 0-1 range
  const [rs, gs, bs] = [r / 255, g / 255, b / 255];

  // Apply gamma correction
  const [rg, gg, bg] = [rs, gs, bs].map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );

  // Calculate relative luminance
  return 0.2126 * rg + 0.7152 * gg + 0.0722 * bg;
}
