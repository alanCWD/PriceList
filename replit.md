# Product Pricelist Generator

## Overview
A professional web application that creates stylish, print-ready pricelists from CSV files exported from Wix websites (and future platform support planned). The application features database persistence, three professional templates (Modern, Classic, Minimal), configurable branding, dual sales agents, QR codes, category-grouped products, field mapping, and PDF export functionality.

**Last Updated**: November 16, 2025

## Project Architecture

### Fullstack Architecture with Database Persistence
The application uses a PostgreSQL database for persistence and client-side processing for performance:
- **CSV Parsing**: PapaParse library handles all CSV parsing in-browser
- **Image Handling**: FileReader API for logo uploads (base64)
- **PDF Generation**: jsPDF library generates professional PDFs client-side
- **QR Codes**: qrcode.react for live QR code generation and preview
- **State Management**: React hooks for local state (no external state library needed)

### Technology Stack
- **Frontend Framework**: React with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Shadcn UI + Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **Typography**: Inter font family with tabular numbers for professional documents
- **PDF Export**: jsPDF with jspdf-autotable
- **CSV Parsing**: PapaParse
- **QR Codes**: qrcode.react
- **Form Handling**: React Hook Form with Zod validation

### Data Models (`shared/schema.ts`)
```typescript
- Product: id, product, sku, format, price, category, notes
- FieldMapping: Maps CSV headers to product fields (product, sku, format, price, category, notes)
- CompanyBranding: companyName, tagline, logoUrl
- SalesAgent: name, email, phone, region (max 2 agents)
- QRCodeConfig: url, size (optional footer QR code)
- Template: "modern" | "classic" | "minimal"
- Pricelist (DB table): id, name, description, branding, salesAgents, qrCode, products, fieldMapping, template, createdAt, updatedAt
- CompanyProfile (DB table): id, name, branding, createdAt, updatedAt (reusable company branding)
- SalesAgentProfile (DB table): id, name, agents, createdAt, updatedAt (reusable sales teams)
```

## User Workflow

1. **Admin Setup (Optional)** (`admin.tsx`)
   - Access via Admin button in header
   - Create reusable Company Profiles (company name, tagline, logo)
   - Create reusable Sales Agent Teams (up to 2 agents per team)
   - Edit and delete saved profiles
   - Profiles can be loaded into any pricelist

2. **CSV Upload** (`csv-upload.tsx`)
   - Drag & drop or file picker
   - Real-time validation
   - Preview of first 5 rows

3. **Field Mapping** (`field-mapping-panel.tsx`)
   - Map CSV headers to required fields (Product Name, SKU, Format, Price)
   - Map optional fields (Category, Notes)
   - Live preview of mapped data
   - Validation enforcement before continuing

4. **Configuration** (`configuration-panel.tsx` + `template-selector.tsx`)
   - Template selection (Modern, Classic, Minimal) with visual preview
   - Company branding:
     - Load from saved Company Profile (if profiles exist)
     - Or manually enter company name, tagline, logo
   - Sales agents:
     - Load from saved Sales Agent Team (if teams exist)
     - Or manually add up to 2 agents with name, email, phone, region
   - QR code (optional URL with live preview)
   - Validation alerts for limits

5. **Preview & Export** (`preview-panel.tsx` + `pricelist-document.tsx`)
   - Live preview with template-specific styling
   - Products grouped by category
   - Print-optimized layout
   - PDF export via jsPDF with template styling
   
6. **Save/Load** (`save-pricelist-dialog.tsx` + `load-pricelist-dropdown.tsx`)
   - Save pricelists to database with name and description
   - Load saved pricelists with all configuration
   - Update existing pricelists
   - Delete pricelists

## Key Features

### Admin System for Reusable Profiles
- **Company Profiles**: Save company branding (name, tagline, logo) for reuse across pricelists
- **Sales Agent Teams**: Save agent teams (up to 2 agents) for reuse across pricelists
- Full CRUD operations for both profile types
- Profile selector in configuration panel for quick loading
- Users can still manually enter data if they prefer

### Template System (3 Professional Styles)
1. **Modern** (Default): Dark category headers (#1a1a1a), zebra striping, Inter font, tabular numbers
2. **Classic**: Serif fonts (Georgia), full table borders, centered header, traditional layout
3. **Minimal**: Light font weights (300), list-style layout (no tables), generous spacing, subtle separators

### Database Persistence
- Save unlimited pricelists with name and description
- Load saved pricelists with full configuration (branding, agents, QR, template, products)
- Update existing pricelists
- Delete pricelists
- Timestamps for created/updated tracking
- Separate storage for reusable company and sales agent profiles

### Professional Document Design
- **Typography**: Template-specific fonts (Inter, Georgia, Helvetica)
- **Layout**: Template-specific headers, category grouping, professional footers
- **Table Design**: Varies by template (zebra striping, borders, or list layout)
- **Print Optimization**: Dedicated print styles, consistent spacing

### Validation & User Experience
- Required field mapping enforcement with clear alerts
- Sales agent limit (max 2) with validation
- QR code live preview
- Comprehensive error handling
- Loading states for all async operations
- Toast notifications for all user actions

### Export Quality
- Template-specific PDF generation (Modern, Classic, Minimal)
- Print-ready output
- Consistent typography and spacing per template
- Header with logo and company info
- Footer with sales agents (and QR code in preview)

## File Structure

```
client/src/
├── pages/
│   ├── home.tsx              # Main application page with workflow orchestration
│   └── admin.tsx             # Admin page for managing company/agent profiles
├── components/
│   ├── csv-upload.tsx        # CSV file upload with drag & drop
│   ├── field-mapping-panel.tsx  # Map CSV headers to fields
│   ├── template-selector.tsx # Template selection UI with 3 cards
│   ├── configuration-panel.tsx  # Company info, agents, QR code (with profile loading)
│   ├── preview-panel.tsx     # Preview controls and export
│   ├── pricelist-document.tsx  # Document renderer with template routing
│   ├── save-pricelist-dialog.tsx  # Save/update pricelist dialog
│   └── load-pricelist-dropdown.tsx  # Load/delete pricelist dropdown
├── lib/
│   ├── pdf-generator.ts      # jsPDF export logic
│   └── queryClient.ts        # TanStack Query setup
├── components/ui/            # Shadcn UI components
└── index.css                 # Global styles, design tokens, print styles

shared/
└── schema.ts                 # TypeScript types, Zod schemas, DB tables

server/
├── routes.ts                 # API routes (pricelists, company-profiles, sales-agent-profiles)
└── storage.ts                # Database storage interface

db/
└── index.ts                  # Drizzle database connection with Neon WebSocket config

design_guidelines.md          # Design system specification
```

## Design Guidelines

The application follows strict design guidelines documented in `design_guidelines.md`:
- **Color Palette**: Professional blue-gray scheme (#1E3A8A primary, #F8FAFC background)
- **Typography**: Inter font family, tabular numbers, proper hierarchy
- **Spacing**: Consistent 8px baseline grid
- **Components**: Document-first design optimized for print
- **Print Styles**: Dedicated styles for professional printed output

## Development Notes

### Running the Project
```bash
npm run dev  # Starts Vite dev server on port 5000
```

The workflow "Start application" is configured and runs automatically.

### Key Technical Decisions

1. **Client-Side Only**: No backend needed - all processing happens in browser for optimal performance and simplicity
2. **Professional Typography**: Inter font with tabular numbers ensures professional appearance
3. **Inline Styles**: Used in PricelistDocument for print consistency alongside Tailwind
4. **CSV Flexibility**: Field mapping allows any CSV structure to work
5. **Two-Agent Limit**: Footer layout optimized for maximum 2 sales agents

### Recent Enhancements

**November 16, 2025**:
1. ✅ **Fixed "PayloadTooLargeError" for large pricelists**
   - Increased Express body parser limit from 100KB to 50MB
   - Enables saving pricelists with 70+ products and base64-encoded logos
   - Fixes "Failed to save pricelist" error for large datasets
   - Configuration in `server/index.ts`: `express.json({ limit: '50mb' })`

**November 15, 2025 - Completed**:
1. ✅ Database persistence with PostgreSQL and Drizzle ORM
2. ✅ Template system with 3 professional styles (Modern, Classic, Minimal)
3. ✅ Save/load functionality with full configuration
4. ✅ Template-specific PDF generation
5. ✅ Neon WebSocket configuration for server-side database access
6. ✅ Admin system for managing reusable company profiles and sales agent teams
7. ✅ Profile selection integration in configuration panel
8. ✅ Product image support with Wix CSV integration
   - Optional "Product Image" field in CSV mapping
   - Displays thumbnail images in all three templates (Modern, Classic, Minimal)
   - Auto-completes Wix image URLs (prepends `https://static.wixstatic.com/media/` to filenames)
   - Auto-maps "productimageUrl" or "productImageUrl" columns
   - Field renamed: "Format/Size" → "Case/Size" (better matches Wix data structure)
   - Product Name field auto-mapping improved to prefer "Name" over "productimageUrl"
   - Case/Size auto-extracts from "Additional info sections" structured data (e.g., "CASE SIZE\n12 x 750 ml" → "12 x 750 ml")
9. ✅ Redesigned header layout (all templates)
   - Logo 2x larger (120-128px), positioned at far left
   - Title (24px) and tagline (14px) at TOP - straight horizontal lines starting just beyond logo
   - Sales team contact info at BOTTOM right
   - Dark green text (#2d5016) matching wine/spirits branding
   - Background color (#CCC79A) matching wine/spirits branding
   - Minimal header height - just enough to fit logo
   - Clean, professional letterhead-style design

10. ✅ Minimal height footer with pagination (all templates)
   - Thin separator line at top
   - No background color
   - Displays: "File: Pricelist", "Date: (current date)", "Page: [dynamic]", Company Name
   - QR code positioned at far right (32px size)
   - Compact 10px text for minimal vertical space
   - **Pagination**: Footer repeats on every printed page using CSS `position: fixed`
   - **Dynamic page numbers**: CSS counters automatically increment page numbers
   - **Page breaks**: Smart page break controls prevent awkward breaks within product rows and category sections

**Known Limitations**:
- Product images display in preview but are not included in PDF exports (requires complex image conversion)

**Planned Future Enhancements**:
1. Product image support in PDF exports (requires base64 image conversion)
2. Product filtering and sorting options
3. Custom product badges (NEW, SALE, LIMITED, etc.)
4. Column customization (add/remove product fields)
5. Excel (.xlsx) import support
6. Color scheme customization
7. Batch CSV processing
8. Industry-specific templates (wine/spirits, retail, wholesale)
9. WordPress integration
10. QR code in PDF exports (currently preview-only)

## Testing

The application should be tested for:
1. CSV upload with various file formats
2. Field mapping with different CSV structures
3. Logo upload and preview
4. Sales agent management (add, edit, remove, validation)
5. QR code generation and preview
6. Preview accuracy
7. PDF export quality
8. Print output quality

## User Preferences

**Design Philosophy**:
- Professional, print-ready output is paramount
- Clean, minimal UI focused on the document quality
- Document-first design approach
- Typography and spacing must be exceptional

**Key Requirements**:
- Support Wix CSV exports (extensible to other platforms)
- Maximum 2 sales agents in footer
- Optional QR code in footer
- Category-based product grouping
- Professional appearance suitable for customer distribution
