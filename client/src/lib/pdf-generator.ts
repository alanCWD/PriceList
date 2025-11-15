import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Product, SalesAgent, CompanyBranding, QRCodeConfig } from "@shared/schema";

interface PDFConfig {
  products: Product[];
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
}

export async function generatePDF(config: PDFConfig): Promise<void> {
  const { products, branding, salesAgents, qrCodeConfig } = config;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  let yPosition = margin;

  // Header
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(branding.companyName, margin, yPosition);
  yPosition += 20;

  if (branding.tagline) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(branding.tagline, margin, yPosition);
    yPosition += 20;
  }

  // Sales agents in header
  if (salesAgents.length > 0) {
    doc.setFontSize(10);
    let agentX = pageWidth - margin;
    salesAgents.reverse().forEach(agent => {
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
      margin: { left: margin, right: margin },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  });

  // Footer
  const footerY = pageHeight - margin - 60;
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(2);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  // Sales agents in footer
  if (salesAgents.length > 0) {
    let agentX = margin;
    salesAgents.forEach((agent, index) => {
      doc.setFillColor(245, 245, 245);
      const boxWidth = 180;
      doc.rect(agentX, footerY + 10, boxWidth, 40, "F");
      doc.setDrawColor(200, 200, 200);
      doc.rect(agentX, footerY + 10, boxWidth, 40, "S");

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      let textY = footerY + 22;
      if (agent.region) {
        doc.text(agent.region, agentX + 8, textY);
        textY += 10;
      }
      doc.text(agent.name, agentX + 8, textY);
      textY += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(agent.email, agentX + 8, textY);
      textY += 10;
      doc.text(agent.phone, agentX + 8, textY);

      agentX += boxWidth + 20;
    });
  }

  // Date and page number
  const currentDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const centerX = pageWidth / 2;
  doc.text(`Updated: ${currentDate}`, centerX, footerY + 25, { align: "center" });
  doc.text("Page 1", centerX, footerY + 35, { align: "center" });

  // QR Code (if available)
  if (qrCodeConfig) {
    // Note: For now, we'll skip QR code in PDF as it requires canvas conversion
    // This can be enhanced later with QR code image generation
  }

  // Save the PDF
  const fileName = `${branding.companyName.replace(/[^a-z0-9]/gi, "_")}_Pricelist_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
