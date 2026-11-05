import type { z } from "zod";
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomomai/ui";
import { parameterDocs, type ParameterDoc } from "@/lib/api/openapi";

interface ParamTableProps {
  schema: z.ZodObject | undefined;
  kind: ParameterDoc["in"];
}

export function ParamTable({ schema, kind }: ParamTableProps) {
  const rows = parameterDocs(schema, kind);
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
                <code className="font-mono text-xs">{typeLabel(row.schema)}</code>
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

function typeLabel(schema: ParameterDoc["schema"]): string {
  if (Array.isArray(schema.enum)) return schema.enum.map(value => JSON.stringify(value)).join(" | ");
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return "any";
}
