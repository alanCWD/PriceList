import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertPricelistSchema, 
  insertCompanyProfileSchema,
  insertSalesAgentProfileSchema 
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all pricelists
  app.get("/api/pricelists", async (req, res) => {
    try {
      const pricelists = await storage.getAllPricelists();
      res.json(pricelists);
    } catch (error) {
      console.error("Error fetching pricelists:", error);
      res.status(500).json({ error: "Failed to fetch pricelists" });
    }
  });

  // Get a specific pricelist
  app.get("/api/pricelists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricelist ID" });
      }

      const pricelist = await storage.getPricelistById(id);
      if (!pricelist) {
        return res.status(404).json({ error: "Pricelist not found" });
      }

      res.json(pricelist);
    } catch (error) {
      console.error("Error fetching pricelist:", error);
      res.status(500).json({ error: "Failed to fetch pricelist" });
    }
  });

  // Create a new pricelist
  app.post("/api/pricelists", async (req, res) => {
    try {
      const validation = insertPricelistSchema.safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const pricelist = await storage.createPricelist(validation.data);
      res.status(201).json(pricelist);
    } catch (error) {
      console.error("Error creating pricelist:", error);
      res.status(500).json({ error: "Failed to create pricelist" });
    }
  });

  // Update a pricelist
  app.patch("/api/pricelists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricelist ID" });
      }

      const validation = insertPricelistSchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const pricelist = await storage.updatePricelist(id, validation.data);
      if (!pricelist) {
        return res.status(404).json({ error: "Pricelist not found" });
      }

      res.json(pricelist);
    } catch (error) {
      console.error("Error updating pricelist:", error);
      res.status(500).json({ error: "Failed to update pricelist" });
    }
  });

  // Delete a pricelist
  app.delete("/api/pricelists/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid pricelist ID" });
      }

      const success = await storage.deletePricelist(id);
      if (!success) {
        return res.status(404).json({ error: "Pricelist not found" });
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

      const validation = insertCompanyProfileSchema.partial().safeParse(req.body);
      if (!validation.success) {
        const errorMessage = fromZodError(validation.error).message;
        return res.status(400).json({ error: errorMessage });
      }

      const profile = await storage.updateCompanyProfile(id, validation.data);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
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

      const success = await storage.deleteCompanyProfile(id);
      if (!success) {
        return res.status(404).json({ error: "Profile not found" });
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

      const profile = await storage.updateSalesAgentProfile(id, validation.data);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
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

      const success = await storage.deleteSalesAgentProfile(id);
      if (!success) {
        return res.status(404).json({ error: "Profile not found" });
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
