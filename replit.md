# Product Pricelist Generator

## Overview
This project is a professional web application designed to generate stylish, print-ready pricelists from CSV files, primarily sourced from Wix. It aims to streamline the pricelist creation process for businesses by offering features like database persistence, customizable templates, branding options, sales agent integration, QR codes, category-based product grouping, flexible field mapping, and PDF export. The application supports multi-user and multi-company environments through Google OAuth authentication, company management, and role-based access control, positioning itself as a valuable tool for businesses needing professional and efficient pricelist generation.

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
- **Authentication**: Replit Auth with Google OAuth
- **PDF Generation**: jsPDF with jspdf-autotable
- **CSV Parsing**: PapaParse
- **QR Codes**: qrcode.react
- **Form Handling**: React Hook Form with Zod validation

### Data Models
Key data models include `Product`, `FieldMapping`, `CompanyBranding`, `SalesAgent`, `QRCodeConfig`, `Template`, and `BrandRegistry`. User and company management are handled via `sessions`, `users`, and `companies` tables, while pricelist-specific data is stored in `pricelists`, `companyProfiles`, and `salesAgentProfiles`. Brand registry data is stored in a `brandRegistry` table with a company-scoped multi-tenant design.

### Authentication & Authorization
The system features a robust, database-centric security model where all authorization decisions rely on fresh database lookups. Sessions only contain user IDs, with roles and company affiliations dynamically fetched from the database.
- **Roles**: Super Admin (system-wide), Company Admin (company-scoped), Client (read-only with upload).
- **Google OAuth**: Integrated via Replit Auth.
- **Domain-based User Assignment**: New users are automatically assigned to companies based on email domains.
- **Multi-Tenancy**: Supports multiple companies with isolated data and configurations.

### User Workflow
- **Admin Workflow**: Admins configure company defaults, including field mappings, templates, and branding. They have access to a full file browser for all pricelists.
- **Client Workflow**: Clients experience a streamlined landing page displaying their most recent pricelist, with inline CSV upload for updates and quick PDF download/print options. Company defaults are automatically applied.

### Key Features
- **Admin System**: Manages companies, users, branding, and sales agent teams.
- **Role-Based UX**: Tailored interfaces for Admins (full dashboard) and Clients (simplified landing page).
- **Inline CSV Upload**: Allows clients to easily update pricelists.
- **CSV-Based Field Mapping**: Admins configure default mappings that clients inherit.
- **Brand Registry System**: Company-scoped master brand list for explicit brand categorization and consistent product grouping. It is database-driven with category assignment, optional type field, display order, and manual product ordering.
  - **IMPORTANT DATA NOTE**: ALL products have SKUs in the Brand Registry for Storied Wines company in both Development and Production environments. Any "missing SKUs" message indicates a company context bug (fetching wrong company's data), NOT actual missing data.
  - **SKU-Based Brand Matching**: The brand registry uses a two-phase workflow:
    1. **Initial Upload (Seeding)**: When the registry is empty, heuristic parsing extracts brands from CSV collection fields. SKUs from matched products are automatically assigned to their detected brands.
    2. **Subsequent Uploads**: Products are matched to brands via SKU lookup first (primary). Unmatched SKUs are flagged for admin review.
  - **SKU Management**: Brands store an array of SKUs (`skus` column). Admins can bulk assign/remove SKUs via the Unassigned Products section in the Brand Registry Manager.
  - **Unassigned Products Queue**: Products with SKUs not mapped to any brand appear in a dedicated "Unassigned Products" section, with checkbox selection and brand assignment controls.
  - **Manual Product Ordering**: Admins can drag-and-drop to manually order products within each brand. Ordering is persisted as SKUs in the `productOrder` field (not product IDs), ensuring ordering survives across CSV re-uploads.
  - **Client-Accessible Ordering Endpoint**: The `/api/brands/ordering` endpoint provides ordering data (brandName, category, displayOrder, productOrder) to all authenticated users, enabling clients to generate PDFs with correct brand and product ordering without exposing full admin-only brand registry data.
  - **Brand Sorting Logic**: Brands are sorted in three levels: (1) by category order (Wine → Spirits → Cider → Non-Alc), (2) by `displayOrder` if set, (3) alphabetically by brand name. This ensures consistent ordering across preview and PDF output.
  - **Cache-Busting Headers**: The ordering endpoint uses `no-cache` headers to prevent HTTP caching issues that could serve stale product ordering data.
- **Intelligent Collection Parsing & Standardization**: Parses Wix CSV "collection" fields to extract brand names and product categories, handling Canadian wine industry categorization (Cider → Wine → Spirits → Non-Alc). It includes automatic standardization, wine type and region recognition, and a "Review" tab for manual overrides. Product names are prioritized for wine type normalization to ensure correct sorting.
- **Template System**: Three professional, print-optimized templates (Modern, Classic, Minimal) that apply branding colors and group products by brand, sorted by wine type within each brand or by manual ordering if configured.
- **Database Persistence**: Full CRUD operations for pricelists with company isolation.
- **Pricelist Viewing Workflow**: Users can view and download saved pricelists directly from the database without re-uploading CSVs via dedicated view pages.
- **User Profile Menu & View Switching**: A user profile menu allows Super Admins to toggle between "admin" and "client" views, with preferences persisting in local storage.

## External Dependencies

-   **Google OAuth**: For user authentication via Replit Auth.
-   **PostgreSQL (Neon serverless)**: Primary database.
-   **PapaParse**: Client-side CSV parsing.
-   **jsPDF**: Client-side PDF generation.
-   **qrcode.react**: Client-side QR code generation.
-   **React Hook Form & Zod**: For form management and validation.