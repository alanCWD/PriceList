import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import type { CompanyBranding } from "@shared/schema";

interface SavePricelistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description?: string) => Promise<void>;
  companyBranding: CompanyBranding;
  initialName?: string;
  initialDescription?: string;
}

export function SavePricelistDialog({ 
  open, 
  onOpenChange, 
  onSave,
  companyBranding,
  initialName = "",
  initialDescription = "",
}: SavePricelistDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  // Generate auto-name using footer format: "Company Pricelist [Day Month]"
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
    return `${companyBranding.companyName} Pricelist [${day} ${month}]`;
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      console.log("SaveDialog: Starting save...");
      await onSave(name.trim(), description.trim() || undefined);
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
    }
  }, [open, initialName, initialDescription, companyBranding.companyName]);

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
            disabled={!name.trim() || saving}
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
