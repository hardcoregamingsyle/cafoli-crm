try {
  await ctx.runAction(internal.whatsapp.cloudflare.sendFilesViaWorker, {...});
  sentViaCloudflare = true;
} catch (err) {
  logAiError("SEND_PRODUCT_CLOUDFLARE", err, { fallback: true });
}
