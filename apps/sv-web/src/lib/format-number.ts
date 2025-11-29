export function formatCompactNumber(num: number | null | undefined) {
	if (num == null) return '0';
	return new Intl.NumberFormat('en-US', {
		notation: 'compact',
		maximumFractionDigits: 1
	}).format(num);
}
