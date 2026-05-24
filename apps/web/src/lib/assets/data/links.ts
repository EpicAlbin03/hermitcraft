import {
	AtlauncherSVG,
	ModrinthSVG,
	RedditSVG,
	TwitchSVG,
	TwitterSVG,
	YoutubeSVG
} from '$lib/assets/svg';
import { ShirtIcon } from '@lucide/svelte';

export const links = [
	{
		title: 'hermitcraft.com',
		url: 'https://hermitcraft.com',
		icon: 'https://favicon.pub/hermitcraft.com'
	},
	{
		title: 'Merch',
		url: 'https://shop.hermitcraft.com',
		icon: ShirtIcon
	},
	{
		title: 'YouTube',
		url: 'https://youtube.com/c/HermitcraftOfficial',
		icon: YoutubeSVG
	},
	{
		title: 'Twitch',
		url: 'https://twitch.tv/hermitcraft_',
		icon: TwitchSVG
	},
	{
		title: 'Twitter',
		url: 'https://x.com/hermitcraft_',
		icon: TwitterSVG
	},
	{
		title: 'Reddit',
		url: 'https://reddit.com/r/HermitCraft',
		icon: RedditSVG
	},
	{
		title: 'Server Pack',
		url: 'https://modrinth.com/modpack/hermitcraft/version/2.0.0',
		icon: ModrinthSVG
	},
	{
		title: 'TCG Online',
		url: 'https://hc-tcg.online/',
		icon: 'https://favicon.pub/hc-tcg.online'
	},
	{
		title: 'TCG Add-On',
		url: 'https://www.minecraft.net/marketplace/pdp/hermitcraft/hermitcraft-tcg-add--on/5564c4dd-639e-490b-875d-996d183fe8c2',
		icon: 'https://favicon.pub/minecraft.net'
	},
	{
		title: 'Modsauce 2',
		url: 'https://atlauncher.com/pack/HermitcraftModsauce2',
		icon: AtlauncherSVG
	}
];
