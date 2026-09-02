export const DEFAULT_RIBBON_FIELD = "ribbon";

export function findRibbonField(headers: readonly string[], existingMapping = ""): string {
  const existing = existingMapping.trim();
  const matchingHeader = headers.find((header) => header.trim().toLowerCase() === DEFAULT_RIBBON_FIELD) || "";
  if (existing === DEFAULT_RIBBON_FIELD && !matchingHeader) return "";
  if (existing === DEFAULT_RIBBON_FIELD && matchingHeader) return matchingHeader;
  if (existing) return existing;

  return matchingHeader;
}

export function getOptionalFieldDefaults(
  headers: readonly string[],
  existingMapping?: { ribbon?: string; notes?: string },
): { ribbon: string; notes: string } {
  return {
    ribbon: findRibbonField(headers, existingMapping?.ribbon || ""),
    notes: existingMapping?.notes?.trim() || "",
  };
}