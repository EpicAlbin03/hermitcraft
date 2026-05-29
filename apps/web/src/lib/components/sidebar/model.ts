import type { Component } from 'svelte';
import { links } from '$lib/assets/data/links';
import { maps } from '$lib/assets/data/maps';
import type { SidebarCreator } from '$lib/remote/creators.remote';

export type SidebarIcon =
	| {
			type: 'component';
			component: Component;
	  }
	| {
			type: 'image';
			url: string;
			alt: string;
			className?: string;
	  };

export type SidebarCreatorItem = {
	kind: 'creator';
	title: string;
	url: string;
	avatarUrl: string;
	isActive: boolean;
	twitchUserLogin?: string;
	isTwitchLive: boolean;
	ytLiveVideoId?: string;
};

export type SidebarLinkItem = {
	kind: 'link';
	title: string;
	url: string;
	icon: SidebarIcon;
	targetBlank: boolean;
};

export type SidebarMapDownload = {
	title: string;
	url: string;
	external: boolean;
};

export type SidebarMapItem = {
	kind: 'map';
	title: string;
	icon: SidebarIcon;
	primaryUrl: string;
	downloads: SidebarMapDownload[];
};

export function buildSidebarCreatorItems(creators: SidebarCreator[], pathname: string) {
	return creators.map<SidebarCreatorItem>((creator) => ({
		kind: 'creator',
		title: creator.ytName,
		url: `/${creator.ytHandle}`,
		avatarUrl: creator.ytAvatarUrl,
		isActive: pathname.startsWith(`/${creator.ytHandle}`),
		isTwitchLive: creator.isTwitchLive ?? false,
		...(creator.twitchUserLogin ? { twitchUserLogin: creator.twitchUserLogin } : {}),
		...(creator.ytLiveVideoId ? { ytLiveVideoId: creator.ytLiveVideoId } : {})
	}));
}

export function buildSidebarLinkItems() {
	return links.map<SidebarLinkItem>((link) => ({
		kind: 'link',
		title: link.title,
		url: link.url,
		icon:
			typeof link.icon === 'string'
				? { type: 'image', url: link.icon, alt: link.title }
				: { type: 'component', component: link.icon },
		targetBlank: true
	}));
}

export function buildSidebarMapItems() {
	return maps.map<SidebarMapItem>((map) => {
		const downloads =
			'url' in map
				? [{ title: map.title, url: map.url, external: map.url.startsWith('https://') }]
				: [
						{ title: 'Java', url: map.javaUrl, external: map.javaUrl.startsWith('https://') },
						{
							title: 'Bedrock',
							url: map.bedrockUrl,
							external: map.bedrockUrl.startsWith('https://')
						},
						{ title: 'Mcworld', url: map.mcwUrl, external: map.mcwUrl.startsWith('https://') },
						...(map.mcMarketplaceUrl
							? [
									{
										title: 'MC Marketplace',
										url: map.mcMarketplaceUrl,
										external: true
									}
								]
							: [])
					];

		return {
			kind: 'map',
			title: map.title,
			icon: { type: 'image', url: '/favicon-32x32.png', alt: map.title },
			primaryUrl: downloads[0]!.url,
			downloads
		};
	});
}
