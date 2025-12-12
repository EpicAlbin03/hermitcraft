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
	DiscordSVG
} from '$lib/assets/svg';
import { Globe, Shirt } from '@lucide/svelte';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

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
		case hostname.includes('twitch.tv'):
			return TwitchSVG;
		case hostname.includes('x.com') || hostname.includes('twitter.com'):
			return TwitterSVG;
		case hostname.includes('youtube.com'):
			return YoutubeSVG;
		case lowerTitle === 'merch':
			return Shirt;
		default:
			return Globe;
	}
}
