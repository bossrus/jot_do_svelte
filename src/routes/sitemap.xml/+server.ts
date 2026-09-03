import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ url }) => {
	const groups = [
		{ name: 'about', priority: '1.0' },
		{ name: 'pricing', priority: '0.9' },
		{ name: 'terms', priority: '0.7' },
		{ name: 'privacy', priority: '0.7' },
		{ name: 'refunds', priority: '0.7' }
	];
	const pages = groups.flatMap(({ name, priority }) =>
		[
			{ path: `/${name}`, locale: 'en' },
			{ path: `/ru/${name}`, locale: 'ru' },
			{ path: `/es/${name}`, locale: 'es' }
		].map(({ path, locale }) => ({ path, locale, name, priority }))
	);
	const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${pages.map(({ path, name, priority }) => `<url><loc>${url.origin}${path}</loc><changefreq>monthly</changefreq><priority>${priority}</priority><xhtml:link rel="alternate" hreflang="en" href="${url.origin}/${name}"/><xhtml:link rel="alternate" hreflang="ru" href="${url.origin}/ru/${name}"/><xhtml:link rel="alternate" hreflang="es" href="${url.origin}/es/${name}"/><xhtml:link rel="alternate" hreflang="x-default" href="${url.origin}/${name}"/></url>`).join('')}</urlset>`;
	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
