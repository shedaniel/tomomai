/**
 * Uploads the rendered image as the interaction's followup (edits the original
 * deferred response) by PATCHing the Discord webhook with multipart form data:
 * `files[0]` (the image) + `payload_json` (the message body composed by
 * apps/main). Possession of `interactionToken` authorizes the post — no bot
 * token needed. Valid for ~15 minutes after the interaction.
 */
export async function uploadDiscordFollowup(
  applicationId: string,
  interactionToken: string,
  payloadJson: unknown,
  buffer: Buffer,
  filename: string,
): Promise<void> {
  const form = new FormData();
  form.append('files[0]', new Blob([new Uint8Array(buffer)], { type: 'image/webp' }), filename);
  form.append('payload_json', JSON.stringify(payloadJson));

  // Bound the upload so a slow Discord API can't stall the render request. 15s
  // is well within Discord's typical response times and the interaction token's
  // 15-minute validity window.
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    { method: 'PATCH', body: form, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) {
    throw new Error(`Discord followup PATCH failed: ${res.status} ${await res.text()}`);
  }
}
