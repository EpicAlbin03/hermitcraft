import { Context } from 'runed';

export class SkeletonDevTools {
	enabled = $state(false);

	setEnabled(enabled: boolean) {
		this.enabled = enabled;
	}

	toggle() {
		this.enabled = !this.enabled;
	}
}

export const SkeletonDevToolsContext = new Context<SkeletonDevTools>('SkeletonDevToolsContext');
