import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Users, Trash2, Edit, Plus, Upload } from "lucide-react";
import type { 
  CompanyProfile, 
  SalesAgentProfile,
  CompanyBranding,
  SalesAgent
} from "@shared/schema";

export default function AdminPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("company");

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Admin Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage reusable company profiles and sales agent teams
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="company" data-testid="tab-company-profiles">
            <Building2 className="w-4 h-4 mr-2" />
            Company Profiles
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agent-profiles">
            <Users className="w-4 h-4 mr-2" />
            Sales Agent Teams
          </TabsTrigger>
        </TabsList>

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
