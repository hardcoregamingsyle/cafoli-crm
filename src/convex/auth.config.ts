export default {
  providers: [
    {
      // Fallback to the site URL if the env var is not set
      domain: process.env.CONVEX_SITE_URL || "https://canny-porcupine-779.convex.site",
      applicationID: "convex",
    },
  ],
};