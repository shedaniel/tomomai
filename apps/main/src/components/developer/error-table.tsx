import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tomomai/ui";
import type { RouteErrorResponse } from "@/lib/api/registry";

export function ErrorTable({ errors }: { errors: readonly RouteErrorResponse[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Meaning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {errors.map((error) => (
            <TableRow key={error.code} className="align-top">
              <TableCell>
                <code className="font-mono text-xs">{error.status}</code>
              </TableCell>
              <TableCell>
                <code className="font-mono text-xs">{error.code}</code>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {error.description}
                {error.retryAfter ? " The response carries Retry-After." : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
