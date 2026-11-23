// OAuth 2.0 client-credentials token provider for the Creators API.

export const TOKEN_ENDPOINTS = {
  '3.1': 'https://api.amazon.com/auth/o2/token',
  '3.2': 'https://api.amazon.co.uk/auth/o2/token',
  '3.3': 'https://api.amazon.co.jp/auth/o2/token',
};

const EXPIRY_MARGIN_MS = 60 * 1000;

export function createTokenProvider({ credentialId, secret, version, fetchImpl = fetch, now = Date.now }) {
  const endpoint = TOKEN_ENDPOINTS[version];
  if (!endpoint) throw new Error(`Unsupported Creators API version: ${version}`);

  let token = null;
  let expiresAt = 0;
  let inFlight = null;

  async function request() {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: credentialId,
        client_secret: secret,
        scope: 'creatorsapi::default',
      }),
    });
    if (!res.ok) throw new Error(`Creators API token request failed with status ${res.status}`);
    const body = await res.json();
    token = body.access_token;
    expiresAt = now() + body.expires_in * 1000 - EXPIRY_MARGIN_MS;
    return token;
  }

  return {
    async getToken() {
      if (token && now() < expiresAt) return token;
      if (!inFlight) inFlight = request().finally(() => { inFlight = null; });
      return inFlight;
    },
    invalidate() {
      token = null;
      expiresAt = 0;
    },
  };
}
