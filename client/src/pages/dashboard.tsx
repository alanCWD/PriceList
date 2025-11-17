import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileText, Trash2, Edit, Calendar } from "lucide-react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { format } from "date-fns";
import type { Pricelist, Company, Product, CompanyBranding } from "@shared/schema";
import { productSchema, companyBrandingSchema } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Fetch user's company info
  const { data: company, isLoading: companyLoading } = useQuery<Company>({
    queryKey: user?.companyId ? ['/api/companies', user.companyId] : [],
    enabled: !!user?.companyId,
  });

  // Fetch pricelists
  const { data: pricelists = [], isLoading: pricelistsLoading } = useQuery<Pricelist[]>({
    queryKey: ['/api/pricelists'],
    enabled: !!user,
  });

  // Delete pricelist mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pricelists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricelists'] });
      toast({
        title: "Pricelist deleted",
        description: "The pricelist has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete pricelist",
        variant: "destructive",
      });
    },
  });

  const handleCreateNew = () => {
    setLocation("/editor");
  };

  const handleEdit = (id: number) => {
    setLocation(`/editor?id=${id}`);
  };

  // Schema-backed JSON field parser with validation for data integrity
  const parseJsonField = <T,>(
    value: T | string | null | undefined,
    schema: z.ZodSchema<T>,
    fallback: T
  ): T => {
    if (!value) return fallback;
    
    let normalizedValue: unknown;
    
    // Normalize: string → parsed JSON, otherwise use as-is
    if (typeof value === 'string') {
      try {
        normalizedValue = JSON.parse(value);
      } catch (error) {
        console.warn('[Dashboard] JSON parse failed:', error);
        return fallback;
      }
    } else {
      normalizedValue = value;
    }
    
    // Validate the normalized value (both parsed strings AND database objects)
    const result = schema.safeParse(normalizedValue);
    if (result.success) {
      return result.data;
    } else {
      console.warn('[Dashboard] Schema validation failed:', result.error.format());
      return fallback;
    }
  };

  const getTemplateColor = (template: string) => {
    switch (template) {
      case "modern":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "classic":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
      case "minimal":
        return "bg-slate-500/10 text-slate-700 dark:text-slate-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  // Loading state
  if (authLoading || companyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" data-testid="loader-page" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-company-name">
                {company?.name || "Pricelist Generator"}
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="text-user-info">
                {user?.firstName} {user?.lastName} • {user?.email}
              </p>
            </div>
            <UserProfileMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-6xl mx-auto px-6 py-8">
        {/* Page Header with CTA */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">My Pricelists</h2>
            <p className="text-muted-foreground mt-2">
              Create and manage professional pricelists for your products
            </p>
          </div>
          <Button onClick={handleCreateNew} data-testid="button-create-pricelist">
            <Plus className="w-4 h-4 mr-2" />
            Create New Pricelist
          </Button>
        </div>

        {/* Pricelists Grid */}
        {pricelistsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" data-testid="loader-pricelists" />
          </div>
        ) : pricelists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2" data-testid="text-empty-state">No pricelists yet</h3>
              <p className="text-muted-foreground text-center mb-6">
                Get started by creating your first professional pricelist
              </p>
              <Button onClick={handleCreateNew} data-testid="button-create-first">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Pricelist
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pricelists.map((pricelist) => {
              // Parse and validate JSONB fields using Zod schemas
              const products = parseJsonField<Product[]>(
                pricelist.products, 
                z.array(productSchema), 
                []
              );
              const branding = parseJsonField<CompanyBranding>(
                pricelist.branding,
                companyBrandingSchema,
                { companyName: 'Unknown' }
              );
              const template = pricelist.template || 'modern';

              return (
                <Card key={pricelist.id} className="flex flex-col" data-testid={`card-pricelist-${pricelist.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <CardTitle className="text-lg" data-testid={`text-pricelist-name-${pricelist.id}`}>
                        {pricelist.name}
                      </CardTitle>
                      <Badge 
                        variant="secondary" 
                        className={getTemplateColor(template)}
                        data-testid={`badge-template-${pricelist.id}`}
                      >
                        {template}
                      </Badge>
                    </div>
                    {pricelist.description && (
                      <CardDescription data-testid={`text-pricelist-description-${pricelist.id}`}>
                        {pricelist.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  
                  <CardContent className="flex-1">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span data-testid={`text-product-count-${pricelist.id}`}>
                          {products.length} products
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-created-date-${pricelist.id}`}>
                          Created {format(new Date(pricelist.createdAt), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="pt-2">
                        <p className="text-xs text-muted-foreground">Company</p>
                        <p className="font-medium" data-testid={`text-company-name-${pricelist.id}`}>
                          {branding.companyName}
                        </p>
                      </div>
                    </div>
                  </CardContent>

                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleEdit(pricelist.id)}
                    data-testid={`button-edit-${pricelist.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        data-testid={`button-delete-${pricelist.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Pricelist</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{pricelist.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid={`button-cancel-delete-${pricelist.id}`}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(pricelist.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid={`button-confirm-delete-${pricelist.id}`}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
