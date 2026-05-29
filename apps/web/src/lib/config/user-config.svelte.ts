import { Context } from 'runed';
import { z } from 'zod';

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

function parseCookie(cookie: string) {
	return cookie.split(';').reduce<Record<string, string>>((cookieMap, cookiePart) => {
		const [key, ...valueParts] = cookiePart.split('=');
		if (!key || valueParts.length === 0) {
			return cookieMap;
		}

		cookieMap[key.trim()] = valueParts.join('=');
		return cookieMap;
	}, {});
}

export function serializeUserConfig(config: UserConfigType) {
	return encodeURIComponent(JSON.stringify(userConfigSchema.parse(config)));
}

export function deserializeUserConfig(value: string | undefined) {
	if (!value) {
		return userConfigSchema.parse({});
	}

	try {
		return userConfigSchema.parse(JSON.parse(decodeURIComponent(value)));
	} catch {
		return userConfigSchema.parse({});
	}
}

export function parseUserConfig(cookie: string) {
	return deserializeUserConfig(parseCookie(cookie)[USER_CONFIG_COOKIE_NAME]);
}

export class UserConfig {
	#config: UserConfigType;

	constructor(config: UserConfigType) {
		this.#config = $state.raw(config);
	}

	get current() {
		return this.#config;
	}

	setConfig(config: Partial<UserConfigType>) {
		this.#config = { ...this.#config, ...config };
		document.cookie = `${USER_CONFIG_COOKIE_NAME}=${serializeUserConfig(this.#config)}; path=/; max-age=31536000; SameSite=Lax;`;
	}
}

export const UserConfigContext = new Context<UserConfig>('UserConfigContext');
