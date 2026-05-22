import { z } from "zod";
import { API_SCOPES, type ScopeKey } from "./scopes";
import { getRegistry, type RouteSpec } from "./registry";
import "./specs";

/**
 * Build an OpenAPI 3.1 document derived from the route registry + scope
 * catalogue. The result is the single source of truth for the /developer
 * reference page and any external OpenAPI consumers (e.g. Stoplight, code
 * generators).
 */
export function buildOpenApiDocument(baseUrl: string) {
  const routes = getRegistry();

  const securitySchemes = {
    BearerApiKey: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "tomomai API key (tmk_…)",
      description:
        "Personal API key. Pass via `Authorization: Bearer tmk_…` or " +
        "`x-api-key: tmk_…`.",
    },
    OAuth2: {
      type: "oauth2",
      description: "OAuth 2.1 with mandatory PKCE.",
      flows: {
        authorizationCode: {
          authorizationUrl: `${baseUrl}/api/auth/oauth2/authorize`,
          tokenUrl: `${baseUrl}/api/auth/oauth2/token`,
          refreshUrl: `${baseUrl}/api/auth/oauth2/token`,
          scopes: Object.fromEntries(
            (Object.keys(API_SCOPES) as ScopeKey[]).map((s) => [s, API_SCOPES[s].description]),
          ),
        },
      },
    },
  };

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const openapiPath = route.path; // already in {param} form
    if (!paths[openapiPath]) paths[openapiPath] = {};
    paths[openapiPath][route.method.toLowerCase()] = buildOperation(route);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "tomomai API",
      description:
        "Public HTTP API for tomomai. Authenticate with a personal API key " +
        "or an OAuth 2.1 access token. See the [Developer Center](" +
        baseUrl +
        "/developer) for guides.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl, description: "Primary" }],
    components: {
      securitySchemes,
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
      },
    },
    paths,
  };
}

function buildOperation(route: RouteSpec) {
  const operation: Record<string, unknown> = {
    tags: [route.tag],
    summary: route.summary,
    description: route.description,
    operationId: `${route.method.toLowerCase()}_${route.path
      .replace(/^\/api\/v1\/?/, "")
      .replace(/[/{}]/g, "_")}`,
    deprecated: route.deprecated ?? undefined,
    "x-tomomai-cost": route.cost,
  };

  // Security
  if (route.scope === "public") {
    operation.security = [];
  } else {
    const scopes = Array.isArray(route.scope) ? route.scope : [route.scope];
    operation.security = [
      { BearerApiKey: scopes },
      { OAuth2: scopes },
    ];
  }

  // Parameters
  const parameters: unknown[] = [];
  if (route.params) {
    for (const [name, schema] of paramEntries(route.params)) {
      parameters.push({
        name,
        in: "path",
        required: true,
        description: extractDescription(schema),
        schema: safeJsonSchema(schema),
      });
    }
  }
  if (route.query) {
    for (const [name, schema] of paramEntries(route.query)) {
      parameters.push({
        name,
        in: "query",
        required: !isOptional(schema),
        description: extractDescription(schema),
        schema: safeJsonSchema(schema),
      });
    }
  }
  if (parameters.length) operation.parameters = parameters;

  // Responses
  const responses: Record<string, unknown> = {
    "200": {
      description: "Successful response",
      content: {
        "application/json": {
          schema: safeJsonSchema(route.response),
        },
      },
    },
  };
  if (route.scope !== "public") {
    responses["401"] = errorRef("Missing API key");
    responses["403"] = errorRef("Invalid or expired token, or missing required scope");
  }
  responses["500"] = errorRef("Internal server error");
  operation.responses = responses;

  return operation;
}

function errorRef(description: string) {
  return {
    description,
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/Error" } },
    },
  };
}

function paramEntries(schema: z.ZodTypeAny): [string, z.ZodTypeAny][] {
  // We only ever pass ZodObjects for params/query. Other shapes fall through.
  const obj = schema as unknown as { shape?: Record<string, z.ZodTypeAny> };
  if (obj.shape) {
    return Object.entries(obj.shape);
  }
  return [];
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return schema.safeParse(undefined).success;
}

function extractDescription(schema: z.ZodTypeAny): string | undefined {
  return (schema as unknown as { description?: string }).description;
}

function safeJsonSchema(schema: z.ZodTypeAny): unknown {
  try {
    return z.toJSONSchema(schema, { target: "draft-2020-12" });
  } catch {
    return { type: "object" };
  }
}
