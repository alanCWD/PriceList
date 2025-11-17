import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { 
  insertPricelistSchema, 
  insertCompanyProfileSchema,
  updateCompanyProfileSchema,
  insertSalesAgentProfileSchema,
  insertCompanySchema,
  updateUserSchema,
  type Pricelist
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ===== COMPANY MANAGEMENT ROUTES (Admin Only) =====
  
  app.get("/api/companies", isAdmin, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const company = await storage.getCompanyById(id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(company);
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", isAdmin, async (req, res) => {
    try {
      const validation = insertCompanySchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const company = await storage.createCompany(validation.data);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const validation = insertCompanySchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const company = await storage.updateCompany(id, validation.data);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(company);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const success = await storage.deleteCompany(id);
      if (!success) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // ===== USER MANAGEMENT ROUTES (Admin Only) =====
  
  app.get("/api/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id", isAdmin, async (req, res) => {
    try {
      const id = req.params.id;

      const validation = updateUserSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const user = await storage.updateUser(id, validation.data);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Get all pricelists (authenticated, scoped to user's company for clients)
  app.get("/api/pricelists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Admin can see all pricelists, clients only see their company's
      let pricelists: Pricelist[];
      if (user.role === "admin") {
        pricelists = await storage.getAllPricelists();
      } else if (user.companyId) {
        pricelists = await storage.getPricelistsByCompanyId(user.companyId);
      } else {
        pricelists = [];
      }
      
      res.json(pricelists);
    } catch (error) {
      console.error("Error fetching pricelists:", error);
      res.status(500).json({ error: "Failed to fetch pricelists" });
    }
  });

  // Get a specific pricelist (authenticated, with company access check)
  app.get("/api/pricelists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricelist ID" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const pricelist = await storage.getPricelistById(id);
      if (!pricelist) {
        return res.status(404).json({ error: "Pricelist not found" });
      }
      
      // Access control: admin sees all, clients only see their company's pricelists
      if (user.role !== "admin" && pricelist.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(pricelist);
    } catch (error) {
      console.error("Error fetching pricelist:", error);
      res.status(500).json({ error: "Failed to fetch pricelist" });
    }
  });

  // Create a new pricelist (authenticated, with company enforcement)
  app.post("/api/pricelists", isAuthenticated, async (req: any, res) => {
    try {
      console.log("[POST /api/pricelists] Request received, body size:", JSON.stringify(req.body).length, "bytes");
      console.log("[POST /api/pricelists] Starting validation...");
      
      // SECURITY: ALWAYS load user from database, NEVER trust session claims for authorization
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const validation = insertPricelistSchema.safeParse(req.body);
      if (!validation.success) {
        console.log("[POST /api/pricelists] Validation failed:", validation.error);
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      // SECURITY: Clients CANNOT provide companyId - it's always set to their company
      // Admins can optionally provide companyId (or leave null)
      const requestedCompanyId = (validation.data as any).companyId;
      
      if (user.role !== "admin" && requestedCompanyId && requestedCompanyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied: You cannot create pricelists for other companies" });
      }
      
      const pricelistData: any = {
        ...validation.data,
        // Force companyId based on database user role
        companyId: user.role === "admin" ? requestedCompanyId : user.companyId,
      };

      console.log("[POST /api/pricelists] Validation passed, creating pricelist...");
      const pricelist = await storage.createPricelist(pricelistData);
      console.log("[POST /api/pricelists] Pricelist created successfully, ID:", pricelist.id);
      res.status(201).json(pricelist);
    } catch (error) {
      console.error("[POST /api/pricelists] Error creating pricelist:", error);
      res.status(500).json({ error: "Failed to create pricelist" });
    }
  });

  // Update a pricelist (authenticated, with ownership check)
  app.patch("/api/pricelists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricelist ID" });
      }

      // SECURITY: ALWAYS load user from database, NEVER trust session claims for authorization
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // SECURITY: Check existing pricelist ownership BEFORE allowing any updates
      const existingPricelist = await storage.getPricelistById(id);
      if (!existingPricelist) {
        return res.status(404).json({ error: "Pricelist not found" });
      }

      // SECURITY: Verify ownership using database user role, not session
      // Admin can edit any pricelist, clients can only edit their company's
      if (user.role !== "admin" && existingPricelist.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied: You can only update your company's pricelists" });
      }

      const validation = insertPricelistSchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      // SECURITY: Clients CANNOT change companyId at all
      const updateData: any = { ...validation.data };
      if (user.role !== "admin") {
        delete updateData.companyId; // Force remove - clients cannot change company
      }

      const pricelist = await storage.updatePricelist(id, updateData);
      if (!pricelist) {
        return res.status(500).json({ error: "Failed to update pricelist" });
      }

      res.json(pricelist);
    } catch (error) {
      console.error("Error updating pricelist:", error);
      res.status(500).json({ error: "Failed to update pricelist" });
    }
  });

  // Delete a pricelist (authenticated, admin or owner only)
  app.delete("/api/pricelists/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricelist ID" });
      }

      // SECURITY: ALWAYS load user from database, NEVER trust session claims for authorization
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // SECURITY: Check existing pricelist ownership BEFORE allowing deletion
      const existingPricelist = await storage.getPricelistById(id);
      if (!existingPricelist) {
        return res.status(404).json({ error: "Pricelist not found" });
      }

      // SECURITY: Verify ownership using database user role, not session
      // Admin can delete any pricelist, clients can only delete their company's
      if (user.role !== "admin" && existingPricelist.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied: You can only delete your company's pricelists" });
      }

      const success = await storage.deletePricelist(id);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete pricelist" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pricelist:", error);
      res.status(500).json({ error: "Failed to delete pricelist" });
    }
  });

  // Company Profile routes
  app.get("/api/company-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllCompanyProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching company profiles:", error);
      res.status(500).json({ error: "Failed to fetch company profiles" });
    }
  });

  app.post("/api/company-profiles", async (req, res) => {
    try {
      const validation = insertCompanyProfileSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const profile = await storage.createCompanyProfile(validation.data);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating company profile:", error);
      res.status(500).json({ error: "Failed to create company profile" });
    }
  });

  app.patch("/api/company-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const validation = updateCompanyProfileSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      // Get existing profile to merge data
      const existing = await storage.getCompanyProfileById(id);
      if (!existing) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // Merge branding data if partially updating
      const updatedData = {
        name: validation.data.name || existing.name,
        branding: validation.data.branding 
          ? { ...existing.branding, ...validation.data.branding }
          : existing.branding,
      };

      const profile = await storage.updateCompanyProfile(id, updatedData);
      if (!profile) {
        return res.status(500).json({ error: "Failed to update profile" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error updating company profile:", error);
      res.status(500).json({ error: "Failed to update company profile" });
    }
  });

  app.delete("/api/company-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      // Verify profile exists before attempting deletion
      const existing = await storage.getCompanyProfileById(id);
      if (!existing) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const success = await storage.deleteCompanyProfile(id);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete profile" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company profile:", error);
      res.status(500).json({ error: "Failed to delete company profile" });
    }
  });

  // Sales Agent Profile routes
  app.get("/api/sales-agent-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllSalesAgentProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching sales agent profiles:", error);
      res.status(500).json({ error: "Failed to fetch sales agent profiles" });
    }
  });

  app.post("/api/sales-agent-profiles", async (req, res) => {
    try {
      const validation = insertSalesAgentProfileSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const profile = await storage.createSalesAgentProfile(validation.data);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating sales agent profile:", error);
      res.status(500).json({ error: "Failed to create sales agent profile" });
    }
  });

  app.patch("/api/sales-agent-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      const validation = insertSalesAgentProfileSchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      // Get existing profile to verify it exists
      const existing = await storage.getSalesAgentProfileById(id);
      if (!existing) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // For agents array, replace entirely if provided (don't merge individual agents)
      const updatedData = {
        name: validation.data.name || existing.name,
        agents: validation.data.agents || existing.agents,
      };

      const profile = await storage.updateSalesAgentProfile(id, updatedData);
      if (!profile) {
        return res.status(500).json({ error: "Failed to update profile" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error updating sales agent profile:", error);
      res.status(500).json({ error: "Failed to update sales agent profile" });
    }
  });

  app.delete("/api/sales-agent-profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid profile ID" });
      }

      // Verify profile exists before attempting deletion
      const existing = await storage.getSalesAgentProfileById(id);
      if (!existing) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const success = await storage.deleteSalesAgentProfile(id);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete profile" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sales agent profile:", error);
      res.status(500).json({ error: "Failed to delete sales agent profile" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
