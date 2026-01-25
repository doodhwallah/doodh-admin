/**
 * CORS configuration for edge functions
 * Centralizes allowed origins for security
 */

// Allowed origins for CORS - update these for production
export const ALLOWED_ORIGINS = [
  'https://doodhwallah.lovable.app',
  'https://id-preview--6fd5a15b-f32d-4ffc-a9fd-b0135c143077.lovable.app',
] as const;

/**
 * Get CORS headers with proper origin validation
 * Falls back to first allowed origin if origin not in list
 */
export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin as typeof ALLOWED_ORIGINS[number])
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}
