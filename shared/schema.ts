import { z } from "zod";

// Product schema for pricelist items
export const productSchema = z.object({
  id: z.string(),
  category: z.string(), // Producer/winery name or category
  notes: z.string().optional(), // Notes/Order column
  product: z.string(), // Product name/description
  sku: z.string(),
  format: z.string(), // Package format (e.g., "12 x 750 ml")
  price: z.string(), // Price as string to preserve formatting
});

export type Product = z.infer<typeof productSchema>;

// Sales agent schema
export const salesAgentSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  region: z.string().optional(), // e.g., "South Vancouver Island"
});

export type SalesAgent = z.infer<typeof salesAgentSchema>;

// Company branding schema
export const companyBrandingSchema = z.object({
  companyName: z.string(),
  tagline: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type CompanyBranding = z.infer<typeof companyBrandingSchema>;

// QR code configuration
export const qrCodeConfigSchema = z.object({
  url: z.string().url(),
  size: z.number().default(80),
});

export type QRCodeConfig = z.infer<typeof qrCodeConfigSchema>;

// Field mapping for CSV import
export const fieldMappingSchema = z.object({
  category: z.string().optional(), // CSV column name for category
  notes: z.string().optional(),
  product: z.string(),
  sku: z.string(),
  format: z.string(),
  price: z.string(),
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

// Complete pricelist configuration
export const pricelistConfigSchema = z.object({
  branding: companyBrandingSchema,
  salesAgents: z.array(salesAgentSchema).max(2).default([]),
  qrCode: qrCodeConfigSchema.optional(),
  products: z.array(productSchema).default([]),
  dateUpdated: z.string().optional(),
});

export type PricelistConfig = z.infer<typeof pricelistConfigSchema>;

// CSV upload response
export const csvUploadResponseSchema = z.object({
  headers: z.array(z.string()),
  rowCount: z.number(),
  preview: z.array(z.record(z.string(), z.string())).max(5),
});

export type CSVUploadResponse = z.infer<typeof csvUploadResponseSchema>;
