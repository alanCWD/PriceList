import { db } from "../db";
import { pricelists, type InsertPricelist, type Pricelist } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Pricelist operations
  getAllPricelists(): Promise<Pricelist[]>;
  getPricelistById(id: number): Promise<Pricelist | undefined>;
  createPricelist(pricelist: InsertPricelist): Promise<Pricelist>;
  updatePricelist(id: number, pricelist: Partial<InsertPricelist>): Promise<Pricelist | undefined>;
  deletePricelist(id: number): Promise<boolean>;
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
    const result = await db.insert(pricelists).values(pricelist).returning();
    return result[0]!;
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
}

export const storage = new DatabaseStorage();
