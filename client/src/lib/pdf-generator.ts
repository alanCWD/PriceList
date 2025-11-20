import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig, Template } from "@shared/schema";

interface PDFConfig {
  products: Product[];
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  template?: Template;
  pricelistName?: string;
}

// Helper to extract image format from data URL
const getImageFormat = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/);
  if (match) {
    const format = match[1].toUpperCase();
    // Map common formats to jsPDF-supported formats
    if (format === 'JPEG' || format === 'JPG') return 'JPEG';
    if (format === 'PNG') return 'PNG';
    if (format === 'WEBP') return 'WEBP';
  }
  return 'PNG'; // Default fallback
};

export async function generatePDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, qrCodeConfig, template = "modern", pricelistName } = config;
  
  if (template === "classic") {
    return await generateClassicPDF(config);
  } else if (template === "minimal") {
    return await generateMinimalPDF(config);
  }
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const footerHeight = 40;
  let yPosition = margin;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  // Convert QR code to base64 if present (minimal size for footer)
  let qrCodeBase64: string | null = null;
  const qrCodeSize = 20; // Minimal size for PDF footer
  if (qrCodeConfig?.url) {
    try {
      const QRCode = (await import('qrcode')).default;
      qrCodeBase64 = await QRCode.toDataURL(qrCodeConfig.url, { 
        width: qrCodeSize * 4, // Generate at higher resolution for clarity
        margin: 0 
      });
    } catch (error) {
      console.error('Failed to generate QR code for PDF:', error);
    }
  }

  // Load logo image if present
  let logoBase64: string | null = null;
  let logoFormat: string = 'PNG';
  const maxLogoHeight = 120;
  let logoWidth = 0;
  let logoHeight = 0;
  
  if (branding.logoUrl) {
    try {
      // Fetch and convert logo to base64
      const response = await fetch(branding.logoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Detect image format from data URL
      logoFormat = getImageFormat(logoBase64);
      
      // Get logo dimensions to calculate aspect ratio
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoBase64!;
      });
      
      // Calculate logo dimensions maintaining aspect ratio
      const aspectRatio = img.width / img.height;
      logoHeight = Math.min(img.height, maxLogoHeight);
      logoWidth = logoHeight * aspectRatio;
    } catch (error) {
      console.error('Failed to load logo for PDF:', error);
      logoBase64 = null;
    }
  }

  // Use extracted colors if available
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const textColor = branding.headerTextColor 
    ? (hexToRgb(branding.headerTextColor) || { r: 30, g: 30, b: 30 })
    : { r: 30, g: 30, b: 30 };
  
  const bgColor = branding.headerBackgroundColor 
    ? hexToRgb(branding.headerBackgroundColor)
    : null;

  // Header height conforms exactly to logo height (no padding)
  const headerHeight = logoBase64 ? logoHeight : 50;
  
  // Function to draw header on every page
  const drawHeader = () => {
    // Draw header background full-width band
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
      doc.rect(0, 0, pageWidth, headerHeight, "F");
    }

    // Minimal padding from edges
    const headerPadding = 10;
    const bottomPadding = 10;
    const lineHeight = 10;
    
    // Draw logo on the left if present with minimal left padding
    if (logoBase64) {
      try {
        // Center logo vertically if header is taller than logo
        const logoY = (headerHeight - logoHeight) / 2;
        doc.addImage(logoBase64, logoFormat, headerPadding, logoY, logoWidth, logoHeight);
      } catch (error) {
        console.error('Failed to add logo to PDF:', error);
        // Continue without logo
      }
    }

    // Calculate agent block height to position title/tagline above it
    let maxAgentLines = 0;
    if (salesAgents.length > 0) {
      salesAgents.forEach(agent => {
        let lineCount = 0;
        if (agent.region) lineCount++;
        lineCount += 3; // name, email, phone
        maxAgentLines = Math.max(maxAgentLines, lineCount);
      });
    }
    const agentBlockHeight = maxAgentLines * lineHeight;
    const agentTop = headerHeight - bottomPadding - agentBlockHeight;
    
    // Position title/tagline centered between top and agents
    const titleBaseline = 28; // Safe top padding + font ascent
    const taglineBaseline = 46; // Below title with minimal spacing
    
    const centerX = pageWidth / 2;
    
    // Title centered horizontally
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(branding.companyName, centerX, titleBaseline, { align: "center" });

    // Tagline centered below title with minimal spacing
    if (branding.tagline) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(branding.tagline, centerX, taglineBaseline, { align: "center" });
    }

    // Sales agents at bottom-right with right alignment
    if (salesAgents.length > 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      
      const agentRightX = pageWidth - headerPadding;
      
      // Position agents from right to left
      salesAgents.slice().reverse().forEach((agent, agentIndex) => {
        const lines = [];
        if (agent.region) lines.push(agent.region);
        lines.push(agent.name, agent.email, agent.phone);
        
        // Calculate starting Y for this agent block (bottom-aligned)
        let agentY = headerHeight - bottomPadding - (lines.length - 1) * lineHeight;
        
        // Measure the widest line to offset this agent block to the left
        const maxWidth = Math.max(...lines.map(line => doc.getTextWidth(line)));
        const agentX = agentRightX - (agentIndex * (maxWidth + 30));
        
        // Draw agent info right-aligned
        lines.forEach(line => {
          doc.text(line, agentX, agentY, { align: "right" });
          agentY += lineHeight;
        });
      });
    }
  };

  // Draw header on first page
  drawHeader();
  
  // Move yPosition to after header (add small spacing)
  yPosition = headerHeight + 20;

  // Group products by category, excluding only explicitly "Uncategorized" items
  const groupedProducts = products
    .filter(product => {
      // Only exclude if explicitly labeled "Uncategorized" (case-insensitive)
      // Allow empty categories - they'll be shown under their category name or producer
      return !product.category || product.category.toLowerCase() !== "uncategorized";
    })
    .reduce((acc, product) => {
      // Use category as the grouping key, empty categories will group together
      const category = product.category || "";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(product);
      return acc;
    }, {} as Record<string, Product[]>);

  // Load product images as base64 in parallel
  const productImageMap = new Map<string, { data: string; format: string }>();
  const imagePromises = products
    .filter(p => p.productImageUrl)
    .map(async (product) => {
      try {
        const response = await fetch(product.productImageUrl!);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const format = getImageFormat(base64);
        productImageMap.set(product.id, { data: base64, format });
      } catch (error) {
        console.error(`Failed to load image for product ${product.id}:`, error);
      }
    });
  await Promise.all(imagePromises);

  // Render products by category (sorted alphabetically by category name)
  Object.entries(groupedProducts)
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .forEach(([category, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 20;
    }

    // Category header - use same color as main header
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    } else {
      doc.setFillColor(30, 30, 30); // Fallback to dark gray
    }
    doc.rect(margin, yPosition, pageWidth - margin * 2, 24, "F");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(category, margin + 12, yPosition + 16);
    yPosition += 30;

    // Check if this category has any products with images
    const hasImages = categoryProducts.some(p => p.productImageUrl);

    // Capture the current categoryProducts for this table (avoid closure issues)
    const currentCategoryProducts = [...categoryProducts];

    // Products table - adjust columns based on whether images are present
    const tableData = currentCategoryProducts.map(product => {
      const row: any[] = hasImages ? [""] : []; // Empty cell for image if present
      row.push(
        product.notes || "",
        product.product,
        product.sku,
        product.format,
        product.price
      );
      return row;
    });

    autoTable(doc, {
      startY: yPosition,
      head: hasImages 
        ? [["Image", "Notes/Order", "Product", "SKU", "Format", "Price"]]
        : [["Notes/Order", "Product", "SKU", "Format", "Price"]],
      body: tableData,
      theme: "plain",
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontSize: 9,
        fontStyle: "bold",
        halign: "left",
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [30, 30, 30],
        minCellHeight: hasImages ? 35 : 15, // Taller rows when images present
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: hasImages ? {
        0: { cellWidth: 40, halign: "center" }, // Image column
        1: { cellWidth: 70 },  // Notes
        2: { cellWidth: 150 }, // Product
        3: { cellWidth: 75 },  // SKU
        4: { cellWidth: 90 },  // Format
        5: { cellWidth: 70 },  // Price
      } : {
        0: { cellWidth: 80 },
        1: { cellWidth: 180 },
        2: { cellWidth: 80 },
        3: { cellWidth: 100 },
        4: { cellWidth: 75 },
      },
      margin: { left: margin, right: margin, top: 50, bottom: margin + footerHeight },
      didDrawCell: hasImages ? (data) => {
        // Draw product images in the first column
        if (data.column.index === 0 && data.section === 'body') {
          const product = currentCategoryProducts[data.row.index];
          if (!product) {
            console.error(`Product not found at index ${data.row.index} in category ${category}`);
            return;
          }
          const imageData = productImageMap.get(product.id);
          if (imageData) {
            try {
              const imgSize = 30; // 30pt square thumbnail
              const cellCenterX = data.cell.x + (data.cell.width / 2);
              const cellCenterY = data.cell.y + (data.cell.height / 2);
              const imgX = cellCenterX - (imgSize / 2);
              const imgY = cellCenterY - (imgSize / 2);
              doc.addImage(imageData.data, imageData.format, imgX, imgY, imgSize, imgSize);
            } catch (error) {
              console.error(`Failed to add product image ${product.id} to PDF:`, error);
              // Continue without this image
            }
          }
        }
      } : undefined,
      didDrawPage: (data) => {
        const currentPage = (doc as any).getCurrentPageInfo().pageNumber;
        
        // Draw full header only on first page
        if (currentPage === 1) {
          drawHeader();
        } else {
          // On subsequent pages, draw a simple centered title bar
          const simpleHeaderHeight = 30;
          
          // Draw background bar if color is defined
          if (bgColor) {
            doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
            doc.rect(0, 0, pageWidth, simpleHeaderHeight, "F");
          }
          
          // Center company name in the bar
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(textColor.r, textColor.g, textColor.b);
          const centerX = pageWidth / 2;
          doc.text(branding.companyName, centerX, simpleHeaderHeight / 2 + 5, { align: "center" });
        }
        
        // Minimal footer with text and small QR code
        const footerY = pageHeight - margin - 12;
        
        // Thin separator line
        const separatorY = footerY - 10;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, separatorY, pageWidth - margin, separatorY);
        
        // Footer text - format: Page: X | Company Pricelist - Day Month Year
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        const footerText = `Page: ${pageNum} | ${branding.companyName} Pricelist - ${dayMonthDate}`;
        doc.text(footerText, margin, footerY);
        
        // QR code on the right side, just below the separator line
        if (qrCodeBase64) {
          try {
            const qrX = pageWidth - margin - qrCodeSize;
            const qrY = separatorY + 2; // Position just below the separator line
            doc.addImage(qrCodeBase64, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);
          } catch (error) {
            console.error('Failed to add QR code to PDF:', error);
            // Continue without QR code
          }
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  // Save the PDF
  const fileName = `${displayName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

async function generateClassicPDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, pricelistName } = config;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const footerHeight = 30;
  let yPosition = margin;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(30, 30, 30);
  const titleWidth = doc.getTextWidth(branding.companyName);
  doc.text(branding.companyName, (pageWidth - titleWidth) / 2, yPosition);
  yPosition += 25;

  if (branding.tagline) {
    doc.setFont("times", "italic");
    doc.setFontSize(16);
    doc.setTextColor(70, 70, 70);
    const taglineWidth = doc.getTextWidth(branding.tagline);
    doc.text(branding.tagline, (pageWidth - taglineWidth) / 2, yPosition);
    yPosition += 20;
  }

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  const dateWidth = doc.getTextWidth(dayMonthDate);
  doc.text(dayMonthDate, (pageWidth - dateWidth) / 2, yPosition);
  yPosition += 20;

  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(1);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 30;

  const groupedProducts = products.reduce((acc, product) => {
    const category = product.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  Object.entries(groupedProducts)
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .forEach(([category, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 25;
    }

    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 30, 30);
    doc.text(category, margin, yPosition);
    yPosition += 5;
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(2);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;

    const tableData = categoryProducts.map(product => [
      product.sku,
      product.product,
      product.format,
      product.price,
      product.notes || "",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["SKU", "Product", "Format", "Price", "Notes"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [229, 231, 235],
        textColor: [30, 30, 30],
        fontSize: 10,
        fontStyle: "bold",
        halign: "left",
        font: "times",
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [30, 30, 30],
        font: "times",
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 200 },
        2: { cellWidth: 100 },
        3: { cellWidth: 70, halign: "right" },
        4: { cellWidth: 100 },
      },
      margin: { left: margin, right: margin, bottom: margin + footerHeight },
      didDrawPage: (data) => {
        // Footer on every page
        const footerY = pageHeight - margin - 20;
        
        // Thin separator line
        doc.setDrawColor(156, 163, 175);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
        
        // Footer text
        doc.setFontSize(10);
        doc.setFont("times", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        const footerText = `Page: ${pageNum}    ${branding.companyName} Pricelist - ${dayMonthDate}`;
        doc.text(footerText, margin, footerY);
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  const fileName = `${displayName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

async function generateMinimalPDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, pricelistName, qrCodeConfig } = config;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40; // Reduced margin for more content
  const footerHeight = 25; // Reduced footer
  let yPosition = margin;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  // Process logo if present
  let logoBase64 = null;
  let logoFormat = "PNG";
  let logoWidth = 0;
  let logoHeight = 0;
  
  if (branding.logoUrl) {
    try {
      const response = await fetch(branding.logoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      logoFormat = getImageFormat(logoBase64);
      
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = logoBase64!;
      });
      
      const aspectRatio = img.width / img.height;
      logoHeight = 40; // Compact height for minimal template
      logoWidth = logoHeight * aspectRatio;
    } catch (error) {
      console.error('Failed to load logo:', error);
    }
  }

  // Process QR code if present
  let qrCodeBase64 = null;
  const qrCodeSize = 20; // Very small for minimal template
  
  if (qrCodeConfig?.url) {
    try {
      const QRCode = (await import('qrcode')).default;
      qrCodeBase64 = await QRCode.toDataURL(qrCodeConfig.url, {
        width: qrCodeSize * 4,
        margin: 1,
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  }

  // Extract colors from branding
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const textColor = branding.headerTextColor 
    ? (hexToRgb(branding.headerTextColor) || { r: 30, g: 30, b: 30 })
    : { r: 30, g: 30, b: 30 };
  
  const bgColor = branding.headerBackgroundColor 
    ? hexToRgb(branding.headerBackgroundColor)
    : null;

  // Compact header height
  const headerHeight = logoBase64 ? logoHeight + 10 : 35;
  
  // Function to draw compact header (only on first page)
  const drawHeader = () => {
    // Draw header background
    if (bgColor) {
      doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
      doc.rect(0, 0, pageWidth, headerHeight, "F");
    }

    const headerPadding = 8;
    const lineHeight = 8;
    
    // Logo on left if present
    if (logoBase64) {
      try {
        const logoY = (headerHeight - logoHeight) / 2;
        doc.addImage(logoBase64, logoFormat, headerPadding, logoY, logoWidth, logoHeight);
      } catch (error) {
        console.error('Failed to add logo to PDF:', error);
      }
    }

    // Calculate agent block height
    let maxAgentLines = 0;
    if (salesAgents.length > 0) {
      salesAgents.forEach(agent => {
        let lineCount = 0;
        if (agent.region) lineCount++;
        lineCount += 3; // name, email, phone
        maxAgentLines = Math.max(maxAgentLines, lineCount);
      });
    }
    const agentBlockHeight = maxAgentLines * lineHeight;
    const agentTop = headerHeight - headerPadding - agentBlockHeight;
    
    // Title/tagline centered
    const titleBaseline = 20;
    const taglineBaseline = 30;
    const centerX = pageWidth / 2;
    
    doc.setFontSize(16); // Smaller than Modern template
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(branding.companyName, centerX, titleBaseline, { align: "center" });

    if (branding.tagline) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.text(branding.tagline, centerX, taglineBaseline, { align: "center" });
    }

    // Sales agents at bottom-right
    if (salesAgents.length > 0) {
      doc.setFontSize(7); // Smaller font
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      
      const agentRightX = pageWidth - headerPadding;
      
      salesAgents.slice().reverse().forEach((agent, agentIndex) => {
        const lines = [];
        if (agent.region) lines.push(agent.region);
        lines.push(agent.name, agent.email, agent.phone);
        
        let agentY = headerHeight - headerPadding - (lines.length - 1) * lineHeight;
        const maxWidth = Math.max(...lines.map(line => doc.getTextWidth(line)));
        const agentX = agentRightX - (agentIndex * (maxWidth + 20));
        
        lines.forEach(line => {
          doc.text(line, agentX, agentY, { align: "right" });
          agentY += lineHeight;
        });
      });
    }
  };

  // Draw header on first page only
  drawHeader();
  yPosition = headerHeight + 15;

  // Group products by category, excluding only explicitly "Uncategorized" items
  const groupedProducts = products
    .filter(product => {
      // Only exclude if explicitly labeled "Uncategorized" (case-insensitive)
      // Allow empty categories - they'll be shown under their category name or empty string
      return !product.category || product.category.toLowerCase() !== "uncategorized";
    })
    .reduce((acc, product) => {
      // Use category as the grouping key, empty categories will group together
      const category = product.category || "";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(product);
      return acc;
    }, {} as Record<string, Product[]>);

  // Load product images as base64 in parallel
  const productImageMap = new Map<string, { data: string; format: string }>();
  const imagePromises = products
    .filter(p => p.productImageUrl)
    .map(async (product) => {
      try {
        const response = await fetch(product.productImageUrl!);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const format = getImageFormat(base64);
        productImageMap.set(product.id, { data: base64, format });
      } catch (error) {
        console.error(`Failed to load image for product ${product.id}:`, error);
      }
    });
  await Promise.all(imagePromises);

  // Render products by category (sorted alphabetically)
  Object.entries(groupedProducts)
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .forEach(([category, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 12; // Minimal spacing between categories
    }

    // Category header - blue bar with grey text (minimalist design)
    doc.setFillColor(74, 144, 226); // Blue bar (#4A90E2)
    doc.rect(margin, yPosition, pageWidth - margin * 2, 18, "F"); // Smaller header
    doc.setTextColor(107, 114, 128); // Grey text (#6B7280)
    doc.setFontSize(11); // Smaller category font
    doc.setFont("helvetica", "bold");
    doc.text(category, margin + 8, yPosition + 12);
    yPosition += 22;

    // Check if this category has any products with images or notes
    const hasImages = categoryProducts.some(p => p.productImageUrl);
    const hasNotes = categoryProducts.some(p => p.notes);
    const currentCategoryProducts = [...categoryProducts];

    // Products table with compressed spacing - only include columns that have data
    const tableData = currentCategoryProducts.map(product => {
      const row: any[] = [];
      if (hasImages) row.push("");  // Placeholder for image
      if (hasNotes) row.push(product.notes || "");
      row.push(
        product.product,
        product.sku,
        product.format,
        product.price
      );
      return row;
    });

    // Build header row dynamically based on which columns have data
    const headRow: string[] = [];
    if (hasImages) headRow.push("Image");
    if (hasNotes) headRow.push("Notes");
    headRow.push("Product", "SKU", "Format", "Price");

    autoTable(doc, {
      startY: yPosition,
      head: [headRow],
      body: tableData,
      theme: "plain",
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [60, 60, 60],
        fontSize: 6.5, // Ultra-small header font (1/4 reduction)
        fontStyle: "bold",
        halign: "left",
        cellPadding: 1, // Reduced padding for tighter spacing
        minCellHeight: 6, // Minimal header row height
      },
      bodyStyles: {
        fontSize: 6.5, // Ultra-small body font (1/4 reduction)
        textColor: [30, 30, 30],
        minCellHeight: hasImages ? 18 : 6, // Ultra-compact rows (~1/4 of original)
        cellPadding: 1, // Reduced padding for tighter spacing
      },
      alternateRowStyles: {
        fillColor: [242, 242, 242], // Stronger zebra striping for better visibility
      },
      columnStyles: (() => {
        const styles: any = {};
        let colIndex = 0;
        
        if (hasImages) {
          styles[colIndex] = { cellWidth: 30, halign: "center" };
          colIndex++;
        }
        if (hasNotes) {
          styles[colIndex] = { cellWidth: 60 };
          colIndex++;
        }
        // Product, SKU, Format, Price
        styles[colIndex] = { cellWidth: hasImages && hasNotes ? 140 : hasImages || hasNotes ? 160 : 180 };
        styles[colIndex + 1] = { cellWidth: 70 };
        styles[colIndex + 2] = { cellWidth: 80 };
        styles[colIndex + 3] = { cellWidth: 60 };
        
        return styles;
      })(),
      margin: { left: margin, right: margin, top: 35, bottom: margin + footerHeight },
      didDrawCell: hasImages ? (data) => {
        // Only process body cells in the image column with valid row indices
        if (data.column.index === 0 && data.section === 'body' && data.row.index >= 0) {
          const product = currentCategoryProducts[data.row.index];
          if (!product) {
            console.error(`Product not found at index ${data.row.index} in category ${category}`);
            return;
          }
          const imageData = productImageMap.get(product.id);
          if (imageData) {
            try {
              const imgSize = 16; // Smaller thumbnail for ultra-compact layout
              const cellCenterX = data.cell.x + (data.cell.width / 2);
              const cellCenterY = data.cell.y + (data.cell.height / 2);
              const imgX = cellCenterX - (imgSize / 2);
              const imgY = cellCenterY - (imgSize / 2);
              doc.addImage(imageData.data, imageData.format, imgX, imgY, imgSize, imgSize);
            } catch (error) {
              console.error(`Failed to add product image ${product.id} to PDF:`, error);
            }
          }
        }
      } : undefined,
      didDrawPage: (data) => {
        // Only draw header on first page
        const currentPageNum = (doc as any).getCurrentPageInfo().pageNumber;
        if (currentPageNum === 1) {
          drawHeader();
        }
        
        // Minimal footer
        const footerY = pageHeight - margin - 10;
        const separatorY = footerY - 8;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, separatorY, pageWidth - margin, separatorY);
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        const footerText = `Page: ${pageNum} | ${branding.companyName} Pricelist - ${dayMonthDate}`;
        doc.text(footerText, margin, footerY);
        
        // Tiny QR code on the right
        if (qrCodeBase64) {
          try {
            const qrX = pageWidth - margin - qrCodeSize;
            const qrY = separatorY + 1;
            doc.addImage(qrCodeBase64, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);
          } catch (error) {
            console.error('Failed to add QR code to PDF:', error);
          }
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 8;
  });

  const fileName = `${displayName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
