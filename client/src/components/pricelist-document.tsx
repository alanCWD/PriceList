import { Mail, Phone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { getDisplayName } from "@/lib/collection-parser";
import { sortBrandGroups, type BrandOrderingEntry } from "@/lib/sort-utils";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, Template } from "@shared/schema";

// Helper function to format price with 2 decimal places
function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price; // Return as-is if not a number
  return num.toFixed(2);
}

interface PricelistDocumentProps {
  products: Product[];
  groupedProducts: [string, Product[]][];  // Ordered array of [brandName, products[]]
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  template?: Template;
  brandOrdering?: BrandOrderingEntry[];  // Optional brand ordering data for sorting
}

export function PricelistDocument({
  products,
  groupedProducts,
  branding,
  salesAgents,
  qrCodeConfig,
  template = "pricelist",
  brandOrdering,
}: PricelistDocumentProps) {
  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const dayMonthDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Defensive sorting: ensure brand groups are in correct order
  // even if caller bypasses PreviewPanel sorting
  const sortedGroupedProducts = sortBrandGroups([...groupedProducts], brandOrdering);

  // "catalogue" template uses the ClassicTemplate (with product images)
  if (template === "catalogue") {
    return <ClassicTemplate 
      products={products}
      groupedProducts={sortedGroupedProducts}
      branding={branding}
      salesAgents={salesAgents}
      qrCodeConfig={qrCodeConfig}
      currentDate={dayMonthDate}
    />;
  }

  // "pricelist" template uses the MinimalTemplate (simple and elegant)
  if (template === "pricelist") {
    return <MinimalTemplate 
      products={products}
      groupedProducts={sortedGroupedProducts}
      branding={branding}
      salesAgents={salesAgents}
      qrCodeConfig={qrCodeConfig}
      currentDate={dayMonthDate}
    />;
  }

  // Use extracted colors from logo, or fallback to neutral defaults
  const headerBgColor = branding.headerBackgroundColor || '#f8f9fa';
  const headerTextColor = branding.headerTextColor || '#1a1a1a';

  return (
    <div className="pricelist-document font-sans" id="pricelist-document" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header - Logo far left, title/tagline at top, sales team at bottom */}
      <header className="px-12 border-b-2 border-gray-900" style={{ backgroundColor: headerBgColor }}>
        <div className="flex gap-6">
          {/* Logo - Far Left, no vertical padding */}
          {branding.logoUrl && (
            <div className="flex-shrink-0">
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="w-auto object-contain block"
                data-testid="img-header-logo"
                style={{ maxHeight: '120px' }}
              />
            </div>
          )}
          
          {/* Content Area - slightly taller for better spacing */}
          <div className="flex-1 flex flex-col justify-between py-2" style={{ minHeight: '145px' }}>
            {/* Title and Tagline - Top with tight spacing */}
            <div className="flex flex-col">
              <h1 
                className="font-semibold leading-tight tracking-tight" 
                data-testid="text-company-name"
                style={{ fontSize: '22px', fontWeight: 600, lineHeight: 1.2, color: headerTextColor }}
              >
                {branding.companyName}
              </h1>
              {branding.tagline && (
                <p 
                  className="italic" 
                  data-testid="text-tagline"
                  style={{ fontSize: '11px', fontStyle: 'italic', lineHeight: 1.3, color: headerTextColor, marginTop: '1px' }}
                >
                  {branding.tagline}
                </p>
              )}
            </div>
            
            {/* Sales Agents - Bottom Right with visible spacing above */}
            {salesAgents.length > 0 && (
              <div className="flex gap-6 justify-end">
                {salesAgents.map((agent, index) => (
                  <div key={index} className="text-right min-w-0" data-testid={`agent-header-${index}`}>
                    {agent.region && (
                      <p 
                        className="font-semibold uppercase tracking-wide"
                        style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.025em', color: headerTextColor, opacity: 0.8 }}
                      >
                        {agent.region}
                      </p>
                    )}
                    <p 
                      className="font-medium" 
                      style={{ fontSize: '11px', fontWeight: 500, color: headerTextColor }}
                    >
                      {agent.name}
                    </p>
                    <p 
                      style={{ fontSize: '9px', color: headerTextColor, opacity: 0.8 }}
                    >
                      {agent.email}
                    </p>
                    <p 
                      style={{ fontSize: '9px', color: headerTextColor, opacity: 0.8 }}
                    >
                      {agent.phone}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Products by Brand */}
      <main className="px-12 py-8" style={{ paddingTop: '32px', paddingBottom: '32px' }}>
        {sortedGroupedProducts.map(([brandName, categoryProducts], categoryIndex) => (
          <div 
            key={brandName} 
            className={categoryIndex > 0 ? "mt-12" : ""}
            style={{ marginTop: categoryIndex > 0 ? '48px' : '0' }}
          >
            {/* Category Header - Bold and Clear */}
            <div 
              className="bg-gray-900 text-white px-6 py-3 mb-4" 
              style={{ 
                backgroundColor: '#1a1a1a',
                color: '#ffffff',
                padding: '12px 24px',
                marginBottom: '16px'
              }}
            >
              <h2 
                className="text-base font-semibold" 
                data-testid={`category-${categoryIndex}`}
                style={{ fontSize: '16px', fontWeight: 600 }}
              >
                {brandName}
              </h2>
            </div>

            {/* Products Table - Professional Typography */}
            <table 
              className="w-full border-collapse" 
              style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '15%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Notes/Order
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '35%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Product
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '15%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    SKU
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '17%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Format
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '12%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryProducts.map((product, productIndex) => (
                  <tr
                    key={product.id}
                    className="border-b border-gray-200"
                    data-testid={`product-row-${product.id}`}
                    style={{
                      backgroundColor: productIndex % 2 === 0 ? '#ffffff' : '#f9fafb',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    <td 
                      className="px-4 py-3 text-xs text-gray-600 align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '12px',
                        color: '#4b5563',
                        verticalAlign: 'top'
                      }}
                    >
                      {product.notes || ""}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-900 font-medium align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827',
                        verticalAlign: 'top'
                      }}
                    >
                      {product.product}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-700 align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#374151',
                        verticalAlign: 'top',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {product.sku}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-700 align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#374151',
                        verticalAlign: 'top'
                      }}
                    >
                      {product.format}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-900 font-medium align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827',
                        verticalAlign: 'top',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {formatPrice(product.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>

      {/* Footer - Minimal Height */}
      <footer 
        className="px-12 py-2 border-t border-gray-300 mt-8"
        style={{ marginTop: '32px', borderTop: '1px solid #d1d5db', paddingTop: '8px', paddingBottom: '8px' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-gray-600" style={{ fontSize: '10px', color: '#6b7280' }}>
            <span className="page-number">Page: </span>
            <span>{branding.companyName} Pricelist - {dayMonthDate}</span>
          </div>

          {/* QR Code - Far Right */}
          {qrCodeConfig && (
            <div className="flex-shrink-0">
              <QRCodeSVG
                value={qrCodeConfig.url}
                size={32}
                data-testid="qr-code"
              />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

interface TemplateProps {
  products: Product[];
  groupedProducts: [string, Product[]][];  // Ordered array of [brandName, products[]]
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  currentDate: string;
}

function ClassicTemplate({
  groupedProducts,
  branding,
  salesAgents,
  qrCodeConfig,
  currentDate,
}: TemplateProps) {
  // Use branding colors from color picker (same as Pricelist template)
  const headerBgColor = branding.headerBackgroundColor || '#f8f9fa';
  const headerTextColor = branding.headerTextColor || '#1a1a1a';

  return (
    <div className="pricelist-document font-serif" id="pricelist-document" style={{ fontFamily: 'Georgia, serif' }}>
      <header className="px-12 border-b-2 border-gray-900" style={{ backgroundColor: headerBgColor }}>
        <div className="flex gap-6">
          {/* Logo - Far Left, no vertical padding */}
          {branding.logoUrl && (
            <div className="flex-shrink-0">
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="w-auto object-contain block"
                data-testid="img-header-logo"
                style={{ maxHeight: '120px' }}
              />
            </div>
          )}
          
          {/* Content Area - slightly taller for better spacing */}
          <div className="flex-1 flex flex-col justify-between py-2" style={{ minHeight: '145px' }}>
            {/* Title and Tagline - Top with tight spacing */}
            <div className="flex flex-col">
              <h1 
                className="font-semibold leading-tight tracking-tight"
                data-testid="text-company-name"
                style={{ fontSize: '22px', fontWeight: 600, lineHeight: 1.2, color: headerTextColor }}
              >
                {branding.companyName}
              </h1>
              {branding.tagline && (
                <p 
                  className="italic"
                  data-testid="text-tagline"
                  style={{ fontSize: '11px', fontStyle: 'italic', lineHeight: 1.3, color: headerTextColor, marginTop: '1px' }}
                >
                  {branding.tagline}
                </p>
              )}
            </div>
            
            {/* Sales Agents - Bottom Right with visible spacing above */}
            {salesAgents.length > 0 && (
              <div className="flex gap-6 justify-end">
                {salesAgents.map((agent, index) => (
                  <div key={index} className="text-right min-w-0" data-testid={`agent-header-${index}`}>
                    {agent.region && (
                      <p 
                        className="font-semibold uppercase tracking-wide"
                        style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.025em', color: headerTextColor, opacity: 0.8 }}
                      >
                        {agent.region}
                      </p>
                    )}
                    <p 
                      className="font-medium" 
                      style={{ fontSize: '11px', fontWeight: 500, color: headerTextColor }}
                    >
                      {agent.name}
                    </p>
                    <p 
                      style={{ fontSize: '9px', color: headerTextColor, opacity: 0.8 }}
                    >
                      {agent.email}
                    </p>
                    <p 
                      style={{ fontSize: '9px', color: headerTextColor, opacity: 0.8 }}
                    >
                      {agent.phone}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Products by Brand */}
      <main className="px-12 py-8" style={{ paddingTop: '32px', paddingBottom: '32px' }}>
        {groupedProducts.map(([brandName, categoryProducts], categoryIndex) => (
          <div 
            key={brandName} 
            className={categoryIndex > 0 ? "mt-12" : ""}
            style={{ marginTop: categoryIndex > 0 ? '48px' : '0' }}
          >
            {/* Brand Header - Matches Pricelist style with branding colors */}
            <div 
              className="px-6 py-3 mb-4" 
              style={{ 
                backgroundColor: headerBgColor,
                padding: '12px 24px',
                marginBottom: '16px'
              }}
            >
              <h2 
                className="text-base font-semibold" 
                data-testid={`category-${categoryIndex}`}
                style={{ fontSize: '16px', fontWeight: 600, color: headerTextColor }}
              >
                {brandName}
              </h2>
            </div>

            {/* Products Table - No grid lines, alternating rows */}
            <table 
              className="w-full border-collapse" 
              style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '8%', 
                      padding: '12px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'center',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Image
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '10%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    SKU
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '36%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Product
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '14%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Format
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '10%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'right',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Price
                  </th>
                  <th 
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-gray-700"
                    style={{ 
                      width: '17%', 
                      padding: '12px 16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'left',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f3f4f6',
                      borderBottom: '1px solid #d1d5db'
                    }}
                  >
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryProducts.map((product, productIndex) => (
                  <tr 
                    key={product.id}
                    data-testid={`product-row-${product.id}`}
                    style={{
                      backgroundColor: productIndex % 2 === 0 ? '#ffffff' : '#f9fafb',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    <td 
                      className="px-2 py-3 text-center align-middle"
                      style={{ 
                        padding: '8px',
                        verticalAlign: 'middle',
                        textAlign: 'center'
                      }}
                    >
                      {product.productImageUrl ? (
                        <img 
                          src={product.productImageUrl} 
                          alt={product.product}
                          style={{ width: '40px', height: '40px', objectFit: 'contain', display: 'inline-block' }}
                          data-testid={`product-image-${product.id}`}
                        />
                      ) : (
                        <div 
                          style={{ 
                            width: '40px', 
                            height: '40px', 
                            backgroundColor: '#f3f4f6', 
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9ca3af',
                            fontSize: '8px'
                          }}
                        >
                          No img
                        </div>
                      )}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-700 align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#374151',
                        verticalAlign: 'top',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {product.sku}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-900 font-medium align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827',
                        verticalAlign: 'top'
                      }}
                    >
                      <div>{product.product}</div>
                      {product.description && (
                        <div 
                          style={{ 
                            fontStyle: 'italic', 
                            fontSize: '12px', 
                            color: '#6b7280',
                            marginTop: '4px',
                            fontWeight: 400
                          }}
                          dangerouslySetInnerHTML={{ __html: product.description }}
                        />
                      )}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-700 align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        color: '#374151',
                        verticalAlign: 'top'
                      }}
                    >
                      {product.format}
                    </td>
                    <td 
                      className="px-4 py-3 text-sm text-gray-900 font-medium align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#111827',
                        verticalAlign: 'top',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'right'
                      }}
                    >
                      {formatPrice(product.price)}
                    </td>
                    <td 
                      className="px-4 py-3 text-xs text-gray-600 align-top"
                      style={{ 
                        padding: '12px 16px',
                        fontSize: '12px',
                        color: '#4b5563',
                        verticalAlign: 'top'
                      }}
                    >
                      {product.notes || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>

      {/* Footer - Minimal Height */}
      <footer 
        className="px-12 py-2 border-t border-gray-300 mt-8"
        style={{ marginTop: '32px', borderTop: '1px solid #d1d5db', paddingTop: '8px', paddingBottom: '8px' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-gray-600" style={{ fontSize: '10px', color: '#6b7280' }}>
            <span className="page-number">Page: </span>
            <span>{branding.companyName} Pricelist - {currentDate}</span>
          </div>

          {/* QR Code - Far Right */}
          {qrCodeConfig && (
            <div className="flex-shrink-0">
              <QRCodeSVG
                value={qrCodeConfig.url}
                size={32}
                data-testid="qr-code"
              />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

function MinimalTemplate({
  groupedProducts,
  branding,
  salesAgents,
  qrCodeConfig,
  currentDate,
}: TemplateProps) {
  // Use branding colors or defaults
  const headerBgColor = branding.headerBackgroundColor || '#f8f9fa';
  const headerTextColor = branding.headerTextColor || '#1a1a1a';

  return (
    <div className="pricelist-document font-sans" id="pricelist-document" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Ultra-Compact Header */}
      <header 
        className="px-8 py-2"
        style={{ 
          backgroundColor: headerBgColor,
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '32px',
          paddingRight: '32px'
        }}
      >
        <div className="flex gap-4 items-center">
          {/* Logo - Far Left (Compact) */}
          {branding.logoUrl && (
            <div className="flex-shrink-0">
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="w-auto object-contain"
                data-testid="img-header-logo"
                style={{ height: '40px' }}
              />
            </div>
          )}
          
          {/* Title - Center */}
          <div className="flex-1 text-center">
            <h1 
              className="font-semibold"
              data-testid="text-company-name"
              style={{ fontSize: '16px', fontWeight: 600, color: headerTextColor, lineHeight: '1.2' }}
            >
              {branding.companyName}
            </h1>
            {branding.tagline && (
              <p 
                className="text-xs"
                data-testid="text-tagline"
                style={{ fontSize: '9px', marginTop: '2px', color: headerTextColor, lineHeight: '1.2' }}
              >
                {branding.tagline}
              </p>
            )}
          </div>
          
          {/* Sales Agents - Right */}
          {salesAgents.length > 0 && (
            <div className="flex gap-4 flex-shrink-0">
              {salesAgents.slice(0, 2).map((agent, index) => (
                <div key={index} className="text-right text-xs" data-testid={`agent-header-${index}`} style={{ fontSize: '7px', lineHeight: '1.2' }}>
                  {agent.region && (
                    <p style={{ fontWeight: 500, color: headerTextColor }}>
                      {agent.region}
                    </p>
                  )}
                  <p style={{ fontWeight: 500, color: headerTextColor }}>
                    {agent.name}
                  </p>
                  <p style={{ color: headerTextColor, opacity: 0.9 }}>
                    {agent.email}
                  </p>
                  <p style={{ color: headerTextColor, opacity: 0.9 }}>
                    {agent.phone}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Ultra-Compact Table Layout */}
      <main className="px-8 py-4" style={{ paddingTop: '16px', paddingBottom: '16px', paddingLeft: '32px', paddingRight: '32px' }}>
        {groupedProducts.map(([brandName, categoryProducts], categoryIndex) => {
            // brandName is now the clean brand name (e.g., "Mt. Boucherie Estate Winery")
            const displayName = brandName;
            
            return (
              <div key={brandName} className={categoryIndex > 0 ? "mt-6" : ""} style={{ marginTop: categoryIndex > 0 ? '24px' : '0' }}>
                {/* Compact Brand Header - Matches header background with grey text */}
                <h2 
                  className="font-semibold mb-2"
                  data-testid={`category-${categoryIndex}`}
                  style={{ 
                    fontSize: '11px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    padding: '6px 8px',
                    backgroundColor: headerBgColor,
                    color: '#D8DBD9',
                    borderRadius: '2px'
                  }}
                >
                  {displayName}
                </h2>

                {/* Ultra-Compact Table */}
                <table 
              className="w-full border-collapse"
              style={{ 
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '8.5px',
                lineHeight: '1.2'
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th 
                    className="text-left font-semibold"
                    style={{ 
                      padding: '2px 4px',
                      fontSize: '7px',
                      fontWeight: 600,
                      textAlign: 'left',
                      width: '12%'
                    }}
                  >
                    SKU
                  </th>
                  <th 
                    className="text-left font-semibold"
                    style={{ 
                      padding: '2px 4px',
                      fontSize: '7px',
                      fontWeight: 600,
                      textAlign: 'left',
                      width: '42%'
                    }}
                  >
                    Product
                  </th>
                  <th 
                    className="text-left font-semibold"
                    style={{ 
                      padding: '2px 4px',
                      fontSize: '7px',
                      fontWeight: 600,
                      textAlign: 'left',
                      width: '12%'
                    }}
                  >
                    Format
                  </th>
                  <th 
                    className="text-right font-semibold"
                    style={{ 
                      padding: '2px 4px',
                      fontSize: '7px',
                      fontWeight: 600,
                      textAlign: 'right',
                      width: '8%'
                    }}
                  >
                    Price
                  </th>
                  <th 
                    className="text-left font-semibold"
                    style={{ 
                      padding: '2px 4px',
                      fontSize: '7px',
                      fontWeight: 600,
                      textAlign: 'left',
                      width: '20%'
                    }}
                  >
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryProducts.map((product, productIndex) => (
                  <tr 
                    key={product.id}
                    data-testid={`product-row-${product.id}`}
                    style={{ 
                      backgroundColor: productIndex % 2 === 0 ? '#ffffff' : '#f2f2f2'
                    }}
                  >
                    <td style={{ padding: '1px 4px', fontSize: '8.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {product.sku}
                    </td>
                    <td style={{ padding: '1px 4px', fontSize: '8.5px', fontWeight: 500 }}>
                      {product.product}
                    </td>
                    <td style={{ padding: '1px 4px', fontSize: '8.5px' }}>
                      {product.format}
                    </td>
                    <td style={{ padding: '1px 4px', fontSize: '8.5px', fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(product.price)}
                    </td>
                    <td style={{ padding: '1px 4px', fontSize: '8.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {product.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
                </table>
              </div>
            );
          })}
      </main>

      {/* Compact Footer */}
      <footer 
        className="px-8 py-1 border-t mt-6"
        style={{ 
          marginTop: '24px',
          borderTop: '1px solid #d1d5db',
          paddingTop: '4px',
          paddingBottom: '4px',
          paddingLeft: '32px',
          paddingRight: '32px'
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2" style={{ fontSize: '7px', color: '#6b7280' }}>
            <span className="page-number">Page: </span>
            <span>{branding.companyName} Pricelist - {currentDate}</span>
          </div>

          {qrCodeConfig && (
            <div className="flex-shrink-0">
              <QRCodeSVG
                value={qrCodeConfig.url}
                size={20}
                data-testid="qr-code"
              />
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
