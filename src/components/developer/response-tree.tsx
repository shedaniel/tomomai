import { z } from "zod";

interface ResponseTreeProps {
  schema: z.ZodTypeAny;
}

export function ResponseTree({ schema }: ResponseTreeProps) {
  let json: unknown;
  try {
    json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  } catch {
    return <div className="text-sm text-muted-foreground">(unrepresentable)</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4">
      <SchemaNode node={json} depth={0} />
    </div>
  );
}

function SchemaNode({ node, depth, name }: { node: unknown; depth: number; name?: string }) {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  const desc = typeof n.description === "string" ? (n.description as string) : undefined;
  const type = Array.isArray(n.type) ? n.type.join(" | ") : (n.type as string | undefined);

  if (type === "object" && n.properties && typeof n.properties === "object") {
    const props = n.properties as Record<string, Record<string, unknown>>;
    const required = (Array.isArray(n.required) ? n.required : []) as string[];
    return (
      <div className="font-mono text-xs">
        {name ? (
          <div className="text-foreground">
            {name}
            <span className="text-muted-foreground"> : object</span>
            {desc ? <span className="ml-2 text-muted-foreground">— {desc}</span> : null}
          </div>
        ) : null}
        <div className={name ? "border-l border-border pl-3 mt-1" : ""}>
          {Object.entries(props).map(([k, v]) => (
            <div key={k} className="mb-1">
              <SchemaNode
                node={v}
                depth={depth + 1}
                name={`${k}${required.includes(k) ? "" : "?"}`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "array" && n.items) {
    return (
      <div className="font-mono text-xs">
        <div className="text-foreground">
          {name}
          <span className="text-muted-foreground"> : array of</span>
          {desc ? <span className="ml-2 text-muted-foreground">— {desc}</span> : null}
        </div>
        <div className="border-l border-border pl-3 mt-1">
          <SchemaNode node={n.items} depth={depth + 1} />
        </div>
      </div>
    );
  }

  // anyOf / oneOf (e.g. recent play union)
  const union = (n.anyOf ?? n.oneOf) as unknown[] | undefined;
  if (union) {
    return (
      <div className="font-mono text-xs">
        <div className="text-foreground">
          {name}
          <span className="text-muted-foreground"> : one of</span>
          {desc ? <span className="ml-2 text-muted-foreground">— {desc}</span> : null}
        </div>
        <div className="border-l border-border pl-3 mt-1 space-y-2">
          {union.map((u, i) => (
            <div key={i}>
              <div className="text-muted-foreground">— variant {i + 1}:</div>
              <SchemaNode node={u} depth={depth + 1} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (Array.isArray(n.enum)) {
    return (
      <div className="font-mono text-xs">
        {name}
        <span className="text-muted-foreground">
          {" "}: {(n.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ")}
        </span>
        {desc ? <span className="ml-2 text-muted-foreground">— {desc}</span> : null}
      </div>
    );
  }

  return (
    <div className="font-mono text-xs">
      {name}
      <span className="text-muted-foreground"> : {type ?? "any"}</span>
      {desc ? <span className="ml-2 text-muted-foreground">— {desc}</span> : null}
    </div>
  );
}
