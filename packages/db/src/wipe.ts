import { DB_SCHEMA, getDbConnection } from '@hc/db';

const main = async () => {
	const dbClient = getDbConnection(Bun.env.MYSQL_URL!);

	const prompt = 'This will wipe DB tables. Type "yes" to continue: ';
	const input = await new Promise((res) => {
		process.stdout.write(prompt);
		let data = '';
		process.stdin.on('data', (chunk) => {
			data += chunk.toString();
			if (data.endsWith('\n')) {
				res(data.trim());
			}
		});
	});
	if (input !== 'yes') {
		console.log('Aborted.');
		process.exit(0);
	}

	console.log('Wiping DB tables...');
	await dbClient.delete(DB_SCHEMA.videos);
	console.log('Wiped videos');
	await dbClient.delete(DB_SCHEMA.channels);
	console.log('Wiped channels');
	console.log('DB tables wiped successfully');
};

main();
