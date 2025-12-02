import ExcelJS from "exceljs";
import { getDisplayName, injectManualSortIndex, type ProductWithSortIndex } from "./collection-parser";
import type { Product, CompanyBranding, BrandRegistry, SalesAgent } from "@shared/schema";

interface SpreadsheetConfig {
  products: Product[];
  branding: CompanyBranding;
  pricelistName?: string;
  brandRegistry?: BrandRegistry[];
  salesAgents?: SalesAgent[];
}

const skipWords = ['wine', 'wines', 'cider', 'spirits', 'non alcoholic', 'non-alcoholic',
                   'white', 'red', 'rosé', 'rose', 'sparkling', 
                   'okanagan', 'vancouver island', 'similkameen', 'fraser valley',
                   'gulf islands', 'kootenays', 'bc', 'british columbia', 'lower mainland'];

function extractBrandFromProductName(productName: string, brandRegistry?: BrandRegistry[]): string | null {
  if (!productName) return null;
  
  const nameLower = productName.toLowerCase().trim();
  const productFirstWord = nameLower.split(/\s+/)[0];
  
  if (brandRegistry && brandRegistry.length > 0) {
    const sortedBrands = [...brandRegistry].sort((a, b) => 
      (b.brandName?.length || 0) - (a.brandName?.length || 0)
    );
    
    for (const entry of sortedBrands) {
      if (!entry.brandName) continue;
      const brandLower = entry.brandName.toLowerCase().trim();
      
      if (nameLower.startsWith(brandLower)) {
        return entry.brandName;
      }
      
      if (productFirstWord.length >= 3 && brandLower.startsWith(productFirstWord)) {
        return entry.brandName;
      }
      
      if (productFirstWord.length >= 3) {
        const escaped = productFirstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundaryRegex = new RegExp(`(?:^|\\s|\\b)${escaped}[+]?(?:\\s|$|\\b)`, 'i');
        if (wordBoundaryRegex.test(brandLower)) {
          return entry.brandName;
        }
      }
    }
  }
  
  const fallbackSkipWords = ['wine', 'wines', 'white', 'red', 'rosé', 'rose', 'sparkling', 
                             'cider', 'spirits', 'the', 'a', 'an', 'estate', 'winery'];
  const firstWord = productName.split(/\s+/)[0];
  if (firstWord && !fallbackSkipWords.includes(firstWord.toLowerCase()) && firstWord.length >= 3) {
    if (/^[A-Z0-9]/.test(firstWord)) {
      return firstWord;
    }
  }
  
  return null;
}

function extractBrandFromCategory(category: string): string {
  if (!category) return "Uncategorized";
  
  const sortKeyMatch = category.match(/^\d+-\w+-(.+)$/);
  if (sortKeyMatch) {
    return sortKeyMatch[1];
  }
  
  if (category.includes(';')) {
    const parts = category.split(';').map(p => p.trim()).filter(p => p);
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (!skipWords.some(skip => lower === skip)) {
        return part;
      }
    }
    return "Uncategorized";
  }
  
  const lower = category.toLowerCase().trim();
  if (skipWords.some(word => lower === word)) {
    return "Uncategorized";
  }
  
  return category;
}

// Build SKU to brand name lookup map for efficient brand assignment
function buildSkuToBrandMap(brandRegistry?: BrandRegistry[]): Map<string, string> {
  const skuMap = new Map<string, string>();
  if (!brandRegistry) return skuMap;
  
  for (const brand of brandRegistry) {
    if (brand.brandName && brand.skus && Array.isArray(brand.skus)) {
      for (const sku of brand.skus) {
        if (sku) {
          skuMap.set(sku, brand.brandName);
        }
      }
    }
  }
  return skuMap;
}

// Get brand for product using SKU-based lookup (authoritative) with fallbacks
function getBrandForProduct(product: Product, brandRegistry?: BrandRegistry[], skuToBrandMap?: Map<string, string>): string {
  // PRIORITY 1 (HIGHEST): SKU-based lookup from brand registry
  // This is the authoritative source - if product SKU is in a brand's SKU list, use that brand name
  if (skuToBrandMap && product.sku && skuToBrandMap.has(product.sku)) {
    return skuToBrandMap.get(product.sku)!;
  }
  
  // PRIORITY 2: Check if product name matches a brand in registry
  const brandFromName = extractBrandFromProductName(product.product, brandRegistry);
  if (brandFromName) return brandFromName;
  
  // PRIORITY 3: collectionBrand (if not a skip word)
  if (product.collectionBrand) {
    const lower = product.collectionBrand.toLowerCase().trim();
    if (!skipWords.some(skip => lower === skip)) {
      return product.collectionBrand;
    }
  }
  
  // PRIORITY 4: extracted from category
  if (product.category) {
    return extractBrandFromCategory(product.category);
  }
  
  return "Uncategorized";
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `$${num.toFixed(2)}`;
}

function hexToArgb(hex: string): string {
  const cleanHex = hex.replace('#', '');
  return `FF${cleanHex.toUpperCase()}`;
}

function getLighterColor(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  const lighterR = Math.min(255, Math.floor(r + (255 - r) * 0.85));
  const lighterG = Math.min(255, Math.floor(g + (255 - g) * 0.85));
  const lighterB = Math.min(255, Math.floor(b + (255 - b) * 0.85));
  
  return `FF${lighterR.toString(16).padStart(2, '0')}${lighterG.toString(16).padStart(2, '0')}${lighterB.toString(16).padStart(2, '0')}`.toUpperCase();
}

function isLightColor(hex: string): boolean {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export async function generateSpreadsheet(config: SpreadsheetConfig): Promise<Blob> {
  const { products, branding, pricelistName, brandRegistry, salesAgents } = config;
  
  const visibleProducts = products.filter(p => !p.isHidden);
  
  const primaryColor = branding.headerBackgroundColor || '#4472C4';
  const secondaryColor = branding.headerTextColor || '#2E5090';
  const primaryArgb = hexToArgb(primaryColor);
  const secondaryArgb = hexToArgb(secondaryColor);
  const lightPrimaryArgb = getLighterColor(primaryColor);
  const textOnPrimary = isLightColor(primaryColor) ? 'FF000000' : 'FFFFFFFF';
  const textOnSecondary = isLightColor(secondaryColor) ? 'FF000000' : 'FFFFFFFF';
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.companyName || 'Pricelist Generator';
  workbook.created = new Date();
  
  const worksheet = workbook.addWorksheet('Pricelist', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3
      }
    }
  });
  
  worksheet.columns = [
    { header: 'Product', key: 'product', width: 38 },
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Format', key: 'format', width: 16 },
    { header: 'Price', key: 'price', width: 10 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Qty', key: 'quantity', width: 8 },
    { header: 'Notes', key: 'notes', width: 25 },
  ];
  
  const headerRow1 = worksheet.insertRow(1, [
    branding.companyName || 'Company Pricelist'
  ]);
  worksheet.mergeCells('A1:G1');
  const headerCell1 = worksheet.getCell('A1');
  headerCell1.font = { bold: true, size: 16, color: { argb: textOnPrimary } };
  headerCell1.alignment = { horizontal: 'center', vertical: 'middle' };
  headerCell1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: primaryArgb }
  };
  worksheet.getRow(1).height = 28;
  
  const headerRow2 = worksheet.insertRow(2, [
    `${pricelistName || 'Pricelist'} - ${new Date().toLocaleDateString()}`
  ]);
  worksheet.mergeCells('A2:G2');
  const headerCell2 = worksheet.getCell('A2');
  headerCell2.font = { bold: true, size: 11, color: { argb: textOnSecondary } };
  headerCell2.alignment = { horizontal: 'center', vertical: 'middle' };
  headerCell2.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: secondaryArgb }
  };
  worksheet.getRow(2).height = 20;
  
  const columnHeaderRow = worksheet.getRow(3);
  columnHeaderRow.font = { bold: true, size: 10 };
  columnHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: lightPrimaryArgb }
  };
  columnHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
  columnHeaderRow.height = 18;
  
  columnHeaderRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: primaryArgb } },
      left: { style: 'thin', color: { argb: primaryArgb } },
      bottom: { style: 'thin', color: { argb: primaryArgb } },
      right: { style: 'thin', color: { argb: primaryArgb } }
    };
  });
  
  const productsWithSortIndex = brandRegistry && brandRegistry.length > 0
    ? injectManualSortIndex(visibleProducts, brandRegistry)
    : visibleProducts;
  
  // Build SKU to brand lookup map for authoritative brand assignment
  const skuToBrandMap = buildSkuToBrandMap(brandRegistry);
  
  const productsByBrand: Record<string, ProductWithSortIndex[]> = {};
  productsWithSortIndex.forEach(product => {
    const brand = getBrandForProduct(product as Product, brandRegistry, skuToBrandMap);
    if (!productsByBrand[brand]) {
      productsByBrand[brand] = [];
    }
    productsByBrand[brand].push(product as ProductWithSortIndex);
  });
  
  const wineTypeOrder: Record<string, number> = {
    'sparkling': 1,
    'white': 2,
    'rose': 3,
    'rosé': 3,
    'red': 4,
  };
  
  const getSecondaryWineType = (productName: string, primaryType: string): string => {
    if (primaryType !== 'sparkling') return primaryType;
    
    const lower = productName.toLowerCase();
    if (lower.includes('white')) return 'white';
    if (lower.includes('rosé') || lower.includes('rose') || lower.includes('pink')) return 'rosé';
    if (lower.includes('red')) return 'red';
    
    return primaryType;
  };
  
  Object.values(productsByBrand).forEach(brandProducts => {
    brandProducts.sort((a, b) => {
      const hasManualA = typeof a.manualSortIndex === 'number';
      const hasManualB = typeof b.manualSortIndex === 'number';
      
      if (hasManualA && hasManualB) {
        return (a.manualSortIndex ?? 0) - (b.manualSortIndex ?? 0);
      }
      
      if (hasManualA && !hasManualB) return -1;
      if (!hasManualA && hasManualB) return 1;
      
      const typeA = (a as any).collectionType?.toLowerCase() || '';
      const typeB = (b as any).collectionType?.toLowerCase() || '';
      
      const effectiveTypeA = getSecondaryWineType(a.product || '', typeA);
      const effectiveTypeB = getSecondaryWineType(b.product || '', typeB);
      
      const orderA = wineTypeOrder[effectiveTypeA] || 999;
      const orderB = wineTypeOrder[effectiveTypeB] || 999;
      
      if (orderA !== orderB) return orderA - orderB;
      
      if (typeA === 'sparkling' && typeB !== 'sparkling') return -1;
      if (typeA !== 'sparkling' && typeB === 'sparkling') return 1;
      
      return (a.product || '').localeCompare(b.product || '');
    });
  });
  
  const sortedBrandEntries = Object.entries(productsByBrand)
    .sort(([brandA, productsA], [brandB, productsB]) => {
      const sortKeyA = (productsA[0] as any)?.category || brandA;
      const sortKeyB = (productsB[0] as any)?.category || brandB;
      return sortKeyA.localeCompare(sortKeyB);
    });
  
  let rowIndex = 4;
  const brandHeaderRows: number[] = [];
  
  sortedBrandEntries.forEach(([brandName, brandProducts]) => {
    const displayBrandName = getDisplayName(brandName);
    
    const brandHeaderRow = worksheet.addRow([displayBrandName.toUpperCase()]);
    worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
    const brandCell = worksheet.getCell(`A${rowIndex}`);
    brandCell.font = { bold: true, size: 10, color: { argb: textOnSecondary } };
    brandCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    brandCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: secondaryArgb }
    };
    worksheet.getRow(rowIndex).height = 18;
    brandHeaderRows.push(rowIndex);
    rowIndex++;
    
    brandProducts.forEach((product) => {
      const row = worksheet.addRow({
        product: product.product,
        sku: product.sku,
        format: product.format,
        price: formatPrice(product.price),
        status: '',
        quantity: '',
        notes: product.notes || ''
      });
      
      row.height = 16;
      row.font = { size: 9 };
      
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFD0D0D0' } },
          left: { style: 'hair', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'hair', color: { argb: 'FFD0D0D0' } },
          right: { style: 'hair', color: { argb: 'FFD0D0D0' } }
        };
        cell.alignment = { vertical: 'middle' };
        
        if (colNumber === 4) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
        if (colNumber === 6) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      
      rowIndex++;
    });
  });
  
  const lastDataRow = rowIndex - 1;
  const statusColumn = 'E';
  
  for (let i = 4; i <= lastDataRow; i++) {
    if (brandHeaderRows.includes(i)) continue;
    
    const cell = worksheet.getCell(`${statusColumn}${i}`);
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Unavailable,Purchased,Recommended"'],
      showInputMessage: true,
      prompt: 'Select status',
      promptTitle: 'Status'
    };
  }
  
  worksheet.addConditionalFormatting({
    ref: `A4:G${lastDataRow}`,
    rules: [
      {
        type: 'expression',
        formulae: ['$E4="Unavailable"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' }
          },
          font: { color: { argb: 'FF9C0006' } }
        },
        priority: 1
      },
      {
        type: 'expression',
        formulae: ['$E4="Purchased"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' }
          },
          font: { color: { argb: 'FF006100' } }
        },
        priority: 2
      },
      {
        type: 'expression',
        formulae: ['$E4="Recommended"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEB9C' }
          },
          font: { color: { argb: 'FF9C5700' } }
        },
        priority: 3
      }
    ]
  });
  
  worksheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false
  });
  
  for (let i = 4; i <= lastDataRow; i++) {
    if (brandHeaderRows.includes(i)) continue;
    
    ['E', 'F', 'G'].forEach(col => {
      const cell = worksheet.getCell(`${col}${i}`);
      cell.protection = { locked: false };
    });
  }
  
  worksheet.addRow([]);
  rowIndex++;
  
  const footerStartRow = rowIndex;
  
  if (salesAgents && salesAgents.length > 0) {
    const agentRow = worksheet.addRow([
      `Sales Contact: ${salesAgents.map(a => `${a.name}${a.phone ? ` (${a.phone})` : ''}${a.email ? ` - ${a.email}` : ''}`).join(' | ')}`
    ]);
    worksheet.mergeCells(`A${rowIndex}:G${rowIndex}`);
    worksheet.getCell(`A${rowIndex}`).font = { size: 9, italic: true };
    worksheet.getCell(`A${rowIndex}`).alignment = { horizontal: 'center' };
    rowIndex++;
  }
  
  const legendStartRow = rowIndex + 1;
  
  worksheet.getCell(`A${legendStartRow}`).value = 'Status Legend:';
  worksheet.getCell(`A${legendStartRow}`).font = { bold: true, size: 9 };
  
  worksheet.getCell(`B${legendStartRow}`).value = 'Unavailable';
  worksheet.getCell(`B${legendStartRow}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC7CE' }
  };
  worksheet.getCell(`B${legendStartRow}`).font = { size: 8, color: { argb: 'FF9C0006' } };
  worksheet.getCell(`C${legendStartRow}`).value = '= Not available/Not a focus';
  worksheet.getCell(`C${legendStartRow}`).font = { size: 8 };
  
  worksheet.getCell(`B${legendStartRow + 1}`).value = 'Purchased';
  worksheet.getCell(`B${legendStartRow + 1}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC6EFCE' }
  };
  worksheet.getCell(`B${legendStartRow + 1}`).font = { size: 8, color: { argb: 'FF006100' } };
  worksheet.getCell(`C${legendStartRow + 1}`).value = '= Focus SKU\'s already in system';
  worksheet.getCell(`C${legendStartRow + 1}`).font = { size: 8 };
  
  worksheet.getCell(`B${legendStartRow + 2}`).value = 'Recommended';
  worksheet.getCell(`B${legendStartRow + 2}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' }
  };
  worksheet.getCell(`B${legendStartRow + 2}`).font = { size: 8, color: { argb: 'FF9C5700' } };
  worksheet.getCell(`C${legendStartRow + 2}`).value = '= Not currently listed, but would like approval';
  worksheet.getCell(`C${legendStartRow + 2}`).font = { size: 8 };
  
  const copyrightRow = legendStartRow + 4;
  worksheet.getCell(`A${copyrightRow}`).value = '© 2025 CityWide Digital Pricelist Generator';
  worksheet.mergeCells(`A${copyrightRow}:G${copyrightRow}`);
  worksheet.getCell(`A${copyrightRow}`).font = { size: 8, italic: true, color: { argb: 'FF666666' } };
  worksheet.getCell(`A${copyrightRow}`).alignment = { horizontal: 'center' };
  
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadSpreadsheet(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
