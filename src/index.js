export default {
  async fetch(request, env, ctx) {
    try {
      // Attempt to serve the static asset
      const response = await env.ASSETS.fetch(request);

      // If the asset is found (status 200-299) or not modified (304), return it
      if ((response.status >= 200 && response.status < 300) || response.status === 304) {
        return response;
      }

      // Look for an index.html if the path is a directory (optional, helpful for some setups)
      // Standard behavior of env.ASSETS might handle this, but explicit handling is safe.
      // For this simple static site, ASSETS.fetch is usually sufficient as it resembles Pages behavior.

      // Custom 404 handling or fallback to index.html for SPA (Single Page App)
      // Since this is likely a static site, we can just return the response even if 404,
      // or customize it.

      return response;

    } catch (e) {
      return new Response("Internal Error", { status: 500 });
    }
  },
};
