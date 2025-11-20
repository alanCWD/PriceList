# Product Pricelist Generator

## Overview
This project is a professional web application designed to generate stylish, print-ready pricelists from CSV files, primarily sourced from Wix. It aims to streamline the pricelist creation process for businesses, offering features like database persistence, customizable templates, branding options, sales agent integration, QR codes, category-based product grouping, flexible field mapping, and PDF export. The application supports multi-user and multi-company environments through Google OAuth authentication, company management, and role-based access control, positioning itself as a valuable tool for businesses needing professional and efficient pricelist generation.

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
The application employs a React (TypeScript) frontend and a Node.js Express backend with a PostgreSQL database. Performance-intensive tasks such as CSV parsing, image handling, PDF generation, and QR code generation are offloaded to the client-side.

### Technology Stack
- **Frontend**: React with TypeScript, Wouter, Shadcn UI + Radix UI, Tailwind CSS
- **Backend**: Node.js with Express, Drizzle ORM
- **Database**: PostgreSQL (Neon serverless)
- **Authentication**: Replit Auth with Google OAuth, express-session
- **PDF Generation**: jsPDF with jspdf-autotable
- **CSV Parsing**: PapaParse
- **QR Codes**: qrcode.react
- **Form Handling**: React Hook Form with Zod validation
- **Styling**: Tailwind CSS, Inter font family

### Data Models
Key data models include `Product`, `FieldMapping`, `CompanyBranding`, `SalesAgent`, `QRCodeConfig`, and `Template`. User and company management are handled via `sessions`, `users`, and `companies` tables, while pricelist-specific data is stored in `pricelists`, `companyProfiles`, and `salesAgentProfiles` for reusability.

### Authentication & Authorization
The system features a robust, database-centric security model where all authorization decisions rely on fresh database lookups. Sessions only contain user IDs, with roles and company affiliations dynamically fetched from the database.
- **Roles**:
    - **Super Admin**: System-wide access, managed via environment variable allowlist.
    - **Company Admin**: Company-scoped access, managing branding and sales agents for their company.
    - **Client**: Read-only access to their company's pricelists, with CSV upload capabilities.
- **Google OAuth**: Integrated via Replit Auth for secure login.
- **Domain-based User Assignment**: New users are automatically assigned to companies based on email domains.
- **Multi-Tenancy**: Supports multiple companies with isolated data and configurations.

### User Workflow
- **Admin Workflow**: Admins configure company defaults, including field mappings, templates, and branding. They have access to a full file browser for all pricelists.
- **Client Workflow**: Clients experience a streamlined landing page displaying their most recent pricelist, with inline CSV upload for updates and quick PDF download/print options. Company defaults are automatically applied.

### Key Features
- **Admin System**: Manages companies, users, branding, and sales agent teams.
- **Role-Based UX**: Tailored interfaces for Admins (full dashboard) and Clients (simplified landing page).
- **Latest Price List API**: Provides the most recent pricelist for a user's company.
- **Inline CSV Upload**: Allows clients to easily update pricelists.
- **CSV-Based Field Mapping**: Admins configure default mappings that clients inherit.
- **Auto-Generated Pricelist Names**: Consistent naming convention.
- **Template System**: Three professional, print-optimized templates (Modern, Classic, Minimal).
  - **Modern template**: Full header (logo left, title/tagline center, sales agents right) on page 1 (~120pt height); simple centered title bar on pages 2+
  - **Minimal template**: Compact header matching Modern layout (logo left, title/tagline center, agents right) with reduced fonts and height (~40-50pt), shown only on page 1; very compressed row spacing (8pt body font, 7pt headers) to minimize page count; dynamic column inclusion (Image/Notes columns only when data present); reduced margins (40pt vs 48pt) for maximum content density
  - **Classic template**: Traditional layout with centered branding
  - **All templates**: Category headers sorted alphabetically A-Z; products within categories maintain original CSV order; "Uncategorized" products excluded from output; branding colors applied to headers
- **Database Persistence**: Full CRUD operations for pricelists with company isolation.
- **Professional Document Design**: High-quality, print-ready PDF exports with template-specific styling.
- **Validation & UX**: Comprehensive validation, error handling, and notifications.

### Routing Structure
- `/`: Role-based routing to admin dashboard or client landing page.
- `/dashboard`: Admin dashboard.
- `/client`: Client landing page.
- `/editor`: Full pricelist editor (primarily for admins).
- `/admin`: Admin interface (admin role only).
- `/login`: Login page.

### User Profile Menu & View Switching
**Component**: `client/src/components/user-profile-menu.tsx`

**Features:**
- Avatar with initials fallback
- Dropdown showing user name, email, and role
- **Super Admin only**: "View as Client" toggle for switching between admin and client views
- **All admin users** (Super Admin + Company Admin): "Admin Settings" menu item for quick navigation to /admin
- Logout functionality with cache invalidation
- Available on all authenticated pages (Dashboard, Editor, Admin)

**View Switching Implementation:**
- **ViewModeContext** (`client/src/contexts/ViewModeContext.tsx`): Manages view mode state ("admin" or "client")
- **localStorage Persistence**: View preference persists across sessions with key "viewMode"
- **SSR-Safe Lazy Initialization**: Uses lazy initializer in useState to read localStorage before first render
- **Super Admin Toggle**: 
  - Shows "View as Client" when in admin mode (switches to client view)
  - Shows "View as Admin" when in client mode (switches back to admin view)
  - Navigates appropriately: admin view → /dashboard, client view → /
- **Company Admin**: No view toggle (always sees company-scoped data)
- **Client Users**: Never see view toggle or admin settings (always in client mode)

**Implementation:**
- Uses `useAuth()` hook for role detection (`isSuperAdmin`, `isCompanyAdmin`, `isAdmin`)
- Uses `useViewMode()` hook for view mode state management
- Conditional rendering: `{isSuperAdmin && <ViewToggle />}` and `{isAdmin && <AdminSettings />}`
- View toggle has dynamic data-testid based on current mode
- Logout clears TanStack Query cache before redirect
- Integrated in top-right corner of all page headers

## External Dependencies

-   **Google OAuth**: For user authentication via Replit Auth.
-   **PostgreSQL (Neon serverless)**: Primary database for all application data.
-   **PapaParse**: Client-side CSV parsing.
-   **jsPDF**: Client-side PDF generation.
-   **qrcode.react**: Client-side QR code generation.
-   **React Hook Form & Zod**: For form management and validation.