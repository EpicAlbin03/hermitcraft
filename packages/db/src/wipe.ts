import { DB_SCHEMA, dbClient } from '@hc/db';

const askQuestion = (prompt: string) =>
	new Promise<string>((res) => {
		process.stdout.write(prompt);
		let data = '';
		const handler = (chunk: Buffer) => {
			data += chunk.toString();
			if (data.endsWith('\n')) {
				process.stdin.off('data', handler);
				res(data.trim());
			}
		};
		process.stdin.on('data', handler);
	});

const main = async () => {
	const confirmTablesInput = await askQuestion('Specify which tables to wipe? (y/N): ');
	const wantsSpecificTables = /^y(es)?$/i.test(confirmTablesInput.trim());

	const availableTables = {
		videos: DB_SCHEMA.videos,
		channels: DB_SCHEMA.channels
	};

	let tablesToWipe = Object.entries(availableTables);

	if (wantsSpecificTables) {
		const selection = await askQuestion(
			`Select tables to wipe (comma-separated). Available: ${Object.keys(availableTables).join(', ')}: `
		);
		const selected = selection
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);

		const uniqueSelected = Array.from(new Set(selected));
		const filtered = uniqueSelected
			.map((name) => [name, availableTables[name as keyof typeof availableTables]] as const)
			.filter(([, table]) => Boolean(table));

		if (filtered.length === 0) {
			console.log('No valid tables selected. Aborting.');
			process.exit(0);
		}

		tablesToWipe = filtered as [string, (typeof availableTables)[keyof typeof availableTables]][];
	}

	const tableNames = tablesToWipe.map(([name]) => name).join(', ');
	const confirmation = await askQuestion(
		`This will wipe the following tables: ${tableNames}. Type "yes" to continue: `
	);
	if (confirmation.trim() !== 'yes') {
		console.log('Aborted.');
		process.exit(0);
	}

	console.log(`Wiping DB tables: ${tableNames}...`);
	for (const [name, table] of tablesToWipe) {
		await dbClient.delete(table);
		console.log(`Wiped ${name}`);
	}
	console.log('DB tables wiped successfully');
};

main();
