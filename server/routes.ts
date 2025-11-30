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
  productSchema,
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
      
      // Support query parameter for company selection (ONLY for super admins)
      let effectiveCompanyId: number | null;
      const companyIdParam = req.query.companyId;
      
      if (companyIdParam) {
        // SECURITY: Only super admins can query other companies' defaults
        if (user.role !== 'superAdmin') {
          return res.status(403).json({ error: "Forbidden: Only super admins can query other companies' defaults" });
        }
        
        // Use query parameter if provided
        const parsed = parseInt(companyIdParam as string, 10);
        if (isNaN(parsed)) {
          return res.status(400).json({ error: "Invalid companyId parameter" });
        }
        effectiveCompanyId = parsed;
      } else {
        // Otherwise use header-based impersonation or user's company
        effectiveCompanyId = getEffectiveCompanyId(req, user);
      }
      
      // Special case: Superadmin with no company (empty production database)
      // Return sensible defaults so they can access admin UI to create first company
      if (!effectiveCompanyId && user.role === "superAdmin") {
        return res.json({
          defaultTemplate: "modern",
          defaultFieldMapping: {
            product: "",
            sku: "",
            format: "",
            price: "",
            category: "",
            notes: "",
            productImageUrl: "",
          },
          defaultBranding: {
            companyName: "",
            tagline: "",
            logoUrl: "",
            headerBackgroundColor: "",
            headerTextColor: "",
            address: "",
            phone: "",
            email: "",
            website: "",
            footerText: "",
          },
        });
      }
      
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
        logoUrl: branding.logoUrl ?? "",
        headerBackgroundColor: branding.headerBackgroundColor ?? "",
        headerTextColor: branding.headerTextColor ?? "",
        address: branding.address ?? "",
        phone: branding.phone ?? "",
        email: branding.email ?? "",
        website: branding.website ?? "",
        footerText: branding.footerText ?? "",
      };
      
      // Return only default settings (not full company data), with fallbacks
      res.json({
        defaultTemplate: company.defaultTemplate || "modern",
        defaultFieldMapping: normalizedFieldMapping,
        defaultBranding: normalizedBranding,
        defaultSalesAgents: company.defaultSalesAgents || [],
        defaultQRCodeConfig: company.defaultQRCodeConfig || null,
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

      console.log('[PATCH /api/companies/:id] ===== UPDATE COMPANY REQUEST =====');
      console.log('[PATCH /api/companies/:id] Company ID:', id);
      console.log('[PATCH /api/companies/:id] Request body:', JSON.stringify(req.body, null, 2));
      console.log('[PATCH /api/companies/:id] defaultFieldMapping received:', JSON.stringify(req.body.defaultFieldMapping, null, 2));

      const validation = insertCompanySchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        console.log('[PATCH /api/companies/:id] Validation failed:', errorMessage);
        console.log('[PATCH /api/companies/:id] Validation errors:', JSON.stringify(validation.error.errors, null, 2));
        return res.status(400).json({ error: errorMessage });
      }

      console.log('[PATCH /api/companies/:id] Validation succeeded');
      console.log('[PATCH /api/companies/:id] Validated data:', JSON.stringify(validation.data, null, 2));
      console.log('[PATCH /api/companies/:id] Validated defaultFieldMapping:', JSON.stringify(validation.data.defaultFieldMapping, null, 2));

      // Fetch existing company to deep-merge JSON blobs (prevents nulling out existing data)
      const existingCompany = await storage.getCompanyById(id);
      if (!existingCompany) {
        console.log('[PATCH /api/companies/:id] Company not found');
        return res.status(404).json({ error: "Company not found" });
      }

      // Filter out undefined values and deep-merge JSON blobs
      const updates: any = {};
      
      // Copy non-JSON fields directly if defined
      if (validation.data.name !== undefined) updates.name = validation.data.name;
      if (validation.data.domain !== undefined) updates.domain = validation.data.domain;
      if (validation.data.defaultTemplate !== undefined) updates.defaultTemplate = validation.data.defaultTemplate;
      
      // Deep-merge JSON blobs with existing values to prevent accidental nulling
      if (validation.data.defaultFieldMapping !== undefined) {
        updates.defaultFieldMapping = {
          ...(existingCompany.defaultFieldMapping as any || {}),
          ...validation.data.defaultFieldMapping,
        };
      }
      
      if (validation.data.defaultBranding !== undefined) {
        updates.defaultBranding = {
          ...(existingCompany.defaultBranding as any || {}),
          ...validation.data.defaultBranding,
        };
      }
      
      if (validation.data.defaultSalesAgents !== undefined) {
        updates.defaultSalesAgents = validation.data.defaultSalesAgents;
      }

      console.log('[PATCH /api/companies/:id] Updates after deep merge:', JSON.stringify(updates, null, 2));

      const company = await storage.updateCompany(id, updates);
      if (!company) {
        console.log('[PATCH /api/companies/:id] Update failed');
        return res.status(404).json({ error: "Company not found" });
      }

      console.log('[PATCH /api/companies/:id] Update successful');
      console.log('[PATCH /api/companies/:id] Returned company:', JSON.stringify(company, null, 2));
      console.log('[PATCH /api/companies/:id] Returned defaultFieldMapping:', JSON.stringify(company.defaultFieldMapping, null, 2));

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
      
      // Also save branding, sales agents, and QR code as company defaults for future pricelists
      if (finalCompanyId) {
        const companyUpdates: any = {};
        
        // Save branding as company default (if it has meaningful data)
        if (pricelistData.branding && (pricelistData.branding.companyName || pricelistData.branding.logoUrl || pricelistData.branding.headerBackgroundColor)) {
          companyUpdates.defaultBranding = pricelistData.branding;
          console.log("[POST /api/pricelists] Saving branding as company default");
        }
        
        // Save sales agents as company default (if any are defined)
        if (pricelistData.salesAgents && pricelistData.salesAgents.length > 0) {
          companyUpdates.defaultSalesAgents = pricelistData.salesAgents;
          console.log("[POST /api/pricelists] Saving sales agents as company default");
        }
        
        // Save QR code config as company default (if present with valid URL)
        if (pricelistData.qrCode && pricelistData.qrCode.url) {
          companyUpdates.defaultQRCodeConfig = pricelistData.qrCode;
          console.log("[POST /api/pricelists] Saving QR code config as company default");
        }
        
        // Update company defaults if we have any changes
        if (Object.keys(companyUpdates).length > 0) {
          try {
            await storage.updateCompany(finalCompanyId, companyUpdates);
            console.log("[POST /api/pricelists] Company defaults updated successfully");
          } catch (err) {
            console.error("[POST /api/pricelists] Failed to update company defaults:", err);
            // Don't fail the pricelist creation if defaults update fails
          }
        }
      }
      
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

      // Also update company defaults with branding, sales agents, and QR code
      // Use the updated pricelist values to ensure defaults reflect the current state
      const companyId = pricelist.companyId;
      if (companyId) {
        const companyUpdates: any = {};
        
        // Save branding as company default (if it has meaningful data)
        if (pricelist.branding && (pricelist.branding.companyName || pricelist.branding.logoUrl || pricelist.branding.headerBackgroundColor)) {
          companyUpdates.defaultBranding = pricelist.branding;
          console.log("[PATCH /api/pricelists] Saving branding as company default");
        }
        
        // Save sales agents as company default (if any are defined)
        if (pricelist.salesAgents && pricelist.salesAgents.length > 0) {
          companyUpdates.defaultSalesAgents = pricelist.salesAgents;
          console.log("[PATCH /api/pricelists] Saving sales agents as company default");
        }
        
        // Save QR code config as company default (if present with valid URL)
        if (pricelist.qrCode && pricelist.qrCode.url) {
          companyUpdates.defaultQRCodeConfig = pricelist.qrCode;
          console.log("[PATCH /api/pricelists] Saving QR code config as company default");
        }
        
        // Update company defaults if we have any changes
        if (Object.keys(companyUpdates).length > 0) {
          try {
            await storage.updateCompany(companyId, companyUpdates);
            console.log("[PATCH /api/pricelists] Company defaults updated successfully");
          } catch (err) {
            console.error("[PATCH /api/pricelists] Failed to update company defaults:", err);
            // Don't fail the pricelist update if defaults update fails
          }
        }
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
        // Validate reorderedProducts - only require id field for reordering
        // Other fields should already exist from original CSV upload
        const reorderProductSchema = z.object({
          id: z.string(),
          // All other product fields are optional for reorder validation
        }).passthrough(); // Allow additional fields without strict validation
        
        const reorderedProductsSchema = z.array(reorderProductSchema);
        
        const validation = reorderedProductsSchema.safeParse(req.body.reorderedProducts);
        if (!validation.success) {
          console.error('[PATCH /api/brands/products] Validation error:', validation.error);
          return res.status(400).json({ 
            error: "Invalid products array",
            details: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
          });
        }
        
        // Build a map of existing complete products by ID
        const existingProductsMap = new Map(
          latestPricelist.products.map(p => [p.id, p])
        );
        
        // Verify all product IDs exist in the current pricelist
        const reorderedIds = req.body.reorderedProducts.map((p: any) => p.id);
        const invalidIds = reorderedIds.filter((id: string) => !existingProductsMap.has(id));
        
        if (invalidIds.length > 0) {
          return res.status(400).json({
            error: "Invalid product IDs",
            details: `The following product IDs do not exist in the pricelist: ${invalidIds.join(', ')}`
          });
        }
        
        // Reorder existing complete products based on ID order from request
        // This preserves all product fields while applying the new order
        const reorderedCompleteProducts = reorderedIds.map((id: string) => 
          existingProductsMap.get(id)!
        );
        
        // Save the reordered complete products
        await storage.updatePricelist(latestPricelist.id, {
          products: reorderedCompleteProducts,
        });
        
        // Also persist product order to brand registry for each brand
        // Store SKUs (not product IDs) because SKUs are stable across CSV uploads
        // Group products by brand to save productOrder per brand
        const skusByBrand: Record<string, string[]> = {};
        req.body.reorderedProducts.forEach((product: any) => {
          const brandName = product.collectionBrand;
          const sku = product.sku;
          if (brandName && sku) {
            if (!skusByBrand[brandName]) {
              skusByBrand[brandName] = [];
            }
            skusByBrand[brandName].push(sku);
          }
        });
        
        // Update productOrder for each brand in registry (stores SKUs now)
        for (const [brandName, skuList] of Object.entries(skusByBrand)) {
          try {
            // Find existing brand registry entry
            const existingBrand = await storage.getBrandByName(targetCompanyId, brandName);
            
            if (existingBrand) {
              // Update existing brand with productOrder (array of SKUs)
              await storage.updateBrand(existingBrand.id, {
                productOrder: skuList,
              });
            }
            // If brand doesn't exist in registry, we don't create it automatically
            // Brands should be added via the brand registry UI first
          } catch (error) {
            console.error(`[Brand Reorder] Error updating productOrder for brand ${brandName}:`, error);
            // Continue processing other brands even if one fails
          }
        }
        
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

  // Regenerate sortKeys for all products in latest pricelist
  app.post("/api/brands/products/regenerate-sortkeys", isAdmin, async (req: any, res) => {
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

      // Category order: Wine (1), Spirits (2), Cider (3), NonAlc (4)
      // Note: Wine type is NOT included in sortKey so brands are alphabetized across all wine types
      const categoryOrder: Record<string, string> = {
        wine: '1',
        spirits: '2',
        cider: '3',
        nonAlc: '4',
      };

      // Regenerate sortKey (category field) for each product
      const updatedProducts = latestPricelist.products.map((product: any) => {
        const category = product.collectionCategory;
        const brand = product.collectionBrand;

        if (!category || !brand) {
          // If no category or brand, keep original
          return product;
        }

        // Build new sortKey: {categoryNum}-{category}-{brandName}
        // Example: "1-wine-Synchromesh"
        const newSortKey = `${categoryOrder[category]}-${category}-${brand}`;

        return {
          ...product,
          category: newSortKey, // Update the category field which stores the sortKey
        };
      });

      // Save updated pricelist
      await storage.updatePricelist(latestPricelist.id, {
        products: updatedProducts,
      });

      res.json({ 
        success: true, 
        message: `Regenerated sortKeys for ${updatedProducts.length} products` 
      });
    } catch (error) {
      console.error("Error regenerating sortKeys:", error);
      res.status(500).json({ error: "Failed to regenerate sortKeys" });
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
        return res.json({ 
          productsByBrand: {},
          pricelistMeta: null 
        });
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

      // Return products grouped by brand along with pricelist metadata
      res.json({
        productsByBrand,
        pricelistMeta: {
          id: latestPricelist.id,
          name: latestPricelist.name,
          updatedAt: latestPricelist.updatedAt,
          totalProducts: latestPricelist.products.length,
          productsWithoutBrand,
        }
      });
    } catch (error) {
      console.error("Error fetching products by brand:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });
  
  // Get unassigned products (SKUs not mapped to any brand in registry)
  // Returns products from latest pricelist that have SKUs not found in any brand's skus array
  app.get("/api/brands/unassigned", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Determine target company
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

      // Get brand registry with SKU mappings
      const brands = await storage.getBrandsByCompanyId(targetCompanyId);
      
      // Build a Set of all assigned SKUs
      const assignedSkus = new Set<string>();
      for (const brand of brands) {
        if (brand.skus && Array.isArray(brand.skus)) {
          brand.skus.forEach(sku => assignedSkus.add(sku));
        }
      }

      // Get latest pricelist
      const latestPricelist = await storage.getLatestPricelistByCompanyId(targetCompanyId);
      
      if (!latestPricelist || !latestPricelist.products) {
        return res.json({ 
          unassignedProducts: [],
          totalProducts: 0,
          unassignedCount: 0,
          registryHasSKUs: assignedSkus.size > 0,
        });
      }

      // Find products with SKUs not in registry
      const unassignedProducts: Array<{
        sku: string;
        product: string;
        collectionBrand?: string;
        collectionCategory?: string;
      }> = [];

      latestPricelist.products.forEach((product: any) => {
        if (product.sku && !assignedSkus.has(product.sku)) {
          unassignedProducts.push({
            sku: product.sku,
            product: product.product,
            collectionBrand: product.collectionBrand,
            collectionCategory: product.collectionCategory,
          });
        }
      });

      console.log(`[GET /api/brands/unassigned] Total products: ${latestPricelist.products.length}`);
      console.log(`[GET /api/brands/unassigned] Assigned SKUs in registry: ${assignedSkus.size}`);
      console.log(`[GET /api/brands/unassigned] Unassigned products: ${unassignedProducts.length}`);

      res.json({
        unassignedProducts,
        totalProducts: latestPricelist.products.length,
        unassignedCount: unassignedProducts.length,
        registryHasSKUs: assignedSkus.size > 0,
        brands: brands.map(b => ({
          id: b.id,
          brandName: b.brandName,
          category: b.category,
        })),
      });
    } catch (error) {
      console.error("Error fetching unassigned products:", error);
      res.status(500).json({ error: "Failed to fetch unassigned products" });
    }
  });

  // Get brand product ordering for current user's company (Client-accessible for PDF generation)
  app.get("/api/brands/ordering", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const effectiveCompanyId = getEffectiveCompanyId(req, user);
      
      // If no company ID available (super admin without company/impersonation), return empty array
      if (!effectiveCompanyId) {
        return res.json([]);
      }

      // Fetch brands and return only brandName + productOrder (safe for clients)
      const brands = await storage.getBrandsByCompanyId(effectiveCompanyId);
      const brandOrdering = brands.map(b => ({
        brandName: b.brandName,
        productOrder: b.productOrder,
      }));
      
      // Prevent HTTP caching to ensure fresh data after reordering
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(brandOrdering);
    } catch (error) {
      console.error("Error fetching brand ordering:", error);
      res.status(500).json({ error: "Failed to fetch brand ordering" });
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
      let targetCompanyId: number | null = null;
      if (user.role === "superAdmin" && req.query.companyId) {
        targetCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(targetCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        targetCompanyId = getEffectiveCompanyId(req, user);
      }

      // If no company ID available (super admin without company/impersonation), return empty array
      if (!targetCompanyId) {
        return res.json([]);
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

  // Add SKUs to a brand
  app.post("/api/brands/:id/skus", isAdmin, async (req: any, res) => {
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

      // Verify brand exists and belongs to user's company
      const existing = await storage.getBrandById(id);
      if (!existing) {
        return res.status(404).json({ error: "Brand not found" });
      }

      if (user.role !== "superAdmin") {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (effectiveCompanyId && existing.companyId !== effectiveCompanyId) {
          return res.status(403).json({ error: "Access denied: Brand belongs to different company" });
        }
      }

      const { skus } = req.body;
      if (!Array.isArray(skus) || !skus.every(s => typeof s === 'string')) {
        return res.status(400).json({ error: "skus must be an array of strings" });
      }

      // Merge new SKUs with existing ones (no duplicates)
      const existingSkus = existing.skus || [];
      const allSkusSet = new Set([...existingSkus, ...skus]);
      const allSkus = Array.from(allSkusSet);
      
      const brand = await storage.updateBrand(id, { skus: allSkus });
      res.json(brand);
    } catch (error) {
      console.error("Error adding SKUs to brand:", error);
      res.status(500).json({ error: "Failed to add SKUs to brand" });
    }
  });

  // Remove SKUs from a brand
  app.delete("/api/brands/:id/skus", isAdmin, async (req: any, res) => {
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

      // Verify brand exists and belongs to user's company
      const existing = await storage.getBrandById(id);
      if (!existing) {
        return res.status(404).json({ error: "Brand not found" });
      }

      if (user.role !== "superAdmin") {
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (effectiveCompanyId && existing.companyId !== effectiveCompanyId) {
          return res.status(403).json({ error: "Access denied: Brand belongs to different company" });
        }
      }

      const { skus } = req.body;
      if (!Array.isArray(skus) || !skus.every(s => typeof s === 'string')) {
        return res.status(400).json({ error: "skus must be an array of strings" });
      }

      // Remove specified SKUs from existing ones
      const existingSkus = existing.skus || [];
      const skusToRemove = new Set(skus);
      const remainingSkus = existingSkus.filter(s => !skusToRemove.has(s));
      
      const brand = await storage.updateBrand(id, { skus: remainingSkus });
      res.json(brand);
    } catch (error) {
      console.error("Error removing SKUs from brand:", error);
      res.status(500).json({ error: "Failed to remove SKUs from brand" });
    }
  });

  // Get all SKU→Brand mappings for a company (for CSV upload resolution)
  app.get("/api/brands/sku-mappings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let effectiveCompanyId: number | null = null;
      if (user.role === "superAdmin" && req.query.companyId) {
        effectiveCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(effectiveCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        effectiveCompanyId = getEffectiveCompanyId(req, user);
      }

      if (!effectiveCompanyId) {
        return res.json({ mappings: {}, brands: [] });
      }

      const brands = await storage.getBrandsByCompanyId(effectiveCompanyId);
      
      // Build SKU→Brand lookup map
      const mappings: Record<string, { brandId: number; brandName: string; category: string }> = {};
      for (const brand of brands) {
        if (brand.skus && Array.isArray(brand.skus)) {
          for (const sku of brand.skus) {
            mappings[sku] = {
              brandId: brand.id,
              brandName: brand.brandName,
              category: brand.category,
            };
          }
        }
      }

      res.json({ 
        mappings,
        brands: brands.map(b => ({
          id: b.id,
          brandName: b.brandName,
          category: b.category,
          displayOrder: b.displayOrder,
          skuCount: b.skus?.length || 0,
        })),
        isEmpty: brands.length === 0,
      });
    } catch (error) {
      console.error("Error fetching SKU mappings:", error);
      res.status(500).json({ error: "Failed to fetch SKU mappings" });
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
