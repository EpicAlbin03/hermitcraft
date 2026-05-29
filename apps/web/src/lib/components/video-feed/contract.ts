import { z } from 'zod';

export const videoFilterValues = ['videos', 'shorts', 'livestreams'] as const;
export const videoSortValues = ['latest', 'most_viewed', 'most_liked', 'oldest'] as const;

export const videoFilterSchema = z.enum(videoFilterValues);
export const videoSortSchema = z.enum(videoSortValues);

export type VideoFilter = z.infer<typeof videoFilterSchema>;
export type VideoSort = z.infer<typeof videoSortSchema>;

export const defaultVideoFilter: VideoFilter = 'videos';
export const defaultVideoSort: VideoSort = 'latest';

export const videoFilterLabels: Record<VideoFilter, string> = {
	videos: 'Videos',
	shorts: 'Shorts',
	livestreams: 'Livestreams'
};

export const videoBrowseParamsSchema = z.object({
	limit: z.number().min(1).max(48),
	offset: z.number().min(0),
	filter: videoFilterSchema.default(defaultVideoFilter),
	sort: videoSortSchema.default(defaultVideoSort),
	onlyHermitCraft: z.boolean().default(false)
});

export type VideoQueryParams = z.infer<typeof videoBrowseParamsSchema>;

export function parseVideoFilter(value: string | null | undefined) {
	const result = videoFilterSchema.safeParse(value);
	return result.success ? result.data : defaultVideoFilter;
}

export function parseVideoSort(value: string | null | undefined) {
	const result = videoSortSchema.safeParse(value);
	return result.success ? result.data : defaultVideoSort;
}

export function setVideoFilterSearchParam(url: URL, filter: VideoFilter) {
	if (filter === defaultVideoFilter) {
		url.searchParams.delete('filter');
		return;
	}

	url.searchParams.set('filter', filter);
}

export function setVideoSortSearchParam(url: URL, sort: VideoSort) {
	if (sort === defaultVideoSort) {
		url.searchParams.delete('sort');
		return;
	}

	url.searchParams.set('sort', sort);
}
