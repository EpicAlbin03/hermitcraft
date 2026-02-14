import { Effect } from 'effect';
import { parseArgs } from 'util';

const ANSI = {
	reset: '\x1b[0m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m'
} as const;

const withColor = (text: string, color: string) => `${color}${text}${ANSI.reset}`;

export const color = {
	info: (text: string) => withColor(text, ANSI.cyan),
	action: (text: string) => withColor(text, ANSI.blue),
	success: (text: string) => withColor(text, ANSI.green),
	warn: (text: string) => withColor(text, ANSI.yellow),
	error: (text: string) => withColor(text, ANSI.red)
};

export const prompt = {
	chooseSpecificOps: 'Choose specific operations? (y/N): ',
	selectOperations: (label: string, options: string[]) =>
		`${label} (comma-separated). Available: ${options.join(', ')}: `,
	confirmTypeYes: (message: string) => `${message} Type "yes" to continue: `
};

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
		const confirmInput = yield* askQuestion(prompt.chooseSpecificOps);
		const wantsSpecific = /^y(es)?$/i.test(confirmInput.trim());

		let selected = Object.entries(args.operations) as Array<
			[T, () => Effect.Effect<void, unknown>]
		>;

		if (wantsSpecific) {
			const selection = yield* askQuestion(
				prompt.selectOperations(args.prompt, Object.keys(args.operations))
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
