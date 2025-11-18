import { z } from "zod";
import { sql } from 'drizzle-orm';
import { pgTable, varchar, text, timestamp, jsonb, serial, index, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Product schema for pricelist items
export const productSchema = z.object({
  id: z.string(),
  category: z.string(), // Producer/winery name or category
  notes: z.string().optional(), // Notes/Order column
  product: z.string(), // Product name/description
  sku: z.string(),
  format: z.string(), // Package format (e.g., "12 x 750 ml")
  price: z.string(), // Price as string to preserve formatting
  productImageUrl: z.string().optional(), // Product image URL for thumbnail display
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
  headerBackgroundColor: z.string().optional(), // Extracted from logo or manually set
  headerTextColor: z.string().optional(), // Extracted from logo or manually set
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
  productImageUrl: z.string().optional(), // CSV column name for product image URL
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

// Template types and configuration
export const templateSchema = z.enum(["modern", "classic", "minimal"]);
export type Template = z.infer<typeof templateSchema>;

export const templateConfigSchema = z.object({
  template: templateSchema.default("modern"),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

// Complete pricelist configuration
export const pricelistConfigSchema = z.object({
  branding: companyBrandingSchema,
  salesAgents: z.array(salesAgentSchema).max(2).default([]),
  qrCode: qrCodeConfigSchema.optional(),
  products: z.array(productSchema).default([]),
  dateUpdated: z.string().optional(),
  template: templateSchema.default("modern"),
});

export type PricelistConfig = z.infer<typeof pricelistConfigSchema>;

// CSV upload response
export const csvUploadResponseSchema = z.object({
  headers: z.array(z.string()),
  rowCount: z.number(),
  preview: z.array(z.record(z.string(), z.string())).max(5),
});

export type CSVUploadResponse = z.infer<typeof csvUploadResponseSchema>;

// Database Tables

// ===== AUTH TABLES (Required by Replit Auth) =====

// Session storage table for Replit Auth
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// ===== COMPANIES TABLE =====

// Companies table - stores company configuration for client users
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull().unique(), // Email domain (e.g., "example.com")
  
  // Default configuration for this company
  defaultTemplate: varchar("default_template", { length: 50 }).notNull().default("modern").$type<Template>(),
  defaultFieldMapping: jsonb("default_field_mapping").$type<FieldMapping>(),
  defaultBranding: jsonb("default_branding").$type<CompanyBranding>(),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Company = typeof companies.$inferSelect;

export const insertCompanySchema = createInsertSchema(companies, {
  name: z.string().min(1, "Company name is required"),
  domain: z.string().min(1, "Domain is required").regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain format (e.g., example.com)"),
  defaultTemplate: templateSchema,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCompany = z.infer<typeof insertCompanySchema>;

export const updateCompanySchema = insertCompanySchema.partial().extend({
  domain: z.string().min(1).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain format").optional(),
});

// ===== USERS TABLE =====

// User storage table for Replit Auth + company association
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(), // Email is required
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  
  // Company association
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'set null' }),
  role: varchar("role", { length: 50 }).notNull().default("client"), // "admin" or "client"
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

// Schemas for user operations
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Valid email is required"),
  role: z.enum(["superAdmin", "admin", "client"]),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;

// User management schema for admin
export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyId: z.number().nullable().optional(),
  role: z.enum(["superAdmin", "admin", "client"]).optional(),
});

// ===== PRICELISTS TABLE =====

// Saved pricelists table
export const pricelists = pgTable("pricelists", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Company association (optional - admin pricelists won't have companyId)
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }),
  
  // Configuration data stored as JSON
  branding: jsonb("branding").notNull().$type<CompanyBranding>(),
  salesAgents: jsonb("sales_agents").notNull().$type<SalesAgent[]>(),
  qrCode: jsonb("qr_code").$type<QRCodeConfig>(),
  products: jsonb("products").notNull().$type<Product[]>(),
  fieldMapping: jsonb("field_mapping").$type<FieldMapping>(),
  template: varchar("template", { length: 50 }).notNull().default("modern").$type<Template>(),
  categoryFilter: varchar("category_filter", { length: 255 }), // null = ALL categories, otherwise filter to specific category
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Pricelist = typeof pricelists.$inferSelect;

// Hand-crafted insert schema with proper validation
export const insertPricelistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  branding: companyBrandingSchema,
  salesAgents: z.array(salesAgentSchema).max(2).default([]),
  qrCode: qrCodeConfigSchema.optional(),
  products: z.array(productSchema).default([]),
  fieldMapping: fieldMappingSchema.optional(),
  template: templateSchema.default("modern"),
  categoryFilter: z.string().nullable().optional(), // null = ALL categories, otherwise filter to specific category
});

export type InsertPricelist = z.infer<typeof insertPricelistSchema>;

// Company Profile table for reusable company branding
export const companyProfiles = pgTable("company_profiles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // Profile name (e.g., "Primary Company", "Secondary Brand")
  branding: jsonb("branding").notNull().$type<CompanyBranding>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CompanyProfile = typeof companyProfiles.$inferSelect;

export const insertCompanyProfileSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  branding: z.object({
    companyName: z.string().min(1, "Company name is required"),
    tagline: z.string().optional(),
    logoUrl: z.string().optional(),
  }),
});

export type InsertCompanyProfile = z.infer<typeof insertCompanyProfileSchema>;

// Update schema for PATCH operations - allows partial branding updates
export const updateCompanyProfileSchema = insertCompanyProfileSchema.partial().extend({
  branding: z.object({
    companyName: z.string().min(1).optional(),
    tagline: z.string().optional(),
    logoUrl: z.string().optional(),
  }).partial().optional(),
});

// Sales Agent Profile table for reusable sales agent configurations
export const salesAgentProfiles = pgTable("sales_agent_profiles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // Profile name (e.g., "West Coast Team", "East Coast Team")
  agents: jsonb("agents").notNull().$type<SalesAgent[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SalesAgentProfile = typeof salesAgentProfiles.$inferSelect;

export const insertSalesAgentProfileSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  agents: z.array(z.object({
    name: z.string().min(1, "Agent name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().min(1, "Phone number is required"),
    region: z.string().optional(),
  })).min(1, "At least one agent is required").max(2, "Maximum 2 agents allowed"),
});

export type InsertSalesAgentProfile = z.infer<typeof insertSalesAgentProfileSchema>;
