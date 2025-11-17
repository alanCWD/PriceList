import { Mail, Phone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, Template } from "@shared/schema";

interface PricelistDocumentProps {
  products: Product[];
  groupedProducts: Record<string, Product[]>;
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  template?: Template;
}

export function PricelistDocument({
  products,
  groupedProducts,
  branding,
  salesAgents,
  qrCodeConfig,
  template = "modern",
}: PricelistDocumentProps) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  if (template === "classic") {
    return <ClassicTemplate 
      products={products}
      groupedProducts={groupedProducts}
      branding={branding}
      salesAgents={salesAgents}
      qrCodeConfig={qrCodeConfig}
      currentDate={currentDate}
    />;
  }

  if (template === "minimal") {
    return <MinimalTemplate 
      products={products}
      groupedProducts={groupedProducts}
      branding={branding}
      salesAgents={salesAgents}
      qrCodeConfig={qrCodeConfig}
      currentDate={currentDate}
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

      {/* Products by Category */}
      <main className="px-12 py-8" style={{ paddingTop: '32px', paddingBottom: '32px' }}>
        {Object.entries(groupedProducts).map(([category, categoryProducts], categoryIndex) => (
          <div 
            key={category} 
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
                {category}
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
                  {categoryProducts.some(p => p.productImageUrl) && (
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
                      Image
                    </th>
                  )}
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
                      width: categoryProducts.some(p => p.productImageUrl) ? '30%' : '35%', 
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
                      width: '20%', 
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
                    {categoryProducts.some(p => p.productImageUrl) && (
                      <td 
                        className="px-4 py-3 align-top"
                        style={{ 
                          padding: '12px 16px',
                          verticalAlign: 'top'
                        }}
                      >
                        {product.productImageUrl && (
                          <img
                            src={product.productImageUrl}
                            alt={product.product}
                            className="w-12 h-12 object-cover rounded border border-gray-200"
                            style={{ 
                              width: '48px',
                              height: '48px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #e5e7eb'
                            }}
                            onError={(e) => {
                              console.error('Image failed to load:', product.productImageUrl);
                              e.currentTarget.style.display = 'none';
                            }}
                            data-testid={`product-image-${product.id}`}
                          />
                        )}
                      </td>
                    )}
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
                      {product.price}
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
            <span>File: Pricelist</span>
            <span>Date: {currentDate}</span>
            <span className="page-number">Page: </span>
            <span>{branding.companyName}</span>
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
  groupedProducts: Record<string, Product[]>;
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
  return (
    <div className="pricelist-document font-serif" id="pricelist-document" style={{ fontFamily: 'Georgia, serif' }}>
      <header className="px-12 py-3 border-b border-gray-400" style={{ backgroundColor: '#CCC79A' }}>
        <div className="flex gap-6">
          {/* Logo - Far Left */}
          {branding.logoUrl && (
            <div className="flex-shrink-0">
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="w-auto object-contain"
                data-testid="img-header-logo"
                style={{ height: '128px' }}
              />
            </div>
          )}
          
          {/* Content Area */}
          <div className="flex-1 flex flex-col justify-between" style={{ minHeight: '128px' }}>
            {/* Title and Tagline - Top */}
            <div>
              <h1 
                className="font-bold"
                data-testid="text-company-name"
                style={{ fontSize: '24px', fontWeight: 700, color: '#2d5016' }}
              >
                {branding.companyName}
              </h1>
              {branding.tagline && (
                <p 
                  className="italic mt-1"
                  data-testid="text-tagline"
                  style={{ fontSize: '14px', fontStyle: 'italic', marginTop: '4px', color: '#2d5016' }}
                >
                  {branding.tagline}
                </p>
              )}
            </div>
            
            {/* Sales Agents - Bottom Right */}
            {salesAgents.length > 0 && (
              <div className="flex gap-6 justify-end">
                {salesAgents.map((agent, index) => (
                  <div key={index} className="text-right min-w-0" data-testid={`agent-header-${index}`}>
                    {agent.region && (
                      <p 
                        className="font-semibold uppercase"
                        style={{ fontSize: '10px', fontWeight: 600, color: '#2d5016' }}
                      >
                        {agent.region}
                      </p>
                    )}
                    <p 
                      className="font-medium" 
                      style={{ fontSize: '12px', fontWeight: 500, color: '#2d5016' }}
                    >
                      {agent.name}
                    </p>
                    <p 
                      style={{ fontSize: '10px', color: '#2d5016' }}
                    >
                      {agent.email}
                    </p>
                    <p 
                      style={{ fontSize: '10px', color: '#2d5016' }}
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

      <main className="px-12 py-8" style={{ paddingTop: '32px', paddingBottom: '32px' }}>
        {Object.entries(groupedProducts).map(([category, categoryProducts], categoryIndex) => (
          <div key={category} className={categoryIndex > 0 ? "mt-10" : ""} style={{ marginTop: categoryIndex > 0 ? '40px' : '0' }}>
            <h2 
              className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b-2 border-gray-400"
              data-testid={`category-${categoryIndex}`}
              style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #9ca3af' }}
            >
              {category}
            </h2>

            <table 
              className="w-full border border-gray-400"
              style={{ width: '100%', border: '1px solid #9ca3af', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}
            >
              <thead>
                <tr className="bg-gray-200 border-b border-gray-400">
                  {categoryProducts.some(p => p.productImageUrl) && (
                    <th style={{ width: '8%', padding: '10px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'left', border: '1px solid #9ca3af' }}>
                      Image
                    </th>
                  )}
                  <th style={{ width: '12%', padding: '10px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'left', border: '1px solid #9ca3af' }}>
                    SKU
                  </th>
                  <th style={{ width: categoryProducts.some(p => p.productImageUrl) ? '35%' : '40%', padding: '10px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'left', border: '1px solid #9ca3af' }}>
                    Product
                  </th>
                  <th style={{ width: '18%', padding: '10px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'left', border: '1px solid #9ca3af' }}>
                    Format
                  </th>
                  <th style={{ width: '12%', padding: '10px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'right', border: '1px solid #9ca3af' }}>
                    Price
                  </th>
                  <th style={{ width: categoryProducts.some(p => p.productImageUrl) ? '15%' : '18%', padding: '10px 12px', fontSize: '12px', fontWeight: 600, textAlign: 'left', border: '1px solid #9ca3af' }}>
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryProducts.map((product, productIndex) => (
                  <tr 
                    key={product.id}
                    data-testid={`product-row-${product.id}`}
                  >
                    {categoryProducts.some(p => p.productImageUrl) && (
                      <td style={{ padding: '10px 12px', border: '1px solid #9ca3af' }}>
                        {product.productImageUrl && (
                          <img
                            src={product.productImageUrl}
                            alt={product.product}
                            style={{ 
                              width: '40px',
                              height: '40px',
                              objectFit: 'cover',
                              borderRadius: '2px',
                              border: '1px solid #d1d5db'
                            }}
                            onError={(e) => {
                              console.error('Image failed to load:', product.productImageUrl);
                              e.currentTarget.style.display = 'none';
                            }}
                            data-testid={`product-image-${product.id}`}
                          />
                        )}
                      </td>
                    )}
                    <td style={{ padding: '10px 12px', fontSize: '12px', border: '1px solid #9ca3af' }}>
                      {product.sku}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', border: '1px solid #9ca3af' }}>
                      {product.product}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', border: '1px solid #9ca3af' }}>
                      {product.format}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', border: '1px solid #9ca3af' }}>
                      {product.price}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', border: '1px solid #9ca3af' }}>
                      {product.notes}
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
            <span>File: Pricelist</span>
            <span>Date: {currentDate}</span>
            <span className="page-number">Page: </span>
            <span>{branding.companyName}</span>
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
  return (
    <div className="pricelist-document font-sans" id="pricelist-document" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="px-16 py-3" style={{ backgroundColor: '#CCC79A' }}>
        <div className="flex gap-6">
          {/* Logo - Far Left */}
          {branding.logoUrl && (
            <div className="flex-shrink-0">
              <img
                src={branding.logoUrl}
                alt={branding.companyName}
                className="w-auto object-contain"
                data-testid="img-header-logo"
                style={{ height: '120px' }}
              />
            </div>
          )}
          
          {/* Content Area */}
          <div className="flex-1 flex flex-col justify-between" style={{ minHeight: '120px' }}>
            {/* Title and Tagline - Top */}
            <div>
              <h1 
                className="font-light"
                data-testid="text-company-name"
                style={{ fontSize: '24px', fontWeight: 300, color: '#2d5016' }}
              >
                {branding.companyName}
              </h1>
              {branding.tagline && (
                <p 
                  className="font-light mt-1"
                  data-testid="text-tagline"
                  style={{ fontSize: '14px', fontWeight: 300, marginTop: '4px', color: '#2d5016' }}
                >
                  {branding.tagline}
                </p>
              )}
            </div>
            
            {/* Sales Agents - Bottom Right */}
            {salesAgents.length > 0 && (
              <div className="flex gap-6 justify-end">
                {salesAgents.map((agent, index) => (
                  <div key={index} className="text-right min-w-0" data-testid={`agent-header-${index}`}>
                    {agent.region && (
                      <p 
                        className="font-medium"
                        style={{ fontSize: '10px', fontWeight: 500, color: '#2d5016' }}
                      >
                        {agent.region}
                      </p>
                    )}
                    <p 
                      className="font-medium" 
                      style={{ fontSize: '12px', fontWeight: 400, color: '#2d5016' }}
                    >
                      {agent.name}
                    </p>
                    <p 
                      style={{ fontSize: '10px', fontWeight: 300, color: '#2d5016' }}
                    >
                      {agent.email}
                    </p>
                    <p 
                      style={{ fontSize: '10px', fontWeight: 300, color: '#2d5016' }}
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

      <main className="px-16 py-6" style={{ paddingTop: '24px', paddingBottom: '24px' }}>
        {Object.entries(groupedProducts).map(([category, categoryProducts], categoryIndex) => (
          <div key={category} className={categoryIndex > 0 ? "mt-16" : ""} style={{ marginTop: categoryIndex > 0 ? '64px' : '0' }}>
            <h2 
              className="text-2xl font-light text-gray-900 mb-6"
              data-testid={`category-${categoryIndex}`}
              style={{ fontSize: '24px', fontWeight: 300, marginBottom: '24px' }}
            >
              {category}
            </h2>

            <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {categoryProducts.map((product) => (
                <div 
                  key={product.id}
                  className="flex items-start gap-4 py-3 border-b border-gray-200"
                  data-testid={`product-row-${product.id}`}
                  style={{ paddingTop: '12px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}
                >
                  {product.productImageUrl && (
                    <div className="flex-shrink-0">
                      <img
                        src={product.productImageUrl}
                        alt={product.product}
                        style={{ 
                          width: '48px',
                          height: '48px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid #e5e7eb'
                        }}
                        onError={(e) => {
                          console.error('Image failed to load:', product.productImageUrl);
                          e.currentTarget.style.display = 'none';
                        }}
                        data-testid={`product-image-${product.id}`}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900" style={{ fontSize: '15px', fontWeight: 500 }}>
                      {product.product}
                    </p>
                    <div className="flex gap-3 mt-1 text-sm text-gray-500" style={{ fontSize: '13px', marginTop: '4px' }}>
                      <span>{product.sku}</span>
                      <span>•</span>
                      <span>{product.format}</span>
                      {product.notes && (
                        <>
                          <span>•</span>
                          <span>{product.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-medium text-gray-900" style={{ fontSize: '18px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {product.price}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* Footer - Minimal Height */}
      <footer 
        className="px-16 py-2 border-t border-gray-300 mt-12"
        style={{ marginTop: '48px', borderTop: '1px solid #d1d5db', paddingTop: '8px', paddingBottom: '8px' }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-gray-600" style={{ fontSize: '10px', color: '#6b7280' }}>
            <span>File: Pricelist</span>
            <span>Date: {currentDate}</span>
            <span className="page-number">Page: </span>
            <span>{branding.companyName}</span>
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
