// Auth utility functions
// Based on blueprint: javascript_log_in_with_replit

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

// Extract domain from email (e.g., "user@example.com" -> "example.com")
export function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1] : '';
}

// Validate if email matches allowed domain
export function validateEmailDomain(email: string, allowedDomain: string): boolean {
  const domain = extractDomain(email);
  return domain.toLowerCase() === allowedDomain.toLowerCase();
}
