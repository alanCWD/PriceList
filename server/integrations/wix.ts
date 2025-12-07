import type { Product, IntegrationProvider } from "@shared/schema";

export interface WixConfig {
  appId: string;
  siteId?: string;
}

export interface WixTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

interface WixProduct {
  id: string;
  name: string;
  slug: string;
  visible: boolean;
  productType: string;
  description: string;
  sku: string;
  weight: number;
  ribbon?: string;
  brand?: string;
  price: {
    currency: string;
    price: number;
    discountedPrice?: number;
    formatted: {
      price: string;
      discountedPrice?: string;
    };
  };
  media?: {
    mainMedia?: {
      image?: {
        url: string;
      };
    };
  };
  additionalInfoSections?: Array<{
    title: string;
    description: string;
  }>;
  collections?: Array<{
    id: string;
    name: string;
  }>;
  variants?: Array<{
    id: string;
    sku: string;
    variant: {
      priceData: {
        price: number;
        formatted: {
          price: string;
        };
      };
    };
  }>;
  inventory?: {
    status: string;
    quantity: number;
  };
}

interface WixProductsResponse {
  products: WixProduct[];
  metadata: {
    count: number;
    offset: number;
    total: number;
  };
  _cursor?: string | null;
}

const WIX_API_BASE = "https://www.wixapis.com";
const WIX_OAUTH_URL = "https://www.wix.com/oauth/access";

export class WixIntegrationService {
  private appId: string;
  private appSecret: string;

  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  getAuthorizationUrl(redirectUrl: string, state: string, token: string): string {
    const params = new URLSearchParams({
      token,
      appId: this.appId,
      redirectUrl,
      state,
    });
    return `https://www.wix.com/installer/install?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<WixTokens> {
    const response = await fetch(WIX_OAUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        client_id: this.appId,
        client_secret: this.appSecret,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<WixTokens> {
    const response = await fetch(WIX_OAUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: this.appId,
        client_secret: this.appSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async fetchProducts(accessToken: string, limit = 100, cursor?: string): Promise<WixProductsResponse> {
    const requestBody: any = {
      query: {
        paging: { limit },
      },
    };
    
    // Add cursor for subsequent pages (V3 uses cursor-based pagination)
    if (cursor) {
      requestBody.query.paging.cursor = cursor;
    }
    
    const response = await fetch(`${WIX_API_BASE}/stores/v3/products/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch products: ${error}`);
    }

    const data = await response.json();
    
    // Adapt V3 response to match expected interface
    return {
      products: data.products || [],
      metadata: {
        count: data.products?.length || 0,
        total: data.pagingMetadata?.total || data.products?.length || 0,
        offset: 0,
      },
      _cursor: data.pagingMetadata?.cursors?.next || null,
    };
  }

  async fetchAllProducts(accessToken: string): Promise<WixProduct[]> {
    const allProducts: WixProduct[] = [];
    let cursor: string | undefined = undefined;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await this.fetchProducts(accessToken, limit, cursor);
      allProducts.push(...response.products);

      // V3 uses cursor-based pagination
      cursor = (response as any)._cursor;
      hasMore = !!cursor;
    }

    return allProducts;
  }

  private parseCollectionInfo(collectionNames: string[]): { 
    collectionCategory?: "cider" | "wine" | "spirits" | "nonAlc";
    collectionBrand?: string;
    collectionType?: string;
  } {
    let collectionCategory: "cider" | "wine" | "spirits" | "nonAlc" | undefined;
    let collectionType: string | undefined;

    for (const name of collectionNames) {
      const lower = name.toLowerCase();
      if (lower.includes("cider")) collectionCategory = "cider";
      else if (lower.includes("wine") || lower.includes("red") || lower.includes("white") || lower.includes("rosé") || lower.includes("sparkling")) {
        collectionCategory = "wine";
        if (lower.includes("red")) collectionType = "red";
        else if (lower.includes("white")) collectionType = "white";
        else if (lower.includes("rosé") || lower.includes("rose")) collectionType = "rosé";
        else if (lower.includes("sparkling")) collectionType = "sparkling";
      }
      else if (lower.includes("spirit") || lower.includes("whisky") || lower.includes("vodka") || lower.includes("gin")) collectionCategory = "spirits";
      else if (lower.includes("non-alc") || lower.includes("non alc") || lower.includes("nonalc")) collectionCategory = "nonAlc";
    }

    return { collectionCategory, collectionType, collectionBrand: collectionNames[0] };
  }

  mapWixProductToProducts(wixProduct: WixProduct, baseIndex: number): Product[] {
    const additionalInfo = wixProduct.additionalInfoSections || [];
    const notesSection = additionalInfo.find(
      (s) => s.title.toLowerCase().includes("note") || 
             s.title.toLowerCase() === "additionalinfodescription2"
    );

    const collectionNames = wixProduct.collections?.map((c) => c.name) || [];
    const collectionRaw = collectionNames.join(", ");
    const { collectionCategory, collectionType, collectionBrand } = this.parseCollectionInfo(collectionNames);
    const brand = wixProduct.brand || collectionBrand;

    const baseProduct = {
      category: brand || "Uncategorized",
      ribbon: wixProduct.ribbon || undefined,
      notes: notesSection?.description || undefined,
      product: wixProduct.name,
      productImageUrl: wixProduct.media?.mainMedia?.image?.url,
      isHidden: !wixProduct.visible,
      collectionRaw,
      collectionCategory,
      collectionType,
      collectionBrand: brand,
    };

    const products: Product[] = [];
    const variants = wixProduct.variants || [];

    if (variants.length > 0) {
      variants.forEach((variant, variantIndex) => {
        products.push({
          ...baseProduct,
          id: `${wixProduct.id}-${variant.id}`,
          sku: variant.sku || `${wixProduct.sku}-${variantIndex}`,
          format: "1 x 750 ml",
          price: variant.variant?.priceData?.formatted?.price || 
                 variant.variant?.priceData?.price?.toString() || 
                 wixProduct.price?.formatted?.price || 
                 wixProduct.price?.price?.toString() || "0",
        });
      });
    } else {
      products.push({
        ...baseProduct,
        id: wixProduct.id || `wix-${baseIndex}`,
        sku: wixProduct.sku || wixProduct.id,
        format: "1 x 750 ml",
        price: wixProduct.price?.formatted?.price || wixProduct.price?.price?.toString() || "0",
      });
    }

    return products;
  }

  async syncProducts(accessToken: string): Promise<Product[]> {
    const wixProducts = await this.fetchAllProducts(accessToken);
    const allProducts: Product[] = [];
    
    wixProducts.forEach((product, index) => {
      const mapped = this.mapWixProductToProducts(product, index);
      allProducts.push(...mapped);
    });
    
    return allProducts;
  }
}

export function createWixService(appId: string, appSecret: string): WixIntegrationService {
  return new WixIntegrationService(appId, appSecret);
}
