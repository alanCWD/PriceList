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
  type InsertCompany
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // User operations (required by Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User | undefined>;
  createUser(user: { email: string; firstName: string; lastName: string; role: "admin" | "client"; companyId: number | null }): Promise<User>;
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
  // User operations (required by Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
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

  async createUser(user: { email: string; firstName: string; lastName: string; role: "admin" | "client"; companyId: number | null }): Promise<User> {
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
    // Sort by most recent first
    return results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  
  async getPricelistsByCompanyId(companyId: number): Promise<Pricelist[]> {
    const results = await db.select().from(pricelists).where(eq(pricelists.companyId, companyId));
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
}

export const storage = new DatabaseStorage();
