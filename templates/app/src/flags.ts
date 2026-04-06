import { flag, dedupe } from "flags/next";
import { auth } from "@/auth";
import { getUserOrgs } from "@/lib/forgejo-orgs";
import type { ForgejoOrgMembership } from "@/lib/forgejo-orgs";

export interface FlagEntities {
  user: { id: string; name: string } | null;
  orgs: ForgejoOrgMembership[];
  environment: string;
}

/** Resolve identity once per request via dedupe. */
const identify = dedupe(
  async ({ headers }: { headers: Headers }): Promise<FlagEntities> => {
    const session = await auth.api.getSession({ headers });
    const env = process.env.DEPLOY_ENV || "development";

    if (!session?.user) {
      return { user: null, orgs: [], environment: env };
    }

    const orgs = await getUserOrgs(session.user.id);
    return {
      user: { id: session.user.id, name: session.user.name },
      orgs,
      environment: env,
    };
  },
);

/** Example flag: enabled in non-production environments. Safe to delete. */
export const exampleFeature = flag<boolean, FlagEntities>({
  key: "example-feature",
  description: "Example feature flag -- safe to delete",
  options: [
    { value: true, label: "Enabled" },
    { value: false, label: "Disabled" },
  ],
  identify,
  decide({ entities }) {
    if (!entities) return false;
    return entities.environment !== "production";
  },
  defaultValue: false,
});
