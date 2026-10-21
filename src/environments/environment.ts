export const environment = {
  production: false,
  // Same-origin; ng serve proxies /api → https://localhost:7265 (see proxy.conf.json).
  apiUrl: '/api',
  // SignalR hub base — sibling of /api (NOT under it); proxied with ws:true in dev.
  hubUrl: '/hubs',
};
