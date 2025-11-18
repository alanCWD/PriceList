import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Helper to get impersonated company ID from localStorage
function getImpersonatedCompanyId(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("impersonatedCompanyId");
  }
  return null;
}

// Helper to build headers with optional impersonation
function buildHeaders(includeContentType: boolean = false): HeadersInit {
  const headers: HeadersInit = {};
  
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  
  const impersonatedCompanyId = getImpersonatedCompanyId();
  if (impersonatedCompanyId) {
    headers["X-Impersonated-Company-Id"] = impersonatedCompanyId;
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    let bodyString: string | undefined;
    if (data) {
      console.log(`apiRequest: Stringifying payload...`);
      bodyString = JSON.stringify(data);
      console.log(`apiRequest: Payload stringified (${bodyString.length} bytes)`);
    }
    
    console.log(`apiRequest: Initiating ${method} ${url}`);
    const res = await fetch(url, {
      method,
      headers: buildHeaders(!!data),
      body: bodyString,
      credentials: "include",
    });

    console.log(`apiRequest: Response received - ${res.status} ${res.statusText}`);
    await throwIfResNotOk(res);
    console.log(`apiRequest: Response OK, returning`);
    return res;
  } catch (error) {
    console.error(`apiRequest: Error during ${method} ${url}:`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // URL is the first element only; rest are for cache invalidation
    const url = typeof queryKey[0] === 'string' ? queryKey[0] : queryKey.join("/");
    
    const res = await fetch(url, {
      headers: buildHeaders(false),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
