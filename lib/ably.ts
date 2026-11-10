import { roomChannel } from "./ablyAuth";
export { roomChannel, selChannel } from "./ablyAuth";

let rest: any;

/** Server-side Ably client (declared as a "server" so it is not counted as a user on MAU plans). Loaded lazily. */
export async function ablyRest() {
  if (!rest) {
    const key = (process.env.ABLY_API_KEY || "").trim();
    if (!key) throw new Error("ABLY_API_KEY is not set");
    const { createHttpClient } = await import("@ably/pubsub-server");
    rest = createHttpClient({ key });
  }
  return rest;
}

export async function publish(code: string, name: string, data: unknown) {
  try {
    await (await ablyRest()).channels.get(roomChannel(code)).publish(name, data);
  } catch (e) {
    console.error("[ably] publish failed", e);
  }
}
export const publishSync = (code: string) => publish(code, "sync", { t: Date.now() });
