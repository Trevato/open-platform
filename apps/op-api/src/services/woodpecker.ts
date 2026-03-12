import type { WoodpeckerPipeline, WoodpeckerRepo } from "./types.js";

const WOODPECKER_URL =
  process.env.WOODPECKER_INTERNAL_URL ||
  "http://woodpecker-server.woodpecker.svc:80";
const ADMIN_TOKEN = process.env.WOODPECKER_ADMIN_TOKEN || "";

export class WoodpeckerClient {
  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${WOODPECKER_URL}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Woodpecker API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async lookupRepo(fullName: string): Promise<WoodpeckerRepo | null> {
    try {
      return await this.fetchJSON(
        `/api/repos/lookup/${encodeURIComponent(fullName)}`,
      );
    } catch {
      return null;
    }
  }

  async listPipelines(
    repoId: number,
    page: number = 1,
  ): Promise<WoodpeckerPipeline[]> {
    return this.fetchJSON(`/api/repos/${repoId}/pipelines?page=${page}`);
  }

  async getPipeline(
    repoId: number,
    pipelineNumber: number,
  ): Promise<WoodpeckerPipeline> {
    return this.fetchJSON(
      `/api/repos/${repoId}/pipelines/${pipelineNumber}`,
    );
  }

  async triggerPipeline(
    repoId: number,
    branch: string = "main",
  ): Promise<WoodpeckerPipeline> {
    return this.fetchJSON(`/api/repos/${repoId}/pipelines`, {
      method: "POST",
      body: JSON.stringify({ branch }),
    });
  }

  async getPipelineLogs(
    repoId: number,
    pipelineNumber: number,
    stepId: number,
  ): Promise<string> {
    const res = await fetch(
      `${WOODPECKER_URL}/api/repos/${repoId}/logs/${pipelineNumber}/${stepId}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Woodpecker logs ${res.status}`);
    const lines = (await res.json()) as Array<{ data: string }>;
    return lines.map((l) => l.data).join("\n");
  }
}
