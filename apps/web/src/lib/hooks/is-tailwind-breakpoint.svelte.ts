import { MediaQuery } from 'svelte/reactivity';

const BREAKPOINTS = {
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	'2xl': 1536
} as const;

export const DESKTOP_BREAKPOINTS = ['md', 'lg', 'xl', '2xl'];

export type TailwindBreakpointKey = keyof typeof BREAKPOINTS;
export type ActiveTailwindBreakpoint = TailwindBreakpointKey | 'xs';

type BreakpointEntry = {
	key: TailwindBreakpointKey;
	query: MediaQuery;
};

const SORTED_BREAKPOINTS = Object.entries(BREAKPOINTS).sort(([, a], [, b]) => a - b) as Array<
	[TailwindBreakpointKey, number]
>;

export class IsTailwindBreakpoint {
	#queries: BreakpointEntry[];
	#fallback: ActiveTailwindBreakpoint;

	constructor(fallback: ActiveTailwindBreakpoint = 'xs') {
		this.#fallback = fallback;
		this.#queries = SORTED_BREAKPOINTS.map(([key, minWidth]) => ({
			key,
			query: new MediaQuery(`min-width: ${minWidth}px`, key === fallback)
		}));
	}

	get current(): ActiveTailwindBreakpoint {
		let active = this.#fallback;

		for (const { key, query } of this.#queries) {
			if (query.current) {
				active = key;
			} else {
				break;
			}
		}

		return active;
	}
}
