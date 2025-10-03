import { warDetection, callManagement, syncUpdates, getWarTargets } from '../shared/functions.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();
  
  switch(path) {
    case 'war-detection':
      return warDetection(req);
    case 'call-management':
      return callManagement(req);
    case 'sync-updates':
      return syncUpdates(req);
    case 'get-war-targets':
      return getWarTargets(req);
    default:
      // Default to war detection for backward compatibility
      return warDetection(req);
  }
});