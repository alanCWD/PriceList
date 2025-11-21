import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, requireSuperAdmin, requireCompanyScopedAdmin } from "./replitAuth";
import { z } from "zod";
import { 
  insertPricelistSchema, 
  insertCompanyProfileSchema,
  updateCompanyProfileSchema,
  insertSalesAgentProfileSchema,
  insertCompanySchema,
  insertUserSchema,
  updateUserSchema,
  insertBrandRegistrySchema,
  updateBrandRegistrySchema,
  type Pricelist,
  type User
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";

// Helper to get effective company ID (supports Super Admin impersonation)
function getEffectiveCompanyId(req: Request, user: User): number | null {
  // Super Admin can impersonate companies via header
  if (user.role === "superAdmin") {
    const impersonatedId = req.headers["x-impersonated-company-id"];
    if (impersonatedId && typeof impersonatedId === "string") {
      const parsed = parseInt(impersonatedId, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    // Super Admin with no impersonation header returns null (access to all)
    return null;
  }
  
  // Regular users use their assigned company
  return user.companyId || null;
}

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

  // ===== CLIENT COMPANY ROUTES (Authenticated Users) =====
  
  app.get("/api/companies/defaults", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get effective company ID (supports Super Admin impersonation)
      const effectiveCompanyId = getEffectiveCompanyId(req, user);
      
      if (!effectiveCompanyId) {
        return res.status(404).json({ error: "Company not specified" });
      }
      
      const company = await storage.getCompanyById(effectiveCompanyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      
      // Always normalize all defaults to ensure complete data (handles legacy/null data)
      const normalizedFieldMapping = {
        product: (company.defaultFieldMapping as any)?.product || "",
        sku: (company.defaultFieldMapping as any)?.sku || "",
        format: (company.defaultFieldMapping as any)?.format || "",
        price: (company.defaultFieldMapping as any)?.price || "",
        category: (company.defaultFieldMapping as any)?.category || "",
        notes: (company.defaultFieldMapping as any)?.notes || "",
        productImageUrl: (company.defaultFieldMapping as any)?.productImageUrl || "",
      };
      
      // Normalize branding to full CompanyBranding shape with per-field coalescing
      const branding: any = company.defaultBranding ?? {};
      const normalizedBranding = {
        companyName: branding.companyName ?? "",
        tagline: branding.tagline ?? "",
      };
      
      // Return only default settings (not full company data), with fallbacks
      res.json({
        defaultTemplate: company.defaultTemplate || "modern",
        defaultFieldMapping: normalizedFieldMapping,
        defaultBranding: normalizedBranding,
      });
    } catch (error) {
      console.error("Error fetching company defaults:", error);
      res.status(500).json({ error: "Failed to fetch company defaults" });
    }
  });

  // ===== COMPANY MANAGEMENT ROUTES (Super Admin Only) =====
  
  app.get("/api/companies", requireSuperAdmin, async (req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", requireSuperAdmin, async (req, res) => {
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

  app.post("/api/companies", requireSuperAdmin, async (req, res) => {
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

  app.patch("/api/companies/:id", requireSuperAdmin, async (req, res) => {
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

  app.delete("/api/companies/:id", requireSuperAdmin, async (req, res) => {
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

  // ===== USER MANAGEMENT ROUTES (Super Admin Only) =====
  
  app.get("/api/users", requireSuperAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireSuperAdmin, async (req, res) => {
    try {
      // Extend insertUserSchema to require firstName and lastName for admin creation
      const adminCreateUserSchema = insertUserSchema.extend({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
      });

      // Validate request body using Zod schema
      const validation = adminCreateUserSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const { email, firstName, lastName, role, companyId } = validation.data;

      // Normalize email for domain comparison (storage will also normalize)
      const normalizedEmail = email.trim().toLowerCase();
      
      // Validate email domain matches company if company is selected
      if (companyId) {
        const company = await storage.getCompanyById(companyId);
        if (!company) {
          return res.status(400).json({ error: "Invalid company ID" });
        }

        const emailDomain = normalizedEmail.split('@')[1];
        if (!emailDomain || emailDomain !== company.domain.toLowerCase()) {
          return res.status(400).json({ error: `Email domain must match company domain: @${company.domain}` });
        }
      }

      const user = await storage.createUser({
        email: normalizedEmail,
        firstName,
        lastName,
        role,
        companyId: companyId ?? null,
      });

      res.status(201).json(user);
    } catch (error: any) {
      console.error("Error creating user:", error);
      
      // Handle duplicate email error with specific message
      if (error.message?.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = req.params.id;

      const validation = updateUserSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const updates = { ...validation.data };

      // Normalize email if being updated
      if (updates.email) {
        updates.email = updates.email.trim().toLowerCase();
      }

      // Get current user for domain validation
      const currentUser = await storage.getUser(id);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine the final role and companyId after update
      const finalRole = updates.role || currentUser.role;
      const finalCompanyId = updates.companyId !== undefined ? updates.companyId : currentUser.companyId;
      
      // Normalize finalEmail to ensure consistent domain validation
      const finalEmail = updates.email || currentUser.email.trim().toLowerCase();

      // Business rule: client users must have a company assignment
      if (finalRole === "client" && !finalCompanyId) {
        return res.status(400).json({ error: "Client users must be assigned to a company. Change role to admin or assign a company." });
      }

      // Validate domain if company is being set or user has/will have a company
      if (finalCompanyId) {
        const company = await storage.getCompanyById(finalCompanyId);
        if (!company) {
          return res.status(400).json({ error: "Invalid company ID" });
        }

        const emailDomain = finalEmail.split('@')[1]?.toLowerCase();
        if (!emailDomain || emailDomain !== company.domain.toLowerCase()) {
          return res.status(400).json({ error: `Email domain must match company domain: @${company.domain}` });
        }
      }

      // Duplicate email check is handled by storage layer's unique constraint
      // If email is being updated to an existing one, database will reject it

      const user = await storage.updateUser(id, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error: any) {
      console.error("Error updating user:", error);
      
      // Handle duplicate email error
      if (error.message?.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = req.params.id;

      const success = await storage.deleteUser(id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Get latest pricelist for user's company (authenticated)
  app.get("/api/pricelists/latest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get effective company ID (supports Super Admin impersonation)
      const effectiveCompanyId = getEffectiveCompanyId(req, user);
      
      if (!effectiveCompanyId) {
        return res.status(404).json({ error: "Company not specified" });
      }
      
      const pricelist = await storage.getLatestPricelistByCompanyId(effectiveCompanyId);
      
      if (!pricelist) {
        return res.status(404).json({ error: "No pricelist found" });
      }
      
      res.json(pricelist);
    } catch (error) {
      console.error("Error fetching latest pricelist:", error);
      res.status(500).json({ error: "Failed to fetch latest pricelist" });
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
      
      // Admin/Super Admin can see all pricelists, clients only see their company's
      let pricelists: Pricelist[];
      if (user.role === "admin" || user.role === "superAdmin") {
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
      
      // Access control: admin/superAdmin sees all, clients only see their company's pricelists
      if (user.role !== "admin" && user.role !== "superAdmin" && pricelist.companyId !== user.companyId) {
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
      // Admins/Super Admins can optionally provide companyId (or leave null/use impersonation)
      const requestedCompanyId = (validation.data as any).companyId;
      const isAdminOrSuperAdmin = user.role === "admin" || user.role === "superAdmin";
      
      if (!isAdminOrSuperAdmin && requestedCompanyId && requestedCompanyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied: You cannot create pricelists for other companies" });
      }
      
      // Determine final company ID: explicit request > impersonation > user's company
      let finalCompanyId: number | null;
      if (isAdminOrSuperAdmin) {
        // Admins/SuperAdmins: use explicit request, or fallback to effective (which handles impersonation)
        finalCompanyId = requestedCompanyId || getEffectiveCompanyId(req, user);
      } else {
        // Clients: always use their company
        finalCompanyId = user.companyId;
      }
      
      // SECURITY: Require a valid company ID for all pricelists
      if (!finalCompanyId) {
        return res.status(400).json({ error: "Company ID is required. Please specify a company or select one via impersonation." });
      }
      
      const pricelistData: any = {
        ...validation.data,
        companyId: finalCompanyId,
      };

      console.log("[POST /api/pricelists] Validation passed, creating pricelist...");
      console.log("[POST /api/pricelists] categoryFilter in validation.data:", validation.data.categoryFilter);
      console.log("[POST /api/pricelists] categoryFilter in pricelistData:", pricelistData.categoryFilter);
      const pricelist = await storage.createPricelist(pricelistData);
      console.log("[POST /api/pricelists] categoryFilter in created pricelist:", pricelist.categoryFilter);
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
      // Admin/Super Admin can edit any pricelist, clients can only edit their company's
      if (user.role !== "admin" && user.role !== "superAdmin" && existingPricelist.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied: You can only update your company's pricelists" });
      }

      const validation = insertPricelistSchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      // SECURITY: Clients CANNOT change companyId at all
      const updateData: any = { ...validation.data };
      if (user.role !== "admin" && user.role !== "superAdmin") {
        delete updateData.companyId; // Force remove - clients cannot change company
      }

      console.log("[PATCH /api/pricelists] categoryFilter in validation.data:", validation.data.categoryFilter);
      console.log("[PATCH /api/pricelists] categoryFilter in updateData:", updateData.categoryFilter);
      const pricelist = await storage.updatePricelist(id, updateData);
      console.log("[PATCH /api/pricelists] categoryFilter in updated pricelist:", pricelist?.categoryFilter);
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
      // Admin/Super Admin can delete any pricelist, clients can only delete their company's
      if (user.role !== "admin" && user.role !== "superAdmin" && existingPricelist.companyId !== user.companyId) {
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

  // Company Profile routes (Super Admin only - these are reusable shared entities)
  app.get("/api/company-profiles", requireSuperAdmin, async (req, res) => {
    try {
      const profiles = await storage.getAllCompanyProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching company profiles:", error);
      res.status(500).json({ error: "Failed to fetch company profiles" });
    }
  });

  app.post("/api/company-profiles", requireSuperAdmin, async (req, res) => {
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

  app.patch("/api/company-profiles/:id", requireSuperAdmin, async (req, res) => {
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

  app.delete("/api/company-profiles/:id", requireSuperAdmin, async (req, res) => {
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

  // Sales Agent Profile routes (Super Admin only - these are reusable shared entities)
  app.get("/api/sales-agent-profiles", requireSuperAdmin, async (req, res) => {
    try {
      const profiles = await storage.getAllSalesAgentProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching sales agent profiles:", error);
      res.status(500).json({ error: "Failed to fetch sales agent profiles" });
    }
  });

  app.post("/api/sales-agent-profiles", requireSuperAdmin, async (req, res) => {
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

  app.patch("/api/sales-agent-profiles/:id", requireSuperAdmin, async (req, res) => {
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

  app.delete("/api/sales-agent-profiles/:id", requireSuperAdmin, async (req, res) => {
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

  // ===== BRAND REGISTRY ROUTES (Admin & Company Admin) =====

  // Update products in latest pricelist (type and/or order)
  app.patch("/api/brands/products", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine target company
      let targetCompanyId: number;
      if (user.role === "superAdmin" && req.body.companyId) {
        targetCompanyId = parseInt(req.body.companyId);
        if (isNaN(targetCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (!effectiveCompanyId) {
          return res.status(400).json({ error: "No company associated with user" });
        }
        targetCompanyId = effectiveCompanyId;
      }

      // Get latest pricelist
      const latestPricelist = await storage.getLatestPricelistByCompanyId(targetCompanyId);
      
      if (!latestPricelist) {
        return res.status(404).json({ error: "No pricelist found for this company" });
      }

      // Debug: log what we received
      console.log('[PATCH /api/brands/products] Request body keys:', Object.keys(req.body));
      console.log('[PATCH /api/brands/products] Has reorderedProducts?', 'reorderedProducts' in req.body);
      console.log('[PATCH /api/brands/products] reorderedProducts type:', typeof req.body.reorderedProducts);
      console.log('[PATCH /api/brands/products] reorderedProducts length:', req.body.reorderedProducts?.length);

      // Check if this is a bulk reorder (reorderedProducts array) or single update (productId + updates)
      if (req.body.reorderedProducts && Array.isArray(req.body.reorderedProducts)) {
        // Bulk reorder: replace entire products array with new order
        await storage.updatePricelist(latestPricelist.id, {
          products: req.body.reorderedProducts,
        });
        res.json({ success: true });
      } else {
        // Single product update
        const { productId, updates } = req.body;
        
        if (!productId) {
          return res.status(400).json({ error: "Product ID is required" });
        }

        // Update the product in the products array
        const updatedProducts = latestPricelist.products.map((p: any) => {
          if (p.id === productId) {
            return { ...p, ...updates };
          }
          return p;
        });

        // Save updated pricelist
        await storage.updatePricelist(latestPricelist.id, {
          products: updatedProducts,
        });

        res.json({ success: true });
      }
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  // Get products grouped by brand from latest pricelist
  // Returns products from the most recent pricelist for the company
  app.get("/api/brands/products", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine target company (Super Admin can specify, others use their own)
      let targetCompanyId: number;
      if (user.role === "superAdmin" && req.query.companyId) {
        targetCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(targetCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (!effectiveCompanyId) {
          return res.status(400).json({ error: "No company associated with user" });
        }
        targetCompanyId = effectiveCompanyId;
      }

      // Get latest pricelist for this company
      const latestPricelist = await storage.getLatestPricelistByCompanyId(targetCompanyId);
      
      if (!latestPricelist || !latestPricelist.products) {
        return res.json({}); // Return empty object if no pricelist exists
      }

      // Group products by brand
      const productsByBrand: Record<string, any[]> = {};
      let productsWithoutBrand = 0;
      
      latestPricelist.products.forEach((product: any) => {
        const brandName = product.collectionBrand;
        if (brandName) {
          if (!productsByBrand[brandName]) {
            productsByBrand[brandName] = [];
          }
          productsByBrand[brandName].push(product);
        } else {
          productsWithoutBrand++;
        }
      });

      console.log(`[GET /api/brands/products] Total products: ${latestPricelist.products.length}`);
      console.log(`[GET /api/brands/products] Products without brand: ${productsWithoutBrand}`);
      console.log(`[GET /api/brands/products] Brands found: ${Object.keys(productsByBrand).length}`);
      console.log(`[GET /api/brands/products] Brand names:`, Object.keys(productsByBrand));

      res.json(productsByBrand);
    } catch (error) {
      console.error("Error fetching products by brand:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });
  
  // Get brands for current user's company (Admin & Company Admin)
  // Super Admins can optionally pass companyId query parameter to view any company's brands
  app.get("/api/brands", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Debug logging
      console.log('[GET /api/brands] User role:', user.role);
      console.log('[GET /api/brands] Query params:', req.query);
      console.log('[GET /api/brands] companyId param:', req.query.companyId);

      // Super Admins can query brands for any company via companyId query param
      let targetCompanyId: number;
      if (user.role === "superAdmin" && req.query.companyId) {
        targetCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(targetCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (!effectiveCompanyId) {
          return res.status(400).json({ error: "No company associated with user" });
        }
        targetCompanyId = effectiveCompanyId;
      }

      const brands = await storage.getBrandsByCompanyId(targetCompanyId);
      res.json(brands);
    } catch (error) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ error: "Failed to fetch brands" });
    }
  });

  // Create a new brand (Admin & Company Admin)
  // Super Admins can pass companyId in request body to create brands for any company
  app.post("/api/brands", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Super Admins can create brands for any company via companyId in request body
      let targetCompanyId: number;
      if (user.role === "superAdmin" && req.body.companyId) {
        targetCompanyId = parseInt(req.body.companyId);
        if (isNaN(targetCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (!effectiveCompanyId) {
          return res.status(400).json({ error: "No company associated with user" });
        }
        targetCompanyId = effectiveCompanyId;
      }

      // Validate request body
      const validation = insertBrandRegistrySchema.safeParse({
        ...req.body,
        companyId: targetCompanyId,
      });
      
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const brand = await storage.createBrand(validation.data);
      res.status(201).json(brand);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Error creating brand:", error);
      res.status(500).json({ error: "Failed to create brand" });
    }
  });

  // Update a brand (Admin & Company Admin)
  // Super Admins can update brands for any company
  app.patch("/api/brands/:id", isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid brand ID" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // SECURITY: Verify brand belongs to user's company (unless Super Admin)
      const existing = await storage.getBrandById(id);
      if (!existing) {
        return res.status(404).json({ error: "Brand not found" });
      }

      if (user.role !== "super_admin") {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (effectiveCompanyId && existing.companyId !== effectiveCompanyId) {
          return res.status(403).json({ error: "Access denied: Brand belongs to different company" });
        }
      }

      // Validate request body
      const validation = updateBrandRegistrySchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const brand = await storage.updateBrand(id, validation.data);
      if (!brand) {
        return res.status(500).json({ error: "Failed to update brand" });
      }

      res.json(brand);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Error updating brand:", error);
      res.status(500).json({ error: "Failed to update brand" });
    }
  });

  // Delete a brand (Admin & Company Admin)
  // Super Admins can delete brands for any company
  app.delete("/api/brands/:id", isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid brand ID" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // SECURITY: Verify brand belongs to user's company (unless Super Admin)
      const existing = await storage.getBrandById(id);
      if (!existing) {
        return res.status(404).json({ error: "Brand not found" });
      }

      if (user.role !== "super_admin") {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (effectiveCompanyId && existing.companyId !== effectiveCompanyId) {
          return res.status(403).json({ error: "Access denied: Brand belongs to different company" });
        }
      }

      const success = await storage.deleteBrand(id);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete brand" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting brand:", error);
      res.status(500).json({ error: "Failed to delete brand" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
