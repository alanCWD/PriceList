# Design Guidelines: Professional Product Pricelist Generator

## Design Approach: Document-First Utility System
**Selected Framework:** Clean, document-focused design inspired by professional business software (Notion, Figma, Linear) with emphasis on clarity, readability, and print optimization.

**Core Principle:** This is a B2B utility tool where function drives form. Every design decision prioritizes document quality, data clarity, and workflow efficiency.

---

## Typography System

**Primary Font:** Inter (Google Fonts)
- Headers: 600-700 weight
- Body: 400-500 weight
- Data/Numbers: 500 weight (tabular numbers)

**Type Scale:**
- Page Title: text-2xl (24px)
- Section Headers: text-lg (18px) 
- Product Categories: text-base font-semibold (16px)
- Body/Data: text-sm (14px)
- Footer Info: text-xs (12px)

---

## Layout & Spacing

**Tailwind Spacing Units:** Consistent use of 4, 6, 8, 12, 16 units
- Component padding: p-6, p-8
- Section gaps: gap-8, gap-12
- Table cell padding: px-4 py-3
- Page margins: Print-aware spacing

**Container Strategy:**
- Upload/Config Area: max-w-4xl centered
- Preview Area: Full-width with print dimensions (8.5" x 11" simulation)
- Two-column layout: 40/60 split (sidebar config + main preview)

---

## Component Library

### Header (Pricelist Document)
- Logo: Left-aligned, max-h-16, contained within clean border
- Title: Company name in text-2xl, tagline in text-sm text-gray-600
- Layout: Minimal whitespace, single horizontal line separator below

### Footer (Pricelist Document)
- Three-column grid: Sales agents (left 40%), Date/Page (center 30%), QR code (right 30%)
- Sales Agent Cards: Subtle border, compact spacing (p-4)
  - Name: font-semibold
  - Email/Phone: text-sm, icon prefix
- QR Code: 80x80px, subtle rounded border, shadow-sm

### Product Table
- Alternating row backgrounds: white/gray-50 zebra striping
- Column headers: Uppercase text-xs, font-semibold, bg-gray-100, sticky on scroll
- Borders: Subtle gray-200 horizontal lines only (no vertical)
- Column widths: Notes (15%), Product (35%), SKU (15%), Format (20%), Price (15%)

### Category Headers
- Full-width bar with bg-gray-800 text-white
- Left-aligned category name with subtle icon
- Margin-top for visual separation between groups

### Upload Interface
- Drag-and-drop zone: Dashed border-2, border-gray-300, bg-gray-50
- Hover state: border-blue-500, bg-blue-50
- File selected: Success state with green accent
- Field mapping: Two-column grid showing CSV → Pricelist mappings

### Configuration Panel
- Sidebar with clean form inputs
- Logo upload: Image preview with replace button
- Sales agent inputs: Stacked forms with clear labels
- QR code config: URL input with live preview
- All inputs: Consistent height (h-10), border-gray-300

### Preview Panel
- White background simulating paper
- Box shadow to lift from page (shadow-xl)
- Zoom controls: 75%, 100%, 125% buttons
- Page break indicators: Dashed horizontal lines in preview mode

---

## Visual Elements

**Borders & Dividers:**
- Use sparingly: border-gray-200 for table rows
- Header/footer separators: border-t-2 border-gray-800

**Shadows:**
- Preview container: shadow-xl
- QR code: shadow-sm
- Modals/dropdowns: shadow-lg

**Icons:**
- Source: Heroicons (outline style)
- Size: w-5 h-5 for UI, w-4 h-4 for inline elements
- Usage: Upload icon, agent contact icons (mail, phone), category icons

---

## Print Optimization

**Page Structure:**
- A4/Letter size simulation in preview
- Proper margins: 0.75" all sides
- Page breaks: Avoid breaking product groups mid-category
- Print CSS: Hide UI elements, show only document content

**PDF Generation:**
- High-quality rendering at 300dpi equivalent
- Embedded fonts for consistency
- Crisp QR code rendering

---

## Interaction Patterns

**File Upload Flow:**
1. Drag/drop or click to upload CSV
2. Automatic field detection with smart mapping suggestions
3. Manual field mapping interface if needed
4. Live preview updates instantly

**Configuration Updates:**
- All changes reflect in real-time preview
- No "Apply" button needed—immediate feedback
- Clear visual indicators for unsaved changes

**Data Display:**
- Expandable/collapsible categories (optional toggle)
- Search/filter products in preview
- Column sorting by clicking headers

---

## Color Strategy (Minimal Palette)

**Document Colors:**
- Background: Pure white (#FFFFFF)
- Text: Near-black (#1F2937) for body, #111827 for headers
- Muted text: #6B7280
- Accents: Professional blue (#2563EB) for interactive elements
- Category headers: #1F2937 dark gray

**UI Colors:**
- Success states: Green-600
- Interactive elements: Blue-600
- Borders: Gray-200/300
- Backgrounds: Gray-50/100 for alternating/inactive states

---

## Accessibility

- WCAG AA contrast ratios throughout
- Form labels clearly associated with inputs
- Keyboard navigation for all interactive elements
- Focus indicators on all focusable elements (ring-2 ring-blue-500)
- Alt text for logo images
- Print-friendly high contrast in final output

---

## Images

**Logo:**
- User uploads company logo
- Displays in header at max-h-16
- Maintains aspect ratio
- Fallback: Company name text if no logo provided

**No hero image needed** - This is a document generation tool, not a marketing site. Focus is entirely on the functional interface and document preview.