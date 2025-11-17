import { useState, useEffect } from "react";
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
import { Loader2, Building2, Users, Trash2, Edit, Plus, Upload, Building, UserCog } from "lucide-react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { CSVUpload } from "@/components/csv-upload";
import type { 
  CompanyProfile, 
  SalesAgentProfile,
  CompanyBranding,
  SalesAgent,
  Company,
  User,
  Template,
  FieldMapping
} from "@shared/schema";

export default function AdminPage() {
  const { toast } = useToast();
  const { user, isAdmin, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("companies");

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
        <TabsList className="grid w-full grid-cols-4">
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
    
    setCsvHeaders(headers);
    
    // Auto-detect mappings from CSV headers
    const autoMapping: FieldMapping = {
      product: headers.find(h => {
        const lower = h.toLowerCase();
        return lower === "name" || (lower.includes("product") && !lower.includes("image"));
      }) || "",
      sku: headers.find(h => h.toLowerCase().includes("sku")) || "",
      format: headers.find(h => {
        const lower = h.toLowerCase();
        return lower.includes("additional info") || lower.includes("case") || lower.includes("format") || lower.includes("size");
      }) || "",
      price: headers.find(h => h.toLowerCase().includes("price")) || "",
      category: headers.find(h => h.toLowerCase().includes("category") || h.toLowerCase().includes("producer") || h.toLowerCase().includes("winery")) || "",
      notes: headers.find(h => h.toLowerCase().includes("note")) || "",
      productImageUrl: headers.find(h => {
        const lower = h.toLowerCase();
        return lower.includes("productimage") || lower === "productimageurl";
      }) || "",
    };
    
    // Guard against CSV files with no matching headers (preserve existing mappings)
    if (Object.values(autoMapping).every(v => !v)) {
      toast({
        title: "No field matches found",
        description: "CSV headers don't match expected product fields. Please check your CSV format.",
        variant: "destructive",
      });
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
    
    // Normalize field mapping to ensure all keys exist (prevents undefined in controlled inputs)
    const normalized: FieldMapping = {
      product: (company.defaultFieldMapping as any)?.product || "",
      sku: (company.defaultFieldMapping as any)?.sku || "",
      format: (company.defaultFieldMapping as any)?.format || "",
      price: (company.defaultFieldMapping as any)?.price || "",
      category: (company.defaultFieldMapping as any)?.category || "",
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

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
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

    // CRITICAL: Must send companyId: null explicitly to clear assignment (not undefined)
    const data = {
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
              Update user role and company assignment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <CardFooter className="flex gap-2">
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
    </div>
  );
}

function CompanyProfilesManager() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState("");
  const [companyName, setCompanyName] = useState("");
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
    setTagline("");
    setLogoUrl("");
  };

  const handleEdit = (profile: CompanyProfile) => {
    setEditingId(profile.id);
    setProfileName(profile.name);
    setCompanyName(profile.branding.companyName);
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
