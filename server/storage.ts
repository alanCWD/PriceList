import { db } from "../db";
import { 
  pricelists, 
  type InsertPricelist, 
  type Pricelist,
  companyProfiles,
  type InsertCompanyProfile,
  type CompanyProfile,
  salesAgentProfiles,
  type InsertSalesAgentProfile,
  type SalesAgentProfile,
  users,
  type User,
  type UpsertUser,
  companies,
  type Company,
  type InsertCompany,
  type Role,
  brandRegistry,
  type BrandRegistry,
  type InsertBrandRegistry,
  type UpdateBrandRegistry,
  productVisibility,
  type ProductVisibility,
  type InsertProductVisibility,
} from "@shared/schema";
import { eq, desc, and, asc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (required by Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User | undefined>;
  createUser(user: { email: string; firstName: string; lastName: string; role: Role; companyId: number | null }): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  
  // Company operations
  getAllCompanies(): Promise<Company[]>;
  getCompanyById(id: number): Promise<Company | undefined>;
  getCompanyByDomain(domain: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: number): Promise<boolean>;
  
  // Pricelist operations
  getAllPricelists(): Promise<Pricelist[]>;
  getPricelistById(id: number): Promise<Pricelist | undefined>;
  getPricelistsByCompanyId(companyId: number): Promise<Pricelist[]>;
  getLatestPricelistByCompanyId(companyId: number): Promise<Pricelist | undefined>;
  createPricelist(pricelist: InsertPricelist): Promise<Pricelist>;
  updatePricelist(id: number, pricelist: Partial<InsertPricelist>): Promise<Pricelist | undefined>;
  deletePricelist(id: number): Promise<boolean>;
  
  // Company Profile operations
  getAllCompanyProfiles(): Promise<CompanyProfile[]>;
  getCompanyProfileById(id: number): Promise<CompanyProfile | undefined>;
  createCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfile>;
  updateCompanyProfile(id: number, profile: Partial<InsertCompanyProfile>): Promise<CompanyProfile | undefined>;
  deleteCompanyProfile(id: number): Promise<boolean>;
  
  // Sales Agent Profile operations
  getAllSalesAgentProfiles(): Promise<SalesAgentProfile[]>;
  getSalesAgentProfileById(id: number): Promise<SalesAgentProfile | undefined>;
  createSalesAgentProfile(profile: InsertSalesAgentProfile): Promise<SalesAgentProfile>;
  updateSalesAgentProfile(id: number, profile: Partial<InsertSalesAgentProfile>): Promise<SalesAgentProfile | undefined>;
  deleteSalesAgentProfile(id: number): Promise<boolean>;
  
  // Brand Registry operations
  getBrandsByCompanyId(companyId: number): Promise<BrandRegistry[]>;
  getBrandById(id: number): Promise<BrandRegistry | undefined>;
  getBrandByName(companyId: number, brandName: string): Promise<BrandRegistry | undefined>;
  createBrand(brand: InsertBrandRegistry): Promise<BrandRegistry>;
  updateBrand(id: number, brand: UpdateBrandRegistry): Promise<BrandRegistry | undefined>;
  deleteBrand(id: number): Promise<boolean>;
  
  // Product Visibility operations
  getVisibilityByCompanyId(companyId: number): Promise<ProductVisibility[]>;
  getVisibilityBySku(companyId: number, sku: string): Promise<ProductVisibility | undefined>;
  upsertVisibility(companyId: number, sku: string, isHidden: boolean): Promise<ProductVisibility>;
  getHiddenSkusByCompanyId(companyId: number): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (required by Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.email, // Handle conflicts on email unique constraint
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user!;
  }

  async getAllUsers(): Promise<User[]> {
    const results = await db.select().from(users).orderBy(desc(users.createdAt));
    return results;
  }

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User | undefined> {
    // Normalize email if being updated
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.email) {
      normalizedUpdates.email = normalizedUpdates.email.trim().toLowerCase();
      
      // Check for duplicate email
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedUpdates.email))
        .limit(1);
      
      if (existing.length > 0 && existing[0].id !== id) {
        throw new Error("A user with this email already exists");
      }
    }
    
    // Trim firstName and lastName if being updated
    if (normalizedUpdates.firstName) {
      normalizedUpdates.firstName = normalizedUpdates.firstName.trim();
    }
    if (normalizedUpdates.lastName) {
      normalizedUpdates.lastName = normalizedUpdates.lastName.trim();
    }
    
    const [user] = await db
      .update(users)
      .set({ ...normalizedUpdates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createUser(user: { email: string; firstName: string; lastName: string; role: Role; companyId: number | null }): Promise<User> {
    // Normalize email (trim and lowercase) to ensure consistency
    const normalizedEmail = user.email.trim().toLowerCase();
    
    // Check for duplicate email
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    
    if (existing.length > 0) {
      throw new Error("A user with this email already exists");
    }
    
    // Let database generate UUID via default(sql`gen_random_uuid()`)
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        firstName: user.firstName.trim(),
        lastName: user.lastName.trim(),
        role: user.role,
        companyId: user.companyId,
      })
      .returning();
    
    return newUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    
    return result.length > 0;
  }

  // Company operations
  async getAllCompanies(): Promise<Company[]> {
    const results = await db.select().from(companies).orderBy(desc(companies.createdAt));
    return results;
  }

  async getCompanyById(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getCompanyByDomain(domain: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.domain, domain));
    return company;
  }

  async createCompany(companyData: InsertCompany): Promise<Company> {
    // SECURITY: Normalize domain to lowercase to prevent case sensitivity issues
    const normalizedData = {
      ...companyData,
      domain: companyData.domain.toLowerCase(),
    };
    const [company] = await db.insert(companies).values(normalizedData as any).returning();
    return company!;
  }

  async updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    // SECURITY: Normalize domain to lowercase if being updated
    const normalizedUpdates: any = {
      ...updates,
      updatedAt: new Date(),
    };
    if (updates.domain) {
      normalizedUpdates.domain = updates.domain.toLowerCase();
    }
    const [company] = await db
      .update(companies)
      .set(normalizedUpdates)
      .where(eq(companies.id, id))
      .returning();
    return company;
  }

  async deleteCompany(id: number): Promise<boolean> {
    const result = await db.delete(companies).where(eq(companies.id, id)).returning();
    return result.length > 0;
  }

  // Pricelist operations
  async getAllPricelists(): Promise<Pricelist[]> {
    const results = await db.select().from(pricelists);
    // Sort by creation date, most recent first
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async getPricelistsByCompanyId(companyId: number): Promise<Pricelist[]> {
    const results = await db.select().from(pricelists).where(eq(pricelists.companyId, companyId));
    // Sort by creation date, most recent first
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getLatestPricelistByCompanyId(companyId: number): Promise<Pricelist | undefined> {
    const results = await db
      .select()
      .from(pricelists)
      .where(eq(pricelists.companyId, companyId))
      .orderBy(desc(pricelists.createdAt))
      .limit(1);
    return results[0];
  }

  async getPricelistById(id: number): Promise<Pricelist | undefined> {
    const result = await db.select().from(pricelists).where(eq(pricelists.id, id));
    return result[0];
  }

  async createPricelist(pricelist: InsertPricelist): Promise<Pricelist> {
    console.log("[Storage] createPricelist: Starting database insert...");
    console.log("[Storage] createPricelist: Pricelist data size:", JSON.stringify(pricelist).length, "bytes");
    console.log("[Storage] createPricelist: Products count:", pricelist.products?.length || 0);
    console.log("[Storage] createPricelist: categoryFilter value:", pricelist.categoryFilter);
    
    try {
      const result = await Promise.race([
        db.insert(pricelists).values(pricelist).returning(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database insert timeout after 30 seconds')), 30000)
        )
      ]) as Pricelist[];
      
      console.log("[Storage] createPricelist: Insert completed successfully");
      console.log("[Storage] createPricelist: Returned categoryFilter:", result[0]?.categoryFilter);
      return result[0]!;
    } catch (error) {
      console.error("[Storage] createPricelist: Insert failed with error:", error);
      throw error;
    }
  }

  async updatePricelist(id: number, updates: Partial<InsertPricelist>): Promise<Pricelist | undefined> {
    console.log("[Storage] updatePricelist: categoryFilter in updates:", updates.categoryFilter);
    const result = await db
      .update(pricelists)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pricelists.id, id))
      .returning();
    console.log("[Storage] updatePricelist: Returned categoryFilter:", result[0]?.categoryFilter);
    return result[0];
  }

  async deletePricelist(id: number): Promise<boolean> {
    const result = await db.delete(pricelists).where(eq(pricelists.id, id)).returning();
    return result.length > 0;
  }
  
  // Company Profile operations
  async getAllCompanyProfiles(): Promise<CompanyProfile[]> {
    const results = await db.select().from(companyProfiles);
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  
  async getCompanyProfileById(id: number): Promise<CompanyProfile | undefined> {
    const result = await db.select().from(companyProfiles).where(eq(companyProfiles.id, id));
    return result[0];
  }
  
  async createCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfile> {
    const result = await db.insert(companyProfiles).values(profile).returning();
    return result[0]!;
  }
  
  async updateCompanyProfile(id: number, updates: Partial<InsertCompanyProfile>): Promise<CompanyProfile | undefined> {
    const result = await db
      .update(companyProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(companyProfiles.id, id))
      .returning();
    return result[0];
  }
  
  async deleteCompanyProfile(id: number): Promise<boolean> {
    const result = await db.delete(companyProfiles).where(eq(companyProfiles.id, id)).returning();
    return result.length > 0;
  }
  
  // Sales Agent Profile operations
  async getAllSalesAgentProfiles(): Promise<SalesAgentProfile[]> {
    const results = await db.select().from(salesAgentProfiles);
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  
  async getSalesAgentProfileById(id: number): Promise<SalesAgentProfile | undefined> {
    const result = await db.select().from(salesAgentProfiles).where(eq(salesAgentProfiles.id, id));
    return result[0];
  }
  
  async createSalesAgentProfile(profile: InsertSalesAgentProfile): Promise<SalesAgentProfile> {
    const result = await db.insert(salesAgentProfiles).values(profile).returning();
    return result[0]!;
  }
  
  async updateSalesAgentProfile(id: number, updates: Partial<InsertSalesAgentProfile>): Promise<SalesAgentProfile | undefined> {
    const result = await db
      .update(salesAgentProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(salesAgentProfiles.id, id))
      .returning();
    return result[0];
  }
  
  async deleteSalesAgentProfile(id: number): Promise<boolean> {
    const result = await db.delete(salesAgentProfiles).where(eq(salesAgentProfiles.id, id)).returning();
    return result.length > 0;
  }
  
  // Brand Registry operations
  async getBrandsByCompanyId(companyId: number): Promise<BrandRegistry[]> {
    const results = await db
      .select()
      .from(brandRegistry)
      .where(eq(brandRegistry.companyId, companyId))
      .orderBy(
        sql`CASE ${brandRegistry.category}
          WHEN 'wine' THEN 1
          WHEN 'spirits' THEN 2
          WHEN 'cider' THEN 3
          WHEN 'nonAlc' THEN 4
        END`,
        asc(brandRegistry.displayOrder),
        asc(brandRegistry.brandName)
      );
    return results;
  }
  
  async getBrandById(id: number): Promise<BrandRegistry | undefined> {
    const result = await db.select().from(brandRegistry).where(eq(brandRegistry.id, id));
    return result[0];
  }
  
  async getBrandByName(companyId: number, brandName: string): Promise<BrandRegistry | undefined> {
    const result = await db
      .select()
      .from(brandRegistry)
      .where(
        and(
          eq(brandRegistry.companyId, companyId),
          eq(brandRegistry.brandName, brandName)
        )
      )
      .limit(1);
    return result[0];
  }
  
  async createBrand(brand: InsertBrandRegistry): Promise<BrandRegistry> {
    // Check for duplicate brand name in same company
    const existing = await db
      .select()
      .from(brandRegistry)
      .where(
        and(
          eq(brandRegistry.companyId, brand.companyId),
          eq(brandRegistry.brandName, brand.brandName)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      throw new Error(`Brand "${brand.brandName}" already exists for this company`);
    }
    
    const result = await db.insert(brandRegistry).values(brand).returning();
    return result[0]!;
  }
  
  async updateBrand(id: number, updates: UpdateBrandRegistry): Promise<BrandRegistry | undefined> {
    // If brandName is being updated, check for duplicates
    if (updates.brandName) {
      const current = await this.getBrandById(id);
      if (!current) {
        return undefined;
      }
      
      const existing = await db
        .select()
        .from(brandRegistry)
        .where(
          and(
            eq(brandRegistry.companyId, current.companyId),
            eq(brandRegistry.brandName, updates.brandName)
          )
        )
        .limit(1);
      
      if (existing.length > 0 && existing[0].id !== id) {
        throw new Error(`Brand "${updates.brandName}" already exists for this company`);
      }
    }
    
    const result = await db
      .update(brandRegistry)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(brandRegistry.id, id))
      .returning();
    return result[0];
  }
  
  async deleteBrand(id: number): Promise<boolean> {
    const result = await db.delete(brandRegistry).where(eq(brandRegistry.id, id)).returning();
    return result.length > 0;
  }
  
  // Product Visibility operations
  async getVisibilityByCompanyId(companyId: number): Promise<ProductVisibility[]> {
    return await db
      .select()
      .from(productVisibility)
      .where(eq(productVisibility.companyId, companyId));
  }
  
  async getVisibilityBySku(companyId: number, sku: string): Promise<ProductVisibility | undefined> {
    const results = await db
      .select()
      .from(productVisibility)
      .where(
        and(
          eq(productVisibility.companyId, companyId),
          eq(productVisibility.sku, sku)
        )
      )
      .limit(1);
    return results[0];
  }
  
  async upsertVisibility(companyId: number, sku: string, isHidden: boolean): Promise<ProductVisibility> {
    // Check if visibility record exists
    const existing = await this.getVisibilityBySku(companyId, sku);
    
    if (existing) {
      // Update existing record
      const result = await db
        .update(productVisibility)
        .set({ isHidden, updatedAt: new Date() })
        .where(eq(productVisibility.id, existing.id))
        .returning();
      return result[0]!;
    } else {
      // Create new record
      const result = await db
        .insert(productVisibility)
        .values({ companyId, sku, isHidden })
        .returning();
      return result[0]!;
    }
  }
  
  async getHiddenSkusByCompanyId(companyId: number): Promise<string[]> {
    const results = await db
      .select({ sku: productVisibility.sku })
      .from(productVisibility)
      .where(
        and(
          eq(productVisibility.companyId, companyId),
          eq(productVisibility.isHidden, true)
        )
      );
    return results.map(r => r.sku);
  }
}

export const storage = new DatabaseStorage();
