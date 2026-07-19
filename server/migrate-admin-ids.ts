import YAML from "yaml";
import { githubIdsForLogins, migrate, pool } from "./db.js";

const argumentsList = process.argv.slice(2).flatMap((value) => value.split(","));
const legacyEnvironment = (process.env.GITHUB_ADMIN_LOGINS || "").split(",");
const logins = (argumentsList.length ? argumentsList : legacyEnvironment)
  .map((login) => login.trim())
  .filter(Boolean);

if (!logins.length)
  throw new Error(
    "Provide legacy administrator logins as arguments, or set GITHUB_ADMIN_LOGINS for this one-time migration",
  );

await migrate();
try {
  const resolved = await githubIdsForLogins([...new Set(logins)]);
  process.stdout.write(
    YAML.stringify({
      apiVersion: "perongen.dev/v1",
      access: {
        admins: resolved.map(({ githubId }) => githubId).sort((a, b) => a - b),
      },
    }),
  );
} finally {
  await pool?.end();
}
