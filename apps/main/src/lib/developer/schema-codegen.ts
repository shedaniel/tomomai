/**
 * Turns the JSON Schema that `z.toJSONSchema` emits for a response into TypeScript and Zod source for the
 * developer portal, so readers can paste types that match exactly what the server validates.
 */

type Schema = Record<string, unknown>;

const INDENT = "  ";

function asSchema(value: unknown): Schema | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Schema) : null;
}

function refName(ref: string): string {
  return ref.split("/").pop() ?? "Unknown";
}

function isValidIdentifier(key: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(key);
}

function propKey(key: string): string {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

function docComment(description: unknown, indent: string): string {
  if (typeof description !== "string" || !description) return "";
  return `${indent}/** ${description.replace(/\*\//g, "*\\/")} */\n`;
}

/** Splits `anyOf`/`oneOf` into its members, separating a `null` member so callers can render nullability. */
function unionMembers(schema: Schema): { members: Schema[]; nullable: boolean } | null {
  const list = (schema.anyOf ?? schema.oneOf) as unknown[] | undefined;
  if (!Array.isArray(list)) return null;
  const members = list.map(asSchema).filter((s): s is Schema => !!s);
  const nonNull = members.filter((m) => m.type !== "null");
  return { members: nonNull, nullable: nonNull.length !== members.length };
}

// ── TypeScript ────────────────────────────────────────────────────────────────

/** Whether `tsType` renders this as a top-level union, which needs parentheses before `[]`. */
function rendersAsUnion(schema: Schema): boolean {
  if (typeof schema.$ref === "string" || "const" in schema) return false;
  if (Array.isArray(schema.enum)) return schema.enum.length > 1;
  const union = unionMembers(schema);
  if (union) return union.members.length + (union.nullable ? 1 : 0) > 1;
  return Array.isArray(schema.type) && schema.type.length > 1;
}

function tsType(schema: Schema, depth: number): string {
  if (typeof schema.$ref === "string") return refName(schema.$ref);
  if ("const" in schema) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");

  const union = unionMembers(schema);
  if (union) {
    const parts = union.members.map((m) => tsType(m, depth));
    if (union.nullable) parts.push("null");
    return parts.join(" | ") || "unknown";
  }

  if (Array.isArray(schema.type)) {
    return schema.type.map((t) => tsType({ ...schema, type: t }, depth)).join(" | ");
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const items = asSchema(schema.items);
      if (!items) return "unknown[]";
      const inner = tsType(items, depth);
      return rendersAsUnion(items) ? `(${inner})[]` : `${inner}[]`;
    }
    case "object":
      return tsObject(schema, depth);
    default:
      return "unknown";
  }
}

function tsObject(schema: Schema, depth: number): string {
  const props = asSchema(schema.properties);
  const extra = asSchema(schema.additionalProperties);
  if (!props || Object.keys(props).length === 0) {
    return extra ? `Record<string, ${tsType(extra, depth)}>` : "Record<string, unknown>";
  }
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const pad = INDENT.repeat(depth + 1);
  const lines = Object.entries(props).map(([key, value]) => {
    const child = asSchema(value) ?? {};
    const optional = required.has(key) ? "" : "?";
    return `${docComment(child.description, pad)}${pad}${propKey(key)}${optional}: ${tsType(child, depth + 1)};`;
  });
  return `{\n${lines.join("\n")}\n${INDENT.repeat(depth)}}`;
}

export function toTypeScript(schema: Schema, name: string): string {
  const defs = asSchema(schema.$defs) ?? {};
  const decls = Object.entries(defs).map(([defName, def]) => {
    const s = asSchema(def) ?? {};
    return `${docComment(s.description, "")}export type ${defName} = ${tsType(s, 0)};`;
  });
  const root =
    schema.type === "object" && asSchema(schema.properties)
      ? `${docComment(schema.description, "")}export interface ${name} ${tsObject(schema, 0)}`
      : `${docComment(schema.description, "")}export type ${name} = ${tsType(schema, 0)};`;
  return [...decls, root].join("\n\n");
}

// ── Zod ───────────────────────────────────────────────────────────────────────

function zodType(schema: Schema, depth: number): string {
  if (typeof schema.$ref === "string") return refName(schema.$ref);
  if ("const" in schema) return `z.literal(${JSON.stringify(schema.const)})`;
  if (Array.isArray(schema.enum)) {
    const values = schema.enum;
    return values.every((v) => typeof v === "string")
      ? `z.enum([${values.map((v) => JSON.stringify(v)).join(", ")}])`
      : `z.union([${values.map((v) => `z.literal(${JSON.stringify(v)})`).join(", ")}])`;
  }

  const union = unionMembers(schema);
  if (union) {
    const parts = union.members.map((m) => zodType(m, depth));
    const base = parts.length === 1 ? parts[0] : parts.length === 0 ? "z.unknown()" : `z.union([${parts.join(", ")}])`;
    return union.nullable ? `${base}.nullable()` : base;
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type as string[];
    const nonNull = types.filter((t) => t !== "null");
    const parts = nonNull.map((t) => zodType({ ...schema, type: t }, depth));
    const base = parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`;
    return types.includes("null") ? `${base}.nullable()` : base;
  }

  switch (schema.type) {
    case "string":
      return schema.format === "date-time" ? "z.iso.datetime()" : "z.string()";
    case "number":
      return "z.number()";
    case "integer":
      return "z.int()";
    case "boolean":
      return "z.boolean()";
    case "null":
      return "z.null()";
    case "array": {
      const items = asSchema(schema.items);
      return `z.array(${items ? zodType(items, depth) : "z.unknown()"})`;
    }
    case "object":
      return zodObject(schema, depth);
    default:
      return "z.unknown()";
  }
}

function zodObject(schema: Schema, depth: number): string {
  const props = asSchema(schema.properties);
  const extra = asSchema(schema.additionalProperties);
  if (!props || Object.keys(props).length === 0) {
    return `z.record(z.string(), ${extra ? zodType(extra, depth) : "z.unknown()"})`;
  }
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const pad = INDENT.repeat(depth + 1);
  const lines = Object.entries(props).map(([key, value]) => {
    const child = asSchema(value) ?? {};
    const optional = required.has(key) ? "" : ".optional()";
    return `${docComment(child.description, pad)}${pad}${propKey(key)}: ${zodType(child, depth + 1)}${optional},`;
  });
  return `z.object({\n${lines.join("\n")}\n${INDENT.repeat(depth)}})`;
}

export function toZod(schema: Schema, name: string): string {
  const defs = asSchema(schema.$defs) ?? {};
  const decls = Object.entries(defs).map(([defName, def]) => {
    const s = asSchema(def) ?? {};
    return `${docComment(s.description, "")}export const ${defName} = ${zodType(s, 0)};`;
  });
  const root = `${docComment(schema.description, "")}export const ${name} = ${zodType(schema, 0)};`;
  return [`import { z } from "zod";`, ...decls, root, `export type ${name} = z.infer<typeof ${name}>;`].join("\n\n");
}

/** `get-me-scopes` becomes `GetMeScopesResponse`. */
export function responseTypeName(slug: string): string {
  const pascal = slug
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return `${pascal}Response`;
}
