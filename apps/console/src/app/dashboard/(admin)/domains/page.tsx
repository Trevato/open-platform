import { redirect } from "next/navigation";
import { getSessionWithRole } from "@/lib/session-role";
import { opApiGet } from "@/lib/op-api";
import { DomainManager } from "@/app/components/domain-manager";

interface Org {
  username: string;
}

interface OrgDomain {
  org: string;
  domain: string | null;
}

export default async function DomainsPage() {
  const result = await getSessionWithRole();
  if (!result || result.role !== "admin") redirect("/dashboard");

  const [domainsInfo, orgs] = await Promise.all([
    opApiGet("/api/v1/orgs/domains"),
    opApiGet("/api/v1/orgs"),
  ]);

  const assignments: OrgDomain[] = await Promise.all(
    orgs.map(async (org: Org) => {
      try {
        return await opApiGet(
          `/api/v1/orgs/${encodeURIComponent(org.username)}/domain`,
        );
      } catch {
        return { org: org.username, domain: null };
      }
    }),
  );

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Domains</h1>
        <p className="text-sm text-muted" style={{ marginTop: 4 }}>
          Assign domains to organizations. Apps in each org will use the
          assigned domain.
        </p>
      </div>
      <DomainManager
        orgs={orgs}
        domainsInfo={domainsInfo}
        initialAssignments={assignments}
      />
    </div>
  );
}
