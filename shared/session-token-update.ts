export interface SessionTokenState {
  claims?: Record<string, unknown>;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface RefreshedSessionTokens {
  access_token: string;
  refresh_token?: string;
  claims(): Record<string, unknown> | undefined;
}

export function applyTokenResponseToSession(
  user: SessionTokenState,
  tokens: RefreshedSessionTokens,
): void {
  const claims = tokens.claims();
  user.claims = claims;
  user.access_token = tokens.access_token;
  if (tokens.refresh_token) {
    user.refresh_token = tokens.refresh_token;
  }
  user.expires_at = typeof claims?.exp === "number" ? claims.exp : undefined;
}