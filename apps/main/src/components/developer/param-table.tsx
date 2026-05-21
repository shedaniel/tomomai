import { z } from "zod";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomomai/ui";

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
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{kind === "path" ? "Path param" : "Query param"}</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Required</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name} className="align-top">
              <TableCell>
                <code className="font-mono text-xs">{row.name}</code>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <code className="font-mono text-xs">{row.type}</code>
              </TableCell>
              <TableCell>
                {row.required ? (
                  <Badge
                    variant="outline"
                    className="border-rose-500/40 bg-rose-500/10 text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-300"
                  >
                    Required
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Optional</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{row.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
