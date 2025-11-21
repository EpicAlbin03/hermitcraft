<script lang="ts">
	import { page } from '$app/state';
	import { remoteGetChannelDetails, type ChannelDetails } from '$lib/remote/channels.remote';

	const handle = $derived(page.params.handle as string);
	const channel = $derived<ChannelDetails>(await remoteGetChannelDetails(handle));
</script>

<h1>{channel.name}</h1>
