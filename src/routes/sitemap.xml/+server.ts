import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ url }) => {
	const pages = ['/about', '/ru/about', '/es/about'];
	const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${pages.map((path) => `<url><loc>${url.origin}${path}</loc><changefreq>monthly</changefreq><priority>${path === '/about' ? '1.0' : '0.9'}</priority><xhtml:link rel="alternate" hreflang="en" href="${url.origin}/about"/><xhtml:link rel="alternate" hreflang="ru" href="${url.origin}/ru/about"/><xhtml:link rel="alternate" hreflang="es" href="${url.origin}/es/about"/><xhtml:link rel="alternate" hreflang="x-default" href="${url.origin}/about"/></url>`).join('')}</urlset>`;
	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
