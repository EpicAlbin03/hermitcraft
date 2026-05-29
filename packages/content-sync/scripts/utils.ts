import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import { Prompt } from 'effect/unstable/cli';

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

export class ScriptError extends Data.TaggedError('ScriptError')<{
	message: string;
	cause?: unknown;
}> {}

export const parseOperations = (value?: string) =>
	value
		?.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean) ?? [];

export type OperationMap<T extends string, E = never> = Record<T, () => Effect.Effect<void, E>>;

export const selectOperations = Effect.fn('selectOperations')(function* <
	T extends string,
	E
>(args: {
	operations: OperationMap<T, E>;
	promptLabel: string;
	autoSelect?: string[];
	all?: boolean;
}) {
	if (args.all) {
		const selected = Object.entries(args.operations) as Array<[T, () => Effect.Effect<void, E>]>;
		const names = selected.map(([name]) => name).join(', ');
		return { selected, names };
	}

	if (args.autoSelect && args.autoSelect.length > 0) {
		const unique = Array.from(new Set(args.autoSelect));
		const selected = unique
			.map((name) => {
				const key = name as T;
				const handler = args.operations[key];
				return handler ? ([key, handler] as const) : null;
			})
			.filter((entry): entry is [T, () => Effect.Effect<void, E>] => Boolean(entry));

		const names = selected.map(([name]) => name).join(', ');
		return { selected, names };
	}

	const wantsSpecific = yield* Prompt.confirm({
		message: 'Choose specific operations?',
		initial: false
	});
	let selected = Object.entries(args.operations) as Array<[T, () => Effect.Effect<void, E>]>;

	if (wantsSpecific) {
		const selection = yield* Prompt.text({
			message: `${args.promptLabel} (comma-separated). Available: ${Object.keys(args.operations).join(', ')}`
		});
		const parsed = parseOperations(selection);
		const unique = Array.from(new Set(parsed));
		const filtered = unique
			.map((name) => {
				const key = name as T;
				const handler = args.operations[key];
				return handler ? ([key, handler] as const) : null;
			})
			.filter((entry): entry is [T, () => Effect.Effect<void, E>] => Boolean(entry));

		if (filtered.length === 0) {
			return { selected: [], names: '' };
		}

		selected = filtered;
	}

	const names = selected.map(([name]) => name).join(', ');
	return { selected, names };
});

export const runOperationSelection = Effect.fn('runOperationSelection')(function* <
	T extends string,
	E
>(args: {
	operations: OperationMap<T, E>;
	promptLabel: string;
	autoSelect?: string[];
	all?: boolean;
	yes: boolean;
	confirmMessage: (names: string) => string;
	successMessage: (name: T) => string;
}) {
	const { selected, names } = yield* selectOperations({
		operations: args.operations,
		promptLabel: args.promptLabel,
		...(args.autoSelect ? { autoSelect: args.autoSelect } : {}),
		...(args.all ? { all: args.all } : {})
	});

	if (selected.length === 0) {
		yield* Effect.log(color.warn('No valid selection. Aborting.'));
		return;
	}

	if (!args.yes) {
		const confirmed = yield* Prompt.confirm({
			message: args.confirmMessage(names),
			initial: false
		});
		if (!confirmed) {
			yield* Effect.log(color.warn('Aborted.'));
			return;
		}
	}

	yield* Effect.log(color.action(`Running operations: ${names}`));
	yield* Effect.forEach(selected, ([name, run]) =>
		run().pipe(Effect.tap(() => Effect.log(color.success(args.successMessage(name)))))
	);
});
