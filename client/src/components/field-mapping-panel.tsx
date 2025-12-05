import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FieldMapping } from "@shared/schema";

interface FieldMappingPanelProps {
  headers: string[];
  mapping: FieldMapping;
  onMappingChange: (mapping: FieldMapping) => void;
  onApply: () => void;
  previewData: any[];
}

export function FieldMappingPanel({
  headers,
  mapping,
  onMappingChange,
  onApply,
  previewData,
}: FieldMappingPanelProps) {
  const updateMapping = (field: keyof FieldMapping, value: string) => {
    // Handle "None" selection for optional fields
    const actualValue = value === "__none__" ? "" : value;
    onMappingChange({
      ...mapping,
      [field]: actualValue,
    });
  };

  const requiredFields = [
    { key: "product" as keyof FieldMapping, label: "Product Name", required: true },
    { key: "sku" as keyof FieldMapping, label: "SKU", required: true },
    { key: "format" as keyof FieldMapping, label: "Case/Size", required: true },
    { key: "price" as keyof FieldMapping, label: "Price", required: true },
  ];

  const optionalFields = [
    { key: "category" as keyof FieldMapping, label: "Category/Producer", required: false },
    { key: "notes" as keyof FieldMapping, label: "Notes/Order Info", required: false },
    { key: "productImageUrl" as keyof FieldMapping, label: "Product Image", required: false },
  ];

  const allRequiredMapped = requiredFields.every(field => mapping[field.key]);

  // Filter out empty headers to prevent SelectItem value errors
  const validHeaders = headers.filter(h => h && h.trim() !== "");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Map CSV Fields to Pricelist Columns</CardTitle>
          <CardDescription>
            Match the columns from your CSV file to the pricelist fields. 
            Required fields are marked with a badge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Required Fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Required Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {requiredFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={field.key} className="text-sm font-medium">
                      {field.label}
                    </Label>
                    <Badge variant="secondary" className="text-xs">Required</Badge>
                  </div>
                  <Select
                    value={mapping[field.key] || ""}
                    onValueChange={(value) => updateMapping(field.key, value)}
                  >
                    <SelectTrigger id={field.key} data-testid={`select-${field.key}`}>
                      <SelectValue placeholder="Select CSV column..." />
                    </SelectTrigger>
                    <SelectContent>
                      {validHeaders.map(header => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[field.key] && previewData[0] && mapping[field.key] && (
                    <p className="text-xs text-muted-foreground truncate" data-testid={`preview-${field.key}`}>
                      Preview: {previewData[0][mapping[field.key]!]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Optional Fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Optional Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {optionalFields.map(field => (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={field.key} className="text-sm font-medium">
                      {field.label}
                    </Label>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>
                  <Select
                    value={mapping[field.key] || ""}
                    onValueChange={(value) => updateMapping(field.key, value)}
                  >
                    <SelectTrigger id={field.key} data-testid={`select-${field.key}`}>
                      <SelectValue placeholder="Select CSV column (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {validHeaders.map(header => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[field.key] && previewData[0] && mapping[field.key] && (
                    <p className="text-xs text-muted-foreground truncate">
                      Preview: {previewData[0][mapping[field.key]!]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview Table */}
          {previewData.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Preview (First 3 Rows)</h3>
              <div className="border rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase">Notes</th>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase">Product</th>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase">SKU</th>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase">Format</th>
                        <th className="px-4 py-3 text-left font-semibold text-xs uppercase">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-3">{mapping.notes ? row[mapping.notes] : "-"}</td>
                          <td className="px-4 py-3">{mapping.product ? row[mapping.product] : "-"}</td>
                          <td className="px-4 py-3">{mapping.sku ? row[mapping.sku] : "-"}</td>
                          <td className="px-4 py-3">{mapping.format ? row[mapping.format] : "-"}</td>
                          <td className="px-4 py-3">{mapping.price ? row[mapping.price] : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Validation Alert */}
          {!allRequiredMapped && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please map all required fields (Product Name, SKU, Format, and Price) before continuing.
              </AlertDescription>
            </Alert>
          )}

          {/* Action Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={onApply}
              disabled={!allRequiredMapped}
              size="lg"
              data-testid="button-apply-mapping"
              className="gap-2"
            >
              {allRequiredMapped ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Continue to Configuration
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                "Map all required fields to continue"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
