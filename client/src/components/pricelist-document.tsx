import { Mail, Phone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig } from "@shared/schema";

interface PricelistDocumentProps {
  products: Product[];
  groupedProducts: Record<string, Product[]>;
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
}

export function PricelistDocument({
  products,
  groupedProducts,
  branding,
  salesAgents,
  qrCodeConfig,
}: PricelistDocumentProps) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="pricelist-document font-sans" id="pricelist-document" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header - Clean and Professional */}
      <header className="px-12 py-6 border-b-2 border-gray-900">
        <div className="flex items-start justify-between gap-8">
          {/* Logo and Company Info */}
          <div className="flex items-center gap-6 flex-1">
            {branding.logoUrl && (
              <div className="flex-shrink-0">
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="max-h-16 w-auto object-contain"
                  data-testid="img-header-logo"
                  style={{ maxHeight: '64px' }}
                />
              </div>
            )}
            <div>
              <h1 
                className="text-2xl font-semibold text-gray-900 leading-tight tracking-tight" 
                data-testid="text-company-name"
                style={{ fontSize: '24px', fontWeight: 600, lineHeight: 1.2 }}
              >
                {branding.companyName}
              </h1>
              {branding.tagline && (
                <p 
                  className="text-sm text-gray-600 mt-1" 
                  data-testid="text-tagline"
                  style={{ fontSize: '14px', marginTop: '4px' }}
                >
                  {branding.tagline}
                </p>
              )}
            </div>
          </div>

          {/* Sales Agents Header Info */}
          {salesAgents.length > 0 && (
            <div className="flex gap-8 flex-shrink-0">
              {salesAgents.map((agent, index) => (
                <div key={index} className="text-right min-w-0" data-testid={`agent-header-${index}`}>
                  {agent.region && (
                    <p 
                      className="text-xs font-semibold text-gray-900 mb-1 uppercase tracking-wide"
                      style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.025em' }}
                    >
                      {agent.region}
                    </p>
                  )}
                  <p 
                    className="text-sm font-medium text-gray-900" 
                    style={{ fontSize: '14px', fontWeight: 500 }}
                  >
                    {agent.name}
                  </p>
                  <p 
                    className="text-xs text-gray-600" 
                    style={{ fontSize: '12px' }}
                  >
                    {agent.email}
                  </p>
                  <p 
                    className="text-xs text-gray-600" 
                    style={{ fontSize: '12px' }}
                  >
                    {agent.phone}
                  </p>
                </div>
              ))}
            </div>
          )}
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

      {/* Footer - Professional Layout */}
      <footer 
        className="px-12 py-6 border-t-2 border-gray-900 mt-8"
        style={{ marginTop: '32px', borderTop: '2px solid #1a1a1a' }}
      >
        <div className="flex items-end justify-between gap-8">
          {/* Sales Agents Contact Cards */}
          <div className="flex gap-6 flex-1">
            {salesAgents.map((agent, index) => (
              <div
                key={index}
                className="border border-gray-300 rounded p-4 bg-gray-50 flex-1"
                data-testid={`agent-footer-${index}`}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  padding: '16px',
                  backgroundColor: '#f9fafb'
                }}
              >
                {agent.region && (
                  <p 
                    className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide"
                    style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.025em' }}
                  >
                    {agent.region}
                  </p>
                )}
                <p 
                  className="font-semibold text-sm text-gray-900 mb-2"
                  style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}
                >
                  {agent.name}
                </p>
                <div className="space-y-1">
                  <div 
                    className="flex items-center gap-2 text-xs text-gray-600"
                    style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
                  >
                    <Mail className="w-3 h-3" style={{ width: '12px', height: '12px' }} />
                    <span>{agent.email}</span>
                  </div>
                  <div 
                    className="flex items-center gap-2 text-xs text-gray-600"
                    style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Phone className="w-3 h-3" style={{ width: '12px', height: '12px' }} />
                    <span>{agent.phone}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Date and Page Info */}
          <div className="text-center flex-shrink-0" style={{ textAlign: 'center' }}>
            <p className="text-xs text-gray-600" style={{ fontSize: '12px', color: '#4b5563' }}>
              Updated: {currentDate}
            </p>
            <p className="text-xs text-gray-600 mt-1" style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
              Page 1
            </p>
          </div>

          {/* QR Code */}
          {qrCodeConfig && (
            <div className="flex-shrink-0">
              <div 
                className="border border-gray-300 rounded p-2 bg-white shadow-sm"
                style={{ 
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  padding: '8px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
              >
                <QRCodeSVG
                  value={qrCodeConfig.url}
                  size={qrCodeConfig.size}
                  data-testid="qr-code"
                />
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
