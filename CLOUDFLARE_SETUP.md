# Cloudflare Worker Setup for WhatsApp Media

This setup offloads heavy file transfers to a Cloudflare Worker.

## 1. Create the Worker
1. Go to your Cloudflare Dashboard > Workers & Pages.
2. Create a new Worker.
3. **IMPORTANT**: Copy the *updated* code from `cloudflare/worker.js` into the Worker editor.
4. Save and Deploy.

## 2. Configure Worker Environment Variables
In the Cloudflare Worker settings (Settings > Variables), add these variables:

- `CLOUD_API_ACCESS_TOKEN`: Your WhatsApp Cloud API Token.
- `WA_PHONE_NUMBER_ID`: Your WhatsApp Phone Number ID.
- `WORKER_AUTH_TOKEN`: A secure random string (e.g., "my-secret-token-123").

**Note**: Ensure there are no extra spaces at the start or end of the values.

## 3. Configure Convex Environment Variables
In your Convex Dashboard (Settings > Environment Variables), add:

- `CLOUDFLARE_WORKER_URL`: The URL of your deployed worker (e.g., `https://my-worker.username.workers.dev`).
- `CLOUDFLARE_WORKER_TOKEN`: **MUST MATCH EXACTLY** the `WORKER_AUTH_TOKEN` you set in Cloudflare.

## 4. Verification
1. Open your Worker URL in a browser (e.g., `https://my-worker.username.workers.dev`).
2. You should see: "Cloudflare Worker is running! Method must be POST to send files."
   - If you see this, the URL is correct.
3. If you still get "Unauthorized" in logs:
   - Check that `WORKER_AUTH_TOKEN` in Cloudflare and `CLOUDFLARE_WORKER_TOKEN` in Convex are identical.
   - The system now automatically trims spaces, but double-check for typos.