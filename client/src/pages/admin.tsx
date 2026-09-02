import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Building2, Users, Trash2, Edit, Plus, Upload, Download, Building, UserCog, Tag, ChevronDown, ChevronUp, GripVertical, ArrowUpDown, Eye, EyeOff, AlertCircle, Link as LinkIcon, Key, ExternalLink } from "lucide-react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { CSVUpload } from "@/components/csv-upload";
import { ColorPicker } from "@/components/color-picker";
import { getPaletteFromLogo } from "@/lib/color-extractor";
import type { 
  CompanyProfile, 
  SalesAgentProfile,
  CompanyBranding,
  SalesAgent,
  Company,
  User,
  Template,
  FieldMapping,
  BrandRegistry,
  BrandCategory,
  Pricelist
} from "@shared/schema";
import { moveBrandProductBySku } from "@shared/brand-reorder";
import { getOptionalFieldDefaults } from "@shared/field-mapping-defaults";

export default function AdminPage() {
  const { toast } = useToast();
  const { user, isAdmin, isSuperAdmin, isCompanyAdmin, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("branding");

  // Set default tab when role loads
  useEffect(() => {
    if (user && isSuperAdmin) {
      setActiveTab("companies");
    }
  }, [user, isSuperAdmin]);

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Admin access required",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAdmin, isLoading, toast]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Don't render admin page if not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage companies, users, profiles, and system settings
          </p>
        </div>
        <UserProfileMenu />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {isSuperAdmin ? (
          <>
            {/* Super Admin Tabs */}
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="companies" data-testid="tab-companies">
                <Building className="w-4 h-4 mr-2" />
                Companies
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">
                <UserCog className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="company" data-testid="tab-company-profiles">
                <Building2 className="w-4 h-4 mr-2" />
                Branding Profiles
              </TabsTrigger>
              <TabsTrigger value="agents" data-testid="tab-agent-profiles">
                <Users className="w-4 h-4 mr-2" />
                Sales Agent Teams
              </TabsTrigger>
              <TabsTrigger value="brands" data-testid="tab-brand-registry">
                <Tag className="w-4 h-4 mr-2" />
                Brand Registry
              </TabsTrigger>
            </TabsList>

            <TabsContent value="companies" className="mt-6">
              <CompaniesManager />
            </TabsContent>

            <TabsContent value="users" className="mt-6">
              <UsersManager />
            </TabsContent>

            <TabsContent value="company" className="mt-6">
              <CompanyProfilesManager />
            </TabsContent>

            <TabsContent value="agents" className="mt-6">
              <SalesAgentProfilesManager />
            </TabsContent>

            <TabsContent value="brands" className="mt-6">
              <BrandRegistryManager />
            </TabsContent>
          </>
        ) : (
          <>
            {/* Company Admin Tabs - stack on mobile */}
            <TabsList className="flex flex-col w-full md:grid md:grid-cols-3 h-auto">
              <TabsTrigger value="branding" data-testid="tab-company-branding" className="w-full justify-center">
                <Building2 className="w-4 h-4 mr-2" />
                Company Branding
              </TabsTrigger>
              <TabsTrigger value="sales-agents" data-testid="tab-company-sales-agents" className="w-full justify-center">
                <Users className="w-4 h-4 mr-2" />
                Sales Agents
              </TabsTrigger>
              <TabsTrigger value="brands" data-testid="tab-brand-registry" className="w-full justify-center">
                <Tag className="w-4 h-4 mr-2" />
                Brand Registry
              </TabsTrigger>
            </TabsList>

            <TabsContent value="branding" className="mt-6">
              <CompanyBrandingManager />
            </TabsContent>

            <TabsContent value="sales-agents" className="mt-6">
              <CompanySalesAgentsManager />
            </TabsContent>

            <TabsContent value="brands" className="mt-6">
              <BrandRegistryManager />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function CompaniesManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState<Template>("modern");
  const [defaultFieldMapping, setDefaultFieldMapping] = useState<FieldMapping>({
    product: "",
    sku: "",
    format: "",
    price: "",
    category: "",
    ribbon: "ribbon",
    notes: "",
    productImageUrl: "",
  });
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);

  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; domain: string; defaultTemplate: Template; defaultFieldMapping: FieldMapping }) => {
      const res = await apiRequest("POST", "/api/companies", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company created successfully" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create company", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; domain: string; defaultTemplate: Template; defaultFieldMapping: FieldMapping } }) => {
      const res = await apiRequest("PATCH", `/api/companies/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company updated successfully" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update company", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Company deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete company", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDomain("");
    setDefaultTemplate("modern");
    setDefaultFieldMapping({
      product: "",
      sku: "",
      format: "",
      price: "",
      category: "",
      ribbon: "ribbon",
      notes: "",
      productImageUrl: "",
    });
    setCsvHeaders([]);
  };

  const handleCSVUpload = (data: any[], headers: string[]) => {
    // Guard against empty CSV files (preserve existing mappings)
    if (!headers || headers.length === 0) {
      toast({
        title: "Invalid CSV",
        description: "CSV file has no headers. Please upload a valid file.",
        variant: "destructive",
      });
      return;
    }
    
    // Trim headers to ensure exact matching with saved field mappings
    const trimmedHeaders = headers.map(h => h.trim());
    
    // Always set CSV headers so dropdowns show available columns
    setCsvHeaders(trimmedHeaders);
    
    // If editing an existing company, preserve the current field mappings
    // Only run auto-detection for NEW companies
    if (editingId !== null) {
      toast({
        title: "CSV uploaded",
        description: "CSV headers loaded. Your existing field mappings are preserved.",
      });
      return;
    }
    
    // Auto-detect mappings from CSV headers (only for new companies)
    const optionalDefaults = getOptionalFieldDefaults(trimmedHeaders);
    const autoMapping: FieldMapping = {
      product: trimmedHeaders.find(h => {
        const lower = h.toLowerCase();
        return lower === "name" || (lower.includes("product") && !lower.includes("image"));
      }) || "",
      sku: trimmedHeaders.find(h => h.toLowerCase().includes("sku")) || "",
      format: trimmedHeaders.find(h => {
        const lower = h.toLowerCase();
        return lower.includes("additional info") || lower.includes("case") || lower.includes("format") || lower.includes("size");
      }) || "",
      price: trimmedHeaders.find(h => h.toLowerCase().includes("price")) || "",
      category: trimmedHeaders.find(h => h.toLowerCase().includes("category") || h.toLowerCase().includes("producer") || h.toLowerCase().includes("winery")) || "",
      ...optionalDefaults,
      productImageUrl: trimmedHeaders.find(h => {
        const lower = h.toLowerCase();
        return lower.includes("productimage") || lower === "productimageurl";
      }) || "",
    };
    
    // Guard against CSV files with no matching headers (only for new companies)
    if (Object.values(autoMapping).every(v => !v)) {
      toast({
        title: "No field matches found",
        description: "CSV headers don't match expected product fields. Please manually select mappings.",
        variant: "destructive",
      });
      // Still set headers so user can manually map
      return;
    }
    
    setDefaultFieldMapping(autoMapping);
    
    toast({
      title: "CSV uploaded",
      description: "Field mappings auto-detected from CSV headers",
    });
  };

  const handleEdit = (company: Company) => {
    setEditingId(company.id);
    setName(company.name);
    setDomain(company.domain);
    setDefaultTemplate(company.defaultTemplate as Template);
    
    // Reset CSV headers when starting edit (prevents stale headers from interfering)
    setCsvHeaders([]);
    
    // Normalize field mapping to ensure all keys exist (prevents undefined in controlled inputs)
    const normalized: FieldMapping = {
      product: (company.defaultFieldMapping as any)?.product || "",
      sku: (company.defaultFieldMapping as any)?.sku || "",
      format: (company.defaultFieldMapping as any)?.format || "",
      price: (company.defaultFieldMapping as any)?.price || "",
      category: (company.defaultFieldMapping as any)?.category || "",
      ribbon: (company.defaultFieldMapping as any)?.ribbon || "",
      notes: (company.defaultFieldMapping as any)?.notes || "",
      productImageUrl: (company.defaultFieldMapping as any)?.productImageUrl || "",
    };
    setDefaultFieldMapping(normalized);
  };

  const handleSave = () => {
    if (!name.trim() || !domain.trim()) {
      toast({
        title: "Validation error",
        description: "Company name and domain are required",
        variant: "destructive",
      });
      return;
    }

    // Validate domain format (simple email domain validation)
    const domainRegex = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain.trim())) {
      toast({
        title: "Validation error",
        description: "Please enter a valid domain (e.g., example.com)",
        variant: "destructive",
      });
      return;
    }

    // Always send full FieldMapping with empty strings for unmapped fields
    // This keeps the UI stable and lets client auto-detection handle empty values
    const cleanedFieldMapping: FieldMapping = {
      product: defaultFieldMapping.product?.trim() || "",
      sku: defaultFieldMapping.sku?.trim() || "",
      format: defaultFieldMapping.format?.trim() || "",
      price: defaultFieldMapping.price?.trim() || "",
      category: defaultFieldMapping.category?.trim() || "",
      ribbon: defaultFieldMapping.ribbon?.trim() || "",
      notes: defaultFieldMapping.notes?.trim() || "",
      productImageUrl: defaultFieldMapping.productImageUrl?.trim() || "",
    };

    const data = {
      name: name.trim(),
      domain: domain.trim().toLowerCase(),
      defaultTemplate,
      defaultFieldMapping: cleanedFieldMapping,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit" : "Create"} Company</CardTitle>
          <CardDescription>
            Manage multi-tenant companies. Users will be auto-assigned based on email domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              data-testid="input-company-name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Email Domain</Label>
            <Input
              id="domain"
              data-testid="input-domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Users with this email domain will be auto-assigned to this company
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Default Template</Label>
            <Select value={defaultTemplate} onValueChange={(val) => setDefaultTemplate(val as Template)}>
              <SelectTrigger id="template" data-testid="select-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modern">Modern</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 border-t">
            <h4 className="text-sm font-semibold mb-3">Default Field Mapping</h4>
            <p className="text-xs text-muted-foreground mb-4">
              Upload a sample CSV to auto-detect field mappings, or manually enter column names
            </p>
            
            {/* CSV Upload Section */}
            <div className="mb-6">
              <CSVUpload onUpload={handleCSVUpload} />
            </div>

            {csvHeaders.length > 0 && (
              <Alert className="mb-4">
                <AlertDescription>
                  <strong>CSV Headers Detected:</strong> {csvHeaders.join(", ")}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="field-product">Product Column</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.product || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, product: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-product" data-testid="select-field-product">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-product"
                    data-testid="input-field-product"
                    placeholder="e.g., name, product"
                    value={defaultFieldMapping.product}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, product: e.target.value })}
                  />
                )}
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="field-sku">SKU Column</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.sku || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, sku: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-sku" data-testid="select-field-sku">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-sku"
                    data-testid="input-field-sku"
                    placeholder="e.g., sku, id"
                    value={defaultFieldMapping.sku}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, sku: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="field-format">Format Column</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.format || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, format: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-format" data-testid="select-field-format">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-format"
                    data-testid="input-field-format"
                    placeholder="e.g., size, format"
                    value={defaultFieldMapping.format}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, format: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="field-price">Price Column</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.price || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, price: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-price" data-testid="select-field-price">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-price"
                    data-testid="input-field-price"
                    placeholder="e.g., price, cost"
                    value={defaultFieldMapping.price}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, price: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="field-category">Category Column (Optional)</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.category || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, category: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-category" data-testid="select-field-category">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-category"
                    data-testid="input-field-category"
                    placeholder="e.g., category, type"
                    value={defaultFieldMapping.category || ""}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, category: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="field-notes">Notes Column (Optional)</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.notes || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, notes: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-notes" data-testid="select-field-notes">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-notes"
                    data-testid="input-field-notes"
                    placeholder="e.g., notes, description"
                    value={defaultFieldMapping.notes || ""}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, notes: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1 col-span-2">
                <Label htmlFor="field-image">Product Image URL Column (Optional)</Label>
                {csvHeaders.length > 0 ? (
                  <Select 
                    value={defaultFieldMapping.productImageUrl || "__none__"} 
                    onValueChange={(val) => setDefaultFieldMapping({ ...defaultFieldMapping, productImageUrl: val === "__none__" ? "" : val })}
                  >
                    <SelectTrigger id="field-image" data-testid="select-field-image-url">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {csvHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="field-image"
                    data-testid="input-field-image-url"
                    placeholder="e.g., productImageUrl, image"
                    value={defaultFieldMapping.productImageUrl || ""}
                    onChange={(e) => setDefaultFieldMapping({ ...defaultFieldMapping, productImageUrl: e.target.value })}
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          {editingId && (
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-company-edit">
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending}
            className={!editingId ? "ml-auto" : ""}
            data-testid="button-save-company"
          >
            {(createMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {editingId ? "Update Company" : "Create Company"}
          </Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Companies</h3>
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </CardContent>
          </Card>
        ) : !companies || companies.length === 0 ? (
          <Alert>
            <AlertDescription>No companies yet. Create one above.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {companies.map((company) => (
              <Card key={company.id} data-testid={`company-card-${company.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{company.name}</CardTitle>
                  <CardDescription>@{company.domain}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Template: <span className="font-medium capitalize">{company.defaultTemplate}</span>
                  </p>
                  {company.defaultFieldMapping && (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      <p className="font-medium mb-1">Field Mapping Defaults:</p>
                      <div className="grid grid-cols-2 gap-x-2">
                        {(company.defaultFieldMapping as FieldMapping).product && (
                          <p>Product: {(company.defaultFieldMapping as FieldMapping).product}</p>
                        )}
                        {(company.defaultFieldMapping as FieldMapping).sku && (
                          <p>SKU: {(company.defaultFieldMapping as FieldMapping).sku}</p>
                        )}
                        {(company.defaultFieldMapping as FieldMapping).price && (
                          <p>Price: {(company.defaultFieldMapping as FieldMapping).price}</p>
                        )}
                        {(company.defaultFieldMapping as FieldMapping).format && (
                          <p>Format: {(company.defaultFieldMapping as FieldMapping).format}</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(company)}
                    data-testid={`button-edit-company-${company.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(company.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-company-${company.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UsersManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"admin" | "client">("client");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [settingPasswordForUser, setSettingPasswordForUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/password`, { password });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Password set successfully" });
      setSettingPasswordForUser(null);
      setNewPassword("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to set password", 
        variant: "destructive" 
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; role: "admin" | "client"; companyId: number | null }) => {
      const res = await apiRequest("POST", "/api/users", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create user", 
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User updated successfully" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setShowCreateForm(false);
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole("client");
    setCompanyId(null);
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setEmail(user.email);
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setRole(user.role as "admin" | "client");
    setCompanyId(user.companyId);
  };

  const handleCreate = () => {
    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      toast({
        title: "Validation error",
        description: "Email, first name, and last name are required",
        variant: "destructive",
      });
      return;
    }

    // Validate email domain matches company if company is selected
    if (companyId && companies) {
      const company = companies.find((c) => c.id === companyId);
      if (company) {
        const emailDomain = email.split('@')[1]?.toLowerCase();
        if (emailDomain !== company.domain.toLowerCase()) {
          toast({
            title: "Validation error",
            description: `Email domain must match company domain: @${company.domain}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    createMutation.mutate({
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      companyId,
    });
  };

  const handleSave = () => {
    if (!editingId) return;

    if (!email.trim()) {
      toast({
        title: "Validation error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }

    // CRITICAL: Must send companyId: null explicitly to clear assignment (not undefined)
    const data = {
      email: email.trim(),
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      role,
      companyId,  // Keeps null value, allowing backend to clear the assignment
    };

    updateMutation.mutate({ id: editingId, data });
  };

  const getCompanyName = (companyId: number | null) => {
    if (!companyId || !companies) return "None";
    const company = companies.find((c) => c.id === companyId);
    return company ? company.name : "Unknown";
  };

  return (
    <div className="space-y-6">
      {!editingId && !showCreateForm && (
        <div className="flex justify-end">
          <Button onClick={() => setShowCreateForm(true)} data-testid="button-show-create-user">
            <Plus className="w-4 h-4 mr-2" />
            Create User
          </Button>
        </div>
      )}

      {showCreateForm && !editingId && (
        <Card>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
            <CardDescription>
              Create a new user account with domain validation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                data-testid="input-create-email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="create-first-name">First Name</Label>
                <Input
                  id="create-first-name"
                  data-testid="input-create-first-name"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-last-name">Last Name</Label>
                <Input
                  id="create-last-name"
                  data-testid="input-create-last-name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-role">Role</Label>
              <Select value={role} onValueChange={(val) => setRole(val as "admin" | "client")}>
                <SelectTrigger id="create-role" data-testid="select-create-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-company">Company</Label>
              <Select 
                value={companyId?.toString() || "none"} 
                onValueChange={(val) => setCompanyId(val === "none" ? null : parseInt(val))}
                disabled={companiesLoading}
              >
                <SelectTrigger id="create-company" data-testid="select-create-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name} (@{company.domain})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Email domain must match company domain for validation
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-create-user">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-create-user"
            >
              {createMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Create User
            </Button>
          </CardFooter>
        </Card>
      )}

      {editingId && (
        <Card>
          <CardHeader>
            <CardTitle>Edit User</CardTitle>
            <CardDescription>
              Update user profile, role, and company assignment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                data-testid="input-edit-email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-first-name">First Name</Label>
                <Input
                  id="edit-first-name"
                  data-testid="input-edit-first-name"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-last-name">Last Name</Label>
                <Input
                  id="edit-last-name"
                  data-testid="input-edit-last-name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(val) => setRole(val as "admin" | "client")}>
                <SelectTrigger id="role" data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-company">Company</Label>
              <Select 
                value={companyId?.toString() || "none"} 
                onValueChange={(val) => setCompanyId(val === "none" ? null : parseInt(val))}
                disabled={companiesLoading}
              >
                <SelectTrigger id="user-company" data-testid="select-user-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-user-edit">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-user"
            >
              {updateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Update User
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Users</h3>
        {usersLoading ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </CardContent>
          </Card>
        ) : !users || users.length === 0 ? (
          <Alert>
            <AlertDescription>No users yet. Users will appear here after first login.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id} data-testid={`user-card-${user.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {user.firstName} {user.lastName}
                      </CardTitle>
                      <CardDescription>{user.email}</CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium capitalize">{user.role}</p>
                      <p className="text-xs text-muted-foreground">{getCompanyName(user.companyId)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(user)}
                    data-testid={`button-edit-user-${user.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSettingPasswordForUser(user)}
                    data-testid={`button-set-password-${user.id}`}
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Set Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(user.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-user-${user.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!settingPasswordForUser} onOpenChange={(open) => {
        if (!open) {
          setSettingPasswordForUser(null);
          setNewPassword("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>
              Set a password for {settingPasswordForUser?.firstName} {settingPasswordForUser?.lastName} ({settingPasswordForUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                data-testid="input-new-password"
                placeholder="Enter new password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setSettingPasswordForUser(null);
                setNewPassword("");
              }}
              data-testid="button-cancel-password"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (settingPasswordForUser && newPassword.length >= 8) {
                  setPasswordMutation.mutate({ 
                    userId: settingPasswordForUser.id, 
                    password: newPassword 
                  });
                } else if (newPassword.length < 8) {
                  toast({
                    title: "Validation error",
                    description: "Password must be at least 8 characters",
                    variant: "destructive",
                  });
                }
              }}
              disabled={setPasswordMutation.isPending || newPassword.length < 8}
              data-testid="button-save-password"
            >
              {setPasswordMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompanyProfilesManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNameShort, setCompanyNameShort] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const { data: profiles, isLoading } = useQuery<CompanyProfile[]>({
    queryKey: ["/api/company-profiles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; branding: CompanyBranding }) => {
      return await apiRequest("POST", "/api/company-profiles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-profiles"] });
      toast({ title: "Company profile created" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create profile", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest("PATCH", `/api/company-profiles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-profiles"] });
      toast({ title: "Company profile updated" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/company-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-profiles"] });
      toast({ title: "Company profile deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete profile", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setProfileName("");
    setCompanyName("");
    setCompanyNameShort("");
    setTagline("");
    setLogoUrl("");
  };

  const handleEdit = (profile: CompanyProfile) => {
    setEditingId(profile.id);
    setProfileName(profile.name);
    setCompanyName(profile.branding.companyName);
    setCompanyNameShort(profile.branding.companyNameShort || "");
    setTagline(profile.branding.tagline || "");
    setLogoUrl(profile.branding.logoUrl || "");
  };

  const handleSave = () => {
    if (!profileName.trim() || !companyName.trim()) {
      toast({
        title: "Validation error",
        description: "Profile name and company name are required",
        variant: "destructive",
      });
      return;
    }

    const data = {
      name: profileName.trim(),
      branding: {
        companyName: companyName.trim(),
        companyNameShort: companyNameShort.trim() || undefined,
        tagline: tagline.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      },
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setLogoUrl(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit" : "Create"} Company Profile</CardTitle>
          <CardDescription>
            Create reusable company branding profiles for your pricelists
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Profile Name</Label>
            <Input
              id="profile-name"
              data-testid="input-profile-name"
              placeholder="e.g., Primary Company, Brand A"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              data-testid="input-company-name"
              placeholder="Your Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-name-short">Company Name Short Form (Optional)</Label>
            <Input
              id="company-name-short"
              data-testid="input-company-name-short"
              placeholder="Short name for filenames (e.g., SWS)"
              value={companyNameShort}
              onChange={(e) => setCompanyNameShort(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline (Optional)</Label>
            <Input
              id="tagline"
              data-testid="input-tagline"
              placeholder="Your company tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Logo (Optional)</Label>
            <Input
              id="logo"
              type="file"
              accept="image/*"
              data-testid="input-logo"
              onChange={handleLogoUpload}
            />
            {logoUrl && (
              <div className="mt-2">
                <img src={logoUrl} alt="Logo preview" className="h-16 object-contain" />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          {editingId && (
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-edit">
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending}
            className={!editingId ? "ml-auto" : ""}
            data-testid="button-save-profile"
          >
            {(createMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {editingId ? "Update Profile" : "Create Profile"}
          </Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Saved Profiles</h3>
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </CardContent>
          </Card>
        ) : !profiles || profiles.length === 0 ? (
          <Alert>
            <AlertDescription>No company profiles yet. Create one above.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((profile) => (
              <Card key={profile.id} data-testid={`profile-card-${profile.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{profile.name}</CardTitle>
                  <CardDescription>{profile.branding.companyName}</CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.branding.tagline && (
                    <p className="text-sm text-muted-foreground">{profile.branding.tagline}</p>
                  )}
                  {profile.branding.logoUrl && (
                    <img
                      src={profile.branding.logoUrl}
                      alt="Company logo"
                      className="mt-2 h-12 object-contain"
                    />
                  )}
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(profile)}
                    data-testid={`button-edit-${profile.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(profile.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${profile.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SalesAgentProfilesManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [agents, setAgents] = useState<SalesAgent[]>([
    { name: "", email: "", phone: "", region: "" },
  ]);

  const { data: profiles, isLoading } = useQuery<SalesAgentProfile[]>({
    queryKey: ["/api/sales-agent-profiles"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; agents: SalesAgent[] }) => {
      return await apiRequest("POST", "/api/sales-agent-profiles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-agent-profiles"] });
      toast({ title: "Sales agent profile created" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create profile", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest("PATCH", `/api/sales-agent-profiles/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-agent-profiles"] });
      toast({ title: "Sales agent profile updated" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/sales-agent-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-agent-profiles"] });
      toast({ title: "Sales agent profile deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete profile", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setProfileName("");
    setAgents([{ name: "", email: "", phone: "", region: "" }]);
  };

  const handleEdit = (profile: SalesAgentProfile) => {
    setEditingId(profile.id);
    setProfileName(profile.name);
    setAgents(profile.agents);
  };

  const handleSave = () => {
    const validAgents = agents.filter(
      (agent) => agent.name.trim() && agent.email.trim() && agent.phone.trim()
    );

    if (!profileName.trim() || validAgents.length === 0) {
      toast({
        title: "Validation error",
        description: "Profile name and at least one complete agent are required",
        variant: "destructive",
      });
      return;
    }

    if (validAgents.length > 2) {
      toast({
        title: "Validation error",
        description: "Maximum 2 sales agents per profile",
        variant: "destructive",
      });
      return;
    }

    const data = {
      name: profileName.trim(),
      agents: validAgents.map((agent) => ({
        name: agent.name.trim(),
        email: agent.email.trim(),
        phone: agent.phone.trim(),
        region: agent.region?.trim() || undefined,
      })),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const updateAgent = (index: number, field: keyof SalesAgent, value: string) => {
    const newAgents = [...agents];
    newAgents[index] = { ...newAgents[index], [field]: value };
    setAgents(newAgents);
  };

  const addAgent = () => {
    if (agents.length < 2) {
      setAgents([...agents, { name: "", email: "", phone: "", region: "" }]);
    }
  };

  const removeAgent = (index: number) => {
    if (agents.length > 1) {
      setAgents(agents.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit" : "Create"} Sales Agent Profile</CardTitle>
          <CardDescription>
            Create reusable sales agent team configurations (max 2 agents per profile)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-profile-name">Profile Name</Label>
            <Input
              id="agent-profile-name"
              data-testid="input-agent-profile-name"
              placeholder="e.g., West Coast Team, East Coast Team"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>

          {agents.map((agent, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Agent {index + 1}</h4>
                  {agents.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeAgent(index)}
                      data-testid={`button-remove-agent-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      data-testid={`input-agent-name-${index}`}
                      placeholder="Agent Name"
                      value={agent.name}
                      onChange={(e) => updateAgent(index, "name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input
                      data-testid={`input-agent-email-${index}`}
                      type="email"
                      placeholder="agent@example.com"
                      value={agent.email}
                      onChange={(e) => updateAgent(index, "email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone</Label>
                    <Input
                      data-testid={`input-agent-phone-${index}`}
                      placeholder="(555) 123-4567"
                      value={agent.phone}
                      onChange={(e) => updateAgent(index, "phone", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Region (Optional)</Label>
                    <Input
                      data-testid={`input-agent-region-${index}`}
                      placeholder="e.g., South Vancouver Island"
                      value={agent.region || ""}
                      onChange={(e) => updateAgent(index, "region", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </Card>
          ))}

          {agents.length < 2 && (
            <Button
              variant="outline"
              onClick={addAgent}
              className="w-full"
              data-testid="button-add-agent"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another Agent
            </Button>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {editingId && (
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-agent-edit">
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || updateMutation.isPending}
            className={!editingId ? "ml-auto" : ""}
            data-testid="button-save-agent-profile"
          >
            {(createMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            {editingId ? "Update Profile" : "Create Profile"}
          </Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Saved Profiles</h3>
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin" />
            </CardContent>
          </Card>
        ) : !profiles || profiles.length === 0 ? (
          <Alert>
            <AlertDescription>No sales agent profiles yet. Create one above.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((profile) => (
              <Card key={profile.id} data-testid={`agent-profile-card-${profile.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{profile.name}</CardTitle>
                  <CardDescription>{profile.agents.length} agent(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {profile.agents.map((agent, idx) => (
                    <div key={idx} className="text-sm border-l-2 border-primary pl-3 py-1">
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-muted-foreground">{agent.email}</p>
                      <p className="text-muted-foreground">{agent.phone}</p>
                      {agent.region && (
                        <p className="text-muted-foreground text-xs">{agent.region}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(profile)}
                    data-testid={`button-edit-agent-${profile.id}`}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(profile.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-agent-${profile.id}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Company Branding Manager (for Company Admins)
function CompanyBrandingManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [branding, setBranding] = useState<CompanyBranding>({
    companyName: "",
    tagline: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logoUrl: "",
    footerText: "",
  });

  // Fetch company data
  const { data: company, isLoading } = useQuery<Company>({
    queryKey: ['/api/companies', user?.companyId],
    enabled: !!user?.companyId,
  });

  // Load branding when company data is fetched
  useEffect(() => {
    if (company?.defaultBranding) {
      setBranding(company.defaultBranding as CompanyBranding);
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (data: { defaultBranding: CompanyBranding }) => {
      return await apiRequest("PATCH", `/api/companies/${user?.companyId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', user?.companyId] });
      toast({ title: "Company branding updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update branding", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!user?.companyId) {
      toast({ title: "Error", description: "Company not found", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ defaultBranding: branding });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Branding</CardTitle>
          <CardDescription>
            Configure your company's default branding for pricelists
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={branding.companyName}
                onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                placeholder="Your Company Name"
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyNameShort">Company Name Short Form</Label>
              <Input
                id="companyNameShort"
                value={branding.companyNameShort || ""}
                onChange={(e) => setBranding({ ...branding, companyNameShort: e.target.value })}
                placeholder="Short name for filenames (e.g., SWS)"
                data-testid="input-company-name-short"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={branding.tagline}
                onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
                placeholder="Your company tagline"
                data-testid="input-tagline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={branding.email}
                onChange={(e) => setBranding({ ...branding, email: e.target.value })}
                placeholder="contact@company.com"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={branding.phone}
                onChange={(e) => setBranding({ ...branding, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                data-testid="input-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={branding.website}
                onChange={(e) => setBranding({ ...branding, website: e.target.value })}
                placeholder="www.company.com"
                data-testid="input-website"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                value={branding.logoUrl}
                onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                placeholder="https://..."
                data-testid="input-logo-url"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={branding.address}
                onChange={(e) => setBranding({ ...branding, address: e.target.value })}
                placeholder="123 Main St, City, State 12345"
                data-testid="input-address"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="footerText">Footer Text</Label>
              <Input
                id="footerText"
                value={branding.footerText}
                onChange={(e) => setBranding({ ...branding, footerText: e.target.value })}
                placeholder="Thank you for your business!"
                data-testid="input-footer-text"
              />
            </div>
            <ColorPicker
              label="Header & Logo Background Color"
              color={branding.headerBackgroundColor}
              onChange={(color) => setBranding({ ...branding, headerBackgroundColor: color })}
              onExtractFromLogo={async () => {
                if (branding.logoUrl) {
                  try {
                    const { backgroundColor } = await getPaletteFromLogo(branding.logoUrl);
                    setBranding({ ...branding, headerBackgroundColor: backgroundColor });
                  } catch (error) {
                    console.error('Failed to extract color from logo:', error);
                    toast({ title: "Error", description: "Failed to extract color from logo", variant: "destructive" });
                  }
                }
              }}
              showExtractButton={!!branding.logoUrl}
              testId="picker-header-bg"
            />
            <ColorPicker
              label="Header Text Color"
              color={branding.headerTextColor}
              onChange={(color) => setBranding({ ...branding, headerTextColor: color })}
              onExtractFromLogo={async () => {
                if (branding.logoUrl) {
                  try {
                    const { textColor } = await getPaletteFromLogo(branding.logoUrl);
                    setBranding({ ...branding, headerTextColor: textColor });
                  } catch (error) {
                    console.error('Failed to extract color from logo:', error);
                    toast({ title: "Error", description: "Failed to extract color from logo", variant: "destructive" });
                  }
                }
              }}
              showExtractButton={!!branding.logoUrl}
              testId="picker-header-text"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Colors are automatically extracted from your logo, or you can customize them using the color pickers above.
          </p>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            data-testid="button-save-branding"
          >
            {updateMutation.isPending ? "Saving..." : "Save Branding"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Company Sales Agents Manager (for Company Admins)
function CompanySalesAgentsManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [agents, setAgents] = useState<SalesAgent[]>([
    { name: "", email: "", phone: "", region: "" },
  ]);

  // Fetch company data
  const { data: company, isLoading } = useQuery<Company>({
    queryKey: ['/api/companies', user?.companyId],
    enabled: !!user?.companyId,
  });

  // Load agents when company data is fetched
  useEffect(() => {
    if (company?.defaultSalesAgents && company.defaultSalesAgents.length > 0) {
      setAgents(company.defaultSalesAgents as SalesAgent[]);
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (data: { defaultSalesAgents: SalesAgent[] }) => {
      return await apiRequest("PATCH", `/api/companies/${user?.companyId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/companies', user?.companyId] });
      toast({ title: "Sales agents updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update sales agents", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!user?.companyId) {
      toast({ title: "Error", description: "Company not found", variant: "destructive" });
      return;
    }
    
    // Filter out empty agents
    const validAgents = agents.filter(a => a.name.trim() !== "" || a.email.trim() !== "");
    updateMutation.mutate({ defaultSalesAgents: validAgents });
  };

  const addAgent = () => {
    if (agents.length < 2) {
      setAgents([...agents, { name: "", email: "", phone: "", region: "" }]);
    }
  };

  const removeAgent = (index: number) => {
    setAgents(agents.filter((_, i) => i !== index));
  };

  const updateAgent = (index: number, field: keyof SalesAgent, value: string) => {
    const newAgents = [...agents];
    newAgents[index] = { ...newAgents[index], [field]: value };
    setAgents(newAgents);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sales Agents</CardTitle>
          <CardDescription>
            Configure your company's sales agents (maximum 2)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {agents.map((agent, index) => (
            <div key={index} className="space-y-4 p-4 border rounded-lg" data-testid={`agent-form-${index}`}>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Agent {index + 1}</h4>
                {agents.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAgent(index)}
                    data-testid={`button-remove-agent-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`name-${index}`}>Name</Label>
                  <Input
                    id={`name-${index}`}
                    value={agent.name}
                    onChange={(e) => updateAgent(index, 'name', e.target.value)}
                    placeholder="John Doe"
                    data-testid={`input-agent-name-${index}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`email-${index}`}>Email</Label>
                  <Input
                    id={`email-${index}`}
                    type="email"
                    value={agent.email}
                    onChange={(e) => updateAgent(index, 'email', e.target.value)}
                    placeholder="john@company.com"
                    data-testid={`input-agent-email-${index}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`phone-${index}`}>Phone</Label>
                  <Input
                    id={`phone-${index}`}
                    value={agent.phone}
                    onChange={(e) => updateAgent(index, 'phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    data-testid={`input-agent-phone-${index}`}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`region-${index}`}>Region</Label>
                  <Input
                    id={`region-${index}`}
                    value={agent.region}
                    onChange={(e) => updateAgent(index, 'region', e.target.value)}
                    placeholder="North America"
                    data-testid={`input-agent-region-${index}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
        <CardFooter className="flex gap-2">
          {agents.length < 2 && (
            <Button 
              variant="outline" 
              onClick={addAgent}
              data-testid="button-add-agent"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Agent
            </Button>
          )}
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            data-testid="button-save-agents"
          >
            {updateMutation.isPending ? "Saving..." : "Save Agents"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function BrandRegistryManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superAdmin";
  
  const [editingBrand, setEditingBrand] = useState<BrandRegistry | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState<BrandCategory>("wine");
  const [type, setType] = useState("");
  const [displayOrder, setDisplayOrder] = useState<number | undefined>(undefined);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedPricelistId, setSelectedPricelistId] = useState<number | null>(null);
  
  // Product editing state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductType, setEditingProductType] = useState<string>("");
  const [draggedProductSku, setDraggedProductSku] = useState<string | null>(null);
  const [draggedOverProductSku, setDraggedOverProductSku] = useState<string | null>(null);
  
  // Wix integration state
  const [wixAppId, setWixAppId] = useState("");
  const [wixInstallToken, setWixInstallToken] = useState("");
  const [isConnectingWix, setIsConnectingWix] = useState(false);
  const [isSyncingWix, setIsSyncingWix] = useState(false);

  // Debug logging
  console.log('[BrandRegistry] Render state:', { 
    isSuperAdmin, 
    selectedCompanyId, 
    isAddDialogOpen,
    hasUser: !!user 
  });

  // Fetch all companies (for Super Admins)
  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: isSuperAdmin,
  });

  // Auto-select first company for Super Admins
  useEffect(() => {
    if (isSuperAdmin && companies && companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, isSuperAdmin, selectedCompanyId]);

  // Fetch pricelists for the selected company (for pricelist selector)
  const { data: companyPricelists } = useQuery<Pricelist[]>({
    queryKey: isSuperAdmin 
      ? ["/api/pricelists/company", { companyId: selectedCompanyId }] 
      : ["/api/pricelists/company"],
    queryFn: async () => {
      // Use the /api/pricelists endpoint which already filters by company for non-superadmins
      const url = isSuperAdmin && selectedCompanyId
        ? `/api/pricelists?companyId=${selectedCompanyId}`
        : "/api/pricelists";
      const res = await apiRequest("GET", url);
      const allPricelists = await res.json();
      // Filter to only this company's pricelists for super admin
      if (isSuperAdmin && selectedCompanyId) {
        return allPricelists.filter((p: Pricelist) => p.companyId === selectedCompanyId);
      }
      return allPricelists;
    },
    enabled: isSuperAdmin ? !!selectedCompanyId : true,
    staleTime: 0, // Always fetch fresh data to show latest pricelists
  });

  // Reset selected pricelist when company changes
  useEffect(() => {
    setSelectedPricelistId(null);
  }, [selectedCompanyId]);

  // Auto-select latest pricelist when pricelists load
  useEffect(() => {
    if (companyPricelists && companyPricelists.length > 0 && !selectedPricelistId) {
      setSelectedPricelistId(companyPricelists[0].id);
    }
  }, [companyPricelists, selectedPricelistId]);

  // Fetch brands for selected company (Super Admin) or current company (Company Admin)
  const { data: brands, isLoading, error } = useQuery<BrandRegistry[]>({
    queryKey: isSuperAdmin ? ["/api/brands", { companyId: selectedCompanyId }] : ["/api/brands"],
    queryFn: async () => {
      try {
        const url = isSuperAdmin && selectedCompanyId
          ? `/api/brands?companyId=${selectedCompanyId}`
          : "/api/brands";
        console.log('[BrandRegistry] Fetching brands from URL:', url);
        console.log('[BrandRegistry] Query params:', { isSuperAdmin, selectedCompanyId });
        const res = await fetch(url, { credentials: "include" });
        console.log('[BrandRegistry] Response status:', res.status, res.statusText);
        if (!res.ok) {
          const errorText = await res.text();
          console.error('[BrandRegistry] Fetch failed:', res.status, res.statusText, errorText);
          throw new Error(`Failed to fetch brands: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        console.log('[BrandRegistry] Brands fetched successfully:', data.length, 'brands');
        console.log('[BrandRegistry] Brand names:', data.map((b: any) => b.brandName));
        return data;
      } catch (err) {
        console.error('[BrandRegistry] Query error:', err);
        throw err;
      }
    },
    enabled: isSuperAdmin ? !!selectedCompanyId : true,
  });

  // Log error state
  if (error) {
    console.error('[BrandRegistry] Query error state:', error);
  }

  // Fetch products grouped by brand from selected pricelist (or latest if none selected)
  const { data: productsData } = useQuery<{
    productsByBrand: Record<string, any[]>;
    pricelistMeta: {
      id: number;
      name: string;
      updatedAt: string;
      totalProducts: number;
      productsWithoutBrand: number;
    } | null;
  }>({
    queryKey: isSuperAdmin 
      ? ["/api/brands/products", { companyId: selectedCompanyId, pricelistId: selectedPricelistId }] 
      : ["/api/brands/products", { pricelistId: selectedPricelistId }],
    queryFn: async () => {
      let url = isSuperAdmin && selectedCompanyId
        ? `/api/brands/products?companyId=${selectedCompanyId}`
        : "/api/brands/products";
      // Add pricelistId if selected
      if (selectedPricelistId) {
        url += url.includes('?') ? `&pricelistId=${selectedPricelistId}` : `?pricelistId=${selectedPricelistId}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    enabled: isSuperAdmin ? !!selectedCompanyId : true,
  });
  
  // Extract productsByBrand and pricelistMeta from the response
  const productsByBrand = productsData?.productsByBrand;
  const pricelistMeta = productsData?.pricelistMeta;

  // Fetch unassigned products (SKUs not mapped to any brand)
  const { data: unassignedData } = useQuery<{
    unassignedProducts: Array<{
      sku: string;
      product: string;
      collectionBrand?: string;
      collectionCategory?: string;
    }>;
    totalProducts: number;
    unassignedCount: number;
    registryHasSKUs: boolean;
    brands: Array<{
      id: number;
      brandName: string;
      category: string;
    }>;
  }>({
    queryKey: isSuperAdmin 
      ? ["/api/brands/unassigned", { companyId: selectedCompanyId, pricelistId: selectedPricelistId }] 
      : ["/api/brands/unassigned", { pricelistId: selectedPricelistId }],
    queryFn: async () => {
      let url = isSuperAdmin && selectedCompanyId
        ? `/api/brands/unassigned?companyId=${selectedCompanyId}`
        : "/api/brands/unassigned";
      // Add pricelistId if selected
      if (selectedPricelistId) {
        url += url.includes('?') ? `&pricelistId=${selectedPricelistId}` : `?pricelistId=${selectedPricelistId}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unassigned products");
      return res.json();
    },
    enabled: isSuperAdmin ? !!selectedCompanyId : true,
  });
  
  // Fetch Wix integration status
  interface WixIntegration {
    id: number;
    companyId: number;
    provider: string;
    status: string;
    lastSyncAt?: string;
    lastSyncStatus?: string;
    lastSyncError?: string;
    lastSyncProductCount?: number;
  }
  const { data: integrations, refetch: refetchIntegrations } = useQuery<WixIntegration[]>({
    queryKey: isSuperAdmin 
      ? ["/api/integrations", { companyId: selectedCompanyId }] 
      : ["/api/integrations"],
    queryFn: async () => {
      const url = isSuperAdmin && selectedCompanyId
        ? `/api/integrations?companyId=${selectedCompanyId}`
        : "/api/integrations";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch integrations");
      return res.json();
    },
    enabled: isSuperAdmin ? !!selectedCompanyId : true,
  });
  
  const wixIntegration = integrations?.find(i => i.provider === "wix");
  
  // State for assigning products to brands (from unassigned section)
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [assignToBrandId, setAssignToBrandId] = useState<number | null>(null);
  
  // State for reassigning products from within brands
  const [brandSelectedSkus, setBrandSelectedSkus] = useState<Map<string, Set<string>>>(new Map());
  const [reassignToBrandId, setReassignToBrandId] = useState<number | null>(null);
  
  // Debug logging for Brand Registry products
  console.log('[BrandRegistry] productsByBrand:', productsByBrand);
  console.log('[BrandRegistry] productsByBrand keys:', productsByBrand ? Object.keys(productsByBrand) : 'N/A');
  console.log('[BrandRegistry] pricelistMeta:', pricelistMeta);
  console.log('[BrandRegistry] brands:', brands);
  console.log('[BrandRegistry] brands names:', brands?.map(b => b.brandName));

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: { brandName: string; category: BrandCategory; type?: string; displayOrder?: number }) => {
      const payload = isSuperAdmin && selectedCompanyId
        ? { ...data, companyId: selectedCompanyId }
        : data;
      const res = await apiRequest("POST", "/api/brands", payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Brand added successfully" });
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to add brand", 
        variant: "destructive" 
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; brandName?: string; category?: BrandCategory; type?: string | null; displayOrder?: number | null }) => {
      const { id, ...updates } = data;
      const res = await apiRequest("PATCH", `/api/brands/${id}`, updates);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Brand updated successfully" });
      setEditingBrand(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update brand", 
        variant: "destructive" 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/brands/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Brand deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete brand", 
        variant: "destructive" 
      });
    },
  });

  // Update product mutation (for type editing)
  const updateProductMutation = useMutation({
    mutationFn: async (data: { productId: string; updates: any; companyId?: number }) => {
      const payload = isSuperAdmin && selectedCompanyId
        ? { productId: data.productId, updates: data.updates, companyId: selectedCompanyId }
        : { productId: data.productId, updates: data.updates };
      const res = await apiRequest("PATCH", "/api/brands/products", payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      toast({ title: "Product updated successfully" });
      setEditingProductId(null);
      setEditingProductType("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update product", 
        variant: "destructive" 
      });
    },
  });

  // Toggle product visibility mutation
  const toggleVisibilityMutation = useMutation({
    mutationFn: async (data: { productSku: string; isHidden: boolean }) => {
      const payload = isSuperAdmin && selectedCompanyId
        ? { productSku: data.productSku, updates: { isHidden: data.isHidden }, companyId: selectedCompanyId }
        : { productSku: data.productSku, updates: { isHidden: data.isHidden } };
      const res = await apiRequest("PATCH", "/api/brands/products", payload);
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      // Also invalidate hidden-SKUs cache so CSV uploads use fresh visibility data
      queryClient.invalidateQueries({ queryKey: ["/api/visibility/hidden-skus"] });
      toast({ 
        title: variables.isHidden ? "Product hidden" : "Product visible",
        description: variables.isHidden 
          ? "Product will be excluded from pricelists" 
          : "Product will be included in pricelists"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to toggle product visibility", 
        variant: "destructive" 
      });
    },
  });

  // Regenerate sortKeys mutation
  const regenerateSortKeysMutation = useMutation({
    mutationFn: async () => {
      const payload = isSuperAdmin && selectedCompanyId
        ? { companyId: selectedCompanyId }
        : {};
      const res = await apiRequest("POST", "/api/brands/products/regenerate-sortkeys", payload);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      toast({ 
        title: "Sort order updated!", 
        description: data.message || "Product sort keys regenerated successfully" 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to regenerate sort keys", 
        variant: "destructive" 
      });
    },
  });

  const repairBrandOrderMutation = useMutation({
    mutationFn: async ({ brandId }: { brandId: number; brandName: string }) => {
      const res = await apiRequest("POST", `/api/brands/${brandId}/repair-order`, {});
      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      const conflictNote = data.removedMemberships?.length
        ? ` Resolved ${data.removedMemberships.length} conflicting SKU assignment.`
        : "";
      toast({
        title: "Product order repaired",
        description: `${variables.brandName} now follows the latest pricelist row order.${conflictNote}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to repair product order",
        description: error.message || "The registry conflict could not be resolved safely",
        variant: "destructive",
      });
    },
  });

  // Assign SKUs to brand mutation
  const assignSkusMutation = useMutation({
    mutationFn: async ({ brandId, skus }: { brandId: number; skus: string[] }) => {
      const res = await apiRequest("POST", `/api/brands/${brandId}/skus`, { skus });
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/unassigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/sku-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      toast({ 
        title: "Products assigned!", 
        description: `${variables.skus.length} product(s) assigned to brand` 
      });
      setSelectedSkus(new Set());
      setAssignToBrandId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to assign products to brand", 
        variant: "destructive" 
      });
    },
  });

  // Remove SKUs from brand mutation (for reassignment)
  const removeSkusMutation = useMutation({
    mutationFn: async ({ brandId, skus }: { brandId: number; skus: string[] }) => {
      const res = await apiRequest("DELETE", `/api/brands/${brandId}/skus`, { skus });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/unassigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/sku-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to remove products from brand", 
        variant: "destructive" 
      });
    },
  });

  // Reassign products: remove from current brand and add to new brand
  // Uses brand ID directly instead of looking up by name
  const handleReassignProducts = async (fromBrandId: number, fromBrandName: string, toBrandId: number, skus: string[]) => {
    try {
      // First remove from current brand
      await removeSkusMutation.mutateAsync({ brandId: fromBrandId, skus });
      
      try {
        // Then add to new brand
        await assignSkusMutation.mutateAsync({ brandId: toBrandId, skus });
      } catch (assignError) {
        // Assignment failed - try to rollback by re-adding to original brand
        try {
          await apiRequest("POST", `/api/brands/${fromBrandId}/skus`, { skus });
          toast({ 
            title: "Error", 
            description: "Failed to assign to new brand. Products restored to original brand.", 
            variant: "destructive" 
          });
        } catch (rollbackError) {
          toast({ 
            title: "Critical Error", 
            description: "Assignment failed and rollback failed. Products may be unassigned.", 
            variant: "destructive" 
          });
        }
        return;
      }
      
      // Success - clear selection and refresh data
      setBrandSelectedSkus(prev => {
        const newMap = new Map(prev);
        newMap.delete(fromBrandName);
        return newMap;
      });
      setReassignToBrandId(null);
      
      // Explicitly invalidate all relevant queries
      await queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands/unassigned"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands/sku-mappings"] });
      
      toast({ 
        title: "Products reassigned!", 
        description: `${skus.length} product(s) moved to new brand` 
      });
    } catch (error) {
      // Error already handled in mutation callbacks
    }
  };

  // Remove products from brand (make them unassigned)
  // Uses brand ID directly instead of looking up by name
  const handleRemoveFromBrand = async (brandId: number, brandName: string, skus: string[]) => {
    try {
      await removeSkusMutation.mutateAsync({ brandId, skus });
      
      // Clear selection for this brand
      setBrandSelectedSkus(prev => {
        const newMap = new Map(prev);
        newMap.delete(brandName);
        return newMap;
      });
      
      // Explicitly invalidate all relevant queries
      await queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands/unassigned"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/brands/sku-mappings"] });
      
      toast({ 
        title: "Products removed!", 
        description: `${skus.length} product(s) removed from ${brandName}` 
      });
    } catch (error) {
      // Error handling is done in mutation callback
    }
  };

  const resetForm = () => {
    setBrandName("");
    setCategory("wine");
    setType("");
    setDisplayOrder(undefined);
  };

  const handleAdd = () => {
    if (!brandName.trim()) {
      toast({ title: "Error", description: "Brand name is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({ 
      brandName: brandName.trim(), 
      category, 
      type: type.trim() || undefined,
      displayOrder 
    });
  };

  const handleEdit = (brand: BrandRegistry) => {
    setEditingBrand(brand);
    setBrandName(brand.brandName);
    setCategory(brand.category as BrandCategory);
    setType(brand.type || "");
    setDisplayOrder(brand.displayOrder || undefined);
  };

  const handleUpdate = () => {
    if (!editingBrand) return;
    if (!brandName.trim()) {
      toast({ title: "Error", description: "Brand name is required", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingBrand.id,
      brandName: brandName.trim(),
      category,
      type: type.trim() || null,
      displayOrder: displayOrder || null,
    });
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete brand "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  };

  // Product editing handlers
  const handleStartEditProductType = (product: any) => {
    setEditingProductId(product.id);
    setEditingProductType(product.collectionType || "");
  };

  const handleSaveProductType = (productId: string) => {
    updateProductMutation.mutate({
      productId,
      updates: { collectionType: editingProductType.trim() || null }
    });
  };

  const handleCancelEditProductType = () => {
    setEditingProductId(null);
    setEditingProductType("");
  };

  // State for import functionality
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Export Brand Registry handler
  const handleExportRegistry = async () => {
    try {
      setIsExporting(true);
      const url = isSuperAdmin && selectedCompanyId
        ? `/api/brands/export?companyId=${selectedCompanyId}`
        : "/api/brands/export";
      
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to export brand registry");
      }
      
      const data = await res.json();
      
      // Create downloadable file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `brand-registry-${data.company?.name || "backup"}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      toast({ 
        title: "Export successful", 
        description: `Exported ${data.brands.length} brands and ${data.hiddenSkus.length} hidden SKUs` 
      });
    } catch (error: any) {
      toast({ 
        title: "Export failed", 
        description: error.message || "Failed to export brand registry", 
        variant: "destructive" 
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Import Brand Registry handler
  const handleImportRegistry = async (file: File) => {
    try {
      setIsImporting(true);
      
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // Validate the imported data structure
      if (!importData.brands || !Array.isArray(importData.brands)) {
        throw new Error("Invalid import file format: missing brands array");
      }
      
      const payload = isSuperAdmin && selectedCompanyId
        ? { data: importData, companyId: selectedCompanyId }
        : { data: importData };
      
      const res = await apiRequest("POST", "/api/brands/import", payload);
      const result = await res.json();
      
      // Invalidate all brand-related queries
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/unassigned"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/sku-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/visibility/hidden-skus"] });
      
      toast({ 
        title: "Import successful!", 
        description: `Created ${result.brandsCreated} new brands, updated ${result.brandsUpdated} existing brands, restored ${result.hiddenSkusRestored} hidden SKUs` 
      });
    } catch (error: any) {
      toast({ 
        title: "Import failed", 
        description: error.message || "Failed to import brand registry", 
        variant: "destructive" 
      });
    } finally {
      setIsImporting(false);
    }
  };

  // File input change handler
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportRegistry(file);
      // Reset file input so the same file can be selected again
      event.target.value = "";
    }
  };

  // Wix setup info state
  const [wixSetupInfo, setWixSetupInfo] = useState<{
    appUrl: string;
    redirectUrl: string;
    instructions: string[];
  } | null>(null);

  // Wix integration handlers
  const handleConnectWix = async () => {
    setIsConnectingWix(true);
    try {
      const payload = isSuperAdmin && selectedCompanyId
        ? { companyId: selectedCompanyId }
        : {};

      const res = await apiRequest("POST", "/api/integrations/wix/connect", payload);
      const data = await res.json();

      if (data.appUrl && data.redirectUrl) {
        // Show setup instructions instead of redirecting
        setWixSetupInfo({
          appUrl: data.appUrl,
          redirectUrl: data.redirectUrl,
          instructions: data.instructions || [],
        });
        toast({
          title: "Setup Instructions",
          description: "Configure the URLs shown below in your Wix Developer Center.",
        });
      } else if (data.authUrl) {
        // Legacy flow - redirect directly
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || "Failed to get setup information");
      }
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to Wix",
        variant: "destructive",
      });
    } finally {
      setIsConnectingWix(false);
    }
  };

  const handleSyncWix = async () => {
    setIsSyncingWix(true);
    try {
      const payload = isSuperAdmin && selectedCompanyId
        ? { companyId: selectedCompanyId }
        : {};

      const res = await apiRequest("POST", "/api/integrations/wix/sync", payload);
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Sync successful!",
          description: `Synced ${data.productCount} products from Wix`,
        });
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/brands/unassigned"] });
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync products from Wix",
        variant: "destructive",
      });
    } finally {
      setIsSyncingWix(false);
      refetchIntegrations();
    }
  };

  const handleDisconnectWix = async () => {
    try {
      const url = isSuperAdmin && selectedCompanyId
        ? `/api/integrations/wix?companyId=${selectedCompanyId}`
        : "/api/integrations/wix";
      
      await apiRequest("DELETE", url);
      
      toast({ title: "Wix disconnected successfully" });
      refetchIntegrations();
      setWixAppId("");
      setWixInstallToken("");
    } catch (error: any) {
      toast({
        title: "Disconnect failed",
        description: error.message || "Failed to disconnect Wix",
        variant: "destructive",
      });
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, productSku: string) => {
    setDraggedProductSku(productSku);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, productSku: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDraggedOverProductSku(productSku);
  };

  const handleDragEnd = () => {
    setDraggedProductSku(null);
    setDraggedOverProductSku(null);
  };

  const handleDrop = async (e: React.DragEvent, targetProductSku: string, brandName: string) => {
    e.preventDefault();
    
    if (!draggedProductSku || draggedProductSku === targetProductSku) {
      setDraggedProductSku(null);
      setDraggedOverProductSku(null);
      return;
    }

    // Get the products for this brand
    const brandProducts = productsByBrand?.[brandName] || [];
    let reorderedBrandProducts: any[];
    try {
      reorderedBrandProducts = moveBrandProductBySku(
        brandProducts,
        draggedProductSku,
        targetProductSku,
      );
    } catch {
      handleDragEnd();
      return;
    }

    // Save the reordered products to the backend
    try {
      const orderedSkus = reorderedBrandProducts.map((product) => product.sku);
      const payload = isSuperAdmin && selectedCompanyId
        ? { brandName, orderedSkus, companyId: selectedCompanyId }
        : { brandName, orderedSkus };
      
      await apiRequest("PATCH", "/api/brands/products", payload);
      
      // Invalidate products, brands, and brand ordering queries to refetch with new order
      queryClient.invalidateQueries({ queryKey: ["/api/brands/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands/ordering"] });
      
      toast({ title: "Products reordered successfully!" });
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reorder products", 
        variant: "destructive" 
      });
    }

    setDraggedProductSku(null);
    setDraggedOverProductSku(null);
  };

  const categoryLabels: Record<BrandCategory, string> = {
    cider: "Cider",
    wine: "Wine",
    spirits: "Spirits",
    nonAlc: "Non-Alcoholic",
  };

  // Track which brands have all products hidden (for visual indication)
  const brandsWithVisibility = useMemo(() => {
    if (!brands) return [];
    if (!productsByBrand) return brands.map(b => ({ ...b, hasVisibleProducts: true, productCount: 0, visibleCount: 0 }));
    
    return brands.map(brand => {
      const brandProducts = productsByBrand[brand.brandName] || [];
      const visibleCount = brandProducts.filter((p: any) => !p.isHidden).length;
      return {
        ...brand,
        hasVisibleProducts: visibleCount > 0,
        productCount: brandProducts.length,
        visibleCount
      };
    });
  }, [brands, productsByBrand]);
  
  // Use brandsWithVisibility for display
  const filteredBrands = brandsWithVisibility;

  // Group brands by category (backend already sorts by wine → spirits → cider → nonAlc)
  const brandsByCategory = filteredBrands?.reduce((acc: Record<BrandCategory, BrandRegistry[]>, brand: BrandRegistry) => {
    const cat = brand.category as BrandCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(brand);
    return acc;
  }, {} as Record<BrandCategory, BrandRegistry[]>);

  // Show loading state while companies are loading for Super Admins
  if (isSuperAdmin && companiesLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
          <p className="text-sm text-muted-foreground mt-2">Loading companies...</p>
        </CardContent>
      </Card>
    );
  }

  // Show message if Super Admin but no companies found
  if (isSuperAdmin && (!companies || companies.length === 0)) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No companies found</p>
        </CardContent>
      </Card>
    );
  }

  // Show message if Super Admin but no company selected yet
  if (isSuperAdmin && !selectedCompanyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Brand Registry</CardTitle>
          <CardDescription>
            Select a company to view and manage their brands
          </CardDescription>
          <div className="mt-4">
            <Label htmlFor="company-selector">Select Company</Label>
            <Select
              value={selectedCompanyId?.toString() || ""}
              onValueChange={(val) => setSelectedCompanyId(parseInt(val))}
              disabled={companiesLoading}
            >
              <SelectTrigger id="company-selector" data-testid="select-company" className="w-full md:w-96 text-left">
                <SelectValue placeholder="Select a company" />
              </SelectTrigger>
              <SelectContent>
                {companies?.map((company) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.name} (@{company.domain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Brand Registry</CardTitle>
            <CardDescription>
              Manage your company's brand list for consistent categorization and sorting
            </CardDescription>
            {pricelistMeta && (
              <div className="mt-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md inline-flex items-center gap-2 flex-wrap" data-testid="pricelist-info">
                <span className="font-medium">Products from:</span>
                <span>{pricelistMeta.name}</span>
                <span className="text-muted-foreground/70">|</span>
                <span>{pricelistMeta.totalProducts} products</span>
                {pricelistMeta.productsWithoutBrand > 0 && (
                  <>
                    <span className="text-muted-foreground/70">|</span>
                    <span className="text-amber-600 dark:text-amber-400">
                      {pricelistMeta.productsWithoutBrand} unmatched
                    </span>
                  </>
                )}
                <span className="text-muted-foreground/70">|</span>
                <span>Updated: {new Date(pricelistMeta.updatedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
          {isSuperAdmin && (
            <div className="mt-4">
              <Label htmlFor="company-selector">Select Company</Label>
              <Select
                value={selectedCompanyId?.toString() || ""}
                onValueChange={(val) => setSelectedCompanyId(parseInt(val))}
                disabled={companiesLoading}
              >
                <SelectTrigger id="company-selector" data-testid="select-company" className="w-full md:w-96 text-left">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={company.id.toString()}>
                      {company.name} (@{company.domain})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Pricelist Selector */}
          {companyPricelists && companyPricelists.length > 0 && (
            <div className="mt-4">
              <Label htmlFor="pricelist-selector">Select Pricelist</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedPricelistId?.toString() || "latest"}
                  onValueChange={(val) => setSelectedPricelistId(val === "latest" ? null : parseInt(val))}
                >
                  <SelectTrigger id="pricelist-selector" data-testid="select-pricelist" className="w-full md:w-96">
                    <SelectValue placeholder="Latest pricelist (auto)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest pricelist (auto)</SelectItem>
                    {companyPricelists
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((pricelist) => (
                        <SelectItem key={pricelist.id} value={pricelist.id.toString()}>
                          {pricelist.name} ({new Date(pricelist.createdAt).toLocaleDateString()})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedPricelistId && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedPricelistId(null)}
                    data-testid="button-reset-pricelist"
                  >
                    Reset to Latest
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Choose which pricelist to view products from. Hidden product settings are stored per-pricelist.
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!brands || brands.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No brands registered yet for this company</p>
              {isSuperAdmin && (
                <p className="text-sm mt-2">
                  Try selecting a different company or add your first brand
                </p>
              )}
              {!isSuperAdmin && (
                <p className="text-sm mt-2">Add your first brand to get started</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {(["wine", "spirits", "cider", "nonAlc"] as BrandCategory[]).map((cat) => {
                const categoryBrands = brandsByCategory?.[cat] || [];
                if (categoryBrands.length === 0) return null;

                return (
                  <div key={cat} className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      {categoryLabels[cat]} ({categoryBrands.length})
                    </h3>
                    <Accordion type="multiple" className="space-y-2">
                      {categoryBrands.map((brand) => {
                        const brandProducts = productsByBrand?.[brand.brandName] || [];
                        const brandWithVis = brand as typeof brand & { hasVisibleProducts?: boolean; visibleCount?: number; productCount?: number };
                        const allHidden = brandWithVis.hasVisibleProducts === false && (brandWithVis.productCount || 0) > 0;
                        
                        return (
                          <AccordionItem key={brand.id} value={brand.id.toString()} className={`border rounded-lg px-4 ${allHidden ? 'opacity-60 bg-muted/30' : ''}`}>
                            <div className="flex items-center justify-between py-3">
                              <AccordionTrigger className="flex-1 hover:no-underline">
                                <div className="flex items-center gap-3 text-left flex-wrap">
                                  <span className={`font-medium ${allHidden ? 'line-through' : ''}`}>{brand.brandName}</span>
                                  {allHidden ? (
                                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                                      All hidden ({brandWithVis.productCount} product{(brandWithVis.productCount || 0) !== 1 ? 's' : ''})
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      ({brandWithVis.visibleCount || brandProducts.length} visible{brandWithVis.productCount && brandWithVis.productCount > (brandWithVis.visibleCount || 0) ? ` / ${brandWithVis.productCount} total` : ''})
                                    </span>
                                  )}
                                  {brand.type && (
                                    <span className="text-xs bg-muted px-2 py-1 rounded">
                                      Type: {brand.type}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    Order: {brand.displayOrder || "A-Z"}
                                  </span>
                                </div>
                              </AccordionTrigger>
                              <div className="flex gap-2 ml-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Replace ${brand.brandName}'s saved product order with the latest pricelist row order?`)) {
                                      repairBrandOrderMutation.mutate({
                                        brandId: brand.id,
                                        brandName: brand.brandName,
                                      });
                                    }
                                  }}
                                  disabled={repairBrandOrderMutation.isPending}
                                  data-testid={`button-repair-brand-order-${brand.id}`}
                                  title="Use latest pricelist row order"
                                >
                                  <ArrowUpDown className="w-4 h-4 mr-1" />
                                  Use Pricelist Order
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(brand);
                                  }}
                                  data-testid={`button-edit-brand-${brand.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(brand.id, brand.brandName);
                                  }}
                                  data-testid={`button-delete-brand-${brand.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                            <AccordionContent>
                              {brandProducts.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                  No products found for this brand in the latest pricelist
                                </div>
                              ) : (
                                <div className="space-y-2 pb-4">
                                  {/* Reassignment control bar */}
                                  {(() => {
                                    const selectedForBrand = brandSelectedSkus.get(brand.brandName) || new Set();
                                    const hasSelection = selectedForBrand.size > 0;
                                    
                                    return hasSelection ? (
                                      <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                          {selectedForBrand.size} selected
                                        </span>
                                        <Select
                                          value={reassignToBrandId?.toString() || ""}
                                          onValueChange={(val) => setReassignToBrandId(parseInt(val))}
                                        >
                                          <SelectTrigger className="w-56" data-testid={`select-reassign-brand-${brand.id}`}>
                                            <SelectValue placeholder="Move to brand..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {brands?.filter(b => b.id !== brand.id).map((b) => (
                                              <SelectItem key={b.id} value={b.id.toString()}>
                                                {b.brandName} ({b.category})
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            if (reassignToBrandId) {
                                              handleReassignProducts(brand.id, brand.brandName, reassignToBrandId, Array.from(selectedForBrand));
                                            }
                                          }}
                                          disabled={!reassignToBrandId || removeSkusMutation.isPending || assignSkusMutation.isPending}
                                          data-testid={`button-reassign-products-${brand.id}`}
                                        >
                                          Move
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRemoveFromBrand(brand.id, brand.brandName, Array.from(selectedForBrand))}
                                          disabled={removeSkusMutation.isPending}
                                          data-testid={`button-remove-from-brand-${brand.id}`}
                                        >
                                          Remove from Brand
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setBrandSelectedSkus(prev => {
                                              const newMap = new Map(prev);
                                              newMap.delete(brand.brandName);
                                              return newMap;
                                            });
                                          }}
                                        >
                                          Clear
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="text-xs text-muted-foreground mb-2">
                                        Products from latest pricelist (check to select for reassignment):
                                      </div>
                                    );
                                  })()}
                                  {brandProducts.map((product, idx) => {
                                    const isEditing = editingProductId === product.id;
                                    const isDragging = draggedProductSku === product.sku;
                                    const isDraggedOver = draggedOverProductSku === product.sku;
                                    const selectedForBrand = brandSelectedSkus.get(brand.brandName) || new Set();
                                    const isSelected = product.sku && selectedForBrand.has(product.sku);
                                    
                                    return (
                                      <div
                                        key={`${brand.brandName}:${product.sku}`}
                                        draggable={!isEditing}
                                        onDragStart={(e) => handleDragStart(e, product.sku)}
                                        onDragOver={(e) => handleDragOver(e, product.sku)}
                                        onDragEnd={handleDragEnd}
                                        onDrop={(e) => handleDrop(e, product.sku, brand.brandName)}
                                        className={`flex items-center gap-3 p-3 rounded border text-sm transition-all ${
                                          isDragging ? 'opacity-50 bg-muted' : 'bg-muted/30'
                                        } ${isDraggedOver ? 'border-primary border-2' : ''} ${
                                          product.isHidden ? 'opacity-50 line-through' : ''
                                        } ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300' : ''}`}
                                      >
                                        {/* Selection checkbox */}
                                        {product.sku && (
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                              setBrandSelectedSkus(prev => {
                                                const newMap = new Map(prev);
                                                const currentSet = new Set(prev.get(brand.brandName) || []);
                                                if (e.target.checked) {
                                                  currentSet.add(product.sku);
                                                } else {
                                                  currentSet.delete(product.sku);
                                                }
                                                if (currentSet.size === 0) {
                                                  newMap.delete(brand.brandName);
                                                } else {
                                                  newMap.set(brand.brandName, currentSet);
                                                }
                                                return newMap;
                                              });
                                            }}
                                            className="h-4 w-4"
                                            data-testid={`checkbox-brand-product-${product.sku}`}
                                          />
                                        )}
                                        <GripVertical 
                                          className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" 
                                        />
                                        <div className="flex-1 grid grid-cols-4 gap-3">
                                          <div>
                                            <div className="font-medium">{product.product}</div>
                                            <div className="text-xs text-muted-foreground">{product.sku}</div>
                                          </div>
                                          <div className="text-muted-foreground">{product.format}</div>
                                          <div>
                                            {isEditing ? (
                                              <div className="flex items-center gap-2">
                                                <Input
                                                  value={editingProductType}
                                                  onChange={(e) => setEditingProductType(e.target.value)}
                                                  className="h-8 text-sm"
                                                  placeholder="e.g., Red, White, Rosé"
                                                  autoFocus
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      handleSaveProductType(product.id);
                                                    } else if (e.key === 'Escape') {
                                                      handleCancelEditProductType();
                                                    }
                                                  }}
                                                />
                                              </div>
                                            ) : (
                                              <div>
                                                <span className="text-xs text-muted-foreground">Type: </span>
                                                <span className="font-medium">
                                                  {product.collectionType || "—"}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="font-medium">{product.price}</div>
                                        </div>
                                        {isEditing ? (
                                          <div className="flex gap-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-xs"
                                              onClick={() => handleSaveProductType(product.id)}
                                              disabled={updateProductMutation.isPending}
                                            >
                                              Save
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-xs"
                                              onClick={handleCancelEditProductType}
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="flex gap-2">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => toggleVisibilityMutation.mutate({
                                                productSku: product.sku,
                                                isHidden: !product.isHidden
                                              })}
                                              disabled={toggleVisibilityMutation.isPending}
                                              data-testid={`button-toggle-visibility-${product.sku}`}
                                              title={product.isHidden ? "Show product" : "Hide product"}
                                            >
                                              {product.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-xs"
                                              onClick={() => handleStartEditProductType(product)}
                                            >
                                              Edit Type
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unassigned Products Section */}
      {unassignedData && unassignedData.unassignedCount > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <CardTitle className="text-lg">Unassigned Products</CardTitle>
              </div>
              <span className="text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full">
                {unassignedData.unassignedCount} product{unassignedData.unassignedCount !== 1 ? 's' : ''}
              </span>
            </div>
            <CardDescription>
              These products have SKUs not mapped to any brand. Select products and assign them to a brand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Assignment controls */}
            {selectedSkus.size > 0 && (
              <div className="flex items-center gap-4 mb-4 p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  {selectedSkus.size} selected
                </span>
                <Select
                  value={assignToBrandId?.toString() || ""}
                  onValueChange={(val) => setAssignToBrandId(parseInt(val))}
                >
                  <SelectTrigger className="w-64" data-testid="select-assign-brand">
                    <SelectValue placeholder="Select brand to assign" />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedData.brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id.toString()}>
                        {brand.brandName} ({brand.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (assignToBrandId) {
                      assignSkusMutation.mutate({
                        brandId: assignToBrandId,
                        skus: Array.from(selectedSkus),
                      });
                    }
                  }}
                  disabled={!assignToBrandId || assignSkusMutation.isPending}
                  data-testid="button-assign-skus"
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  {assignSkusMutation.isPending ? "Assigning..." : "Assign to Brand"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedSkus(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            )}

            {/* Unassigned products list */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {unassignedData.unassignedProducts.map((product) => (
                <div
                  key={product.sku}
                  className={`flex items-center gap-3 p-3 rounded border text-sm transition-all ${
                    selectedSkus.has(product.sku) ? 'bg-primary/10 border-primary' : 'bg-muted/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSkus.has(product.sku)}
                    onChange={(e) => {
                      const newSet = new Set(selectedSkus);
                      if (e.target.checked) {
                        newSet.add(product.sku);
                      } else {
                        newSet.delete(product.sku);
                      }
                      setSelectedSkus(newSet);
                    }}
                    className="h-4 w-4"
                    data-testid={`checkbox-product-${product.sku}`}
                  />
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div>
                      <div className="font-medium">{product.product}</div>
                      <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>
                    </div>
                    <div className="text-muted-foreground">
                      {product.collectionBrand || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {product.collectionCategory || "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Select all / none controls */}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allSkus = new Set(unassignedData.unassignedProducts.map(p => p.sku));
                  setSelectedSkus(allSkus);
                }}
                data-testid="button-select-all"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSkus(new Set())}
                data-testid="button-select-none"
              >
                Select None
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wix Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Wix Integration
          </CardTitle>
          <CardDescription>
            Connect to Wix to sync products directly from your store
          </CardDescription>
        </CardHeader>
        <CardContent>
          {wixIntegration?.status === "connected" ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center gap-2">
                  <span className="text-green-600 font-medium">Connected to Wix</span>
                  {wixIntegration.lastSyncAt && (
                    <span className="text-muted-foreground text-sm">
                      - Last synced: {new Date(wixIntegration.lastSyncAt).toLocaleString()}
                    </span>
                  )}
                  {wixIntegration.lastSyncProductCount !== undefined && (
                    <span className="text-muted-foreground text-sm">
                      ({wixIntegration.lastSyncProductCount} products)
                    </span>
                  )}
                </AlertDescription>
              </Alert>
              
              {wixIntegration.lastSyncStatus === "error" && wixIntegration.lastSyncError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{wixIntegration.lastSyncError}</AlertDescription>
                </Alert>
              )}
              
              <div className="flex flex-col gap-3 md:flex-row md:gap-2">
                <Button
                  onClick={handleSyncWix}
                  disabled={isSyncingWix}
                  data-testid="button-sync-wix"
                  className="w-full md:w-auto"
                >
                  {isSyncingWix ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Sync Products from Wix
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDisconnectWix}
                  data-testid="button-disconnect-wix"
                  className="w-full md:w-auto"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {wixSetupInfo ? (
                <>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Configure these URLs in your Wix Developer Center:</strong>
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">App URL:</label>
                      <div className="flex gap-2 mt-1">
                        <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                          {wixSetupInfo.appUrl}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(wixSetupInfo.appUrl);
                            toast({ title: "Copied App URL" });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Redirect URL:</label>
                      <div className="flex gap-2 mt-1">
                        <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                          {wixSetupInfo.redirectUrl}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(wixSetupInfo.redirectUrl);
                            toast({ title: "Copied Redirect URL" });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="font-medium">First-time Setup:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to Wix Developer Center → Your App → OAuth</li>
                      <li>Set the App URL and Redirect URL to the values above</li>
                      <li>Save and create a new app version</li>
                    </ol>
                    
                    <p className="font-medium mt-4">To Complete Connection:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to your Wix Dashboard → Manage Apps</li>
                      <li>Click on your app to open it</li>
                      <li>This will redirect you through the authorization flow</li>
                    </ol>
                  </div>
                  
                  <div className="flex flex-col gap-2 md:flex-row md:gap-2">
                    <Button
                      onClick={() => window.open("https://dev.wix.com/apps", "_blank")}
                      data-testid="button-open-wix-dev-center"
                      className="w-full md:w-auto"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Wix Dev Center
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setWixSetupInfo(null)}
                      className="w-full md:w-auto"
                    >
                      Close Instructions
                    </Button>
                  </div>
                  
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>To authorize:</strong> In Wix Dev Center, go to your app → Test Your App → select your site and click "Test". This will trigger the OAuth flow.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Connect your Wix store to automatically sync products. Click the button below to get setup instructions.
                  </p>
                  
                  <Button
                    onClick={handleConnectWix}
                    disabled={isConnectingWix}
                    data-testid="button-connect-wix"
                    className="w-full md:w-auto"
                  >
                    {isConnectingWix ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4 mr-2" />
                    )}
                    Connect to Wix
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Registry Settings - positioned at bottom */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Brand Registry Settings</CardTitle>
          <CardDescription>
            Export, import, or manage your brand registry
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:gap-2">
            <Button 
              onClick={handleExportRegistry} 
              variant="outline"
              disabled={isExporting || !brands || brands.length === 0}
              data-testid="button-export-registry"
              className="w-full md:w-auto"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export Registry
            </Button>
            <Button 
              variant="outline"
              disabled={isImporting}
              data-testid="button-import-registry"
              asChild
              className="w-full md:w-auto"
            >
              <label className="cursor-pointer">
                {isImporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Import Registry
                <input 
                  type="file" 
                  accept=".json"
                  onChange={handleFileChange}
                  className="sr-only"
                  data-testid="input-import-file"
                />
              </label>
            </Button>
            <Button 
              onClick={() => regenerateSortKeysMutation.mutate()} 
              variant="outline"
              disabled={regenerateSortKeysMutation.isPending}
              data-testid="button-regenerate-sortkeys"
              className="w-full md:w-auto"
            >
              {regenerateSortKeysMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowUpDown className="w-4 h-4 mr-2" />
              )}
              Fix Sort Order
            </Button>
            <Button 
              onClick={() => setIsAddDialogOpen(true)} 
              data-testid="button-add-brand"
              className="w-full md:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Brand
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Brand Dialog */}
      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsAddDialogOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Add Brand</CardTitle>
              <CardDescription>Add a new brand to your registry</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-brand-name">Brand Name</Label>
                <Input
                  id="add-brand-name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Mt. Boucherie Estate Winery"
                  data-testid="input-brand-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-category">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as BrandCategory)}>
                  <SelectTrigger id="add-category" data-testid="select-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cider">Cider</SelectItem>
                    <SelectItem value="wine">Wine</SelectItem>
                    <SelectItem value="spirits">Spirits</SelectItem>
                    <SelectItem value="nonAlc">Non-Alcoholic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-type">Type (optional)</Label>
                <Input
                  id="add-type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="e.g., Red, White, Rosé, Sparkling"
                  data-testid="input-type"
                />
                <p className="text-xs text-muted-foreground">
                  Product type within the category (e.g., for wine: red, white, rosé, sparkling)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-display-order">Display Order (optional)</Label>
                <Input
                  id="add-display-order"
                  type="number"
                  value={displayOrder ?? ""}
                  onChange={(e) => setDisplayOrder(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Leave empty for alphabetical"
                  data-testid="input-display-order"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to sort alphabetically. Lower numbers appear first.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }} data-testid="button-cancel-add">
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={createMutation.isPending} data-testid="button-confirm-add">
                {createMutation.isPending ? "Adding..." : "Add Brand"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Edit Brand Dialog */}
      {editingBrand && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setEditingBrand(null); resetForm(); }}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Edit Brand</CardTitle>
              <CardDescription>Update brand information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-brand-name">Brand Name</Label>
                <Input
                  id="edit-brand-name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  data-testid="input-edit-brand-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as BrandCategory)}>
                  <SelectTrigger id="edit-category" data-testid="select-edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cider">Cider</SelectItem>
                    <SelectItem value="wine">Wine</SelectItem>
                    <SelectItem value="spirits">Spirits</SelectItem>
                    <SelectItem value="nonAlc">Non-Alcoholic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-type">Type (optional)</Label>
                <Input
                  id="edit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="e.g., Red, White, Rosé, Sparkling"
                  data-testid="input-edit-type"
                />
                <p className="text-xs text-muted-foreground">
                  Product type within the category (e.g., for wine: red, white, rosé, sparkling)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-display-order">Display Order (optional)</Label>
                <Input
                  id="edit-display-order"
                  type="number"
                  value={displayOrder ?? ""}
                  onChange={(e) => setDisplayOrder(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Leave empty for alphabetical"
                  data-testid="input-edit-display-order"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to sort alphabetically. Lower numbers appear first.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setEditingBrand(null); resetForm(); }} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-confirm-edit">
                {updateMutation.isPending ? "Updating..." : "Update Brand"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
