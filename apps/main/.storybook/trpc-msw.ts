import { http, HttpResponse } from "msw";

/**
 * MSW handler factory for the app's tRPC endpoint.
 *
 * The app's tRPC client uses `httpBatchLink({ url: "/api/trpc", transformer:
 * superjson })` (see src/lib/trpc-client.ts). Batched requests hit
 * `/api/trpc/<proc1>,<proc2>?batch=1&input=...` and expect a JSON array whose
 * entries line up with the requested procedures. With the superjson transformer,
 * each successful entry is shaped `{ result: { data: { json: <value> } } }`.
 *
 * Pass a map of fully-qualified procedure names to the data they should resolve
 * with. Plain JSON-safe fixtures only (no Date/Map/Set) — those need superjson
 * `meta` which this helper intentionally omits to stay simple.
 *
 * Usage in a story:
 *   parameters: {
 *     msw: { handlers: [mockTrpc({ "user.getStats": { plays: 1234 } })] },
 *   }
 */
export function mockTrpc(
  mocks: Record<string, unknown>,
  { baseUrl = "*/api/trpc" }: { baseUrl?: string } = {},
) {
  return http.all(`${baseUrl}/:procs`, ({ params }) => {
    const procs = String(params.procs).split(",");
    const body = procs.map((proc) => {
      if (proc in mocks) {
        return { result: { data: { json: mocks[proc] } } };
      }
      return {
        error: {
          json: {
            message: `[trpc-msw] No mock provided for "${proc}"`,
            code: -32004,
            data: { code: "NOT_FOUND", httpStatus: 404, path: proc },
          },
        },
      };
    });
    return HttpResponse.json(body);
  });
}
