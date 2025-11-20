import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Pipette } from "lucide-react";

interface ColorPickerProps {
  label: string;
  color: string | undefined;
  onChange: (color: string) => void;
  onExtractFromLogo?: () => Promise<void>;
  showExtractButton?: boolean;
  testId?: string;
}

export function ColorPicker({
  label,
  color = "#ffffff",
  onChange,
  onExtractFromLogo,
  showExtractButton = false,
  testId,
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentColor = color || "#ffffff";

  const handleColorChange = (newColor: string) => {
    onChange(newColor);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only update if it's a valid hex color format
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 hover-elevate"
              data-testid={testId}
            >
              <div
                className="w-6 h-6 rounded border border-border"
                style={{ backgroundColor: currentColor }}
              />
              <span className="flex-1 text-left">{currentColor.toUpperCase()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <HexColorPicker color={currentColor} onChange={handleColorChange} />
              <div className="space-y-2">
                <Label htmlFor="hex-input">Hex Color</Label>
                <Input
                  id="hex-input"
                  value={currentColor.toUpperCase()}
                  onChange={handleInputChange}
                  placeholder="#FFFFFF"
                  maxLength={7}
                  data-testid={`${testId}-input`}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1">
                  <div className="h-8 rounded border border-border" style={{ backgroundColor: currentColor }} />
                </div>
                <span>Preview</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {showExtractButton && onExtractFromLogo && (
          <Button
            variant="outline"
            size="icon"
            onClick={onExtractFromLogo}
            title="Extract color from logo"
            data-testid={`${testId}-extract`}
            className="hover-elevate"
          >
            <Pipette className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
