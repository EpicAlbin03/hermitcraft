<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Eye,
		ThumbsUp,
		CalendarArrowDown,
		CalendarArrowUp,
		type LucideIcon
	} from '@lucide/svelte';
	import { videoFilterLabels, type VideoSort } from './contract';

	type SortOption = {
		value: VideoSort;
		label: string;
		icon: LucideIcon;
	};

	type Props = {
		activeSort: VideoSort;
		onlyHermitCraft: boolean;
		onSortChange: (sort: VideoSort) => void;
		onOnlyHermitCraftChange: (checked: boolean) => void;
	};

	const { activeSort, onlyHermitCraft, onSortChange, onOnlyHermitCraftChange }: Props = $props();

	const sortOptions: SortOption[] = [
		{ value: 'latest', label: 'Latest', icon: CalendarArrowDown },
		{ value: 'most_viewed', label: 'Views', icon: Eye },
		{ value: 'most_liked', label: 'Likes', icon: ThumbsUp },
		{ value: 'oldest', label: 'Oldest', icon: CalendarArrowUp }
	];

	const selectedSortOption = $derived(
		sortOptions.find((option) => option.value === activeSort) ?? sortOptions[0]!
	);
</script>

<div class="mb-4 flex flex-wrap-reverse items-center justify-between gap-4">
	<Tabs.List>
		{#each Object.entries(videoFilterLabels) as [value, label] (value)}
			<Tabs.Trigger {value}>{label}</Tabs.Trigger>
		{/each}
	</Tabs.List>

	<div class="flex items-center gap-4">
		<div class="flex items-center space-x-2">
			<Switch
				id="only-hermitcraft"
				checked={onlyHermitCraft}
				onCheckedChange={onOnlyHermitCraftChange}
			/>
			<Label for="only-hermitcraft">Only Hermitcraft</Label>
		</div>

		<Select.Root
			type="single"
			value={activeSort}
			onValueChange={(value) => onSortChange(value as VideoSort)}
		>
			<Select.Trigger class="w-30">
				<span class="flex items-center gap-2">
					<selectedSortOption.icon />
					{selectedSortOption.label}
				</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Label>Sort by</Select.Label>
					{#each sortOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label}>
							<option.icon />
							{option.label}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	</div>
</div>
