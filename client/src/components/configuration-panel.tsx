import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, ArrowRight, Building2, Users, QrCode, AlertCircle, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { CompanyBranding, SalesAgent, QRCodeConfig, CompanyProfile, SalesAgentProfile } from "@shared/schema";
import { getPaletteFromLogo } from "@/lib/color-extractor";

interface ConfigurationPanelProps {
  branding: CompanyBranding;
  salesAgents: SalesAgent[];
  qrCodeConfig?: QRCodeConfig;
  onBrandingChange: (branding: CompanyBranding) => void;
  onSalesAgentsChange: (agents: SalesAgent[]) => void;
  onQRCodeChange: (config?: QRCodeConfig) => void;
  onContinue: () => void;
}

export function ConfigurationPanel({
  branding,
  salesAgents,
  qrCodeConfig,
  onBrandingChange,
  onSalesAgentsChange,
  onQRCodeChange,
  onContinue,
}: ConfigurationPanelProps) {
  const [logoPreview, setLogoPreview] = useState<string | undefined>(branding.logoUrl);

  const { data: companyProfiles } = useQuery<CompanyProfile[]>({
    queryKey: ["/api/company-profiles"],
  });

  const { data: agentProfiles } = useQuery<SalesAgentProfile[]>({
    queryKey: ["/api/sales-agent-profiles"],
  });

  const handleLoadCompanyProfile = async (profileId: string) => {
    const profile = companyProfiles?.find((p) => p.id === parseInt(profileId));
    if (profile) {
      setLogoPreview(profile.branding.logoUrl);
      
      // If profile has a logo but no colors, extract them
      if (profile.branding.logoUrl && (!profile.branding.headerBackgroundColor || !profile.branding.headerTextColor)) {
        try {
          const { backgroundColor, textColor } = await getPaletteFromLogo(profile.branding.logoUrl);
          onBrandingChange({ 
            ...profile.branding,
            headerBackgroundColor: backgroundColor,
            headerTextColor: textColor,
          });
        } catch (error) {
          console.error('Failed to extract colors from logo:', error);
          onBrandingChange(profile.branding);
        }
      } else {
        onBrandingChange(profile.branding);
      }
    }
  };

  const handleLoadAgentProfile = (profileId: string) => {
    const profile = agentProfiles?.find((p) => p.id === parseInt(profileId));
    if (profile) {
      // Guard against loading more than 2 agents
      const validAgents = profile.agents.slice(0, 2);
      onSalesAgentsChange(validAgents);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const result = reader.result as string;
        setLogoPreview(result);
        
        // Extract colors from logo
        try {
          const { backgroundColor, textColor } = await getPaletteFromLogo(result);
          onBrandingChange({ 
            ...branding, 
            logoUrl: result,
            headerBackgroundColor: backgroundColor,
            headerTextColor: textColor,
          });
        } catch (error) {
          console.error('Failed to extract colors from logo:', error);
          // Fallback: set logo without colors
          onBrandingChange({ ...branding, logoUrl: result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addSalesAgent = () => {
    if (salesAgents.length < 2) {
      onSalesAgentsChange([
        ...salesAgents,
        { name: "", email: "", phone: "", region: "" },
      ]);
    }
  };

  const updateSalesAgent = (index: number, field: keyof SalesAgent, value: string) => {
    const updated = [...salesAgents];
    updated[index] = { ...updated[index], [field]: value };
    onSalesAgentsChange(updated);
  };

  const removeSalesAgent = (index: number) => {
    onSalesAgentsChange(salesAgents.filter((_, i) => i !== index));
  };

  const handleQRCodeUrlChange = (url: string) => {
    if (url) {
      onQRCodeChange({ url, size: 80 });
    } else {
      onQRCodeChange(undefined);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Company Branding */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Company Branding</CardTitle>
          </div>
          <CardDescription>
            Customize the header of your pricelist with your company information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {companyProfiles && companyProfiles.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="load-company-profile">Load Saved Profile</Label>
              <Select onValueChange={handleLoadCompanyProfile}>
                <SelectTrigger id="load-company-profile" data-testid="select-company-profile">
                  <SelectValue placeholder="Select a company profile..." />
                </SelectTrigger>
                <SelectContent>
                  {companyProfiles.map((profile) => (
                    <SelectItem 
                      key={profile.id} 
                      value={profile.id.toString()}
                      data-testid={`option-company-${profile.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        {profile.name} - {profile.branding.companyName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Or fill in the fields manually below
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name *</Label>
              <Input
                id="company-name"
                data-testid="input-company-name"
                placeholder="Your Company Name"
                value={branding.companyName}
                onChange={(e) => onBrandingChange({ ...branding, companyName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                data-testid="input-tagline"
                placeholder="Quality Products Since 2020"
                value={branding.tagline || ""}
                onChange={(e) => onBrandingChange({ ...branding, tagline: e.target.value })}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <Label htmlFor="logo-upload">Company Logo (Optional)</Label>
            <div className="flex flex-col gap-4">
              {logoPreview && (
                <div className="border rounded-md p-4 bg-card inline-flex items-center justify-center max-w-xs">
                  <img
                    src={logoPreview}
                    alt="Company logo preview"
                    className="max-h-16 object-contain"
                    data-testid="img-logo-preview"
                  />
                </div>
              )}
              <div>
                <Input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  data-testid="input-logo-upload"
                  className="max-w-sm"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Recommended: PNG or SVG, max height 64px
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Agents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <CardTitle>Sales Agents</CardTitle>
            </div>
            <Button
              onClick={addSalesAgent}
              disabled={salesAgents.length >= 2}
              size="sm"
              variant="outline"
              data-testid="button-add-agent"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Agent {salesAgents.length > 0 && `(${salesAgents.length}/2)`}
            </Button>
          </div>
          <CardDescription>
            Add up to 2 sales agents with their contact information for the footer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {agentProfiles && agentProfiles.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="load-agent-profile">Load Saved Team</Label>
              <Select onValueChange={handleLoadAgentProfile}>
                <SelectTrigger id="load-agent-profile" data-testid="select-agent-profile">
                  <SelectValue placeholder="Select a sales team..." />
                </SelectTrigger>
                <SelectContent>
                  {agentProfiles.map((profile) => (
                    <SelectItem 
                      key={profile.id} 
                      value={profile.id.toString()}
                      data-testid={`option-agent-${profile.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        {profile.name} ({profile.agents.length} agent{profile.agents.length !== 1 ? "s" : ""})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Or add agents manually below
              </p>
            </div>
          )}
          {salesAgents.length >= 2 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Maximum of 2 sales agents reached. Remove an agent to add a different one.
              </AlertDescription>
            </Alert>
          )}
          {salesAgents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No sales agents added yet</p>
              <p className="text-sm">Click "Add Agent" to include contact information</p>
            </div>
          ) : (
            <div className="space-y-6">
              {salesAgents.map((agent, index) => (
                <div key={index} className="border rounded-md p-6 space-y-4 bg-card">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Agent {index + 1}</h4>
                    <Button
                      onClick={() => removeSalesAgent(index)}
                      size="sm"
                      variant="ghost"
                      data-testid={`button-remove-agent-${index}`}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`agent-${index}-name`}>Name *</Label>
                      <Input
                        id={`agent-${index}-name`}
                        data-testid={`input-agent-name-${index}`}
                        placeholder="John Doe"
                        value={agent.name}
                        onChange={(e) => updateSalesAgent(index, "name", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`agent-${index}-region`}>Region</Label>
                      <Input
                        id={`agent-${index}-region`}
                        data-testid={`input-agent-region-${index}`}
                        placeholder="South Vancouver Island"
                        value={agent.region || ""}
                        onChange={(e) => updateSalesAgent(index, "region", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`agent-${index}-email`}>Email *</Label>
                      <Input
                        id={`agent-${index}-email`}
                        data-testid={`input-agent-email-${index}`}
                        type="email"
                        placeholder="john@company.com"
                        value={agent.email}
                        onChange={(e) => updateSalesAgent(index, "email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`agent-${index}-phone`}>Phone *</Label>
                      <Input
                        id={`agent-${index}-phone`}
                        data-testid={`input-agent-phone-${index}`}
                        type="tel"
                        placeholder="250-123-4567"
                        value={agent.phone}
                        onChange={(e) => updateSalesAgent(index, "phone", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Code */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-muted-foreground" />
            <CardTitle>QR Code (Optional)</CardTitle>
          </div>
          <CardDescription>
            Add a QR code to the footer that links to your website or catalog
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qr-url">Website URL</Label>
            <Input
              id="qr-url"
              data-testid="input-qr-url"
              type="url"
              placeholder="https://yourwebsite.com"
              value={qrCodeConfig?.url || ""}
              onChange={(e) => handleQRCodeUrlChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              QR code will appear in the bottom right of the pricelist footer
            </p>
          </div>
          {qrCodeConfig?.url && (
            <div className="flex justify-center p-4 border rounded-md bg-white">
              <div className="text-center space-y-2">
                <div className="inline-block p-2 border rounded-md">
                  <QRCodeSVG value={qrCodeConfig.url} size={80} />
                </div>
                <p className="text-xs text-muted-foreground">QR Code Preview</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={onContinue}
          size="lg"
          data-testid="button-continue-preview"
          className="gap-2"
        >
          Continue to Preview
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
