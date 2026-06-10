import type { Instrumentation } from 'next'

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
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger, flushLogger } = await import('./src/lib/logger')
  // Next types headers as string | string[]; collapse to a single value.
  const rawRequestId = request.headers['x-request-id']
  const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId
  logger.error(
    {
      err: error,
      requestId,
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    'Unhandled request error',
  )
  await flushLogger()
}
