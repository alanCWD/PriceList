/**
 * Strips HTML tags and decodes HTML entities from text.
 * Designed for cleaning Wix CSV exports that contain HTML markup.
 * Works in all environments (browser, Node, tests).
 */
export function stripHtml(text: string): string {
  if (!text) return "";
  
  let cleaned = text;
  
  // Remove script and style blocks entirely (including content)
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  cleaned = decodeHtmlEntities(cleaned);
  
  return cleaned.trim();
}

/**
 * Decodes common HTML entities to their text equivalents.
 */
function decodeHtmlEntities(text: string): string {
  // Common named entities
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&euro;': '€',
    '&pound;': '£',
    '&yen;': '¥',
  };
  
  // Replace named entities
  let decoded = text;
  for (const [entity, char] of Object.entries(namedEntities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  
  // Decode numeric entities (&#123; and &#x7B;)
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });
  
  return decoded;
}
