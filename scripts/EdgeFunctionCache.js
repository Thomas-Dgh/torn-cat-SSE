// Edge Function Cache Class - copied for injection
class EdgeFunctionCache {
  constructor() {
    this.cache = new Map();
    this.ttl = {
      'war-detection': 60000,      // 1 minute
      'get-war-targets': 30000,    // 30 seconds  
      'faction-data': 300000,      // 5 minutes
      'unified-war-data': 5000,    // 5 seconds
      'sync-updates': 5000,        // 5 seconds
      'call-management': 3000,     // 3 seconds
    };
  }
  
  generateKey(endpoint, params) {
    return `${endpoint}:${JSON.stringify(params || {})}`;
  }
  
  async get(endpoint, params, fetcher) {
    const key = this.generateKey(endpoint, params);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl[endpoint]) {
      console.log(`[Cache Hit] ${endpoint}`);
      return cached.data;
    }
    
    console.log(`[Cache Miss] ${endpoint} - fetching fresh data`);
    const data = await fetcher();
    
    this.cache.set(key, { 
      data, 
      timestamp: Date.now() 
    });
    
    return data;
  }
  
  invalidate(endpoint, params) {
    const key = this.generateKey(endpoint, params);
    this.cache.delete(key);
  }
  
  invalidateAll() {
    this.cache.clear();
  }
  
  // Clean expired entries periodically
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        const endpoint = key.split(':')[0];
        if (now - value.timestamp > this.ttl[endpoint]) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }
}