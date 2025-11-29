import { parseIsoDurationToSeconds } from './duration';

export const isShort = (duration: string) => {
	const durationSeconds = parseIsoDurationToSeconds(duration);
	if (durationSeconds === null) return false;
	return durationSeconds <= 3 * 60;
};
