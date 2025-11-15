# Product Pricelist Generator

## Overview
A professional web application that creates stylish, print-ready pricelists from CSV files exported from Wix websites (and future platform support planned). The application features a clean header with logo, footer with dual sales agent contact info and QR code, category-grouped products, configurable field mapping, and PDF export functionality.

**Last Updated**: November 15, 2025

## Project Architecture

### Client-Side Architecture (No Backend Required)
The application is built entirely client-side for optimal performance and simplicity:
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
```

## User Workflow

1. **CSV Upload** (`csv-upload.tsx`)
   - Drag & drop or file picker
   - Real-time validation
   - Preview of first 5 rows

2. **Field Mapping** (`field-mapping-panel.tsx`)
   - Map CSV headers to required fields (Product Name, SKU, Format, Price)
   - Map optional fields (Category, Notes)
   - Live preview of mapped data
   - Validation enforcement before continuing

3. **Configuration** (`configuration-panel.tsx`)
   - Company branding (name, tagline, logo upload with preview)
   - Sales agents (up to 2 with name, email, phone, region)
   - QR code (optional URL with live preview)
   - Validation alerts for limits

4. **Preview & Export** (`preview-panel.tsx` + `pricelist-document.tsx`)
   - Live preview with professional document styling
   - Products grouped by category
   - Print-optimized layout
   - PDF export via jsPDF

## Key Features

### Professional Document Design
- **Typography**: Inter font with tabular numbers for prices/SKUs
- **Layout**: Clean header, category-grouped products, professional footer
- **Table Design**: Zebra striping, proper spacing, clear hierarchy
- **Print Optimization**: Dedicated print styles, consistent spacing

### Validation & User Experience
- Required field mapping enforcement with clear alerts
- Sales agent limit (max 2) with validation
- QR code live preview
- Comprehensive error handling
- Loading states for all async operations

### Export Quality
- Professional PDF generation
- Print-ready output
- Consistent typography and spacing
- Header with logo and company info
- Footer with sales agents and QR code

## File Structure

```
client/src/
├── pages/
│   └── home.tsx              # Main application page with workflow orchestration
├── components/
│   ├── csv-upload.tsx        # CSV file upload with drag & drop
│   ├── field-mapping-panel.tsx  # Map CSV headers to fields
│   ├── configuration-panel.tsx  # Company info, agents, QR code
│   ├── preview-panel.tsx     # Preview controls and export
│   └── pricelist-document.tsx  # Document renderer (preview & print)
├── lib/
│   ├── pdf-generator.ts      # jsPDF export logic
│   └── queryClient.ts        # TanStack Query setup
├── components/ui/            # Shadcn UI components
└── index.css                 # Global styles, design tokens, print styles

shared/
└── schema.ts                 # TypeScript types and Zod schemas

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

### Known Limitations & Future Enhancements

**MVP Scope**:
- PDF and preview use different rendering (jsPDF vs React) - both professional but not pixel-perfect matches
- Client-side only (no backend persistence)
- Single-page application

**Planned Enhancements**:
1. Consolidate PDF/preview styling for perfect parity
2. Support for WordPress and other e-commerce platforms
3. Template system for different pricelist styles
4. Save/load configuration profiles
5. Batch processing multiple CSVs
6. Custom category ordering

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
