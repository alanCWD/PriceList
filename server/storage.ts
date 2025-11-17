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
  type SalesAgentProfile
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Pricelist operations
  getAllPricelists(): Promise<Pricelist[]>;
  getPricelistById(id: number): Promise<Pricelist | undefined>;
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
}

export class DatabaseStorage implements IStorage {
  async getAllPricelists(): Promise<Pricelist[]> {
    const results = await db.select().from(pricelists);
    // Sort by most recent first
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getPricelistById(id: number): Promise<Pricelist | undefined> {
    const result = await db.select().from(pricelists).where(eq(pricelists.id, id));
    return result[0];
  }

  async createPricelist(pricelist: InsertPricelist): Promise<Pricelist> {
    console.log("[Storage] createPricelist: Starting database insert...");
    console.log("[Storage] createPricelist: Pricelist data size:", JSON.stringify(pricelist).length, "bytes");
    console.log("[Storage] createPricelist: Products count:", pricelist.products?.length || 0);
    
    try {
      const result = await Promise.race([
        db.insert(pricelists).values(pricelist).returning(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database insert timeout after 30 seconds')), 30000)
        )
      ]) as Pricelist[];
      
      console.log("[Storage] createPricelist: Insert completed successfully");
      return result[0]!;
    } catch (error) {
      console.error("[Storage] createPricelist: Insert failed with error:", error);
      throw error;
    }
  }

  async updatePricelist(id: number, updates: Partial<InsertPricelist>): Promise<Pricelist | undefined> {
    const result = await db
      .update(pricelists)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pricelists.id, id))
      .returning();
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
}

export const storage = new DatabaseStorage();
