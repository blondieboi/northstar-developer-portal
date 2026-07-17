import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  raw: Buffer,
  signature: string,
  secret: string,
) {
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  return Boolean(
    signature &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected)),
  );
}
export function metadataChanged(payload: any, paths: string[]) {
  const changed = [
    ...(payload.commits || []).flatMap((commit: any) => [
      ...(commit.added || []),
      ...(commit.modified || []),
      ...(commit.removed || []),
    ]),
  ];
  return changed.some((path: string) => paths.includes(path));
}
const pluginEvents = new Set([
  "workflow_run",
  "pull_request",
  "deployment",
  "deployment_status",
  "issues",
  "release",
  "push",
]);
export const pluginRefreshRequested = (event: string, repository?: string) =>
  pluginEvents.has(event) && Boolean(repository);
