# Cloudflare Worker Setup for WhatsApp Media

This setup offloads heavy file transfers to a Cloudflare Worker.

## 1. Create the Worker
1. Go to your Cloudflare Dashboard > Workers & Pages.
2. Create a new Worker.
3. **IMPORTANT**: Copy the *updated* code from `cloudflare/worker.js` into the Worker editor.
   - This file is located in your project folder at `cloudflare/worker.js`.
   - It includes **Magic Byte Detection** to fix "sent but not received" image issues.
4. Save and Deploy.

## 2. Configure Worker Environment Variables
In the Cloudflare Worker settings (Settings > Variables), add these variables:

- `CLOUD_API_ACCESS_TOKEN`: Your WhatsApp Cloud API Token.
- `WA_PHONE_NUMBER_ID`: Your WhatsApp Phone Number ID.
- `WORKER_AUTH_TOKEN`: A secure random string (e.g., "my-secret-token-123").

**CRITICAL TROUBLESHOOTING:**
If you see "Server Error: WORKER_AUTH_TOKEN not set", it means the variable is NOT saved in the Worker environment.

1. Go to **Cloudflare Dashboard** > **Workers & Pages**.
2. Click on your Worker name.
3. Click **Settings** tab (top bar).
4. Click **Variables** (left sidebar).
5. Under **Environment Variables**, click **Edit Variables**.
6. Ensure `WORKER_AUTH_TOKEN` is listed there.
7. **IMPORTANT**: Click **Deploy** or **Save** if prompted. Variables do not apply until saved/deployed.

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

## 5. Troubleshooting "Sent but not received"
If the logs say "Sent successfully" but you don't receive the message:

1. **Check the Debug Text**: The updated worker sends a text message "[System] Processing media files..." before the image.
   - If you receive the text but NOT the image: The image file is likely corrupted or has a MIME type mismatch (e.g., a PNG saved as .jpg).
   - **FIXED IN LATEST VERSION**: The worker now automatically detects the *real* file type (Magic Bytes) and corrects it before sending.

2. **REDEPLOY THE WORKER (CRITICAL)**:
   - We have updated the worker code to include **Magic Byte Detection**.
   - This fixes issues where WhatsApp silently drops images because the file extension doesn't match the actual content (e.g., PNG vs JPG).
   - Copy the code from `cloudflare/worker.js` again.
   - Paste it into your Cloudflare Worker editor.
   - Click **Deploy**.

3. **Do NOT Send to Yourself**: WhatsApp Business API does **not** allow sending messages to the same number as the business account. You must test with a different phone number.

4. **Check Phone Number Format**: Ensure the number includes the country code but NO `+` sign or leading zeros (e.g., `919876543210` for India).

5. **Check Worker Logs**:
   - Go to Cloudflare Dashboard > Workers > [Your Worker] > Logs > Begin Log Stream.
   - Trigger the action again.
   - Look for "Media Uploaded" followed by "Message Sent!".
   - If you see "Upload failed" or "Send message failed", the error details will be printed there.