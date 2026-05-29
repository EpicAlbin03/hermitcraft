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

export type OperationMap<T extends string, E = never, R = never> = Record<
	T,
	() => Effect.Effect<void, E, R>
>;

export const selectOperations = Effect.fn('selectOperations')(function* <
	T extends string,
	E,
	R
>(args: {
	operations: OperationMap<T, E, R>;
	promptLabel: string;
	autoSelect?: string[];
	all?: boolean;
}) {
	if (args.all) {
		const selected = Object.entries(args.operations) as Array<[T, () => Effect.Effect<void, E, R>]>;
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
			.filter((entry): entry is [T, () => Effect.Effect<void, E, R>] => Boolean(entry));

		const names = selected.map(([name]) => name).join(', ');
		return { selected, names };
	}

	const wantsSpecific = yield* Prompt.confirm({
		message: 'Choose specific operations?',
		initial: false
	});
	let selected = Object.entries(args.operations) as Array<[T, () => Effect.Effect<void, E, R>]>;

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
			.filter((entry): entry is [T, () => Effect.Effect<void, E, R>] => Boolean(entry));

		if (filtered.length === 0) {
			return { selected: [], names: '' };
		}

		selected = filtered;
	}

	const names = selected.map(([name]) => name).join(', ');
	return { selected, names };
});
