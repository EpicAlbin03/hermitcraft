import { SIDEBAR_WIDTH } from '$lib/components/ui/sidebar/constants';
import { useSidebar } from '$lib/components/ui/sidebar';
import {
	DESKTOP_BREAKPOINTS,
	type ActiveTailwindBreakpoint
} from '$lib/hooks/is-tailwind-breakpoint.svelte';

type BreakpointSource = ActiveTailwindBreakpoint | (() => ActiveTailwindBreakpoint);

function resolveBreakpoint(source: BreakpointSource): ActiveTailwindBreakpoint {
	if (typeof source === 'function') {
		return (source as () => ActiveTailwindBreakpoint)();
	}
	return source;
}

export function useSidebarSpace(source: BreakpointSource) {
	const sidebar = useSidebar();
	const isSidebarOpen = $derived(sidebar.open);

	const activeBreakpoint = $derived(resolveBreakpoint(source));

	const shouldReserveSidebarSpace = $derived(
		DESKTOP_BREAKPOINTS.includes(activeBreakpoint) && isSidebarOpen
	);

	const contentWidthRaw = $derived(
		shouldReserveSidebarSpace ? `(100vw - ${SIDEBAR_WIDTH})` : '100vw'
	);

	const contentWidthResolved = $derived(
		shouldReserveSidebarSpace ? `calc(${contentWidthRaw})` : contentWidthRaw
	);

	return {
		get isSidebarOpen() {
			return isSidebarOpen;
		},
		get shouldReserveSidebarSpace() {
			return shouldReserveSidebarSpace;
		},
		get contentWidthRaw() {
			return contentWidthRaw;
		},
		get contentWidthResolved() {
			return contentWidthResolved;
		}
	};
}
