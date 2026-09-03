<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import type { AppLocale } from '$lib/client/locale';
	import AboutModal from './AboutModal.svelte';
	import PageShell from './primitives/PageShell.svelte';
	import Cluster from './primitives/Cluster.svelte';
	let { locale }: { locale: AppLocale } = $props();
	function t<I extends object>(
		message: (inputs: I, options?: { locale?: AppLocale }) => string,
		inputs = {} as I
	) {
		return message(inputs, { locale });
	}
	let origin = $derived(page.url.origin);
	let canonicalPath = $derived(locale === 'en' ? '/about' : `/${locale}/about`);
	let structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'JotDO',
		url: `${origin}${canonicalPath}`,
		applicationCategory: 'ProductivityApplication',
		operatingSystem: 'Web',
		description: t(m.seo_description),
		inLanguage: ['en', 'ru', 'es'],
		isAccessibleForFree: true,
		featureList: [
			t(m.about_speed_title),
			t(m.about_access_title),
			t(m.about_together_title),
			t(m.about_recurring_title),
			t(m.about_search_title)
		]
	});
</script>

<svelte:head>
	<title>{t(m.seo_title)}</title><meta name="description" content={t(m.seo_description)} /><meta
		name="keywords"
		content={t(m.seo_keywords)}
	/><meta
		name="robots"
		content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
	/>
	<link rel="canonical" href={`${origin}${canonicalPath}`} /><link
		rel="alternate"
		hreflang="en"
		href={`${origin}/about`}
	/><link rel="alternate" hreflang="ru" href={`${origin}/ru/about`} /><link
		rel="alternate"
		hreflang="es"
		href={`${origin}/es/about`}
	/><link rel="alternate" hreflang="x-default" href={`${origin}/about`} />
	<meta name="application-name" content="JotDO" /><meta name="theme-color" content="#326a4b" /><meta
		property="og:type"
		content="website"
	/><meta property="og:site_name" content="JotDO" /><meta
		property="og:locale"
		content={locale === 'ru' ? 'ru_RU' : locale === 'es' ? 'es_ES' : 'en_US'}
	/><meta property="og:title" content={t(m.seo_title)} /><meta
		property="og:description"
		content={t(m.seo_description)}
	/><meta property="og:url" content={`${origin}${canonicalPath}`} /><meta
		name="twitter:card"
		content="summary"
	/><meta name="twitter:title" content={t(m.seo_title)} /><meta
		name="twitter:description"
		content={t(m.seo_description)}
	/>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${JSON.stringify(structuredData)}<${'/'}script>`}
</svelte:head>
<PageShell>
	{#snippet header()}<Cluster class="site-header" justify="space-between" wrap={false}
			><a class="brand" href={resolve('/app')} aria-label={t(m.open_app)}>Jot<span>DO</span></a
			><Cluster gap="var(--space-2)" wrap={false}
				><nav class="languages" aria-label={t(m.language)}>
					<a class:active={locale === 'en'} href={resolve('/about')}>EN</a><a
						class:active={locale === 'ru'}
						href={resolve('/ru/about')}>RU</a
					><a class:active={locale === 'es'} href={resolve('/es/about')}>ES</a>
				</nav>
				<a class="open-app" href={resolve('/app')}>{t(m.open_app)}</a></Cluster
			></Cluster
		>{/snippet}
	<AboutModal standalone {locale} />
	<footer class="legal-footer" aria-label="Legal">
		<a href={locale === 'en' ? '/pricing' : `/${locale}/pricing`}
			>{locale === 'ru' ? 'Тарифы' : locale === 'es' ? 'Precios' : 'Pricing'}</a
		>
		<a href={locale === 'en' ? '/terms' : `/${locale}/terms`}
			>{locale === 'ru' ? 'Условия' : locale === 'es' ? 'Términos' : 'Terms'}</a
		>
		<a href={locale === 'en' ? '/privacy' : `/${locale}/privacy`}
			>{locale === 'ru' ? 'Конфиденциальность' : locale === 'es' ? 'Privacidad' : 'Privacy'}</a
		>
		<a href={locale === 'en' ? '/refunds' : `/${locale}/refunds`}
			>{locale === 'ru' ? 'Возвраты' : locale === 'es' ? 'Reembolsos' : 'Refunds'}</a
		>
	</footer>
</PageShell>

<style>
	:global(body) {
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	:global(.site-header) {
		width: min(100%, 66rem);
		min-height: 4rem;
		margin-inline: auto;
		padding: var(--space-2) var(--space-5);
	}
	.brand {
		color: var(--color-text);
		font-size: 1.7rem;
		font-weight: 900;
		letter-spacing: -0.07em;
		text-decoration: none;
	}
	.brand span {
		color: var(--color-accent);
	}
	.open-app {
		border-radius: var(--radius-md);
		background: var(--color-accent);
		padding: 0.65rem 0.9rem;
		color: var(--color-accent-contrast);
		font-size: var(--text-sm);
		font-weight: 750;
		text-decoration: none;
	}
	.languages {
		display: flex;
		gap: 0.15rem;
	}
	.languages a {
		border-radius: var(--radius-sm);
		padding: 0.42rem;
		color: var(--color-text-muted);
		font-size: 0.72rem;
		font-weight: 800;
		text-decoration: none;
	}
	.languages a:hover,
	.languages a.active {
		background: var(--color-surface-hover);
		color: var(--color-accent);
	}
	.legal-footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-3);
		border-top: 1px solid var(--color-border);
		padding: var(--space-5);
	}
	.legal-footer a {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}
	@media (max-width: 480px) {
		:global(.site-header) {
			padding-inline: var(--space-3);
		}
		.open-app {
			padding-inline: 0.7rem;
		}
		.languages a {
			padding: 0.35rem;
		}
	}
</style>
