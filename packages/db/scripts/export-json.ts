#!/usr/bin/env bun

import { BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import { Client } from 'pg';

const parseArgs = () => {
	const outFlagIndex = process.argv.findIndex((arg) => arg === '--out');
	const outArg = outFlagIndex >= 0 ? process.argv.at(outFlagIndex + 1) : undefined;

	return {
		outDir: outArg ?? 'exports/db'
	};
};

const isSafeIdentifier = (value: string) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);

const makePgClient = (databaseUrl: string) =>
	Effect.acquireRelease(
		Effect.tryPromise(async () => {
			const client = new Client({ connectionString: databaseUrl });
			await client.connect();
			return client;
		}),
		(client) => Effect.promise(() => client.end())
	);

const program = Effect.scoped(
	Effect.gen(function* () {
		const databaseUrl = process.env.DATABASE_URL;

		if (!databaseUrl) {
			throw new Error('DATABASE_URL is required');
		}

		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const { outDir: outDirArg } = parseArgs();
		const outDir = path.resolve(process.cwd(), outDirArg);
		const client = yield* makePgClient(databaseUrl);

		yield* fs.makeDirectory(outDir, { recursive: true });

		const tableResult = yield* Effect.tryPromise(() =>
			client.query<{
				table_schema: string;
				table_name: string;
			}>(`
			SELECT table_schema, table_name
			FROM information_schema.tables
			WHERE table_type = 'BASE TABLE'
				AND table_schema NOT IN ('pg_catalog', 'information_schema')
			ORDER BY table_schema, table_name
		`)
		);

		for (const table of tableResult.rows) {
			if (!isSafeIdentifier(table.table_schema) || !isSafeIdentifier(table.table_name)) {
				throw new Error(`Unsafe table identifier: ${table.table_schema}.${table.table_name}`);
			}

			const rowsResult = yield* Effect.tryPromise(() =>
				client.query(`SELECT * FROM "${table.table_schema}"."${table.table_name}"`)
			);
			const filePath = path.join(outDir, `${table.table_schema}.${table.table_name}.json`);
			const json = yield* Effect.tryPromise(() =>
				Response.json(rowsResult.rows, {
					headers: { 'content-type': 'application/json; charset=utf-8' }
				}).text()
			);

			yield* fs.writeFileString(filePath, `${json}\n`);
			yield* Effect.log(`Wrote ${filePath}`);
		}
	})
);

BunRuntime.runMain(program.pipe(Effect.provide(Layer.merge(BunFileSystem.layer, BunPath.layer))));
