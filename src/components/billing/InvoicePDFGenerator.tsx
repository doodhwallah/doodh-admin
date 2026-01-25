import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { numberToIndianWords } from "@/lib/numberToWords";
import { logger } from "@/lib/logger";

interface DairySettings {
  dairy_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  invoice_prefix: string;
  logo_url: string | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
}

interface DeliveryItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  delivery_date: string;
  unit: string;
}

interface DeliveryQueryResult {
  delivery_date: string;
  delivery_items: Array<{
    quantity: number;
    unit_price: number;
    total_amount: number;
    product: { name: string; unit: string } | null;
  }> | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  due_date: string | null;
  created_at: string;
  notes?: string | null;
  customer?: {
    id: string;
    name: string;
  };
}

interface InvoicePDFGeneratorProps {
  invoice: Invoice;
  onGenerated?: () => void;
}

// Load image as base64
const loadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export function InvoicePDFGenerator({ invoice, onGenerated }: InvoicePDFGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);

  const generatePDF = async (action: "download" | "preview" = "download") => {
    setGenerating(true);

    try {
      // Fetch dairy settings
      const { data: settingsData } = await supabase
        .from("dairy_settings")
        .select("*")
        .limit(1)
        .single();

      const settings: DairySettings = settingsData || {
        dairy_name: "Awadh Dairy",
        address: "Lucknow, Uttar Pradesh",
        phone: "+91 9876543210",
        email: "contact@awadhdairy.com",
        currency: "INR",
        invoice_prefix: "INV",
        logo_url: null,
      };

      // Fetch customer details
      const { data: customerData } = await supabase
        .from("customers")
        .select("*")
        .eq("id", invoice.customer_id)
        .single();

      const customer: Customer = customerData || {
        id: invoice.customer_id,
        name: invoice.customer?.name || "Customer",
        phone: null,
        email: null,
        address: null,
        area: null,
      };

      // Fetch delivery items for this billing period
      const { data: deliveries } = await supabase
        .from("deliveries")
        .select(`
          delivery_date,
          delivery_items (
            quantity,
            unit_price,
            total_amount,
            product:product_id (name, unit)
          )
        `)
        .eq("customer_id", invoice.customer_id)
        .gte("delivery_date", invoice.billing_period_start)
        .lte("delivery_date", invoice.billing_period_end)
        .eq("status", "delivered");

      // Flatten delivery items
      const items: DeliveryItem[] = [];
      const typedDeliveries = (deliveries || []) as DeliveryQueryResult[];
      typedDeliveries.forEach((delivery) => {
        (delivery.delivery_items || []).forEach((item) => {
          items.push({
            product_name: item.product?.name || "Product",
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
            delivery_date: delivery.delivery_date,
            unit: item.product?.unit || "unit",
          });
        });
      });

      // Load logo
      const logoBase64 = await loadImageAsBase64("/images/awadh-dairy-logo.png");

      // Create PDF
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      // Colors - Professional theme
      const primaryColor: [number, number, number] = [47, 79, 79]; // Dark Slate Gray
      const accentGreen: [number, number, number] = [34, 139, 34]; // Forest Green
      const goldAccent: [number, number, number] = [184, 134, 11]; // Dark Golden
      const darkText: [number, number, number] = [33, 33, 33];
      const grayText: [number, number, number] = [100, 100, 100];
      const lightBg: [number, number, number] = [248, 250, 252];
      const borderColor: [number, number, number] = [226, 232, 240];

      // Add watermark logo in center (low opacity effect using lighter tint)
      if (logoBase64) {
        const watermarkSize = 100;
        const watermarkX = (pageWidth - watermarkSize) / 2;
        const watermarkY = (pageHeight - watermarkSize) / 2;
        // Add logo with transparency effect (simulate with global alpha not available, so use positioning)
        doc.saveGraphicsState();
        // @ts-ignore - setGState may not be in types but works
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.addImage(logoBase64, "PNG", watermarkX, watermarkY, watermarkSize, watermarkSize);
        doc.restoreGraphicsState();
      }

      // Top border accent
      doc.setFillColor(...accentGreen);
      doc.rect(0, 0, pageWidth, 4, "F");

      // Header section with logo
      let yPos = 15;

      if (logoBase64) {
        const logoSize = 28;
        doc.addImage(logoBase64, "PNG", margin, yPos - 5, logoSize, logoSize);
        
        // Company name next to logo
        doc.setTextColor(...primaryColor);
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.text(settings.dairy_name.toUpperCase(), margin + logoSize + 8, yPos + 6);
        
        // Tagline
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        doc.text("Premium Fresh Dairy Products", margin + logoSize + 8, yPos + 14);
      } else {
        doc.setTextColor(...primaryColor);
        doc.setFontSize(26);
        doc.setFont("helvetica", "bold");
        doc.text(settings.dairy_name.toUpperCase(), margin, yPos + 8);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayText);
        doc.text("Premium Fresh Dairy Products", margin, yPos + 16);
      }

      // Invoice title - right side
      doc.setTextColor(...primaryColor);
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", pageWidth - margin, yPos + 4, { align: "right" });

      // Invoice number below title
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grayText);
      doc.text(`#${invoice.invoice_number}`, pageWidth - margin, yPos + 12, { align: "right" });

      // Status badge
      const statusText = invoice.payment_status.toUpperCase();
      let statusColor: [number, number, number];
      let statusBgColor: [number, number, number];
      switch (invoice.payment_status) {
        case "paid":
          statusColor = [22, 101, 52];
          statusBgColor = [220, 252, 231];
          break;
        case "partial":
          statusColor = [146, 64, 14];
          statusBgColor = [254, 243, 199];
          break;
        case "overdue":
          statusColor = [153, 27, 27];
          statusBgColor = [254, 226, 226];
          break;
        default:
          statusColor = [71, 85, 105];
          statusBgColor = [241, 245, 249];
      }
      
      const statusWidth = doc.getTextWidth(statusText) + 10;
      doc.setFillColor(...statusBgColor);
      doc.roundedRect(pageWidth - margin - statusWidth, yPos + 16, statusWidth, 8, 2, 2, "F");
      doc.setTextColor(...statusColor);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(statusText, pageWidth - margin - statusWidth / 2, yPos + 21.5, { align: "center" });

      yPos = 50;

      // Horizontal separator
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);

      yPos += 10;

      // Contact info row
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grayText);
      const contactItems = [
        `📞 ${settings.phone || "+91 9876543210"}`,
        `📧 contact@awadhdairy.com`,
        `🌐 www.awadhdairy.com`,
        `📍 ${settings.address || "Lucknow, UP"}`
      ];
      doc.text(contactItems.join("   |   "), pageWidth / 2, yPos, { align: "center" });

      yPos += 12;

      // Two column layout - Bill To and Invoice Details
      const colWidth = (pageWidth - margin * 2 - 20) / 2;

      // Left column - BILL TO
      doc.setFillColor(...lightBg);
      doc.roundedRect(margin, yPos, colWidth, 42, 3, 3, "F");
      doc.setDrawColor(...borderColor);
      doc.roundedRect(margin, yPos, colWidth, 42, 3, 3, "S");

      doc.setTextColor(...accentGreen);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("BILL TO", margin + 8, yPos + 9);

      doc.setTextColor(...darkText);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(customer.name, margin + 8, yPos + 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      let custY = yPos + 25;
      if (customer.address) {
        doc.text(customer.address, margin + 8, custY);
        custY += 5;
      }
      if (customer.area) {
        doc.text(customer.area, margin + 8, custY);
        custY += 5;
      }
      if (customer.phone) {
        doc.text(`Phone: ${customer.phone}`, margin + 8, custY);
      }

      // Right column - INVOICE DETAILS
      const rightX = margin + colWidth + 20;
      doc.setFillColor(...lightBg);
      doc.roundedRect(rightX, yPos, colWidth, 42, 3, 3, "F");
      doc.setDrawColor(...borderColor);
      doc.roundedRect(rightX, yPos, colWidth, 42, 3, 3, "S");

      doc.setTextColor(...accentGreen);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE DETAILS", rightX + 8, yPos + 9);

      const detailLabels = ["Invoice Date", "Billing Period", "Due Date"];
      const detailValues = [
        format(new Date(invoice.created_at), "dd MMMM yyyy"),
        `${format(new Date(invoice.billing_period_start), "dd MMM")} - ${format(new Date(invoice.billing_period_end), "dd MMM yyyy")}`,
        invoice.due_date ? format(new Date(invoice.due_date), "dd MMMM yyyy") : "On Receipt"
      ];

      let detY = yPos + 18;
      doc.setFontSize(9);
      detailLabels.forEach((label, i) => {
        doc.setTextColor(...grayText);
        doc.setFont("helvetica", "normal");
        doc.text(label + ":", rightX + 8, detY);
        
        doc.setTextColor(...darkText);
        doc.setFont("helvetica", "bold");
        doc.text(detailValues[i], rightX + colWidth - 8, detY, { align: "right" });
        detY += 7;
      });

      yPos += 52;

      // Items table
      const tableData: string[][] = [];
      
      if (items.length > 0) {
        // Group items by product and price
        const groupedItems = items.reduce((acc: Record<string, {
          product_name: string;
          unit: string;
          quantity: number;
          unit_price: number;
          total_amount: number;
        }>, item) => {
          const key = `${item.product_name}_${item.unit_price}`;
          if (!acc[key]) {
            acc[key] = {
              product_name: item.product_name,
              unit: item.unit,
              quantity: 0,
              unit_price: item.unit_price,
              total_amount: 0,
            };
          }
          acc[key].quantity += item.quantity;
          acc[key].total_amount += item.total_amount;
          return acc;
        }, {});

        Object.values(groupedItems).forEach((item, index) => {
          tableData.push([
            (index + 1).toString(),
            item.product_name,
            item.quantity.toFixed(2),
            item.unit,
            `₹${item.unit_price.toFixed(2)}`,
            `₹${item.total_amount.toFixed(2)}`,
          ]);
        });
      } else if (invoice.notes) {
        // Parse notes for items
        const noteLines = invoice.notes.split("; ");
        noteLines.forEach((line, index) => {
          const match = line.match(/(.+?):\s*([\d.]+)\s*(\w+)\s*@\s*₹([\d.]+)/);
          if (match) {
            const [, product, qty, unit, rate] = match;
            const amount = parseFloat(qty) * parseFloat(rate);
            tableData.push([
              (index + 1).toString(),
              product.trim(),
              parseFloat(qty).toFixed(2),
              unit,
              `₹${parseFloat(rate).toFixed(2)}`,
              `₹${amount.toFixed(2)}`,
            ]);
          }
        });
      }

      if (tableData.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [["#", "Item Description", "Qty", "Unit", "Rate", "Amount"]],
          body: tableData,
          margin: { left: margin, right: margin },
          headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            cellPadding: 4,
            halign: "center",
          },
          bodyStyles: {
            textColor: darkText,
            fontSize: 9,
            cellPadding: 4,
          },
          alternateRowStyles: {
            fillColor: [250, 250, 250],
          },
          columnStyles: {
            0: { cellWidth: 12, halign: "center" },
            1: { cellWidth: "auto", halign: "left", fontStyle: "bold" },
            2: { cellWidth: 20, halign: "right" },
            3: { cellWidth: 18, halign: "center" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
          },
          styles: {
            lineColor: borderColor,
            lineWidth: 0.3,
          },
          tableLineColor: borderColor,
          tableLineWidth: 0.3,
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        // No items - show billing period note
        doc.setTextColor(...grayText);
        doc.setFontSize(10);
        doc.text(`Billing for period: ${format(new Date(invoice.billing_period_start), "dd MMM")} - ${format(new Date(invoice.billing_period_end), "dd MMM yyyy")}`, margin, yPos + 8);
        yPos += 20;
      }

      // Summary section - right aligned
      const summaryWidth = 95;
      const summaryX = pageWidth - margin - summaryWidth;

      // Summary box
      doc.setFillColor(...lightBg);
      doc.roundedRect(summaryX, yPos, summaryWidth, 58, 3, 3, "F");
      doc.setDrawColor(...borderColor);
      doc.roundedRect(summaryX, yPos, summaryWidth, 58, 3, 3, "S");

      const sumLabelX = summaryX + 10;
      const sumValueX = summaryX + summaryWidth - 10;
      let sumY = yPos + 12;

      doc.setFontSize(9);
      
      // Subtotal
      doc.setTextColor(...grayText);
      doc.setFont("helvetica", "normal");
      doc.text("Subtotal", sumLabelX, sumY);
      doc.setTextColor(...darkText);
      doc.text(`₹${Number(invoice.total_amount).toFixed(2)}`, sumValueX, sumY, { align: "right" });
      
      // Tax
      sumY += 9;
      doc.setTextColor(...grayText);
      doc.text("Tax (GST)", sumLabelX, sumY);
      doc.setTextColor(...darkText);
      doc.text(`₹${Number(invoice.tax_amount).toFixed(2)}`, sumValueX, sumY, { align: "right" });
      
      // Discount (if any)
      if (Number(invoice.discount_amount) > 0) {
        sumY += 9;
        doc.setTextColor(...accentGreen);
        doc.text("Discount", sumLabelX, sumY);
        doc.text(`-₹${Number(invoice.discount_amount).toFixed(2)}`, sumValueX, sumY, { align: "right" });
      }

      // Divider
      sumY += 6;
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.5);
      doc.line(sumLabelX, sumY, sumValueX, sumY);

      // Grand Total
      sumY += 10;
      doc.setFillColor(...primaryColor);
      doc.roundedRect(sumLabelX - 4, sumY - 6, summaryWidth - 12, 14, 2, 2, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("GRAND TOTAL", sumLabelX + 2, sumY + 2);
      doc.setFontSize(12);
      doc.text(`₹${Number(invoice.final_amount).toFixed(2)}`, sumValueX - 4, sumY + 2, { align: "right" });

      // Amount in words - left side
      const wordsY = yPos + 8;
      doc.setTextColor(...darkText);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Amount in Words:", margin, wordsY);
      doc.setFont("helvetica", "italic");
      
      const amountWords = numberToIndianWords(Number(invoice.final_amount));
      const maxWidth = summaryX - margin - 10;
      const splitWords = doc.splitTextToSize(amountWords, maxWidth);
      doc.text(splitWords, margin, wordsY + 6);

      yPos += 68;

      // Payment info (if any payment made)
      if (Number(invoice.paid_amount) > 0) {
        doc.setFillColor(220, 252, 231);
        doc.roundedRect(margin, yPos, pageWidth - margin * 2, 20, 3, 3, "F");
        doc.setDrawColor(134, 239, 172);
        doc.roundedRect(margin, yPos, pageWidth - margin * 2, 20, 3, 3, "S");

        doc.setTextColor(22, 101, 52);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("✓ Payment Received", margin + 10, yPos + 9);
        doc.setFont("helvetica", "normal");
        doc.text(`₹${Number(invoice.paid_amount).toFixed(2)}`, margin + 70, yPos + 9);

        const balance = Number(invoice.final_amount) - Number(invoice.paid_amount);
        if (balance > 0) {
          doc.setTextColor(153, 27, 27);
          doc.setFont("helvetica", "bold");
          doc.text(`Balance Due: ₹${balance.toFixed(2)}`, pageWidth - margin - 10, yPos + 9, { align: "right" });
        } else {
          doc.setTextColor(22, 101, 52);
          doc.setFont("helvetica", "bold");
          doc.text("PAID IN FULL", pageWidth - margin - 10, yPos + 9, { align: "right" });
        }

        yPos += 28;
      }

      // Bank details / Payment terms section
      if (yPos < pageHeight - 80) {
        yPos = Math.max(yPos, pageHeight - 75);
        
        doc.setFillColor(...lightBg);
        doc.roundedRect(margin, yPos, (pageWidth - margin * 2 - 10) / 2, 28, 2, 2, "F");
        
        doc.setTextColor(...accentGreen);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("PAYMENT TERMS", margin + 6, yPos + 8);
        
        doc.setTextColor(...grayText);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text("• Payment due within 15 days", margin + 6, yPos + 15);
        doc.text("• Please quote invoice number", margin + 6, yPos + 21);
        
        // Right side - Notes
        const notesX = margin + (pageWidth - margin * 2 - 10) / 2 + 10;
        doc.setFillColor(...lightBg);
        doc.roundedRect(notesX, yPos, (pageWidth - margin * 2 - 10) / 2, 28, 2, 2, "F");
        
        doc.setTextColor(...accentGreen);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("NOTES", notesX + 6, yPos + 8);
        
        doc.setTextColor(...grayText);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text("Thank you for your business!", notesX + 6, yPos + 15);
        doc.text("Quality guaranteed on all products.", notesX + 6, yPos + 21);
      }

      // Footer
      const footerY = pageHeight - 20;
      
      // Footer line
      doc.setFillColor(...goldAccent);
      doc.rect(0, footerY - 8, pageWidth, 2, "F");

      // Thank you message
      doc.setTextColor(...primaryColor);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Thank you for choosing Awadh Dairy!", pageWidth / 2, footerY, { align: "center" });

      // Footer info
      doc.setTextColor(...grayText);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generated on ${format(new Date(), "dd MMM yyyy, hh:mm a")} | contact@awadhdairy.com | www.awadhdairy.com`,
        pageWidth / 2,
        footerY + 7,
        { align: "center" }
      );

      // Bottom accent
      doc.setFillColor(...accentGreen);
      doc.rect(0, pageHeight - 4, pageWidth, 4, "F");

      if (action === "download") {
        doc.save(`Invoice_${invoice.invoice_number}_${customer.name.replace(/\s+/g, "_")}.pdf`);
        onGenerated?.();
      } else {
        const dataUrl = doc.output("datauristring");
        setPdfDataUrl(dataUrl);
        setPreviewOpen(true);
      }
    } catch (error) {
      logger.error("InvoicePDF", "Error generating PDF", error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => generatePDF("preview")}
          disabled={generating}
        >
          <Eye className="h-3 w-3" />
        </Button>
        <Button
          variant="default"
          size="sm"
          className="gap-1"
          onClick={() => generatePDF("download")}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          PDF
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[90vh]">
          <DialogHeader>
            <DialogTitle>Invoice Preview - {invoice.invoice_number}</DialogTitle>
          </DialogHeader>
          {pdfDataUrl && (
            <iframe
              src={pdfDataUrl}
              className="w-full h-full rounded-lg border"
              title="Invoice Preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
