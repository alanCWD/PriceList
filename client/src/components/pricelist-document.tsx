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
    <div className="pricelist-document" id="pricelist-document">
      {/* Header */}
      <header className="px-12 py-8 border-b-2 border-gray-800">
        <div className="flex items-center justify-between gap-8">
          {/* Logo and Title */}
          <div className="flex items-center gap-6">
            {branding.logoUrl && (
              <div className="flex-shrink-0">
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="max-h-16 object-contain"
                  data-testid="img-header-logo"
                />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-gray-900" data-testid="text-company-name">
                {branding.companyName}
              </h1>
              {branding.tagline && (
                <p className="text-sm text-gray-600 mt-1" data-testid="text-tagline">
                  {branding.tagline}
                </p>
              )}
            </div>
          </div>

          {/* Sales Agents Info */}
          {salesAgents.length > 0 && (
            <div className="flex gap-8">
              {salesAgents.map((agent, index) => (
                <div key={index} className="text-right" data-testid={`agent-header-${index}`}>
                  {agent.region && (
                    <p className="text-xs font-semibold text-gray-900 mb-1">{agent.region}</p>
                  )}
                  <p className="text-sm font-medium text-gray-900">{agent.name}</p>
                  <p className="text-xs text-gray-600">{agent.email}</p>
                  <p className="text-xs text-gray-600">{agent.phone}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Products by Category */}
      <main className="px-12 py-8">
        {Object.entries(groupedProducts).map(([category, categoryProducts], categoryIndex) => (
          <div key={category} className={categoryIndex > 0 ? "mt-12" : ""}>
            {/* Category Header */}
            <div className="bg-gray-800 text-white px-6 py-3 mb-4">
              <h2 className="text-base font-semibold" data-testid={`category-${categoryIndex}`}>
                {category}
              </h2>
            </div>

            {/* Products Table */}
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-gray-700 w-[15%]">
                    Notes/Order
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-gray-700 w-[35%]">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-gray-700 w-[15%]">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-gray-700 w-[20%]">
                    Format
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase text-gray-700 w-[15%]">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryProducts.map((product, productIndex) => (
                  <tr
                    key={product.id}
                    className={`border-b border-gray-200 ${
                      productIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                    data-testid={`product-row-${product.id}`}
                  >
                    <td className="px-4 py-3 text-gray-600 text-xs align-top">
                      {product.notes || ""}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium align-top">
                      {product.product}
                    </td>
                    <td className="px-4 py-3 text-gray-700 align-top">{product.sku}</td>
                    <td className="px-4 py-3 text-gray-700 align-top">{product.format}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium align-top">
                      {product.price}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>

      {/* Footer */}
      <footer className="px-12 py-6 border-t-2 border-gray-800 mt-8">
        <div className="flex items-end justify-between gap-8">
          {/* Sales Agents Contact Cards */}
          <div className="flex gap-6 flex-1">
            {salesAgents.map((agent, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-md p-4 bg-gray-50 flex-1"
                data-testid={`agent-footer-${index}`}
              >
                {agent.region && (
                  <p className="text-xs font-semibold text-gray-900 mb-2">{agent.region}</p>
                )}
                <p className="font-semibold text-sm text-gray-900 mb-2">{agent.name}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Mail className="w-3 h-3" />
                    <span>{agent.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3 h-3" />
                    <span>{agent.phone}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Date and Page Info */}
          <div className="text-center flex-shrink-0">
            <p className="text-xs text-gray-600">Updated: {currentDate}</p>
            <p className="text-xs text-gray-600 mt-1">Page 1</p>
          </div>

          {/* QR Code */}
          {qrCodeConfig && (
            <div className="flex-shrink-0">
              <div className="border border-gray-200 rounded-md p-2 bg-white shadow-sm">
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
