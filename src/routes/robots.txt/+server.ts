import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ url }) =>
	new Response(
		`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api\nSitemap: ${url.origin}/sitemap.xml\n`,
		{
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'cache-control': 'public, max-age=3600'
			}
		}
	);
