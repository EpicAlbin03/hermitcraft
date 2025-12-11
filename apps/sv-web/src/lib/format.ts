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
export function formatDate(date: Date | string, time = false) {
	const d = new Date(date);

	if (time) {
		return d.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

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

	const timeInSeconds = {
		minute: 60,
		hour: 3600,
		day: 86400,
		week: 604800,
		month: 2629746,
		year: 31556952
	};

	if (seconds < timeInSeconds.minute) return 'just now';
	if (seconds < timeInSeconds.hour)
		return `${Math.floor(seconds / timeInSeconds.minute)} minutes ago`;
	if (seconds < timeInSeconds.day) return `${Math.floor(seconds / timeInSeconds.hour)} hours ago`;
	if (seconds < timeInSeconds.week) return `${Math.floor(seconds / timeInSeconds.day)} days ago`;
	if (seconds < timeInSeconds.month) return `${Math.floor(seconds / timeInSeconds.week)} weeks ago`;
	if (seconds < timeInSeconds.year)
		return `${Math.floor(seconds / timeInSeconds.month)} months ago`;

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
