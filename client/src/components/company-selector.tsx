import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useAuth } from "@/hooks/useAuth";
import { Building2 } from "lucide-react";
import type { Company } from "@shared/schema";

export function CompanySelector() {
  const { user } = useAuth();
  const { impersonatedCompanyId, setImpersonatedCompanyId } = useViewMode();

  // Fetch all companies
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['/api/companies'],
    enabled: user?.role === "superAdmin",
  });

  // Handler for company selection
  const handleCompanyChange = (value: string) => {
    if (value === "__none__") {
      setImpersonatedCompanyId(null);
    } else {
      const companyId = parseInt(value, 10);
      if (!isNaN(companyId)) {
        setImpersonatedCompanyId(companyId);
      }
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="company-selector">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select
        value={impersonatedCompanyId?.toString() || "__none__"}
        onValueChange={handleCompanyChange}
      >
        <SelectTrigger className="w-[200px]" data-testid="select-company-trigger">
          <SelectValue placeholder="Select company..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" data-testid="select-company-none">
            No company selected
          </SelectItem>
          {companies.map((company) => (
            <SelectItem 
              key={company.id} 
              value={company.id.toString()}
              data-testid={`select-company-${company.id}`}
            >
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
