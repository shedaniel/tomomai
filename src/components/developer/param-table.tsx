import { z } from "zod";

interface ParamTableProps {
  schema: z.ZodTypeAny | undefined;
  /** Which kind of params these are — affects column labels. */
  kind: "query" | "path";
}

interface Row {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export function ParamTable({ schema, kind }: ParamTableProps) {
  if (!schema) return null;
  const rows = paramRows(schema);
  if (!rows.length) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{kind === "path" ? "Path param" : "Query param"}</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Required</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-border align-top">
              <td className="px-3 py-2">
                <code className="font-mono text-xs">{row.name}</code>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                <code className="font-mono text-xs">{row.type}</code>
              </td>
              <td className="px-3 py-2">
                {row.required ? (
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    Required
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">Optional</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function paramRows(schema: z.ZodTypeAny): Row[] {
  const obj = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (!obj) return [];
  return Object.entries(obj).map(([name, sub]) => ({
    name,
    type: describeType(sub),
    required: !sub.safeParse(undefined).success,
    description: (sub as unknown as { description?: string }).description,
  }));
}

function describeType(schema: z.ZodTypeAny): string {
  try {
    const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
    if (Array.isArray(json.enum)) {
      return (json.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
    }
    if (typeof json.type === "string") return json.type;
    if (Array.isArray(json.type)) return json.type.join(" | ");
    if (json.anyOf) return "any";
    return "any";
  } catch {
    return "any";
  }
}
