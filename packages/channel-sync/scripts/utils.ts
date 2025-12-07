import { Effect } from 'effect';
import { parseArgs } from 'util';

export const parseIdArgs = () => {
	const { values } = parseArgs({
		args: Bun.argv,
		options: {
			id: {
				type: 'string',
				short: 'i'
			}
		},
		strict: true,
		allowPositionals: true
	});
	return values.id;
};

export const askQuestion = (prompt: string) =>
	Effect.promise<string>(
		() =>
			new Promise((resolve) => {
				process.stdout.write(prompt);
				process.stdin.resume();
				const handler = (chunk: Buffer) => {
					process.stdin.pause();
					process.stdin.off('data', handler);
					resolve(chunk.toString().trim());
				};
				process.stdin.on('data', handler);
			})
	);

export type OperationMap<T extends string> = Record<T, () => Effect.Effect<void, unknown>>;

export const selectOperations = <T extends string>(args: {
	operations: OperationMap<T>;
	prompt: string;
}) =>
	Effect.gen(function* () {
		const confirmInput = yield* askQuestion(`Specify which operations? (y/N): `);
		const wantsSpecific = /^y(es)?$/i.test(confirmInput.trim());

		let selected = Object.entries(args.operations) as Array<
			[T, () => Effect.Effect<void, unknown>]
		>;

		if (wantsSpecific) {
			const selection = yield* askQuestion(
				`${args.prompt} (comma-separated). Available: ${Object.keys(args.operations).join(', ')}: `
			);

			const parsed = selection
				.split(',')
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean);

			const unique = Array.from(new Set(parsed));

			const filtered = unique
				.map((name) => {
					const key = name as T;
					const handler = args.operations[key];
					return handler ? ([key, handler] as const) : null;
				})
				.filter((entry): entry is [T, () => Effect.Effect<void, unknown>] => Boolean(entry));

			if (filtered.length === 0) {
				return { selected: [], names: '' };
			}

			selected = filtered;
		}

		const names = selected.map(([name]) => name).join(', ');
		return { selected, names };
	});
