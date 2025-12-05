export const channelIds = [
	{ name: 'BdoubleO100', id: 'UClu2e7S8atp6tG2galK9hgg' },
	{ name: 'cubfan135', id: 'UC9lJXqw4QZw-HWaZH6sN-xw' },
	{ name: 'docm77', id: 'UC4O9HKe9Jt5yAhKuNv3LXpQ' },
	{ name: 'EthosLab', id: 'UCFKDEp9si4RmHFWJW1vYsMA' },
	{ name: 'FalseSymmetry', id: 'UCuQYHhF6on6EXXO-_i_ClHQ' },
	{ name: 'GeminiTay', id: 'UCUBsjvdHcwZd3ztdY1Zadcw' },
	{ name: 'GoodTimesWithScar', id: 'UCodkNmk9oWRTIYZdr_HuSlg' },
	{ name: 'Grian', id: 'UCR9Gcq0CMm6YgTzsDxAxjOQ' },
	{ name: 'Hypnotizd', id: 'UChi5MyXJLQuPni3dM19Ar3g' },
	{ name: 'iJevin', id: 'UCrEtZMErQXaSYy_JDGoU5Qw' },
	{ name: 'impulseSV', id: 'UCuMJPFqazQI4SofSFEd-5zA' },
	{ name: 'JoeHillsTSD', id: 'UCtWObtiLCNI_BTBHwEOZNqg' },
	{ name: 'Keralis', id: 'UCcJgOennb0II4a_qi9OMkRA' },
	{ name: 'MCSkizzleman', id: 'UCYdXHOv7srjm-ZsNsTcwbBw' },
	{ name: 'Mumbo Jumbo', id: 'UChFur_NwVSbUozOcF_F2kMg' },
	{ name: 'PearlescentMoon', id: 'UC1GJ5aeqpEWklMBQ3oXrPQQ' },
	{ name: 'rendog', id: 'UCDpdtiUfcdUCzokpRWORRqA' },
	{ name: 'SmallishBeans', id: 'UC4qdHN4zHhd4VvNy3zNgXPA' },
	{ name: 'Tango Tek', id: 'UC4YUKOBld2PoOLzk0YZ80lw' },
	{ name: "TinfoilChef's Gaming Channel", id: 'UCRatys97ggrXVtQQBGRALkg' },
	{ name: 'VintageBeef', id: 'UCu17Sme-KE87ca9OTzP0p7g' },
	{ name: 'Welsknight Gaming', id: 'UCKEJZ-dqIA03evnzEy1_owg' },
	{ name: 'xBCrafted', id: 'UC_MkjhQr_D_lGlO3uu-GxyA' },
	{ name: 'xisumavoid', id: 'UCU9pX8hKcrx06XfOB-VQLdw' },
	{ name: 'ZedaphPlays', id: 'UCPK5G4jeoVEbUp5crKJl6CQ' },
	{ name: 'ZombieCleo', id: 'UCjI5qxhtyv3srhWr60HemRw' }
];

export function parseIsoDurationToSeconds(duration: string): number | null {
	const ISO_DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
	const match = ISO_DURATION_PATTERN.exec(duration);
	if (!match) return null;

	const days = Number.parseInt(match[1] ?? '0', 10);
	const hours = Number.parseInt(match[2] ?? '0', 10);
	const minutes = Number.parseInt(match[3] ?? '0', 10);
	const seconds = Number.parseInt(match[4] ?? '0', 10);

	const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
	return Number.isNaN(totalSeconds) ? null : totalSeconds;
}

export const getShortsPlaylistId = (ytChannelId: string) => {
	if (!ytChannelId.startsWith('UC')) {
		return null;
	}
	return 'UUSH' + ytChannelId.slice(2);
};
