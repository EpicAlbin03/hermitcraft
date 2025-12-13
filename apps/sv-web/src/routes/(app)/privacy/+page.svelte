<script lang="ts">
	import MetaData from '$lib/components/metadata.svelte';
	import { siteConfig } from '$lib/config/site-config';

	const title = `Privacy Policy - ${siteConfig.name} `;
	const description =
		'Read the privacy policy for the HermitCraft website, including how data is collected, used, and protected.';
</script>

<MetaData {title} {description} />

<h1>Privacy Policy</h1>
