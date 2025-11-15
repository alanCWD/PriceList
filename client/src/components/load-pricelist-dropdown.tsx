import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2, Trash2, Calendar } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Pricelist } from "@shared/schema";

interface LoadPricelistDropdownProps {
  onLoad: (pricelist: Pricelist) => void;
}

export function LoadPricelistDropdown({ onLoad }: LoadPricelistDropdownProps) {
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: pricelists, isLoading } = useQuery<Pricelist[]>({
    queryKey: ["/api/pricelists"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/pricelists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricelists"] });
      toast({
        title: "Pricelist deleted",
        description: "The pricelist has been removed successfully",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete pricelist",
        variant: "destructive",
      });
    },
  });

  const handleLoad = (pricelist: Pricelist) => {
    onLoad(pricelist);
    toast({
      title: "Pricelist loaded",
      description: `Loaded "${pricelist.name}"`,
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" data-testid="button-load-pricelist">
            <FolderOpen className="w-4 h-4 mr-2" />
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load Saved"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Saved Pricelists</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mx-auto mb-2 animate-spin" />
              Loading...
            </div>
          ) : !pricelists || pricelists.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No saved pricelists yet
            </div>
          ) : (
            pricelists.map((pricelist) => (
              <DropdownMenuItem
                key={pricelist.id}
                className="flex items-start justify-between gap-2 cursor-pointer"
                data-testid={`pricelist-item-${pricelist.id}`}
                onSelect={(e) => {
                  e.preventDefault();
                }}
              >
                <div 
                  className="flex-1 min-w-0"
                  onClick={() => handleLoad(pricelist)}
                >
                  <div className="font-medium truncate">{pricelist.name}</div>
                  {pricelist.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {pricelist.description}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(pricelist.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(pricelist.id);
                  }}
                  data-testid={`button-delete-${pricelist.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pricelist?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the saved pricelist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
