import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseIsoDurationToSeconds } from '@hc/channel-sync/youtube/utils';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

// Format number to compact notation (e.g., "1.2k" instead of "1200")
export function formatCompactNumber(num: number | null | undefined) {
	if (num == null) return '0';
	return new Intl.NumberFormat('en-US', {
		notation: 'compact',
		maximumFractionDigits: 1
	}).format(num);
}

// Format date to readable string (e.g., "Nov 24, 2025")
export function formatDate(date: Date | string) {
	const d = new Date(date);
	return d.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

// Format video duration (e.g., "1:23:45" or "20:34")
export function formatVideoDuration(duration: string | null | undefined): string | null {
	if (!duration) return null;
	const totalSeconds = parseIsoDurationToSeconds(duration);
	if (totalSeconds === null) return null;

	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Format relative time (e.g., "2 hours ago", "3 days ago")
export function formatRelativeTime(date: Date | string) {
	const d = new Date(date);
	const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

	return formatDate(d);
}

// Format days ago (e.g., "Today", "1 day ago", "5 days ago")
export function formatDaysAgo(date: Date | string) {
	const d = new Date(date);
	const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
	if (days === 0) return 'Today';
	if (days === 1) return '1 day ago';
	return `${days} days ago`;
}
