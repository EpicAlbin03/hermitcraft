import { type Icon as IconType } from '@lucide/svelte';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			type: 'db' | 'unknown';
			message: string;
			cause?: unknown;
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	type LucideIcon = typeof IconType;
}

export {};
