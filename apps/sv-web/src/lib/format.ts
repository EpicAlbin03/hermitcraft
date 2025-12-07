import { parseIsoDurationToSeconds } from '@hc/channel-sync/youtube/utils';

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
	if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
	if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
	if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
	if (seconds < 315360000) return `${Math.floor(seconds / 31536000)} years ago`;

	return formatDate(d);
}

// Parse channel description into parts (text and links)
export function parseChannelDescription(description: string) {
	const parts = description.split(/(https?:\/\/[^\s]+)/g);
	return parts.map((part) => ({
		type: part.match(/^https?:\/\//) ? 'link' : 'text',
		content: part
	}));
}
