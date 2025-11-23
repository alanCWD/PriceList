import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CompanyBranding, User, Company } from "@shared/schema";

interface SavePricelistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description?: string, companyId?: number) => Promise<void>;
  companyBranding: CompanyBranding;
  initialName?: string;
  initialDescription?: string;
  user: User | null | undefined;
}

export function SavePricelistDialog({ 
  open, 
  onOpenChange, 
  onSave,
  companyBranding,
  initialName = "",
  initialDescription = "",
  user,
}: SavePricelistDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Check if user is a super admin without a company
  const isSuperAdminWithoutCompany = user?.role === "superAdmin" && !user?.companyId;

  // Fetch companies for super admins
  const { data: companies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: isSuperAdminWithoutCompany && open,
  });

  // Generate auto-name using footer format: "Company Pricelist - Day Month Year"
  const generateAutoName = () => {
    // Guard against placeholder/default values
    if (!companyBranding.companyName || 
        companyBranding.companyName === "Your Company Name" ||
        companyBranding.companyName.trim() === "") {
      return "";
    }
    
    const now = new Date();
    const day = now.getDate();
    const month = now.toLocaleDateString("en-GB", { month: "long" });
    const year = now.getFullYear();
    return `${companyBranding.companyName} Pricelist - ${day} ${month} ${year}`;
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    
    // Validate company selection for super admins
    if (isSuperAdminWithoutCompany && !selectedCompanyId) {
      return; // Button should be disabled anyway
    }

    setSaving(true);
    try {
      console.log("SaveDialog: Starting save...");
      await onSave(name.trim(), description.trim() || undefined, selectedCompanyId || undefined);
      console.log("SaveDialog: Save completed successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("SaveDialog: Failed to save pricelist:", error);
    } finally {
      console.log("SaveDialog: Resetting saving state");
      setSaving(false);
    }
  };

  // Update local state when dialog opens or when values change
  useEffect(() => {
    if (open) {
      // Fallback chain: initialName → autoName → initialDescription → "Untitled Pricelist"
      const autoName = generateAutoName();
      const finalName = initialName || autoName || initialDescription || "Untitled Pricelist";
      setName(finalName);
      setDescription(initialDescription);
      setSaving(false);
      
      // Reset company selection when dialog opens
      if (isSuperAdminWithoutCompany && companies && companies.length > 0) {
        setSelectedCompanyId(companies[0].id);
      }
    }
  }, [open, initialName, initialDescription, companyBranding.companyName, isSuperAdminWithoutCompany, companies]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-save-pricelist">
        <DialogHeader>
          <DialogTitle>Save Pricelist</DialogTitle>
          <DialogDescription>
            Save this pricelist configuration to load it later
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isSuperAdminWithoutCompany && (
            <div className="space-y-2">
              <Label htmlFor="company-select">Company *</Label>
              {companies && companies.length > 0 ? (
                <Select 
                  value={selectedCompanyId?.toString()} 
                  onValueChange={(value) => setSelectedCompanyId(parseInt(value))}
                  disabled={saving}
                >
                  <SelectTrigger id="company-select" data-testid="select-company">
                    <SelectValue placeholder="Select a company..." />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id.toString()}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No companies found. Please create a company first in Admin Settings.
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Select which company this pricelist belongs to
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pricelist-name">Name (Optional - auto-generated)</Label>
            <Input
              id="pricelist-name"
              data-testid="input-pricelist-name"
              placeholder="Auto-generated from company name and date"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Leave as-is or customize the pricelist name
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pricelist-description">Description (Optional)</Label>
            <Textarea
              id="pricelist-description"
              data-testid="textarea-pricelist-description"
              placeholder="Add notes about this pricelist..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            data-testid="button-cancel-save"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || saving || (isSuperAdminWithoutCompany && !selectedCompanyId)}
            data-testid="button-confirm-save"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Pricelist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
