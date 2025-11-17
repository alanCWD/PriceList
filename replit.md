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

#### Admin Workflow (Company Configuration)
Admins configure company defaults for streamlined user experience:
1.  **Company Setup**: Create companies with unique email domains for user auto-assignment
2.  **CSV Upload & Field Mapping**: Upload a sample CSV to auto-detect and configure default field mappings
3.  **Template Selection**: Choose default template (Modern, Classic, or Minimal) for the company
4.  **Save Configuration**: Field mappings and template saved as company defaults

#### Client Workflow (Pricelist Generation)
Clients create pricelists with company defaults pre-applied:
1.  **CSV Upload**: Drag & drop or file picker with auto-applied company field mappings
2.  **Field Mapping Review**: Review and adjust auto-populated field mappings if needed
3.  **Configuration**: Branding setup (manual or from profiles), sales agent details, and QR code configuration
4.  **Preview & Export**: Live preview of the pricelist and PDF export functionality
5.  **Save/Load**: Persistence of pricelists with auto-generated names using "{Company} Pricelist [Day Month]" format

### Key Features
-   **Admin System**: For managing companies, users, reusable company branding and sales agent teams.
-   **CSV-Based Field Mapping**: Admins upload sample CSVs to auto-detect and save default field mappings per company; clients inherit these mappings automatically.
-   **Auto-Generated Pricelist Names**: Save dialog pre-fills with "{Company} Pricelist [Day Month]" format (e.g., "Test Company Pricelist [17 November]"), customizable before saving.
-   **Template System**: Three professional, print-optimized templates (Modern, Classic, Minimal) with company defaults.
-   **Database Persistence**: Save, load, update, and delete pricelists and profiles with full company isolation.
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

## Critical Implementation Details

### Server-Side Data Normalization
All company defaults are normalized server-side to ensure clients receive complete, valid data structures:

**Branding Normalization (per-field):**
```typescript
companyBranding: {
  companyName: branding.companyName ?? "",
  tagline: branding.tagline ?? "",
  // ... all fields individually normalized
}
```

**Template Fallback:**
```typescript
defaultTemplate: company.defaultTemplate || "modern"
```

**Field Mapping Normalization:**
All field mappings always include complete key set with empty string defaults for unmapped fields.

### CSV Upload Guards (Admin Interface)
Two critical guards prevent data corruption when uploading CSV files for field mapping configuration:

1. **Empty CSV Guard**: Rejects files with no headers or data
   - Toast: "Invalid CSV file" 
   - Preserves existing mappings
   
2. **Non-Matching Headers Guard**: Rejects files where no headers match expected fields
   - Toast: "No field matches found in CSV"
   - Preserves existing mappings
   - Check: `Object.values(autoMapping).every(v => !v)`

### SelectItem Component Pattern
**Critical Bug Fix**: Radix UI SelectItem components throw errors when value prop is empty string.

**Solution**: Use placeholder value and convert:
```typescript
// In Select component
<SelectItem value="__none__">None</SelectItem>

// In onChange handler
onChange={(value) => setField(value === "__none__" ? "" : value)}
```

### Auto-Generated Pricelist Names
**Fallback Chain** (ensures Save button always enabled):
```typescript
const finalName = initialName || autoName || initialDescription || "Untitled Pricelist";
```

Where:
- `initialName`: Existing pricelist name (when editing)
- `autoName`: "{Company} Pricelist [Day Month]" (when branding valid)
- `initialDescription`: Use description as name fallback
- `"Untitled Pricelist"`: Final fallback

**Auto-Name Format**: "{Company} Pricelist [Day Month]"
- Guards against placeholder value "Your Company Name"
- Returns empty string if branding invalid (fallback chain handles)

### Branding Application Pattern
**Client-Side Guard**: Only apply company branding if it contains actual values:
```typescript
if (companyBranding.companyName.trim() !== "") {
  // Apply branding
}
```
This prevents empty normalized branding from overwriting user-entered values and disabling the Save button.

### Routing Structure
- `/` → Dashboard (authenticated users)
- `/dashboard` → Dashboard (alias for better UX)
- `/editor` → Pricelist editor
- `/admin` → Admin interface (admin role only)
- `/login` → Login page (unauthenticated users)

### Save Button Validation
**Editor Save Button** (`client/src/pages/editor.tsx`):
```typescript
const canSave = products.length > 0;
```

**Key Principle**: Save button enabled when products exist, regardless of branding completeness. The dialog's fallback chain ensures a valid name is always generated.

### UpsertUser Implementation
**Database Upsert** (`server/storage.ts`):
```typescript
onConflictDoUpdate({
  target: users.email, // Handle conflicts on email unique constraint
  set: { ...userData, updatedAt: new Date() }
})
```

**Key Principle**: OAuth login uses email as conflict resolution key, ensuring existing users are updated rather than causing duplicate key violations.