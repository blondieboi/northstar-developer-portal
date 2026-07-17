export function trackPortalEvent(
  eventType: string,
  detail: {
    path?: string;
    entityKind?: string;
    entityKey?: string;
    properties?: Record<string, unknown>;
  } = {},
) {
  const body = JSON.stringify({ eventType, ...detail });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/events",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }
  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
