# Product Pricelist Generator

## Overview
A professional web application designed to create stylish, print-ready pricelists from CSV files, primarily from Wix (with future platform expansion planned). The application features database persistence, three professional templates (Modern, Classic, Minimal), configurable branding, dual sales agents, QR codes, category-grouped products, flexible field mapping, and PDF export functionality. It also includes Google OAuth authentication, company management, and role-based access control to support multi-user and multi-company environments.

## User Preferences

### Design Philosophy
- Professional, print-ready output is paramount
- Clean, minimal UI focused on the document quality
- Document-first design approach
- Typography and spacing must be exceptional

### Key Requirements
- Support Wix CSV exports (extensible to other platforms)
- Maximum 2 sales agents in footer
- Optional QR code in footer
- Category-based product grouping
- Professional appearance suitable for customer distribution

## System Architecture

### Fullstack Architecture
The application uses a React (TypeScript) frontend and a Node.js Express backend with a PostgreSQL database. Client-side processing is utilized for performance-intensive tasks like CSV parsing, image handling, PDF generation, and QR code generation.

### Technology Stack
- **Frontend**: React with TypeScript, Wouter for routing, Shadcn UI + Radix UI, Tailwind CSS
- **Backend**: Node.js with Express, Drizzle ORM
- **Database**: PostgreSQL (Neon serverless)
- **Authentication**: Replit Auth with Google OAuth, express-session
- **PDF Generation**: jsPDF with jspdf-autotable
- **CSV Parsing**: PapaParse
- **QR Codes**: qrcode.react
- **Form Handling**: React Hook Form with Zod validation
- **Styling**: Tailwind CSS, Inter font family for typography

### Data Models
The system uses models for `Product`, `FieldMapping`, `CompanyBranding`, `SalesAgent`, `QRCodeConfig`, and `Template`.
Authentication and user management are handled via `sessions`, `users`, and `companies` tables. Pricelist-specific data is stored in `pricelists`, `companyProfiles`, and `salesAgentProfiles` tables for reusability.

### Authentication & Authorization

**Security Model (Critical for Future Contributors):**
- **Database is Source of Truth**: ALL authorization decisions use fresh database lookups, NEVER trust session claims for role or company
- **Session Contains**: Only user ID (claims.sub) - used to fetch full user record from database
- **Authorization Pattern**: `const user = await storage.getUser(userId)` → check `user.role` and `user.companyId`
- **No Session Tampering**: Session manipulation cannot bypass authorization because database state controls access

**Implementation:**
- **Replit Auth**: Integrated with Google OAuth for secure login and session management
- **Domain Validation**: New users auto-assigned to company based on email domain (must match existing company)
- **Domain Normalization**: All company domains stored and compared as lowercase to prevent case-sensitivity issues
- **Stale Company Protection**: Login rejected if user's company was deleted from database

**Role-Based Access Control:**
- **Admin Role**: 
  - Full system access across all companies
  - Can create/update/delete any pricelist
  - Can manage companies and users
  - Can optionally assign pricelists to specific companies or leave unassigned
- **Client Role**: 
  - Company-scoped access only (see own company's pricelists)
  - Can create/update/delete only their company's pricelists
  - Cannot change companyId on any operation
  - Cannot access other companies' data (403 Forbidden)

**Company System**: 
- Supports multi-tenancy with unique email domains
- Domain-based user assignment during OAuth login
- Pricelist organization by company
- Pre-configured company branding and settings

### User Workflow
The application guides users through a clear workflow:
1.  **Admin Setup**: Optional setup of reusable Company Profiles and Sales Agent Teams.
2.  **CSV Upload**: Drag & drop or file picker for CSV files with real-time validation.
3.  **Field Mapping**: Mapping CSV headers to product fields with live data preview.
4.  **Configuration**: Template selection, branding setup (manual or from profiles), sales agent details, and QR code configuration.
5.  **Preview & Export**: Live preview of the pricelist and PDF export functionality.
6.  **Save/Load**: Persistence of pricelists and configurations to the database.

### Key Features
-   **Admin System**: For managing reusable company branding and sales agent teams.
-   **Template System**: Three professional, print-optimized templates (Modern, Classic, Minimal).
-   **Database Persistence**: Save, load, update, and delete pricelists and profiles.
-   **Professional Document Design**: Template-specific typography, layout, and print optimization.
-   **Auto-Generated Footer**: Automatic footer format: "{Company} Pricelist [Day Month]" (e.g., "TechCorp Pricelist [15 January]") for consistent, professional appearance across all templates.
-   **Brand/Category Filtering**: Dynamic dropdown to filter pricelists by "ALL brands" or a specific category, with persistence across save/load operations.
-   **Validation & UX**: Comprehensive validation, error handling, loading states, and toast notifications.
-   **Export Quality**: High-quality, print-ready PDF exports with template-specific styling and pagination.

## External Dependencies

-   **Google OAuth**: For user authentication via Replit Auth.
-   **PostgreSQL (Neon serverless)**: Primary database for all application data.
-   **PapaParse**: Client-side CSV parsing library.
-   **jsPDF**: Client-side PDF generation library.
-   **qrcode.react**: Client-side QR code generation.
-   **React Hook Form & Zod**: For form management and validation.