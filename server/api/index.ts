// Main API router
import { handleAuthAPI } from "./auth-api";
import { handleAdminAPI } from "./admin-api";
import { handleRequestorAPI } from "./requestor-api";
import { handleMediaCustodianAPI } from "./media-custodian-api";
import { handleTimelineAPI } from "./timeline-api";

export async function handleAPI(request: Request, path: string, ipAddress: string): Promise<Response> {
  // Try each API module in order
  let response: Response | null = null;
  
  // Authentication APIs
  response = await handleAuthAPI(request, path);
  if (response) return response;
  
  // Admin APIs
  response = await handleAdminAPI(request, path);
  if (response) return response;
  
  // Requestor APIs
  response = await handleRequestorAPI(request, path);
  if (response) return response;
  
  // Media Custodian API routes (support both /media-custodian/api/* and /api/* style)
  response = await handleMediaCustodianAPI(request, path);
  if (response) return response;
  
  // Timeline APIs
  response = await handleTimelineAPI(request, path);
  if (response) return response;
  
  // No matching API endpoint found
  return new Response(JSON.stringify({ error: "API endpoint not found" }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}
