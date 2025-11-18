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

  // Calculate header height accounting for logo, title, tagline, and sales agents
  const baseHeight = logoBase64 ? Math.max(logoHeight + 10, 95) : 95;
  const headerHeight = baseHeight + (branding.tagline ? 15 : 0) + (salesAgents.length > 0 ? 50 : 0);
  
  // Draw header background if color is specified
  if (bgColor) {
    doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
  }

  // Draw logo on the left if present
  let textStartX = margin;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, logoFormat, margin, yPosition, logoWidth, logoHeight);
      textStartX = margin + logoWidth + 20; // Add gap between logo and text
    } catch (error) {
      console.error('Failed to add logo to PDF:', error);
      // Continue without logo
    }
  }

  // Header text (company name and tagline) - positioned next to logo
  const savedY = yPosition; // Save for sales agents positioning
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text(branding.companyName, textStartX, yPosition + 18);

  if (branding.tagline) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(branding.tagline, textStartX, yPosition + 32);
  }
  
  // Move yPosition to after the logo/title area
  yPosition = savedY + (logoBase64 ? logoHeight : 40);

  // Sales agents in header - positioned at bottom right
  if (salesAgents.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    let agentX = pageWidth - margin;
    
    // Position agents from right to left
    salesAgents.slice().reverse().forEach(agent => {
      const lines = [];
      if (agent.region) lines.push(agent.region);
      lines.push(agent.name, agent.email, agent.phone);
      
      const textWidth = Math.max(...lines.map(line => doc.getTextWidth(line)));
      agentX -= textWidth + 20;
      
      // Start agents at savedY position (same as logo/title)
      let agentY = savedY + 12;
      lines.forEach(line => {
        doc.text(line, agentX, agentY, { align: "left" });
        agentY += 11;
      });
    });
    yPosition += 10;
  }

  // Thick separator line below header
  yPosition += 8;
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(2);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 30;

  // Group products by category
  const groupedProducts = products.reduce((acc, product) => {
    const category = product.category || "Uncategorized";
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

  // Render products by category
  Object.entries(groupedProducts).forEach(([category, categoryProducts], index) => {
    if (index > 0) {
      yPosition += 20;
    }

    // Category header
    doc.setFillColor(30, 30, 30);
    doc.rect(margin, yPosition, pageWidth - margin * 2, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(category, margin + 12, yPosition + 16);
    yPosition += 30;

    // Check if this category has any products with images
    const hasImages = categoryProducts.some(p => p.productImageUrl);

    // Products table - adjust columns based on whether images are present
    const tableData = categoryProducts.map(product => {
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
      margin: { left: margin, right: margin, bottom: margin + footerHeight },
      didDrawCell: hasImages ? (data) => {
        // Draw product images in the first column
        if (data.column.index === 0 && data.section === 'body') {
          const product = categoryProducts[data.row.index];
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

  Object.entries(groupedProducts).forEach(([category, categoryProducts], index) => {
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
  const { products, branding, salesAgents, pricelistName } = config;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 60;
  const footerHeight = 30;
  let yPosition = margin + 20;

  // Format date as "Day Month Year" (e.g., "15 January 2025")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const displayName = pricelistName || "Pricelist";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(32);
  doc.setTextColor(30, 30, 30);
  doc.text(branding.companyName, margin, yPosition);
  yPosition += 15;

  if (branding.tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(120, 120, 120);
    doc.text(branding.tagline, margin, yPosition);
    yPosition += 35;
  } else {
    yPosition += 25;
  }

  const groupedProducts = products.reduce((acc, product) => {
    const category = product.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  let currentPage = 1;
  const maxY = pageHeight - margin - footerHeight - 20;

  const addFooter = () => {
    const footerY = pageHeight - margin - 10;
    
    // Thin separator line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 15, pageWidth - margin, footerY - 15);
    
    // Footer text
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    
    const footerText = `Page: ${currentPage}    ${branding.companyName} Pricelist [${dayMonthDate}]`;
    doc.text(footerText, margin, footerY);
  };

  Object.entries(groupedProducts).forEach(([category, categoryProducts], index) => {
    if (yPosition + 50 > maxY) {
      addFooter();
      doc.addPage();
      currentPage++;
      yPosition = margin + 20;
    }

    if (index > 0) {
      yPosition += 40;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(22);
    doc.setTextColor(30, 30, 30);
    doc.text(category, margin, yPosition);
    yPosition += 25;

    categoryProducts.forEach((product) => {
      if (yPosition + 40 > maxY) {
        addFooter();
        doc.addPage();
        currentPage++;
        yPosition = margin + 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 30, 30);
      doc.text(product.product, margin, yPosition);

      const priceWidth = doc.getTextWidth(product.price);
      doc.text(product.price, pageWidth - margin - priceWidth, yPosition);
      yPosition += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(120, 120, 120);
      const details = [product.sku, product.format];
      if (product.notes) {
        details.push(product.notes);
      }
      doc.text(details.join(" • "), margin, yPosition);
      yPosition += 5;

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 15;
    });
  });

  addFooter();

  const fileName = `${displayName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
