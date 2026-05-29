import {
	BunChildProcessSpawner,
	BunFileSystem,
	BunPath,
	BunStdio,
	BunTerminal
} from '@effect/platform-bun';
import * as Effect from 'effect/Effect';
import { Command } from 'effect/unstable/cli';
import * as Layer from 'effect/Layer';
import { contentSyncLayer } from '../src/layer';

const bunCommandLayer = BunChildProcessSpawner.layer.pipe(
	Layer.provideMerge(
		Layer.mergeAll(BunFileSystem.layer, BunPath.layer, BunStdio.layer, BunTerminal.layer)
	)
);

const contentSyncCommandLayer = Layer.merge(contentSyncLayer, bunCommandLayer);

export const provideContentSyncCommand = <Name extends string, Input, ContextInput, E>(
	command: Command.Command<
		Name,
		Input,
		ContextInput,
		E,
		Layer.Success<typeof contentSyncLayer> | Command.Environment
	>
) => Command.run(command, { version: 'INTERNAL' }).pipe(Effect.provide(contentSyncCommandLayer));
