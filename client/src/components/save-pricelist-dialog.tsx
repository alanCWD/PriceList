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

interface SavePricelistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description?: string) => Promise<void>;
  initialName?: string;
  initialDescription?: string;
}

export function SavePricelistDialog({ 
  open, 
  onOpenChange, 
  onSave,
  initialName = "",
  initialDescription = "",
}: SavePricelistDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave(name.trim(), description.trim() || undefined);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save pricelist:", error);
    } finally {
      setSaving(false);
    }
  };

  // Update local state when dialog opens (not when initial values change while dialog is open)
  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setSaving(false);
    }
  }, [open]);

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
            <Label htmlFor="pricelist-name">Name</Label>
            <Input
              id="pricelist-name"
              data-testid="input-pricelist-name"
              placeholder="e.g., December 2025 Wine List"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
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
