// Main API router
import { handleAuthAPI } from "./auth-api";
import { handleAdminAPI } from "./admin-api";
import { handleRequestorAPI } from "./requestor-api";
import { handleApproverAPI } from "./approver-api";
import { handleMediaCustodianAPI } from "./media-custodian-api";
import { handleDTAAPI } from "./dta-api";
import { handleSMEAPI } from "./sme-api";
import { handleCPSOAPI } from "./cpso-api";
import { handleTimelineAPI } from "./timeline-api";

export async function handleAPI(request: Request, path: string, ipAddress: string): Promise<Response> {
  // Try each API module in order
  let response: Response | null = null;
  
  // Authentication APIs
  response = await handleAuthAPI(request, path, ipAddress);
  if (response) return response;
  
  // Admin APIs
  response = await handleAdminAPI(request, path, ipAddress);
  if (response) return response;
  
  // Requestor APIs
  response = await handleRequestorAPI(request, path, ipAddress);
  if (response) return response;
  
  // Approver APIs
  if (path.startsWith('/api/approver/')) {
    response = await handleApproverAPI(request, path, ipAddress);
    if (response) return response;
  }
  
  // CPSO APIs
  if (path.startsWith('/api/cpso/')) {
    response = await handleCPSOAPI(request, path, ipAddress);
    if (response) return response;
  }
  
  // DTA APIs
  response = await handleDTAAPI(request, path, ipAddress);
  if (response) return response;
  
  // SME APIs
  response = await handleSMEAPI(request, path, ipAddress);
  if (response) return response;
  
  // Media Custodian API routes (support both /media-custodian/api/* and /api/* style)
  response = await handleMediaCustodianAPI(request, path, ipAddress);
  if (response) return response;
  
  // Timeline APIs
  response = await handleTimelineAPI(request, path, ipAddress);
  if (response) return response;
  
  // No matching API endpoint found
  return new Response(JSON.stringify({ error: "API endpoint not found" }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}
