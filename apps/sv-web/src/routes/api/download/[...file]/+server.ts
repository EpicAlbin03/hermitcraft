import { s3 } from 'bun';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const file = s3.file(params.file);

	return new Response(file.stream(), {
		status: 200,
		headers: {
			'Content-Type': 'application/octet-stream', // generic binary
			'Content-Disposition': `attachment; filename="${params.file}"` // triggers download
		}
	});
};
