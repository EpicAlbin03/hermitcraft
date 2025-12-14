export type MapLink =
	| {
			title: string;
			url: string;
	  }
	| {
			title: string;
			javaUrl: string;
			bedrockUrl: string;
			mcwUrl: string;
			mcMarketplaceUrl?: string;
	  };

export const maps: MapLink[] = [
	{
		title: 'Vanilla S10',
		javaUrl: '/api/download/maps/hermitcraft10.zip',
		bedrockUrl: '/api/download/maps/hermitcraft10-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft10.mcworld',
		mcMarketplaceUrl:
			'https://www.minecraft.net/marketplace/pdp/hermitcraft/hermitcraft-season-10-map/b7fb68d8-23e7-4f39-8266-d9d239dcad4d'
	},
	{
		title: 'Vanilla S9',
		javaUrl: '/api/download/maps/hermitcraft9.zip',
		bedrockUrl: '/api/download/maps/hermitcraft9-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft9.mcworld',
		mcMarketplaceUrl:
			'https://www.minecraft.net/marketplace/pdp/hermitcraft/hermitcraft-season-9-map/85a1edb2-cfc7-4acb-afa7-203cd01354bd'
	},
	{
		title: 'Vanilla S8',
		javaUrl: '/api/download/maps/hermitcraft8.zip',
		bedrockUrl: '/api/download/maps/hermitcraft8-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft8.mcworld',
		mcMarketplaceUrl:
			'https://www.minecraft.net/marketplace/pdp/hermitcraft/hermitcraft-season-8-map/d24c4047-4486-4b12-b7d8-9fa9acea71a6'
	},
	{
		title: 'Vanilla S7',
		javaUrl: '/api/download/maps/hermitcraft7.zip',
		bedrockUrl: '/api/download/maps/hermitcraft7-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft7.mcworld'
	},
	{
		title: 'Vanilla S6',
		javaUrl: '/api/download/maps/hermitcraft6.zip',
		bedrockUrl: '/api/download/maps/hermitcraft6-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft6.mcworld'
	},
	{
		title: 'Vanilla S5',
		javaUrl: '/api/download/maps/hermitcraft5.zip',
		bedrockUrl: '/api/download/maps/hermitcraft5-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft5.mcworld'
	},
	{
		title: 'Vanilla S4',
		javaUrl: '/api/download/maps/hermitcraft4.zip',
		bedrockUrl: '/api/download/maps/hermitcraft4-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft4.mcworld'
	},
	{
		title: 'Vanilla S3',
		javaUrl: '/api/download/maps/hermitcraft3.zip',
		bedrockUrl: '/api/download/maps/hermitcraft3-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft3.mcworld'
	},
	{
		title: 'Vanilla S2',
		javaUrl: '/api/download/maps/hermitcraft2.zip',
		bedrockUrl: '/api/download/maps/hermitcraft2-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft2.mcworld'
	},
	{
		title: 'Vanilla S1',
		javaUrl: '/api/download/maps/hermitcraft1.zip',
		bedrockUrl: '/api/download/maps/hermitcraft1-bedrock.zip',
		mcwUrl: '/api/download/maps/hermitcraft1.mcworld'
	},
	{
		title: 'Hermit Skies',
		url: '/api/download/maps/hermitcraftmodded-s8-hermitskies.zip'
	},
	{
		title: 'HermitPack',
		url: '/api/download/maps/hermitcraftmodded-s7-hermitpack.zip'
	},
	{
		title: 'Modsauce 2',
		url: '/api/download/maps/hermitcraftmodded-s6-modsauce2.zip'
	},
	{
		title: 'FTB Infinity',
		url: '/api/download/maps/hermitcraftmodded-s5-ftbinfinity.zip'
	},
	{
		title: 'Modsauce',
		url: '/api/download/maps/hermitcraftmodded-s4-modsauce.zip'
	},
	{
		title: 'FTB Monster',
		url: '/api/download/maps/hermitcraftmodded-s3-ftbmonster.zip'
	},
	{
		title: 'FTB Unleashed',
		url: '/api/download/maps/hermitcraftmodded-s2-ftbunleashed.zip'
	},
	{
		title: 'FTB Ultimate',
		url: '/api/download/maps/hermitcraftmodded-s1-ftbultimate.zip'
	},
	{
		title: 'Gamemode 4',
		url: '/api/download/maps/hermitcraftgm4-s1.zip'
	}
];
