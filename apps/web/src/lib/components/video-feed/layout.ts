import type { ActiveTailwindBreakpoint } from '$lib/hooks/is-tailwind-breakpoint.svelte';

export const VIDEO_CARD_MIN_WIDTH = 260;
export const VIDEO_CARD_MAX_WIDTH = 420;
export const VIDEO_CARD_MAX_COLUMNS = 6;
export const ROWS_PER_BATCH = 3;

export function getFallbackVideoColumnsByBreakpoint(shouldReserveSidebarSpace: boolean) {
	return {
		xs: 1,
		sm: 2,
		md: shouldReserveSidebarSpace ? 1 : 2,
		lg: shouldReserveSidebarSpace ? 2 : 3,
		xl: shouldReserveSidebarSpace ? 3 : 4,
		'2xl': shouldReserveSidebarSpace ? 5 : 6
	} as const;
}

export function getFallbackVideoColumns(
	breakpoint: ActiveTailwindBreakpoint,
	shouldReserveSidebarSpace: boolean
) {
	const fallbackVideoColumnsByBreakpoint =
		getFallbackVideoColumnsByBreakpoint(shouldReserveSidebarSpace);

	return fallbackVideoColumnsByBreakpoint[breakpoint] ?? 1;
}

export function getColumnsForWidth({
	width,
	gap,
	fallbackColumns
}: {
	width: number;
	gap: number;
	fallbackColumns: number;
}) {
	if (width <= 0) {
		return fallbackColumns;
	}

	for (let columns = VIDEO_CARD_MAX_COLUMNS; columns >= 1; columns--) {
		const totalGap = Math.max(0, columns - 1) * gap;
		const cardWidth = (width - totalGap) / columns;
		if (cardWidth >= VIDEO_CARD_MIN_WIDTH && cardWidth <= VIDEO_CARD_MAX_WIDTH) {
			return columns;
		}
	}

	const widestWidth =
		(width - Math.max(0, VIDEO_CARD_MAX_COLUMNS - 1) * gap) / VIDEO_CARD_MAX_COLUMNS;
	if (widestWidth > VIDEO_CARD_MAX_WIDTH) {
		return VIDEO_CARD_MAX_COLUMNS;
	}

	const estimatedColumns = Math.floor((width + gap) / (VIDEO_CARD_MIN_WIDTH + gap));
	return Math.max(1, Math.min(estimatedColumns, VIDEO_CARD_MAX_COLUMNS));
}

export function getBatchSizeForColumns(columns: number, loadedCount: number) {
	const safeColumns = Math.max(1, columns);
	const baselineRows = safeColumns >= 3 ? ROWS_PER_BATCH : ROWS_PER_BATCH + 1;
	const baselineBatchSize = safeColumns * baselineRows;
	const remainder = loadedCount % safeColumns;
	return remainder === 0 ? baselineBatchSize : baselineBatchSize - remainder;
}

export function getVideoGridTemplate(columns: number) {
	return `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`;
}

export function getVideoSizes({
	contentWidthRaw,
	shouldReserveSidebarSpace
}: {
	contentWidthRaw: string;
	shouldReserveSidebarSpace: boolean;
}) {
	const fallbackVideoColumnsByBreakpoint =
		getFallbackVideoColumnsByBreakpoint(shouldReserveSidebarSpace);

	return [
		`(min-width: 1536px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint['2xl']})`,
		`(min-width: 1280px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.xl})`,
		`(min-width: 1024px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.lg})`,
		`(min-width: 768px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.md})`,
		`(min-width: 640px) calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.sm})`,
		`calc(${contentWidthRaw} / ${fallbackVideoColumnsByBreakpoint.xs})`
	].join(', ');
}
