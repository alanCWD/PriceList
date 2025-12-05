import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check } from "lucide-react";
import type { Template } from "@shared/schema";

interface TemplateSelectorProps {
  value: Template;
  onChange: (template: Template) => void;
}

const templates = [
  {
    id: "pricelist" as Template,
    name: "Pricelist",
    description: "Simple and elegant design with clean lines and maximum whitespace",
    features: ["Clean lines", "Generous spacing", "Light color palette"],
  },
  {
    id: "catalogue" as Template,
    name: "Catalogue",
    description: "Rich layout with product images and detailed formatting",
    features: ["Product images", "Full table borders", "Compact spacing"],
  },
];

export function TemplateSelector({ value, onChange }: TemplateSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Select Template Style</h3>
        <p className="text-sm text-muted-foreground">
          Choose a visual style for your pricelist
        </p>
      </div>

      <RadioGroup value={value} onValueChange={(v) => onChange(v as Template)}>
        <div className="grid gap-4 md:grid-cols-3">
          {templates.map((template) => (
            <Label
              key={template.id}
              htmlFor={template.id}
              className="cursor-pointer"
              data-testid={`template-option-${template.id}`}
            >
              <Card
                className={`hover-elevate transition-all ${
                  value === template.id
                    ? "ring-2 ring-primary"
                    : ""
                }`}
              >
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {template.description}
                      </CardDescription>
                    </div>
                    <RadioGroupItem
                      value={template.id}
                      id={template.id}
                      className="mt-0.5"
                      data-testid={`radio-template-${template.id}`}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {template.features.map((feature, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Check className="h-3 w-3 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Label>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
