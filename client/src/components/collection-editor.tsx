import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Edit, Check, X, AlertCircle } from "lucide-react";
import type { Product } from "@shared/schema";

interface CollectionEditorProps {
  products: Product[];
  onProductsChange: (products: Product[]) => void;
}

export function CollectionEditor({ products, onProductsChange }: CollectionEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    collectionCategory?: 'cider' | 'wine' | 'spirits' | 'nonAlc';
    collectionType?: string;
    collectionBrand?: string;
    collectionRegion?: string;
  }>({});

  // Show all products (including those without collection data for manual entry)
  const productsToShow = products;

  const startEditing = (product: Product) => {
    setEditingId(product.id);
    // Initialize with existing values or empty strings for manual entry
    setEditValues({
      collectionCategory: product.collectionCategory || undefined,
      collectionType: product.collectionType || '',
      collectionBrand: product.collectionBrand || '',
      collectionRegion: product.collectionRegion || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEditing = () => {
    if (!editingId) return;

    const updatedProducts = products.map(p => {
      if (p.id === editingId) {
        // Update the product with new values (keep existing if not changed)
        const updated = {
          ...p,
          collectionCategory: editValues.collectionCategory || p.collectionCategory,
          collectionType: editValues.collectionType || p.collectionType,
          collectionBrand: editValues.collectionBrand || p.collectionBrand,
          collectionRegion: editValues.collectionRegion || p.collectionRegion,
        };

        // Regenerate category/sortKey if we have at least brand and category
        if (updated.collectionBrand && updated.collectionCategory) {
          const primarySortOrder = { cider: '1', wine: '2', spirits: '3', nonAlc: '4' };
          const wineTypeSortOrder = { sparkling: '1', white: '2', red: '3' };
          
          let sortKey = `${primarySortOrder[updated.collectionCategory]}-${updated.collectionCategory}`;
          
          if (updated.collectionType && updated.collectionCategory === 'wine') {
            const typeKey = wineTypeSortOrder[updated.collectionType.toLowerCase() as keyof typeof wineTypeSortOrder] || '9';
            sortKey += `-${typeKey}-${updated.collectionType}`;
          }
          
          sortKey += `-${updated.collectionBrand}`;
          updated.category = sortKey;
        } else if (updated.collectionBrand) {
          // If only brand is provided, use it as category (fallback)
          updated.category = updated.collectionBrand;
        }

        return updated;
      }
      return p;
    });

    onProductsChange(updatedProducts);
    setEditingId(null);
    setEditValues({});
  };

  if (productsToShow.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Collection Data</CardTitle>
          <CardDescription>
            Review and edit parsed collection data from your CSV
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert data-testid="alert-no-products">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription data-testid="alert-description-no-products">
              No products found. Please upload and map your CSV first.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collection Data Review</CardTitle>
        <CardDescription>
          Review and edit the parsed collection data. The parser extracted brand, category, type, and region from your WIX collection field.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]" data-testid="header-product">Product</TableHead>
                <TableHead className="w-[250px]" data-testid="header-collection">Original Collection</TableHead>
                <TableHead className="w-[120px]" data-testid="header-category">Category</TableHead>
                <TableHead className="w-[100px]" data-testid="header-type">Type</TableHead>
                <TableHead className="w-[150px]" data-testid="header-brand">Brand</TableHead>
                <TableHead className="w-[120px]" data-testid="header-region">Region</TableHead>
                <TableHead className="w-[100px]" data-testid="header-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsToShow.map((product) => {
                const isEditing = editingId === product.id;

                return (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell className="font-medium text-sm" data-testid={`text-product-name-${product.id}`}>{product.product}</TableCell>
                    <TableCell className="text-xs text-muted-foreground" data-testid={`text-collection-raw-${product.id}`}>
                      {product.collectionRaw || <span className="text-muted-foreground italic">No collection data</span>}
                    </TableCell>
                    
                    {isEditing ? (
                      <>
                        <TableCell>
                          <Select
                            value={editValues.collectionCategory}
                            onValueChange={(value) => setEditValues({ ...editValues, collectionCategory: value as any })}
                          >
                            <SelectTrigger data-testid={`select-category-${product.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cider">Cider</SelectItem>
                              <SelectItem value="wine">Wine</SelectItem>
                              <SelectItem value="spirits">Spirits</SelectItem>
                              <SelectItem value="nonAlc">Non-Alc</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editValues.collectionType || ''}
                            onChange={(e) => setEditValues({ ...editValues, collectionType: e.target.value })}
                            placeholder="Type"
                            data-testid={`input-type-${product.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editValues.collectionBrand || ''}
                            onChange={(e) => setEditValues({ ...editValues, collectionBrand: e.target.value })}
                            placeholder="Brand"
                            data-testid={`input-brand-${product.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editValues.collectionRegion || ''}
                            onChange={(e) => setEditValues({ ...editValues, collectionRegion: e.target.value })}
                            placeholder="Region"
                            data-testid={`input-region-${product.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={saveEditing}
                              data-testid={`button-save-${product.id}`}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={cancelEditing}
                              data-testid={`button-cancel-${product.id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <span className="capitalize" data-testid={`text-category-${product.id}`}>{product.collectionCategory || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="capitalize" data-testid={`text-type-${product.id}`}>{product.collectionType || '-'}</span>
                        </TableCell>
                        <TableCell data-testid={`text-brand-${product.id}`}>{product.collectionBrand || '-'}</TableCell>
                        <TableCell data-testid={`text-region-${product.id}`}>{product.collectionRegion || '-'}</TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEditing(product)}
                            data-testid={`button-edit-${product.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
