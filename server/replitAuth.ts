// Replit Auth integration for Google OAuth
// Based on blueprint: javascript_log_in_with_replit
import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

// Cache for super admin allowlist (loaded once at startup)
let superAdminEmails: Set<string> | null = null;
let superAdminFallbackDomain: string | null = null;

function getSuperAdminAllowlist(): Set<string> {
  if (superAdminEmails === null) {
    const emailsEnv = process.env.SUPER_ADMIN_EMAILS || "";
    superAdminEmails = new Set(
      emailsEnv.split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0)
    );
    
    // Development fallback domain (only in non-production)
    if (process.env.NODE_ENV !== 'production') {
      // Allow replit.com for development/testing
      superAdminFallbackDomain = 'replit.com';
      console.log(`[Auth] Development mode: allowing super admin domain '${superAdminFallbackDomain}'`);
    }
    
    if (superAdminEmails.size > 0) {
      console.log(`[Auth] Loaded ${superAdminEmails.size} super admin email(s) from allowlist`);
    }
  }
  return superAdminEmails;
}

function isSuperAdminEmail(email: string): boolean {
  const normalizedEmail = email.toLowerCase();
  const allowlist = getSuperAdminAllowlist();
  
  // Check explicit allowlist first
  if (allowlist.has(normalizedEmail)) {
    return true;
  }
  
  // Check fallback domain (development only)
  if (superAdminFallbackDomain) {
    const emailDomain = normalizedEmail.split('@')[1];
    if (emailDomain === superAdminFallbackDomain) {
      return true;
    }
  }
  
  return false;
}

async function upsertUser(
  claims: any,
) {
  const email = claims["email"];
  if (!email) {
    throw new Error("Email is required for authentication");
  }
  
  // Check if user already exists
  const existingUser = await storage.getUser(claims["sub"]);
  
  if (existingUser) {
    // SECURITY: Validate that user's company still exists (unless super admin with no company)
    if (existingUser.companyId) {
      const company = await storage.getCompanyById(existingUser.companyId);
      if (!company) {
        // Company was deleted - reject login and require admin intervention
        throw new Error("Your company account has been deleted. Please contact your administrator.");
      }
    }
    
    // Check if existing user should be upgraded to super admin
    // (in case they were added to SUPER_ADMIN_EMAILS after initial account creation)
    let finalRole = existingUser.role;
    let finalCompanyId = existingUser.companyId;
    
    if (isSuperAdminEmail(email) && existingUser.role !== "superAdmin") {
      console.log(`[Auth] Upgrading existing user to super admin: ${email}`);
      finalRole = "superAdmin";
      finalCompanyId = null; // Super admins have no company
    }
    
    // User exists - update their profile info
    await storage.upsertUser({
      id: claims["sub"],
      email,
      firstName: claims["first_name"],
      lastName: claims["last_name"],
      profileImageUrl: claims["profile_image_url"],
      role: finalRole,
      companyId: finalCompanyId,
    });
  } else {
    // New user - check if super admin first
    if (isSuperAdminEmail(email)) {
      // Super admin - bypass domain check, no company assignment
      console.log(`[Auth] Super admin login: ${email}`);
      await storage.upsertUser({
        id: claims["sub"],
        email,
        firstName: claims["first_name"],
        lastName: claims["last_name"],
        profileImageUrl: claims["profile_image_url"],
        role: "superAdmin",
        companyId: null, // Super admins have no company
      });
    } else {
      // Regular user - validate domain and auto-assign to company
      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (!emailDomain) {
        throw new Error("Invalid email format");
      }
      
      // Look up company by email domain
      const company = await storage.getCompanyByDomain(emailDomain);
      
      if (!company) {
        // Domain not recognized - reject login for security
        // Only admins can manually add users from unrecognized domains
        throw new Error(`Access denied: Email domain '${emailDomain}' is not authorized. Please contact your administrator.`);
      }
      
      // Auto-assign new user to company with client role
      await storage.upsertUser({
        id: claims["sub"],
        email,
        firstName: claims["first_name"],
        lastName: claims["last_name"],
        profileImageUrl: claims["profile_image_url"],
        role: "client", // New users default to client role
        companyId: company.id, // Auto-assign to company based on domain
      });
    }
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const user = {};
      updateUserSession(user, tokens);
      await upsertUser(tokens.claims());
      verified(null, user);
    } catch (error) {
      // Pass error to passport - will be handled by failureRedirect
      console.error("Authentication error:", error);
      verified(error as Error);
    }
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, async (err: any, user: any, info: any) => {
      if (err) {
        console.error("[Auth] Callback error:", err);
        return res.redirect("/?error=unauthorized");
      }
      if (!user) {
        console.log("[Auth] Callback: No user returned");
        return res.redirect("/?error=unauthorized");
      }
      
      // Log in the user
      req.login(user, async (loginErr) => {
        if (loginErr) {
          console.error("[Auth] Login error:", loginErr);
          return res.redirect("/?error=unauthorized");
        }
        
        // Check user's role in database to determine redirect
        try {
          const userId = user.claims?.sub;
          if (userId) {
            const dbUser = await storage.getUser(userId);
            if (dbUser?.role === "client") {
              console.log(`[Auth] Client login redirect: ${dbUser.email} -> /client`);
              return res.redirect("/client");
            }
          }
        } catch (error) {
          console.error("[Auth] Error checking user role:", error);
        }
        
        // Default redirect for admins/super admins
        return res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  
  // Check if session is still valid (not expired)
  if (now <= user.expires_at) {
    return next();
  }

  // Session is expired - handle based on login type
  // Password-based sessions don't have refresh tokens - require re-login
  if (user.isPasswordLogin) {
    return res.status(401).json({ message: "Session expired. Please log in again." });
  }

  // OIDC sessions - try to refresh the token
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

// Middleware to check if user is super admin (full system access)
export const requireSuperAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const userId = user.claims.sub;
    const dbUser = await storage.getUser(userId);
    
    if (!dbUser || dbUser.role !== "superAdmin") {
      return res.status(403).json({ message: "Super Admin access required" });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ message: "Failed to verify super admin status" });
  }
};

// Middleware to check if user is admin or super admin (for backward compatibility)
export const isAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const userId = user.claims.sub;
    const dbUser = await storage.getUser(userId);
    
    if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "superAdmin")) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ message: "Failed to verify admin status" });
  }
};

// Middleware for company-scoped admin (admin can only access their own company's resources)
export const requireCompanyScopedAdmin: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const userId = user.claims.sub;
    const dbUser = await storage.getUser(userId);
    
    // Super admin has access to everything - attach to request
    if (dbUser?.role === "superAdmin") {
      (req as any).dbUser = dbUser;
      return next();
    }
    
    // Admin must have a company assigned
    if (!dbUser || dbUser.role !== "admin" || !dbUser.companyId) {
      return res.status(403).json({ message: "Company admin access required" });
    }
    
    // Attach user to request for downstream use
    (req as any).dbUser = dbUser;
    
    next();
  } catch (error) {
    res.status(500).json({ message: "Failed to verify company admin status" });
  }
};
