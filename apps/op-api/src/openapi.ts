import type { OpenAPIV3 } from "openapi-types";

const bearerAuth: OpenAPIV3.SecuritySchemeObject = {
  type: "http",
  scheme: "bearer",
  description: "Forgejo personal access token",
};

const ref = (name: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

const arrayOf = (name: string): OpenAPIV3.SchemaObject => ({
  type: "array",
  items: ref(name),
});

const errorResponse: OpenAPIV3.ResponseObject = {
  description: "Error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
};

export const spec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Open Platform API",
    version: "1.0.0",
    description:
      "REST and MCP interface for repos, pipelines, apps, and platform services. Authenticates via Forgejo bearer tokens.",
  },
  servers: [{ url: "/" }],
  security: [{ bearer: [] }],
  components: {
    securitySchemes: { bearer: bearerAuth },
    schemas: {
      ForgejoOrg: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          full_name: { type: "string" },
          description: { type: "string" },
          avatar_url: { type: "string" },
          visibility: { type: "string" },
        },
      },
      ForgejoRepo: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          full_name: { type: "string" },
          description: { type: "string" },
          owner: {
            type: "object",
            properties: {
              login: { type: "string" },
              id: { type: "integer" },
            },
          },
          html_url: { type: "string" },
          clone_url: { type: "string" },
          template: { type: "boolean" },
          default_branch: { type: "string" },
          updated_at: { type: "string" },
          stars_count: { type: "integer" },
          forks_count: { type: "integer" },
          open_issues_count: { type: "integer" },
        },
      },
      ForgejoPR: {
        type: "object",
        properties: {
          id: { type: "integer" },
          number: { type: "integer" },
          title: { type: "string" },
          body: { type: "string" },
          state: { type: "string" },
          user: {
            type: "object",
            properties: {
              login: { type: "string" },
              avatar_url: { type: "string" },
            },
          },
          head: {
            type: "object",
            properties: {
              ref: { type: "string" },
              label: { type: "string" },
            },
          },
          base: {
            type: "object",
            properties: {
              ref: { type: "string" },
              label: { type: "string" },
            },
          },
          html_url: { type: "string" },
          mergeable: { type: "boolean" },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
      ForgejoComment: {
        type: "object",
        properties: {
          id: { type: "integer" },
          body: { type: "string" },
          user: {
            type: "object",
            properties: { login: { type: "string" } },
          },
          created_at: { type: "string" },
        },
      },
      WoodpeckerPipeline: {
        type: "object",
        properties: {
          id: { type: "integer" },
          number: { type: "integer" },
          status: {
            type: "string",
            enum: [
              "pending",
              "running",
              "success",
              "failure",
              "error",
              "killed",
            ],
          },
          event: { type: "string" },
          branch: { type: "string" },
          message: { type: "string" },
          author: { type: "string" },
          started: { type: "integer" },
          finished: { type: "integer" },
          created: { type: "integer" },
        },
      },
      AppInfo: {
        type: "object",
        properties: {
          org: { type: "string" },
          repo: { type: "string" },
          namespace: { type: "string" },
          status: {
            type: "string",
            enum: ["running", "degraded", "stopped"],
          },
          replicas: {
            type: "object",
            properties: {
              ready: { type: "integer" },
              desired: { type: "integer" },
            },
          },
          url: { type: "string" },
        },
      },
      ServiceStatus: {
        type: "object",
        properties: {
          name: { type: "string" },
          namespace: { type: "string" },
          ready: { type: "boolean" },
          replicas: {
            type: "object",
            properties: {
              ready: { type: "integer" },
              total: { type: "integer" },
            },
          },
          url: { type: "string" },
        },
      },
      UserProfile: {
        type: "object",
        properties: {
          id: { type: "integer" },
          login: { type: "string" },
          email: { type: "string" },
          fullName: { type: "string" },
          isAdmin: { type: "boolean" },
          avatarUrl: { type: "string" },
        },
      },
      ForgejoBranch: {
        type: "object",
        properties: {
          name: { type: "string" },
          commit: {
            type: "object",
            properties: {
              id: { type: "string" },
              message: { type: "string" },
              author: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                },
              },
              timestamp: { type: "string" },
            },
          },
          protected: { type: "boolean" },
        },
      },
      ForgejoFileContent: {
        type: "object",
        properties: {
          name: { type: "string" },
          path: { type: "string" },
          sha: { type: "string" },
          size: { type: "integer" },
          content: { type: "string", description: "Decoded file content" },
        },
      },
      ForgejoLabel: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          color: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
        },
      },
      ForgejoMilestone: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          description: { type: "string" },
          state: { type: "string", enum: ["open", "closed"] },
          open_issues: { type: "integer" },
          closed_issues: { type: "integer" },
          due_on: { type: "string", nullable: true },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
      ForgejoIssue: {
        type: "object",
        properties: {
          id: { type: "integer" },
          number: { type: "integer" },
          title: { type: "string" },
          body: { type: "string" },
          state: { type: "string", enum: ["open", "closed"] },
          user: {
            type: "object",
            properties: {
              login: { type: "string" },
              avatar_url: { type: "string" },
            },
          },
          labels: arrayOf("ForgejoLabel"),
          milestone: {
            ...ref("ForgejoMilestone"),
            nullable: true,
          } as OpenAPIV3.SchemaObject,
          assignees: {
            type: "array",
            items: {
              type: "object",
              properties: { login: { type: "string" } },
            },
          },
          html_url: { type: "string" },
          created_at: { type: "string" },
          updated_at: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/healthz": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },

    // ── Status ──────────────────────────────────────────────────────
    "/api/v1/status": {
      get: {
        tags: ["Status"],
        summary: "Platform status",
        description:
          "Aggregates Kubernetes readiness for platform services and workload apps.",
        responses: {
          "200": {
            description: "Platform status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    healthy: { type: "boolean" },
                    services: arrayOf("ServiceStatus"),
                    apps: arrayOf("AppInfo"),
                  },
                },
              },
            },
          },
          "500": errorResponse,
        },
      },
    },

    // ── Users ───────────────────────────────────────────────────────
    "/api/v1/users/me": {
      get: {
        tags: ["Users"],
        summary: "Current user profile",
        responses: {
          "200": {
            description: "User profile",
            content: { "application/json": { schema: ref("UserProfile") } },
          },
        },
      },
    },

    // ── Orgs ────────────────────────────────────────────────────────
    "/api/v1/orgs": {
      get: {
        tags: ["Orgs"],
        summary: "List orgs",
        responses: {
          "200": {
            description: "Orgs list",
            content: {
              "application/json": { schema: arrayOf("ForgejoOrg") },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Orgs"],
        summary: "Create org (admin only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: ref("ForgejoOrg") } },
          },
          "403": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── Repos ───────────────────────────────────────────────────────
    "/api/v1/repos/{org}": {
      get: {
        tags: ["Repos"],
        summary: "List repos in org",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Repo list",
            content: {
              "application/json": { schema: arrayOf("ForgejoRepo") },
            },
          },
          "404": errorResponse,
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Repos"],
        summary: "Create repo",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  private: { type: "boolean", default: true },
                  auto_init: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: ref("ForgejoRepo") } },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/repos/{org}/{repo}": {
      get: {
        tags: ["Repos"],
        summary: "Get repo",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Repo detail",
            content: { "application/json": { schema: ref("ForgejoRepo") } },
          },
          "404": errorResponse,
          "500": errorResponse,
        },
      },
      delete: {
        tags: ["Repos"],
        summary: "Delete repo",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { deleted: { type: "boolean" } },
                },
              },
            },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/repos/{org}/{repo}/generate": {
      post: {
        tags: ["Repos"],
        summary: "Generate repo from template",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Template owner org",
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Template repo name",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: ref("ForgejoRepo") } },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── Pull Requests ───────────────────────────────────────────────
    "/api/v1/prs/{org}/{repo}": {
      get: {
        tags: ["Pull Requests"],
        summary: "List PRs",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "state",
            in: "query",
            schema: {
              type: "string",
              enum: ["open", "closed", "all"],
              default: "open",
            },
          },
        ],
        responses: {
          "200": {
            description: "PR list",
            content: {
              "application/json": { schema: arrayOf("ForgejoPR") },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Pull Requests"],
        summary: "Create PR",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "head"],
                properties: {
                  title: { type: "string" },
                  head: { type: "string", description: "Source branch" },
                  body: { type: "string" },
                  base: { type: "string", default: "main" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema: ref("ForgejoPR") } },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/v1/prs/{org}/{repo}/{number}/merge": {
      post: {
        tags: ["Pull Requests"],
        summary: "Merge PR",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  method: {
                    type: "string",
                    enum: ["merge", "rebase", "squash", "fast-forward-only"],
                    default: "merge",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Merged",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { merged: { type: "boolean" } },
                },
              },
            },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/prs/{org}/{repo}/{number}/approve": {
      post: {
        tags: ["Pull Requests"],
        summary: "Approve PR",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  body: {
                    type: "string",
                    description: "Optional review comment",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Approved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { approved: { type: "boolean" } },
                },
              },
            },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/prs/{org}/{repo}/{number}/comments": {
      get: {
        tags: ["Pull Requests"],
        summary: "List PR comments",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "Comments",
            content: {
              "application/json": { schema: arrayOf("ForgejoComment") },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Pull Requests"],
        summary: "Comment on PR",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: { body: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: ref("ForgejoComment") },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── Pipelines ───────────────────────────────────────────────────
    "/api/v1/pipelines/{org}/{repo}": {
      get: {
        tags: ["Pipelines"],
        summary: "List pipelines",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Pipeline list",
            content: {
              "application/json": {
                schema: arrayOf("WoodpeckerPipeline"),
              },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Pipelines"],
        summary: "Trigger pipeline",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  branch: { type: "string", default: "main" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Triggered",
            content: {
              "application/json": {
                schema: ref("WoodpeckerPipeline"),
              },
            },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/pipelines/{org}/{repo}/{id}": {
      get: {
        tags: ["Pipelines"],
        summary: "Get pipeline",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Pipeline number",
          },
        ],
        responses: {
          "200": {
            description: "Pipeline detail",
            content: {
              "application/json": {
                schema: ref("WoodpeckerPipeline"),
              },
            },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/pipelines/{org}/{repo}/{id}/logs": {
      get: {
        tags: ["Pipelines"],
        summary: "Get pipeline step logs",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Pipeline number",
          },
          {
            name: "step",
            in: "query",
            schema: { type: "integer", default: 2 },
            description: "Step position (PIDs start at 2; 1 is the workflow container)",
          },
        ],
        responses: {
          "200": {
            description: "Logs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { logs: { type: "string" } },
                },
              },
            },
          },
          "500": errorResponse,
        },
      },
    },

    // ── Apps ────────────────────────────────────────────────────────
    "/api/v1/apps": {
      get: {
        tags: ["Apps"],
        summary: "List deployed apps",
        responses: {
          "200": {
            description: "App list",
            content: { "application/json": { schema: arrayOf("AppInfo") } },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/apps/{org}/{repo}": {
      get: {
        tags: ["Apps"],
        summary: "Get app status",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "App detail",
            content: { "application/json": { schema: ref("AppInfo") } },
          },
          "404": errorResponse,
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Apps"],
        summary: "Deploy app (trigger pipeline)",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  branch: { type: "string", default: "main" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Pipeline triggered",
            content: {
              "application/json": {
                schema: ref("WoodpeckerPipeline"),
              },
            },
          },
          "404": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── Branches ────────────────────────────────────────────────────
    "/api/v1/branches/{org}/{repo}": {
      get: {
        tags: ["Branches"],
        summary: "List branches",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Branch list",
            content: {
              "application/json": { schema: arrayOf("ForgejoBranch") },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Branches"],
        summary: "Create branch",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", description: "New branch name" },
                  from: {
                    type: "string",
                    default: "main",
                    description: "Base branch",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: ref("ForgejoBranch") },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/v1/branches/{org}/{repo}/{name}": {
      delete: {
        tags: ["Branches"],
        summary: "Delete branch",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "name",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { deleted: { type: "boolean" } },
                },
              },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── Files ──────────────────────────────────────────────────────
    "/api/v1/files/{org}/{repo}/{path}": {
      get: {
        tags: ["Files"],
        summary: "Get file content",
        description: "Read a file from the repository. Returns decoded UTF-8 content.",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "File path (e.g. src/index.ts)",
          },
          {
            name: "ref",
            in: "query",
            schema: { type: "string" },
            description: "Branch, tag, or commit SHA",
          },
        ],
        responses: {
          "200": {
            description: "File content",
            content: {
              "application/json": { schema: ref("ForgejoFileContent") },
            },
          },
          "500": errorResponse,
        },
      },
      put: {
        tags: ["Files"],
        summary: "Create or update file",
        description:
          "Write a file via the contents API (creates a direct commit). Provide SHA to update existing files.",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content", "message"],
                properties: {
                  content: {
                    type: "string",
                    description: "Plain text file content",
                  },
                  message: { type: "string", description: "Commit message" },
                  branch: { type: "string", description: "Target branch" },
                  sha: {
                    type: "string",
                    description: "Current file SHA (for updates)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "File committed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: {
                      type: "object",
                      properties: {
                        path: { type: "string" },
                        sha: { type: "string" },
                      },
                    },
                    commit: {
                      type: "object",
                      properties: {
                        sha: { type: "string" },
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── Issues ──────────────────────────────────────────────────────
    "/api/v1/issues/{org}/{repo}": {
      get: {
        tags: ["Issues"],
        summary: "List issues",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "state",
            in: "query",
            schema: {
              type: "string",
              enum: ["open", "closed", "all"],
              default: "open",
            },
          },
          {
            name: "labels",
            in: "query",
            schema: { type: "string" },
            description: "Comma-separated label names",
          },
          {
            name: "milestone",
            in: "query",
            schema: { type: "string" },
            description: "Milestone name",
          },
          {
            name: "assignee",
            in: "query",
            schema: { type: "string" },
            description: "Assignee username",
          },
        ],
        responses: {
          "200": {
            description: "Issue list",
            content: {
              "application/json": { schema: arrayOf("ForgejoIssue") },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Issues"],
        summary: "Create issue",
        description:
          "Create an issue with optional labels (by ID), milestone (by ID), and assignees in one call.",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                  labels: {
                    type: "array",
                    items: { type: "integer" },
                    description: "Label IDs",
                  },
                  milestone: {
                    type: "integer",
                    description: "Milestone ID",
                  },
                  assignees: {
                    type: "array",
                    items: { type: "string" },
                    description: "Usernames",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: ref("ForgejoIssue") },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/v1/issues/{org}/{repo}/{number}": {
      patch: {
        tags: ["Issues"],
        summary: "Update issue",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                  state: {
                    type: "string",
                    enum: ["open", "closed"],
                  },
                  labels: {
                    type: "array",
                    items: { type: "integer" },
                  },
                  milestone: { type: "integer" },
                  assignees: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated",
            content: {
              "application/json": { schema: ref("ForgejoIssue") },
            },
          },
          "500": errorResponse,
        },
      },
    },
    "/api/v1/issues/{org}/{repo}/{number}/comments": {
      post: {
        tags: ["Issues"],
        summary: "Comment on issue",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "number",
            in: "path",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: { body: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: ref("ForgejoComment") },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/v1/issues/{org}/{repo}/labels": {
      get: {
        tags: ["Issues"],
        summary: "List labels",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Label list",
            content: {
              "application/json": { schema: arrayOf("ForgejoLabel") },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Issues"],
        summary: "Create label",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "color"],
                properties: {
                  name: { type: "string" },
                  color: {
                    type: "string",
                    description: "Hex color (e.g. '#e11d48')",
                  },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: ref("ForgejoLabel") },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },
    "/api/v1/issues/{org}/{repo}/milestones": {
      get: {
        tags: ["Issues"],
        summary: "List milestones",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "state",
            in: "query",
            schema: {
              type: "string",
              enum: ["open", "closed", "all"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Milestone list",
            content: {
              "application/json": {
                schema: arrayOf("ForgejoMilestone"),
              },
            },
          },
          "500": errorResponse,
        },
      },
      post: {
        tags: ["Issues"],
        summary: "Create milestone",
        parameters: [
          {
            name: "org",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  due_on: {
                    type: "string",
                    description:
                      "Due date (YYYY-MM-DD or full ISO 8601 datetime)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": { schema: ref("ForgejoMilestone") },
            },
          },
          "400": errorResponse,
          "500": errorResponse,
        },
      },
    },

    // ── MCP ─────────────────────────────────────────────────────────
    "/mcp": {
      post: {
        tags: ["MCP"],
        summary: "MCP JSON-RPC endpoint",
        description:
          "Streamable HTTP transport for Model Context Protocol. Send an InitializeRequest without mcp-session-id to start a session.",
        parameters: [
          {
            name: "mcp-session-id",
            in: "header",
            schema: { type: "string" },
            description: "Session ID (omit to initialize)",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "MCP JSON-RPC request",
              },
            },
          },
        },
        responses: {
          "200": { description: "MCP response" },
          "400": errorResponse,
          "401": errorResponse,
        },
      },
      get: {
        tags: ["MCP"],
        summary: "MCP SSE stream",
        description: "Server-sent events for an active MCP session.",
        parameters: [
          {
            name: "mcp-session-id",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "SSE stream" },
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["MCP"],
        summary: "Close MCP session",
        parameters: [
          {
            name: "mcp-session-id",
            in: "header",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Session closed" },
        },
      },
    },
  },
  tags: [
    { name: "Health", description: "Liveness and readiness" },
    { name: "Status", description: "Platform service status" },
    { name: "Users", description: "User profile" },
    { name: "Orgs", description: "Forgejo organizations" },
    { name: "Repos", description: "Git repositories" },
    { name: "Pull Requests", description: "PRs and code review" },
    { name: "Branches", description: "Git branches" },
    { name: "Files", description: "File contents (read/write via API)" },
    { name: "Issues", description: "Issues, labels, and milestones" },
    { name: "Pipelines", description: "CI/CD pipelines" },
    { name: "Apps", description: "Deployed workload apps" },
    { name: "MCP", description: "Model Context Protocol" },
  ],
};
