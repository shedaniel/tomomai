export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await require('pino')
    await require('next-logger')
  }
}

// Catch-all for unhandled errors thrown by any route handler / server component
// / server action. Routes don't need their own try/catch to get a correlated
// error log: this fires for every uncaught error with the request's x-request-id
// (assigned by middleware), so non-logging routes are still observable in Axiom.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const { logger, flushLogger } = await import('./src/lib/logger')
  logger.error(
    {
      err: error,
      requestId: request.headers['x-request-id'],
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    'Unhandled request error',
  )
  await flushLogger().catch(() => { })
}
