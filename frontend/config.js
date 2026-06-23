(() => {
  const storageKey = "lock_memory_api_base_url";
  const params = new URLSearchParams(window.location.search);
  const queryOverride = (params.get("api") || "").trim();
  const globalOverride = typeof window.LOCK_MEMORY_API_BASE_URL === "string"
    ? window.LOCK_MEMORY_API_BASE_URL.trim()
    : "";
  const hostname = window.location.hostname;
  const port = window.location.port;
  const isLocalhost = hostname === "127.0.0.1" || hostname === "localhost";
  const isGitHubPages = hostname.endsWith(".github.io");
  const isLiveServerPort = /^55\d{2}$/.test(port);

  if (queryOverride.toLowerCase() === "reset") {
    window.localStorage.removeItem(storageKey);
  } else if (queryOverride) {
    window.localStorage.setItem(storageKey, queryOverride);
  }

  const override = globalOverride || window.localStorage.getItem(storageKey);

  let apiBaseUrl = "http://127.0.0.1:3000";

  if (override) {
    apiBaseUrl = override;
  } else if (
    (window.location.protocol === "http:" || window.location.protocol === "https:") &&
    !(isLocalhost && isLiveServerPort) &&
    !isGitHubPages
  ) {
    apiBaseUrl = window.location.origin;
  }

  window.LOCK_MEMORY_CONFIG = {
    API_BASE_URL: apiBaseUrl.replace(/\/$/, "")
  };
})();
