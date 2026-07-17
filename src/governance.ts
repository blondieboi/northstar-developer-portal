export type RiskLevel = "unclassified" | "low" | "moderate" | "high" | "critical";

const at = (value: unknown, path: string) =>
  path.split(".").reduce<unknown>(
    (current, key) =>
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  );

export function riskProfile(metadata: unknown) {
  const exposure = at(metadata, "spec.risk.exposure");
  const dataSensitivity = at(metadata, "spec.risk.dataSensitivity");
  const authentication = at(metadata, "spec.risk.authentication");
  const lifecycle = at(metadata, "spec.lifecycle");
  const missing = [
    !exposure && "exposure",
    !dataSensitivity && "data sensitivity",
    !authentication && "authentication",
  ].filter(Boolean) as string[];
  if (missing.length)
    return {
      level: "unclassified" as RiskLevel,
      score: null,
      complete: false,
      missing,
      reasons: [`Missing ${missing.join(", ")}`],
      exposure: exposure || null,
      dataSensitivity: dataSensitivity || null,
      authentication: authentication || null,
    };

  let score = 0;
  const reasons: string[] = [];
  if (exposure === "public") {
    score += 2;
    reasons.push("Publicly exposed");
  }
  if (dataSensitivity === "internal") score += 1;
  if (dataSensitivity === "confidential") {
    score += 2;
    reasons.push("Confidential data");
  }
  if (dataSensitivity === "restricted") {
    score += 3;
    reasons.push("Restricted data");
  }
  if (authentication === "none") {
    score += 2;
    reasons.push("No authentication");
  } else if (authentication === "optional") {
    score += 1;
    reasons.push("Authentication is optional");
  }
  if (lifecycle === "production") score += 1;
  const level: RiskLevel =
    exposure === "public" &&
    (authentication === "none" || dataSensitivity === "restricted")
      ? "critical"
      : score >= 6
        ? "critical"
        : score >= 4
          ? "high"
          : score >= 2
            ? "moderate"
            : "low";
  return {
    level,
    score,
    complete: true,
    missing: [],
    reasons: reasons.length ? reasons : ["Internal, authenticated, low-sensitivity use"],
    exposure,
    dataSensitivity,
    authentication,
  };
}

export function experimentStatus(metadata: unknown, now = new Date()) {
  const lifecycle = at(metadata, "spec.lifecycle");
  if (lifecycle !== "experimental")
    return { applicable: false, status: "not-applicable" as const, expiresAt: null, daysRemaining: null };
  const raw = at(metadata, "spec.experiment.expiresAt");
  if (typeof raw !== "string" || !raw)
    return { applicable: true, status: "missing" as const, expiresAt: null, daysRemaining: null };
  const expiresAt = new Date(`${raw}T23:59:59Z`);
  const remainingMs = expiresAt.getTime() - now.getTime();
  const daysRemaining = remainingMs >= 0
    ? Math.ceil(remainingMs / 86_400_000)
    : Math.floor(remainingMs / 86_400_000);
  return {
    applicable: true,
    status: remainingMs < 0 ? ("expired" as const) : daysRemaining <= 14 ? ("due" as const) : ("scheduled" as const),
    expiresAt: raw,
    daysRemaining,
  };
}
