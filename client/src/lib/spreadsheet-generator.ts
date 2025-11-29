import ExcelJS from "exceljs";
import { getDisplayName, injectManualSortIndex, type BrandWithOrder } from "./collection-parser";
import type { Product, CompanyBranding, BrandRegistry } from "@shared/schema";

interface SpreadsheetConfig {
  products: Product[];
  branding: CompanyBranding;
  pricelistName?: string;
  brandRegistry?: BrandRegistry[];
}

const skipWords = ['wine', 'wines', 'cider', 'spirits', 'non alcoholic', 'non-alcoholic',
                   'white', 'red', 'rosé', 'rose', 'sparkling', 
                   'okanagan', 'vancouver island', 'similkameen', 'fraser valley',
                   'gulf islands', 'kootenays', 'bc', 'british columbia', 'lower mainland'];

function extractBrandFromProductName(productName: string, brandRegistry?: BrandRegistry[]): string | null {
  if (!productName) return null;
  
  const nameLower = productName.toLowerCase().trim();
  
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
      
      const brandFirstWord = brandLower.split(/\s+/)[0];
      const productFirstWord = nameLower.split(/\s+/)[0];
      if (productFirstWord === brandFirstWord && brandFirstWord.length >= 4) {
        return entry.brandName;
      }
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

function getBrandForProduct(product: Product, brandRegistry?: BrandRegistry[]): string {
  const brandFromName = extractBrandFromProductName(product.product, brandRegistry);
  if (brandFromName) return brandFromName;
  
  if (product.collectionBrand) {
    const lower = product.collectionBrand.toLowerCase().trim();
    if (!skipWords.some(skip => lower === skip)) {
      return product.collectionBrand;
    }
  }
  
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

export async function generateSpreadsheet(config: SpreadsheetConfig): Promise<Blob> {
  const { products, branding, pricelistName, brandRegistry } = config;
  
  const visibleProducts = products.filter(p => !p.isHidden);
  
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.companyName || 'Pricelist Generator';
  workbook.created = new Date();
  
  const worksheet = workbook.addWorksheet('Pricelist', {
    views: [{ state: 'frozen', ySplit: 2 }]
  });
  
  worksheet.columns = [
    { header: 'Brand', key: 'brand', width: 25 },
    { header: 'Product', key: 'product', width: 40 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Format', key: 'format', width: 18 },
    { header: 'Price', key: 'price', width: 12 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  
  const titleRow = worksheet.insertRow(1, [
    `${branding.companyName || 'Company'} - ${pricelistName || 'Pricelist'} - ${new Date().toLocaleDateString()}`
  ]);
  worksheet.mergeCells('A1:H1');
  const titleCell = worksheet.getCell('A1');
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).height = 25;
  
  const headerRow = worksheet.getRow(2);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E2F3' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 20;
  
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  const productsByBrand: Record<string, Product[]> = {};
  visibleProducts.forEach(product => {
    const brand = getBrandForProduct(product, brandRegistry);
    if (!productsByBrand[brand]) {
      productsByBrand[brand] = [];
    }
    productsByBrand[brand].push(product);
  });
  
  let brandsWithOrder: BrandWithOrder[] = Object.keys(productsByBrand).map(brand => ({
    brandName: brand,
    products: productsByBrand[brand],
    productOrder: null
  }));
  
  if (brandRegistry && brandRegistry.length > 0) {
    brandsWithOrder = injectManualSortIndex(brandsWithOrder, brandRegistry);
  }
  
  brandsWithOrder.sort((a, b) => a.brandName.localeCompare(b.brandName));
  
  let rowIndex = 3;
  brandsWithOrder.forEach(({ brandName, products: brandProducts }) => {
    brandProducts.forEach(product => {
      const row = worksheet.addRow({
        brand: getDisplayName(brandName, brandRegistry),
        product: product.product,
        sku: product.sku,
        format: product.format,
        price: formatPrice(product.price),
        status: '',
        quantity: '',
        notes: product.notes || ''
      });
      
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        };
        
        if (colNumber === 5) {
          cell.alignment = { horizontal: 'right' };
        }
        if (colNumber === 7) {
          cell.alignment = { horizontal: 'center' };
        }
      });
      
      rowIndex++;
    });
  });
  
  const lastDataRow = rowIndex - 1;
  const statusColumn = 'F';
  
  for (let i = 3; i <= lastDataRow; i++) {
    const cell = worksheet.getCell(`${statusColumn}${i}`);
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Unavailable,Purchased,Recommended"'],
      showDropDown: true,
      prompt: 'Select status',
      promptTitle: 'Status'
    };
  }
  
  worksheet.addConditionalFormatting({
    ref: `A3:H${lastDataRow}`,
    rules: [
      {
        type: 'expression',
        formulae: ['$F3="Unavailable"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFFFC7CE' }
          },
          font: { color: { argb: 'FF9C0006' } }
        },
        priority: 1
      },
      {
        type: 'expression',
        formulae: ['$F3="Purchased"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFC6EFCE' }
          },
          font: { color: { argb: 'FF006100' } }
        },
        priority: 2
      },
      {
        type: 'expression',
        formulae: ['$F3="Recommended"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFFFEB9C' }
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
  
  for (let i = 3; i <= lastDataRow; i++) {
    ['F', 'G', 'H'].forEach(col => {
      const cell = worksheet.getCell(`${col}${i}`);
      cell.protection = { locked: false };
    });
  }
  
  const legendRow = worksheet.addRow([]);
  const legendStartRow = lastDataRow + 3;
  
  worksheet.getCell(`A${legendStartRow}`).value = 'Status Legend:';
  worksheet.getCell(`A${legendStartRow}`).font = { bold: true };
  
  worksheet.getCell(`A${legendStartRow + 1}`).value = 'Unavailable';
  worksheet.getCell(`A${legendStartRow + 1}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC7CE' }
  };
  worksheet.getCell(`A${legendStartRow + 1}`).font = { color: { argb: 'FF9C0006' } };
  worksheet.getCell(`B${legendStartRow + 1}`).value = '- Product not currently available';
  
  worksheet.getCell(`A${legendStartRow + 2}`).value = 'Purchased';
  worksheet.getCell(`A${legendStartRow + 2}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC6EFCE' }
  };
  worksheet.getCell(`A${legendStartRow + 2}`).font = { color: { argb: 'FF006100' } };
  worksheet.getCell(`B${legendStartRow + 2}`).value = '- Already in purchasing system / repeat order';
  
  worksheet.getCell(`A${legendStartRow + 3}`).value = 'Recommended';
  worksheet.getCell(`A${legendStartRow + 3}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' }
  };
  worksheet.getCell(`A${legendStartRow + 3}`).font = { color: { argb: 'FF9C5700' } };
  worksheet.getCell(`B${legendStartRow + 3}`).value = '- Recommended for future consideration';
  
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
