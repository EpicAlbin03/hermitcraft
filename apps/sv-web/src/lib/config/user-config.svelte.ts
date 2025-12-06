import { Context } from 'runed';
import { z } from 'zod/v4';

export const USER_CONFIG_COOKIE_NAME = 'hc_user_config';

const onlyHermitCraftSchema = z.boolean().default(false);
const sidebarOpenSchema = z.boolean().default(true);

export type OnlyHermitCraft = z.infer<typeof onlyHermitCraftSchema>;
export type SidebarOpen = z.infer<typeof sidebarOpenSchema>;

export const userConfigSchema = z
	.object({
		onlyHermitCraft: onlyHermitCraftSchema,
		sidebarOpen: sidebarOpenSchema
	})
	.default({
		onlyHermitCraft: false,
		sidebarOpen: true
	});

export type UserConfigType = z.infer<typeof userConfigSchema>;

function parseCookie(cookie: string): Record<string, string> {
	const cookies = cookie.split(';');
	const cookieMap: Record<string, string> = {};
	for (const cookie of cookies) {
		const [key, value] = cookie.split('=');
		if (key && value) {
			cookieMap[key.trim()] = value;
		}
	}
	return cookieMap;
}

export function parseUserConfig(cookie: string): UserConfigType {
	const cookieMap = parseCookie(cookie);
	const userConfig = cookieMap[USER_CONFIG_COOKIE_NAME];
	if (!userConfig) return userConfigSchema.parse({});
	return userConfigSchema.parse(JSON.parse(userConfig));
}

export class UserConfig {
	#config: UserConfigType;

	constructor(config: UserConfigType) {
		this.#config = $state.raw(config);
	}

	get current(): UserConfigType {
		return this.#config;
	}

	setConfig(config: Partial<UserConfigType>): void {
		this.#config = { ...this.#config, ...config };
		document.cookie = `${USER_CONFIG_COOKIE_NAME}=${JSON.stringify(this.#config)}; path=/; max-age=31536000; SameSite=Lax;`;
	}
}

export const UserConfigContext = new Context<UserConfig>('UserConfigContext');
