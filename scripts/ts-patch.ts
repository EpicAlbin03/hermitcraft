// eslint did not like the typescript alias

import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aliasedTypescriptLibDir = path.join(rootDir, 'node_modules', 'typescript', 'lib');
const bunStoreDir = path.join(rootDir, 'node_modules', '.bun');

if (!existsSync(aliasedTypescriptLibDir)) {
	throw new Error(`Missing aliased TypeScript lib dir: ${aliasedTypescriptLibDir}`);
}

if (!existsSync(bunStoreDir)) {
	throw new Error(`Missing Bun store dir: ${bunStoreDir}`);
}

const typescriptLibDir = await realpath(aliasedTypescriptLibDir);
const bunEntries = await readdir(bunStoreDir, { withFileTypes: true });
const realTypescriptDir = (
	await Promise.all(
		bunEntries
			.filter((entry) => entry.isDirectory() && entry.name.startsWith('typescript@'))
			.map(async (entry) => {
				const candidate = path.join(bunStoreDir, entry.name, 'node_modules', 'typescript');
				const packageJsonPath = path.join(candidate, 'package.json');

				if (!existsSync(packageJsonPath)) {
					return null;
				}

				const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
				return packageJson.name === 'typescript' ? candidate : null;
			})
	)
).filter(Boolean)[0];

if (!realTypescriptDir) {
	throw new Error(`Could not find real TypeScript package under ${bunStoreDir}`);
}

const requirePath = (target: string) => {
	const relativePath = path.relative(typescriptLibDir, target).split(path.sep).join('/');
	return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const realTypescriptRoot = requirePath(realTypescriptDir);
const realTypescriptLib = requirePath(path.join(realTypescriptDir, 'lib'));

const patches = [
	{
		file: 'typescript.js',
		content: `module.exports = require(${JSON.stringify(realTypescriptRoot)});\n`
	},
	{
		file: 'typescript.d.ts',
		content: `import ts = require(${JSON.stringify(realTypescriptRoot)});\nexport = ts;\n`
	},
	{
		file: 'tsserverlibrary.js',
		content: `module.exports = require(${JSON.stringify(`${realTypescriptLib}/tsserverlibrary`)});\n`
	},
	{
		file: 'tsserverlibrary.d.ts',
		content: `import ts = require(${JSON.stringify(`${realTypescriptLib}/tsserverlibrary`)});\nexport = ts;\n`
	},
	{
		file: 'tsc.js',
		content: `require(${JSON.stringify(`${realTypescriptLib}/tsc.js`)});\n`
	}
] as const;

for (const patch of patches) {
	const filePath = path.join(typescriptLibDir, patch.file);
	const current = existsSync(filePath) ? await readFile(filePath, 'utf8') : null;

	if (current === patch.content) {
		console.log(`patched ${path.relative(rootDir, filePath)}`);
		continue;
	}

	await writeFile(filePath, patch.content);
	console.log(`${current === null ? 'create' : 'patch'} ${path.relative(rootDir, filePath)}`);
}
