import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, requireSuperAdmin, requireCompanyScopedAdmin } from "./replitAuth";
import { z } from "zod";
import bcrypt from "bcrypt";
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

  // Email/password login endpoint
  const loginSchema = z.object({
    email: z.string().email("Valid email required"),
    password: z.string().min(1, "Password required"),
  });

  app.post('/api/auth/login', async (req: any, res) => {
    try {
      // Validate request body
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid email or password" });
      }

      const { email, password } = validation.data;
      const normalizedEmail = email.toLowerCase();

      // Find user by email
      const user = await storage.getUserByEmail(normalizedEmail);
      if (!user) {
        // Generic error to avoid revealing whether email exists
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Check if user has a password set
      if (!user.password) {
        return res.status(401).json({ error: "Password login not enabled for this account. Please use Google Sign-In." });
      }

      // Validate password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Validate company still exists (if user has one)
      if (user.companyId) {
        const company = await storage.getCompanyById(user.companyId);
        if (!company) {
          return res.status(401).json({ error: "Your company account has been deleted. Please contact your administrator." });
        }
      }

      // Create session with OIDC-like structure for compatibility
      const sessionTtl = 7 * 24 * 60 * 60; // 1 week in seconds
      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
        },
        access_token: null,
        refresh_token: null,
        expires_at: Math.floor(Date.now() / 1000) + sessionTtl,
        isPasswordLogin: true,
      };

      // Log the user in using passport's req.login
      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("Login session error:", err);
          return res.status(500).json({ error: "Failed to create session" });
        }
        
        // Return user info (without password)
        const { password: _, ...safeUser } = user;
        res.json({ 
          success: true, 
          user: safeUser 
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
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
      // Include companyId so client can verify data provenance when switching companies
      res.json({
        companyId: effectiveCompanyId,
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

  // Set password for a user (Super Admin only)
  const setPasswordSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters"),
  });

  app.post("/api/users/:id/password", requireSuperAdmin, async (req, res) => {
    try {
      const id = req.params.id;

      const validation = setPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const { password } = validation.data;

      // Verify user exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user's password
      await storage.updateUserPassword(id, hashedPassword);

      res.json({ success: true, message: "Password set successfully" });
    } catch (error) {
      console.error("Error setting user password:", error);
      res.status(500).json({ error: "Failed to set password" });
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
      
      // Determine effective company ID
      // Priority: query param > header impersonation > user's company
      let effectiveCompanyId: number | null = null;
      
      if (req.query.companyId) {
        const parsed = parseInt(req.query.companyId as string, 10);
        if (!isNaN(parsed)) {
          effectiveCompanyId = parsed;
        }
      } else {
        effectiveCompanyId = getEffectiveCompanyId(req, user);
      }
      
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

      // Preserve isHidden settings from previous pricelist when uploading new CSV
      // Match products by SKU and copy the isHidden flag from the previous pricelist
      try {
        const previousPricelist = await storage.getLatestPricelistByCompanyId(finalCompanyId);
        if (previousPricelist && previousPricelist.products && pricelistData.products) {
          // Build SKU → isHidden map from previous pricelist
          const skuVisibilityMap = new Map<string, boolean>();
          for (const product of previousPricelist.products) {
            if (product.sku && product.isHidden !== undefined) {
              skuVisibilityMap.set(product.sku, product.isHidden);
            }
          }
          
          // Apply isHidden values to matching SKUs in new products
          let preservedCount = 0;
          pricelistData.products = pricelistData.products.map((product: any) => {
            if (product.sku && skuVisibilityMap.has(product.sku)) {
              const previousIsHidden = skuVisibilityMap.get(product.sku);
              if (previousIsHidden) {
                preservedCount++;
                return { ...product, isHidden: true };
              }
            }
            return product;
          });
          
          if (preservedCount > 0) {
            console.log(`[POST /api/pricelists] Preserved isHidden settings for ${preservedCount} products from previous pricelist`);
          }
        }
      } catch (err) {
        console.log("[POST /api/pricelists] No previous pricelist found or error getting it:", err);
        // Continue without preserving settings - this is not a critical failure
      }

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

        // Find the product to get its SKU
        const product = latestPricelist.products.find((p: any) => p.id === productId);
        if (!product) {
          return res.status(404).json({ error: "Product not found" });
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

        // If isHidden was updated, also persist to the visibility table for cross-upload persistence
        if (updates.isHidden !== undefined && product.sku) {
          try {
            await storage.upsertVisibility(targetCompanyId, product.sku, updates.isHidden);
            console.log(`[Visibility] Persisted visibility for SKU ${product.sku}: isHidden=${updates.isHidden}`);
          } catch (visErr) {
            console.error(`[Visibility] Failed to persist visibility for SKU ${product.sku}:`, visErr);
            // Don't fail the request - pricelist was updated successfully
          }
        }

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

      // SECURITY: Determine target company with strict validation
      // Super Admins MUST provide explicit companyId - never fall back to impersonation for brand routes
      let targetCompanyId: number;
      
      if (user.role === "superAdmin") {
        // Super Admin: REQUIRE explicit companyId query parameter
        if (!req.query.companyId) {
          return res.status(400).json({ error: "companyId query parameter is required for Super Admins" });
        }
        targetCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(targetCompanyId) || targetCompanyId <= 0) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        // Regular admin: use their company
        const effectiveCompanyId = getEffectiveCompanyId(req, user);
        if (!effectiveCompanyId) {
          return res.status(400).json({ error: "No company associated with user" });
        }
        targetCompanyId = effectiveCompanyId;
      }

      // Get specific pricelist if ID provided, otherwise get latest
      let targetPricelist: Pricelist | undefined;
      if (req.query.pricelistId) {
        const pricelistId = parseInt(req.query.pricelistId as string);
        if (isNaN(pricelistId) || pricelistId <= 0) {
          return res.status(400).json({ error: "Invalid pricelist ID" });
        }
        targetPricelist = await storage.getPricelistById(pricelistId);
        
        // SECURITY: Verify pricelist exists AND belongs to the target company
        if (!targetPricelist) {
          return res.status(404).json({ error: "Pricelist not found" });
        }
        if (targetPricelist.companyId !== targetCompanyId) {
          return res.status(403).json({ error: "Access denied: Pricelist does not belong to this company" });
        }
      } else {
        targetPricelist = await storage.getLatestPricelistByCompanyId(targetCompanyId);
        // DEFENSE-IN-DEPTH: Verify storage returned correct company's data
        if (targetPricelist && targetPricelist.companyId !== targetCompanyId) {
          console.error(`[SECURITY] Storage returned pricelist ${targetPricelist.id} for wrong company (expected ${targetCompanyId}, got ${targetPricelist.companyId})`);
          return res.status(500).json({ error: "Internal error: data integrity check failed" });
        }
      }
      
      // Empty state is valid - company simply has no pricelists yet
      if (!targetPricelist || !targetPricelist.products) {
        return res.json({ 
          productsByBrand: {},
          pricelistMeta: null 
        });
      }

      // Get brand registry with SKU mappings for this company
      const brands = await storage.getBrandsByCompanyId(targetCompanyId);
      
      // Fetch hidden SKUs for this company to apply visibility status
      const hiddenSkus = await storage.getHiddenSkusByCompanyId(targetCompanyId);
      const hiddenSkuSet = new Set(hiddenSkus);
      
      // Build SKU → brandName lookup map from registry
      const skuToBrand = new Map<string, string>();
      for (const brand of brands) {
        if (brand.skus && Array.isArray(brand.skus)) {
          for (const sku of brand.skus) {
            skuToBrand.set(sku, brand.brandName);
          }
        }
      }
      
      const registryHasSKUs = skuToBrand.size > 0;

      // Group products by brand using SKU-only matching from brand registry
      // Products only appear if their SKU exists in the registry - no fallbacks
      const productsByBrand: Record<string, any[]> = {};
      let productsWithoutBrand = 0;
      let skuMatched = 0;
      
      targetPricelist.products.forEach((product: any) => {
        // SKU-only matching: product must have a SKU that exists in brand registry
        if (product.sku) {
          const brandName = skuToBrand.get(product.sku);
          if (brandName) {
            if (!productsByBrand[brandName]) {
              productsByBrand[brandName] = [];
            }
            // Apply hidden status based on visibility table
            const isHidden = hiddenSkuSet.has(product.sku);
            productsByBrand[brandName].push({ ...product, isHidden });
            skuMatched++;
          } else {
            productsWithoutBrand++;
          }
        } else {
          productsWithoutBrand++;
        }
      });

      console.log(`[GET /api/brands/products] Total products: ${targetPricelist.products.length}`);
      console.log(`[GET /api/brands/products] Registry SKU mappings: ${skuToBrand.size}`);
      console.log(`[GET /api/brands/products] SKU-matched: ${skuMatched}`);
      console.log(`[GET /api/brands/products] Products without brand (unassigned): ${productsWithoutBrand}`);
      console.log(`[GET /api/brands/products] Brands found: ${Object.keys(productsByBrand).length}`);

      // Return products grouped by brand along with pricelist metadata
      res.json({
        productsByBrand,
        pricelistMeta: {
          id: targetPricelist.id,
          name: targetPricelist.name,
          updatedAt: targetPricelist.updatedAt,
          totalProducts: targetPricelist.products.length,
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

      // SECURITY: Determine target company with strict validation
      // Super Admins MUST provide explicit companyId - never fall back to impersonation for brand routes
      let targetCompanyId: number;
      
      if (user.role === "superAdmin") {
        // Super Admin: REQUIRE explicit companyId query parameter
        if (!req.query.companyId) {
          return res.status(400).json({ error: "companyId query parameter is required for Super Admins" });
        }
        targetCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(targetCompanyId) || targetCompanyId <= 0) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        // Regular admin: use their company
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

      // Get specific pricelist if ID provided, otherwise get latest
      let targetPricelist: Pricelist | undefined;
      if (req.query.pricelistId) {
        const pricelistId = parseInt(req.query.pricelistId as string);
        if (isNaN(pricelistId) || pricelistId <= 0) {
          return res.status(400).json({ error: "Invalid pricelist ID" });
        }
        targetPricelist = await storage.getPricelistById(pricelistId);
        
        // SECURITY: Verify pricelist exists AND belongs to the target company
        if (!targetPricelist) {
          return res.status(404).json({ error: "Pricelist not found" });
        }
        if (targetPricelist.companyId !== targetCompanyId) {
          return res.status(403).json({ error: "Access denied: Pricelist does not belong to this company" });
        }
      } else {
        targetPricelist = await storage.getLatestPricelistByCompanyId(targetCompanyId);
        // DEFENSE-IN-DEPTH: Verify storage returned correct company's data
        if (targetPricelist && targetPricelist.companyId !== targetCompanyId) {
          console.error(`[SECURITY] Storage returned pricelist ${targetPricelist.id} for wrong company (expected ${targetCompanyId}, got ${targetPricelist.companyId})`);
          return res.status(500).json({ error: "Internal error: data integrity check failed" });
        }
      }
      
      // Empty state is valid - company simply has no pricelists yet
      if (!targetPricelist || !targetPricelist.products) {
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

      targetPricelist.products.forEach((product: any) => {
        if (product.sku && !assignedSkus.has(product.sku)) {
          unassignedProducts.push({
            sku: product.sku,
            product: product.product,
            collectionBrand: product.collectionBrand,
            collectionCategory: product.collectionCategory,
          });
        }
      });

      console.log(`[GET /api/brands/unassigned] Total products: ${targetPricelist.products.length}`);
      console.log(`[GET /api/brands/unassigned] Assigned SKUs in registry: ${assignedSkus.size}`);
      console.log(`[GET /api/brands/unassigned] Unassigned products: ${unassignedProducts.length}`);

      res.json({
        unassignedProducts,
        totalProducts: targetPricelist.products.length,
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
  // Super Admins can pass companyId query parameter to view any company's brand ordering
  app.get("/api/brands/ordering", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Super Admins can query for any company via companyId query param
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

      // Fetch brands and return ordering data (safe for clients)
      // Includes category, displayOrder for brand sorting, productOrder for product sorting, and skus for SKU-based matching
      const brands = await storage.getBrandsByCompanyId(targetCompanyId);
      const brandOrdering = brands.map(b => ({
        brandName: b.brandName,
        category: b.category,
        displayOrder: b.displayOrder,
        productOrder: b.productOrder,
        skus: b.skus || [], // Include SKUs for client-side brand matching
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

  // Get hidden SKUs for the current user's company (accessible to all authenticated users)
  // Returns an array of SKUs that should be hidden from pricelists
  // Super Admins can pass companyId query parameter to view any company's hidden SKUs
  app.get("/api/visibility/hidden-skus", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Super Admins can query for any company via companyId query param
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

      // Fetch hidden SKUs from the persistent visibility table
      const hiddenSkus = await storage.getHiddenSkusByCompanyId(targetCompanyId);
      
      // Prevent HTTP caching to ensure fresh data
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(hiddenSkus);
    } catch (error) {
      console.error("Error fetching hidden SKUs:", error);
      res.status(500).json({ error: "Failed to fetch hidden SKUs" });
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

      if (user.role !== "superAdmin") {
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

      if (user.role !== "superAdmin") {
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

  // Backfill brand registry SKUs from latest pricelist (Super Admin only - one-time migration)
  // This populates the skus column based on product brand matching in the latest pricelist
  app.post("/api/brands/backfill-skus", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Only Super Admins can run this migration
      if (user.role !== "superAdmin") {
        return res.status(403).json({ error: "Only Super Admins can run this migration" });
      }

      // Get target company ID from query param or request body
      const targetCompanyId = req.body.companyId || req.query.companyId;
      if (!targetCompanyId) {
        return res.status(400).json({ error: "companyId is required" });
      }

      const companyId = parseInt(targetCompanyId);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      console.log(`[Backfill SKUs] Starting backfill for company ${companyId}`);

      // Get the latest pricelist for the company
      const latestPricelist = await storage.getLatestPricelistByCompanyId(companyId);
      if (!latestPricelist || !latestPricelist.products) {
        return res.status(404).json({ error: "No pricelist found for this company" });
      }

      // Get all brands for the company
      const brands = await storage.getBrandsByCompanyId(companyId);
      if (brands.length === 0) {
        return res.status(404).json({ error: "No brands found for this company" });
      }

      console.log(`[Backfill SKUs] Found ${brands.length} brands and ${latestPricelist.products.length} products`);

      // Build brand name → SKUs map from pricelist products
      // Match products to brands by comparing collection brand name
      const brandSkuMap: Record<string, string[]> = {};
      for (const brand of brands) {
        brandSkuMap[brand.brandName.toLowerCase()] = [];
      }

      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const product of latestPricelist.products) {
        const productBrand = (product as any).collectionBrand || '';
        const productSku = (product as any).sku;
        
        if (!productSku) {
          continue; // Skip products without SKU
        }

        // Try exact match first
        const lowerBrand = productBrand.toLowerCase();
        if (brandSkuMap[lowerBrand] !== undefined) {
          brandSkuMap[lowerBrand].push(productSku);
          matchedCount++;
        } else {
          // Try to find brand by partial match (brand name in product name or collection)
          let matched = false;
          for (const brand of brands) {
            const brandNameLower = brand.brandName.toLowerCase();
            const productNameLower = ((product as any).product || '').toLowerCase();
            
            if (productNameLower.includes(brandNameLower)) {
              brandSkuMap[brandNameLower].push(productSku);
              matchedCount++;
              matched = true;
              break;
            }
          }
          if (!matched) {
            unmatchedCount++;
          }
        }
      }

      console.log(`[Backfill SKUs] Matched ${matchedCount} products, ${unmatchedCount} unmatched`);

      // Update each brand with its SKUs
      let updatedCount = 0;
      for (const brand of brands) {
        const skus = brandSkuMap[brand.brandName.toLowerCase()];
        if (skus && skus.length > 0) {
          // Remove duplicates
          const uniqueSkus = Array.from(new Set(skus));
          await storage.updateBrand(brand.id, { 
            skus: uniqueSkus,
            productOrder: uniqueSkus // Also update productOrder to use real SKUs
          });
          updatedCount++;
          console.log(`[Backfill SKUs] Updated ${brand.brandName} with ${uniqueSkus.length} SKUs`);
        }
      }

      res.json({
        success: true,
        brandsUpdated: updatedCount,
        productsMatched: matchedCount,
        productsUnmatched: unmatchedCount,
        totalBrands: brands.length,
      });
    } catch (error) {
      console.error("Error backfilling SKUs:", error);
      res.status(500).json({ error: "Failed to backfill SKUs" });
    }
  });

  // ========================================
  // Brand Registry Export/Import Endpoints
  // ========================================

  // Export Brand Registry - returns all brand data and hidden SKUs as JSON
  app.get("/api/brands/export", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Super Admins can export for any company via companyId query param
      let targetCompanyId: number | null = null;
      if (user.role === "superAdmin" && req.query.companyId) {
        targetCompanyId = parseInt(req.query.companyId as string);
        if (isNaN(targetCompanyId)) {
          return res.status(400).json({ error: "Invalid company ID" });
        }
      } else {
        targetCompanyId = getEffectiveCompanyId(req, user);
      }

      if (!targetCompanyId) {
        return res.status(400).json({ error: "No company associated with user" });
      }

      // Fetch all brands for the company
      const brands = await storage.getBrandsByCompanyId(targetCompanyId);
      
      // Fetch hidden SKUs
      const hiddenSkus = await storage.getHiddenSkusByCompanyId(targetCompanyId);

      // Get company info for the export
      const company = await storage.getCompanyById(targetCompanyId);

      // Build export data structure
      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        company: {
          id: targetCompanyId,
          name: company?.name || "Unknown",
        },
        brands: brands.map(brand => ({
          brandName: brand.brandName,
          category: brand.category,
          type: brand.type,
          displayOrder: brand.displayOrder,
          skus: brand.skus || [],
          productOrder: brand.productOrder || [],
        })),
        hiddenSkus: hiddenSkus,
      };

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="brand-registry-${company?.name || targetCompanyId}-${new Date().toISOString().split('T')[0]}.json"`);
      
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting brand registry:", error);
      res.status(500).json({ error: "Failed to export brand registry" });
    }
  });

  // Import Brand Registry - restores brand data and hidden SKUs from JSON
  app.post("/api/brands/import", isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Super Admins can import for any company via companyId in request body
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

      const importData = req.body.data;
      
      if (!importData || !importData.brands) {
        return res.status(400).json({ error: "Invalid import data format" });
      }

      console.log(`[Brand Import] Starting import for company ${targetCompanyId}`);
      console.log(`[Brand Import] Importing ${importData.brands.length} brands and ${importData.hiddenSkus?.length || 0} hidden SKUs`);

      // Track results
      let brandsCreated = 0;
      let brandsUpdated = 0;
      let hiddenSkusRestored = 0;

      // Process each brand in the import
      for (const brandData of importData.brands) {
        if (!brandData.brandName || !brandData.category) {
          console.log(`[Brand Import] Skipping invalid brand:`, brandData);
          continue;
        }

        // Check if brand already exists
        const existingBrand = await storage.getBrandByName(targetCompanyId, brandData.brandName);
        
        if (existingBrand) {
          // Update existing brand
          await storage.updateBrand(existingBrand.id, {
            category: brandData.category,
            type: brandData.type || null,
            displayOrder: brandData.displayOrder || null,
            skus: brandData.skus || [],
            productOrder: brandData.productOrder || [],
          });
          brandsUpdated++;
          console.log(`[Brand Import] Updated brand: ${brandData.brandName}`);
        } else {
          // Create new brand
          await storage.createBrand({
            companyId: targetCompanyId,
            brandName: brandData.brandName,
            category: brandData.category,
            type: brandData.type,
            displayOrder: brandData.displayOrder,
            skus: brandData.skus || [],
            productOrder: brandData.productOrder || [],
          });
          brandsCreated++;
          console.log(`[Brand Import] Created brand: ${brandData.brandName}`);
        }
      }

      // Restore hidden SKUs
      if (importData.hiddenSkus && Array.isArray(importData.hiddenSkus)) {
        for (const sku of importData.hiddenSkus) {
          await storage.upsertVisibility(targetCompanyId, sku, true);
          hiddenSkusRestored++;
        }
        console.log(`[Brand Import] Restored ${hiddenSkusRestored} hidden SKUs`);
      }

      res.json({
        success: true,
        brandsCreated,
        brandsUpdated,
        hiddenSkusRestored,
        totalBrandsInImport: importData.brands.length,
      });
    } catch (error) {
      console.error("Error importing brand registry:", error);
      res.status(500).json({ error: "Failed to import brand registry" });
    }
  });

  // ===== COMPANY INTEGRATIONS ROUTES =====

  // Get all integrations for a company
  app.get("/api/integrations", isAuthenticated, async (req, res) => {
    try {
      const sessionUser = req.user as any;
      const userId = sessionUser.claims?.sub;
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Get user's company or impersonated company (for super admins)
      let companyId = dbUser.companyId;
      const requestedCompanyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
      
      // Super admins can view any company's integrations
      const isSuperAdmin = dbUser.role === "superAdmin";
      if (isSuperAdmin && requestedCompanyId) {
        companyId = requestedCompanyId;
      }
      
      if (!companyId) {
        return res.status(400).json({ error: "No company context" });
      }
      
      const integrations = await storage.getIntegrationsByCompanyId(companyId);
      
      // Mask sensitive token data
      const safeIntegrations = integrations.map(i => ({
        ...i,
        refreshToken: i.refreshToken ? "••••••••" : null,
        accessToken: i.accessToken ? "••••••••" : null,
      }));
      
      res.json(safeIntegrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  // Wix App URL - This is called by Wix when user installs the app
  // User sets this URL in Wix Dev Center as "App URL"
  app.get("/api/integrations/wix/app", async (req, res) => {
    try {
      const { token, instanceId, state: stateParam } = req.query;
      
      console.log("[Wix App] Received params:", { 
        hasToken: !!token, 
        hasInstanceId: !!instanceId,
        hasState: !!stateParam 
      });
      
      const appId = process.env.WIX_APP_ID;
      const appSecret = process.env.WIX_APP_SECRET;
      
      if (!appId || !appSecret) {
        console.error("[Wix App] Missing WIX_APP_ID or WIX_APP_SECRET");
        return res.redirect("/?error=wix_config_missing");
      }
      
      // Build base URL for redirect
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || 
                      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 
                       `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
      const redirectUrl = `${baseUrl}/api/integrations/wix/callback`;
      
      console.log("[Wix App] Redirect URL:", redirectUrl);
      
      if (token) {
        // Advanced OAuth flow: Wix sent a token, redirect to installer
        // The state will encode our company ID (we'll use default company 2 for now, or parse from query)
        const companyId = stateParam ? parseInt(stateParam as string) : 2;
        const state = `${companyId}:${Date.now()}`;
        
        const installerUrl = new URL("https://www.wix.com/installer/install");
        installerUrl.searchParams.set("token", token as string);
        installerUrl.searchParams.set("appId", appId);
        installerUrl.searchParams.set("redirectUrl", redirectUrl);
        installerUrl.searchParams.set("state", state);
        
        console.log("[Wix App] Redirecting to installer:", installerUrl.toString());
        return res.redirect(installerUrl.toString());
      }
      
      if (instanceId) {
        // Standard OAuth flow: Wix sent instanceId directly
        // Use client_credentials to get access token
        console.log("[Wix App] Using client_credentials with instanceId:", instanceId);
        
        const tokenResponse = await fetch("https://www.wixapis.com/oauth/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: appId,
            client_secret: appSecret,
            instance_id: instanceId,
          }),
        });
        
        if (!tokenResponse.ok) {
          const error = await tokenResponse.text();
          console.error("[Wix App] Token request failed:", error);
          return res.redirect("/?error=wix_token_failed");
        }
        
        const tokens = await tokenResponse.json();
        console.log("[Wix App] Got tokens, storing...");
        
        // Store integration for default company (2)
        const companyId = 2;
        let integration = await storage.getIntegrationByProvider(companyId, "wix");
        
        if (integration) {
          await storage.updateIntegration(integration.id, {
            status: "connected",
            accessToken: tokens.access_token,
            accessTokenExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours for client_credentials
            config: { appId, instanceId: instanceId as string },
          });
        } else {
          await storage.createIntegration({
            companyId,
            provider: "wix",
            status: "connected",
            accessToken: tokens.access_token,
            accessTokenExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
            config: { appId, instanceId: instanceId as string },
          });
        }
        
        return res.redirect("/admin?tab=brands&wix_connected=true");
      }
      
      // No token or instanceId - show error
      console.error("[Wix App] No token or instanceId provided");
      return res.redirect("/?error=wix_no_params");
    } catch (error) {
      console.error("[Wix App] Error:", error);
      return res.redirect("/?error=wix_app_error");
    }
  });

  // Get Wix connection info and App URL for setup
  app.post("/api/integrations/wix/connect", isAuthenticated, async (req, res) => {
    try {
      const sessionUser = req.user as any;
      const userId = sessionUser.claims?.sub;
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const { companyId: requestedCompanyId } = req.body;
      
      // Get target company
      let companyId = dbUser.companyId;
      const isSuperAdmin = dbUser.role === "superAdmin";
      if (isSuperAdmin && requestedCompanyId) {
        companyId = requestedCompanyId;
      }
      
      if (!companyId) {
        return res.status(400).json({ error: "No company context" });
      }
      
      // Get Wix credentials from environment
      const appId = process.env.WIX_APP_ID;
      
      if (!appId) {
        return res.status(500).json({ error: "Wix App ID must be configured in environment variables" });
      }
      
      // Build the App URL that user needs to configure in Wix Dev Center
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL || 
                      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 
                       `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
      const appUrl = `${baseUrl}/api/integrations/wix/app?state=${companyId}`;
      const redirectUrl = `${baseUrl}/api/integrations/wix/callback`;
      
      console.log("[Wix Connect] App URL:", appUrl);
      console.log("[Wix Connect] Redirect URL:", redirectUrl);
      
      // Create or update integration record with pending status
      let integration = await storage.getIntegrationByProvider(companyId, "wix");
      
      if (!integration) {
        integration = await storage.createIntegration({
          companyId,
          provider: "wix",
          status: "pending",
          config: { appId },
        });
      }
      
      // Return setup instructions instead of redirect URL
      res.json({ 
        appUrl,
        redirectUrl,
        message: "Configure these URLs in your Wix Developer Center, then install the app on your Wix site.",
        instructions: [
          "1. Go to Wix Developer Center → Your App → OAuth",
          `2. Set App URL to: ${appUrl}`,
          `3. Set Redirect URL to: ${redirectUrl}`,
          "4. Save and create a new app version",
          "5. Install/reinstall the app on your Wix site",
          "6. The connection will complete automatically"
        ]
      });
    } catch (error) {
      console.error("Error initiating Wix connection:", error);
      res.status(500).json({ error: "Failed to initiate Wix connection" });
    }
  });

  // Wix OAuth callback - handles token exchange from installer flow
  app.get("/api/integrations/wix/callback", async (req, res) => {
    try {
      const { code, state, instanceId } = req.query;
      
      console.log("[Wix Callback] Received params:", { 
        hasCode: !!code, 
        hasState: !!state, 
        hasInstanceId: !!instanceId 
      });
      
      if (!code) {
        console.error("[Wix Callback] Missing code");
        return res.redirect("/?error=missing_code");
      }
      
      // Parse state to get company ID (format: "companyId:timestamp")
      let companyId = 2; // Default fallback
      if (state) {
        const [companyIdStr] = (state as string).split(":");
        const parsedCompanyId = parseInt(companyIdStr);
        if (parsedCompanyId) {
          companyId = parsedCompanyId;
        }
      }
      
      console.log("[Wix Callback] Using companyId:", companyId);
      
      const appId = process.env.WIX_APP_ID;
      const appSecret = process.env.WIX_APP_SECRET;
      
      if (!appId || !appSecret) {
        console.error("[Wix Callback] Missing WIX_APP_ID or WIX_APP_SECRET");
        return res.redirect("/?error=config_error");
      }
      
      // Exchange code for tokens using Wix API
      console.log("[Wix Callback] Exchanging code for tokens...");
      const tokenResponse = await fetch("https://www.wixapis.com/oauth/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
        }),
      });
      
      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error("[Wix Callback] Token exchange failed:", error);
        return res.redirect("/?error=token_exchange_failed");
      }
      
      const tokens = await tokenResponse.json();
      console.log("[Wix Callback] Token exchange successful, storing tokens...");
      
      // Get or create integration record
      let integration = await storage.getIntegrationByProvider(companyId, "wix");
      
      const integrationData = {
        status: "connected" as const,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes for auth code flow
        config: { 
          appId, 
          instanceId: instanceId as string || tokens.instance_id 
        },
      };
      
      if (integration) {
        await storage.updateIntegration(integration.id, integrationData);
      } else {
        await storage.createIntegration({
          companyId,
          provider: "wix",
          ...integrationData,
        });
      }
      
      console.log("[Wix Callback] Integration stored successfully!");
      
      // Redirect to admin page with success message
      res.redirect("/admin?tab=brands&wix_connected=true");
    } catch (error) {
      console.error("[Wix Callback] Error:", error);
      res.redirect("/?error=callback_failed");
    }
  });

  // Sync products from Wix
  app.post("/api/integrations/wix/sync", isAuthenticated, async (req, res) => {
    try {
      const sessionUser = req.user as any;
      const userId = sessionUser.claims?.sub;
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const { companyId: requestedCompanyId } = req.body;
      
      // Get target company
      let companyId = dbUser.companyId;
      const isSuperAdmin = dbUser.role === "superAdmin";
      if (isSuperAdmin && requestedCompanyId) {
        companyId = requestedCompanyId;
      }
      
      if (!companyId) {
        return res.status(400).json({ error: "No company context" });
      }
      
      // Get integration
      const integration = await storage.getIntegrationByProvider(companyId, "wix");
      if (!integration || integration.status !== "connected") {
        return res.status(400).json({ error: "Wix not connected" });
      }
      
      if (!integration.refreshToken) {
        return res.status(400).json({ error: "No refresh token" });
      }
      
      const appId = integration.config?.appId;
      const appSecret = process.env.WIX_APP_SECRET;
      
      if (!appId || !appSecret) {
        return res.status(500).json({ error: "Wix configuration missing" });
      }
      
      // Check if access token needs refresh
      let accessToken = integration.accessToken;
      const now = new Date();
      
      if (!accessToken || !integration.accessTokenExpiresAt || integration.accessTokenExpiresAt < now) {
        // Refresh the access token
        const refreshResponse = await fetch("https://www.wix.com/oauth/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refresh_token: integration.refreshToken,
            client_id: appId,
            client_secret: appSecret,
            grant_type: "refresh_token",
          }),
        });
        
        if (!refreshResponse.ok) {
          const error = await refreshResponse.text();
          console.error("Token refresh failed:", error);
          
          // Mark integration as error
          await storage.updateIntegration(integration.id, {
            status: "error",
            lastSyncStatus: "error",
            lastSyncError: "Token refresh failed - please reconnect",
          });
          
          return res.status(401).json({ error: "Token refresh failed - please reconnect" });
        }
        
        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;
        
        // Update stored tokens
        await storage.updateIntegration(integration.id, {
          accessToken,
          refreshToken: tokens.refresh_token || integration.refreshToken,
          accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
      }
      
      // Fetch products using Wix Catalog V3 API with cursor pagination
      // Your store is on V3, so we use V3 directly
      const allProducts: any[] = [];
      const limit = 100;
      let cursor: string | null = null;
      let hasMore = true;
      let pageCount = 0;
      
      console.log("[Wix Sync] Starting V3 product sync...");
      
      while (hasMore) {
        pageCount++;
        const requestBody: any = {
          query: { 
            paging: { limit }
          },
          includeHiddenProducts: true, // Request hidden products too
          includeVariants: true,
        };
        
        if (cursor) {
          requestBody.query.cursorPaging = { cursor, limit };
          delete requestBody.query.paging; // Use cursorPaging instead when we have a cursor
        }
        
        console.log(`[Wix Sync V3] Fetching page ${pageCount}...`, JSON.stringify(requestBody));
        
        const productsResponse = await fetch("https://www.wixapis.com/stores/v3/products/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!productsResponse.ok) {
          const error = await productsResponse.text();
          console.error("[Wix Sync V3] Products fetch failed:", error);
          
          await storage.updateIntegration(integration.id, {
            lastSyncStatus: "error",
            lastSyncError: `API error: ${error}`,
            lastSyncAt: new Date(),
          });
          
          return res.status(500).json({ error: "Failed to fetch products from Wix", details: error });
        }
        
        const data = await productsResponse.json();
        const pageProducts = data.products || [];
        allProducts.push(...pageProducts);
        
        // Log pagination info
        console.log(`[Wix Sync V3] Page ${pageCount}: Got ${pageProducts.length} products, total: ${allProducts.length}`);
        console.log(`[Wix Sync V3] Paging metadata:`, JSON.stringify(data.pagingMetadata || data.metadata || {}));
        
        // V3 uses cursor-based pagination - check multiple possible locations
        const nextCursor = data.pagingMetadata?.cursors?.next || 
                          data.metadata?.cursors?.next ||
                          data.cursors?.next;
        
        if (nextCursor && pageProducts.length > 0) {
          cursor = nextCursor;
          hasMore = true;
        } else {
          hasMore = false;
        }
      }
      
      console.log(`[Wix Sync] Total products fetched: ${allProducts.length} (V3, ${pageCount} pages)`);
      
      // Map Wix products to our Product format (works for both V1 and V3)
      const products = allProducts.map((wixProduct: any, index: number) => {
        // V1 uses additionalInfoSections, V3 uses infoSections
        const additionalInfo = wixProduct.additionalInfoSections || wixProduct.infoSections || [];
        const notesSection = additionalInfo.find(
          (s: any) => s.title?.toLowerCase().includes("note") || 
                       s.title?.toLowerCase() === "additionalinfodescription2"
        );
        
        // V1 uses collectionIds, both may have different collection structures
        const collectionNames = wixProduct.collectionIds?.map((id: string) => id) || 
                                wixProduct.collections?.map((c: any) => c.name) || [];
        
        // Extract price - V1 and V3 have slightly different structures
        let price = "0";
        if (wixProduct.price?.formatted?.price) {
          price = wixProduct.price.formatted.price;
        } else if (wixProduct.price?.price) {
          price = wixProduct.price.price.toString();
        } else if (wixProduct.priceData?.formatted?.price) {
          price = wixProduct.priceData.formatted.price;
        } else if (wixProduct.priceData?.price) {
          price = wixProduct.priceData.price.toString();
        } else if (wixProduct.actualPriceRange?.minValue?.amount) {
          price = wixProduct.actualPriceRange.minValue.amount;
        }
        
        // Extract image URL - V1 and V3 have different structures
        let productImageUrl = wixProduct.media?.mainMedia?.image?.url || 
                              wixProduct.media?.main?.image?.url ||
                              wixProduct.media?.items?.[0]?.image?.url;
        
        return {
          id: wixProduct.id || `wix-${index}`,
          category: wixProduct.brand || "Uncategorized",
          ribbon: wixProduct.ribbon || undefined,
          notes: notesSection?.description || undefined,
          product: wixProduct.name,
          sku: wixProduct.sku || wixProduct.id,
          format: "1 x 750 ml",
          price,
          productImageUrl,
          isHidden: !wixProduct.visible,
          collectionRaw: collectionNames.join(", "),
          collectionBrand: wixProduct.brand,
        };
      });
      
      // Update integration status
      await storage.updateIntegration(integration.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
        lastSyncProductCount: products.length,
      });
      
      res.json({
        success: true,
        productCount: products.length,
        products,
      });
    } catch (error) {
      console.error("Error syncing from Wix:", error);
      res.status(500).json({ error: "Failed to sync products from Wix" });
    }
  });

  // Disconnect Wix integration
  app.delete("/api/integrations/wix", isAuthenticated, async (req, res) => {
    try {
      const sessionUser = req.user as any;
      const userId = sessionUser.claims?.sub;
      const dbUser = await storage.getUser(userId);
      
      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const requestedCompanyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
      
      let companyId = dbUser.companyId;
      const isSuperAdmin = dbUser.role === "superAdmin";
      if (isSuperAdmin && requestedCompanyId) {
        companyId = requestedCompanyId;
      }
      
      if (!companyId) {
        return res.status(400).json({ error: "No company context" });
      }
      
      const integration = await storage.getIntegrationByProvider(companyId, "wix");
      if (integration) {
        await storage.deleteIntegration(integration.id);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Wix:", error);
      res.status(500).json({ error: "Failed to disconnect Wix" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
