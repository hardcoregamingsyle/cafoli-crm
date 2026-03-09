const { ConvexHttpClient } = require("convex/browser");
require("dotenv").config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  console.log("This would need to be a convex mutation.");
}
run();
