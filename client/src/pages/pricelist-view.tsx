import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, Edit, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { PreviewPanel } from "@/components/preview-panel";
import type { Pricelist, Product, SalesAgent, CompanyBranding, QRCodeConfig, Template } from "@shared/schema";

export default function PricelistView() {
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const pricelistId = urlParams.get('id') ? parseInt(urlParams.get('id')!) : null;

  // Load pricelist
  const { data: pricelist, isLoading, error } = useQuery<Pricelist>({
    queryKey: pricelistId ? [`/api/pricelists/${pricelistId}`] : [],
    enabled: !!pricelistId,
  });

  if (!pricelistId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invalid Pricelist</CardTitle>
            <CardDescription>No pricelist ID provided</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button data-testid="button-back-to-dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground" />
          </div>
          <p className="text-muted-foreground" data-testid="loading-pricelist">Loading pricelist...</p>
        </div>
      </div>
    );
  }

  if (error || !pricelist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error Loading Pricelist</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Failed to load pricelist"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard">
              <Button data-testid="button-back-to-dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const products = pricelist.products as Product[];
  const branding = pricelist.branding as CompanyBranding;
  const salesAgents = pricelist.salesAgents as SalesAgent[];
  const qrCodeConfig = pricelist.qrCode as QRCodeConfig | undefined;
  const template = pricelist.template as Template;
  const categoryFilter = pricelist.categoryFilter || null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-foreground" data-testid="text-pricelist-name">
                  {pricelist.name}
                </h1>
                {pricelist.description && (
                  <p className="text-sm text-muted-foreground mt-1" data-testid="text-pricelist-description">
                    {pricelist.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setLocation(`/editor?id=${pricelistId}`)}
                variant="outline"
                data-testid="button-edit-pricelist"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <UserProfileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <PreviewPanel
          products={products}
          branding={branding}
          salesAgents={salesAgents}
          qrCodeConfig={qrCodeConfig}
          template={template}
          pricelistName={pricelist.name}
          categoryFilter={categoryFilter}
        />
      </main>
    </div>
  );
}
