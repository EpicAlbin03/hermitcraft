import { createConnection } from "mysql2/promise"
import { Console, Effect } from "effect"

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function waitForDb() {
  const mysqlUrl = Bun.env.MYSQL_URL

  if (!mysqlUrl) {
    throw new Error("MYSQL_URL is not set")
  }

  const timeoutMs = toNumber(Bun.env.DB_WAIT_TIMEOUT_MS, 30_000)
  const intervalMs = toNumber(Bun.env.DB_WAIT_INTERVAL_MS, 1_000)
  const deadline = Date.now() + timeoutMs

  let attempt = 0

  const checkConnection = Effect.gen(function* () {
    attempt += 1

    const connection = yield* Effect.tryPromise({
      try: () => createConnection({ uri: mysqlUrl, connectTimeout: intervalMs }),
      catch: (error) => new Error(error instanceof Error ? error.message : String(error)),
    })

    yield* Effect.tryPromise({
      try: () => connection.query("SELECT 1"),
      catch: (error) => new Error(error instanceof Error ? error.message : String(error)),
    }).pipe(
      Effect.ensuring(
        Effect.promise(() => connection.end()).pipe(Effect.catchAll(() => Effect.void)),
      ),
    )
  })

  const program = Effect.gen(function* () {
    yield* Console.log(
      `Waiting for MySQL to be ready (timeout: ${timeoutMs}ms, interval: ${intervalMs}ms)...`,
    )

    while (Date.now() < deadline) {
      const result = yield* Effect.either(checkConnection)

      if (result._tag === "Right") {
        yield* Console.log(`MySQL is ready after ${attempt} attempt${attempt === 1 ? "" : "s"}.`)
        return
      }

      yield* Console.log(`MySQL not ready (attempt ${attempt}): ${result.left.message}`)
      yield* Effect.sleep(`${intervalMs} millis`)
    }

    return yield* Effect.fail(
      new Error(
        `Timed out waiting for MySQL after ${attempt} attempt${attempt === 1 ? "" : "s"} (${timeoutMs}ms)`,
      ),
    )
  })

  await Effect.runPromise(program)
}

try {
  await waitForDb()
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}

export { waitForDb }
