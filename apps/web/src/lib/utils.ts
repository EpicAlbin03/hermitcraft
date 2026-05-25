import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
	TwitchSVG,
	RedditSVG,
	TwitterSVG,
	YoutubeSVG,
	FacebookSVG,
	InstagramSVG,
	PatreonSVG,
	ThreadsSVG,
	TikTokSVG,
	BlueskySVG,
	DiscordSVG,
	TumblrSVG
} from '$lib/assets/svg';
import { GlobeIcon, ShirtIcon } from '@lucide/svelte';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

function cleanHostname(hostname: string) {
	const parts = hostname.replace(/^www\./, '').split('.');
	return parts.length > 2 ? parts.slice(-2).join('.') : parts.join('.');
}

export function getIconFromUrl(url: string, title?: string) {
	const hostname = new URL(url).hostname.toLowerCase();
	const lowerTitle = title?.toLowerCase();

	switch (true) {
		case hostname.includes('bsky.app'):
			return BlueskySVG;
		case hostname.includes('discord.com') || hostname.includes('discord.gg'):
			return DiscordSVG;
		case hostname.includes('facebook.com'):
			return FacebookSVG;
		case hostname.includes('instagram.com'):
			return InstagramSVG;
		case hostname.includes('patreon.com'):
			return PatreonSVG;
		case hostname.includes('reddit.com'):
			return RedditSVG;
		case hostname.includes('threads.com'):
			return ThreadsSVG;
		case hostname.includes('tiktok.com'):
			return TikTokSVG;
		case hostname.includes('tumblr.com'):
			return TumblrSVG;
		case hostname.includes('twitch.tv'):
			return TwitchSVG;
		case hostname.includes('x.com') || hostname.includes('twitter.com'):
			return TwitterSVG;
		case hostname.includes('youtube.com'):
			return YoutubeSVG;
		case lowerTitle === 'merch':
			return ShirtIcon;
		case lowerTitle === 'obrotherhood.com': // Special case
			return GlobeIcon;
		default:
			return {
				url: `https://favicon.pub/${cleanHostname(hostname)}`,
				alt: title ?? '',
				fallback: GlobeIcon
			};
	}
}
