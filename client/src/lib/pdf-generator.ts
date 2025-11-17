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
    return generateClassicPDF(config);
  } else if (template === "minimal") {
    return generateMinimalPDF(config);
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

  // Format date as "Day Month" (e.g., "15 January")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
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

  // Calculate header height (slightly taller for better spacing)
  const headerHeight = 95 + (branding.tagline ? 15 : 0) + (salesAgents.length > 0 ? 50 : 0);
  
  // Draw header background if color is specified
  if (bgColor) {
    doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
  }

  // Header text
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(textColor.r, textColor.g, textColor.b);
  doc.text(branding.companyName, margin, yPosition);
  yPosition += 16;

  if (branding.tagline) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    doc.text(branding.tagline, margin, yPosition);
    yPosition += 24;
  }

  // Sales agents in header
  if (salesAgents.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textColor.r, textColor.g, textColor.b);
    let agentX = pageWidth - margin;
    salesAgents.slice().reverse().forEach(agent => {
      const lines = [];
      if (agent.region) lines.push(agent.region);
      lines.push(agent.name, agent.email, agent.phone);
      
      const textWidth = Math.max(...lines.map(line => doc.getTextWidth(line)));
      agentX -= textWidth + 20;
      
      let agentY = margin;
      lines.forEach(line => {
        doc.text(line, agentX, agentY, { align: "left" });
        agentY += 12;
      });
    });
  }

  yPosition += 10;
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

    // Products table
    const tableData = categoryProducts.map(product => [
      product.notes || "",
      product.product,
      product.sku,
      product.format,
      product.price,
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Notes/Order", "Product", "SKU", "Format", "Price"]],
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
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 180 },
        2: { cellWidth: 80 },
        3: { cellWidth: 100 },
        4: { cellWidth: 75 },
      },
      margin: { left: margin, right: margin, bottom: margin + footerHeight },
      didDrawPage: (data) => {
        // Minimal footer with text and small QR code aligned
        const footerY = pageHeight - margin - 12;
        
        // Thin separator line
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
        
        // Footer text - format: Page: X | Company Pricelist [Day Month]
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        
        const pageNum = (doc as any).getCurrentPageInfo().pageNumber;
        const footerText = `Page: ${pageNum} | ${branding.companyName} Pricelist [${dayMonthDate}]`;
        doc.text(footerText, margin, footerY);
        
        // Small QR code on the right side, vertically centered with text
        if (qrCodeBase64) {
          // Position QR code: right-justified, centered vertically with text baseline
          const qrX = pageWidth - margin - qrCodeSize;
          const qrY = footerY - (qrCodeSize / 2) - 5; // Center with text (text baseline at footerY)
          doc.addImage(qrCodeBase64, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);
        }
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  // Save the PDF
  const fileName = `${displayName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

function generateClassicPDF(config: PDFConfig): void {
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

  // Format date as "Day Month" (e.g., "15 January")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
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
        const footerText = `Page: ${pageNum}    ${branding.companyName} Pricelist [${dayMonthDate}]`;
        doc.text(footerText, margin, footerY);
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  const fileName = `${displayName.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

function generateMinimalPDF(config: PDFConfig): void {
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

  // Format date as "Day Month" (e.g., "15 January")
  const currentDate = new Date();
  const dayMonthDate = currentDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
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
