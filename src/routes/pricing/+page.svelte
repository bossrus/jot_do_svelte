<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { AppLocale } from '$lib/client/locale';
	import { PLAN_DEFINITIONS, PAID_PLANS, type PaidPlan } from '$lib/billing/plans';
	import {
		BILLING_PERIODS,
		formatUsd,
		getMonthlyEquivalentCents,
		getPeriodPriceCents,
		type BillingPeriod
	} from '$lib/billing/pricing';

	let { locale = 'en' }: { locale?: AppLocale } = $props();
	let period = $state<BillingPeriod>('year');
	let origin = $derived(page.url.origin);
	let canonicalPath = $derived(locale === 'en' ? '/pricing' : `/${locale}/pricing`);
	let canonicalUrl = $derived(`${origin}${canonicalPath}`);

	const i18n = {
		en: {
			title: 'JotDo Pricing - Local-First Task Management Plans',
			description:
				'Compare JotDo plans for local-first task management, cloud sync, recurring tasks, sharing, and group collaboration. Start free; paid plans begin at $1.99/month.',
			about: 'About',
			pricing: 'Pricing',
			open: 'Open app',
			eyebrow: 'Simple, capability-based plans',
			hero1: 'Start with a fast local todo.',
			hero2: 'Add collaboration when you need it.',
			lead: 'JotDo is a local-first task manager designed for quick capture, offline work, and focused collaboration. Use the core app for free, then upgrade only for the cloud and sharing tools you actually need.',
			start: 'Start using JotDo',
			compare: 'Compare plans',
			freeNote: 'No account required for local tasks · Prices in USD',
			plansTitle: 'A plan for every way of working',
			plansLead: 'Move up one capability at a time: sync, join, share, then organize groups.',
			monthly: 'Monthly',
			yearly: 'Yearly',
			fiveYears: '5 years',
			flexibility: 'Maximum flexibility',
			better: 'Better value',
			best: 'Best long-term value',
			freeAudience: 'For personal tasks on one browser',
			freeTagline: 'A complete, private local todo list that works without registration.',
			forever: 'forever',
			useFree: 'Use JotDo free',
			choose: 'Choose',
			perMonth: '/ month',
			billedMonthly: 'Billed monthly',
			billedEveryYear: 'billed every year',
			billedFiveYears: 'billed every 5 years',
			popular: 'Most popular',
			billingNote:
				'Subscriptions are purchased inside the JotDo app and securely processed by Paddle. Displayed monthly equivalents are rounded to the nearest cent; checkout shows the full billed amount.',
			why: 'Why JotDo',
			whyTitle: 'A todo app that stays simple as work becomes shared',
			whyText:
				'Most tasks begin as one short thought. JotDo lets you capture that thought immediately, without choosing a project, configuring a board, or filling out a long form. More structure appears only when the task needs it.',
			compareCapabilities: 'Compare capabilities',
			chooseNeed: 'Choose by what you need to do',
			capability: 'Capability',
			faq: 'FAQ',
			faqTitle: 'JotDo pricing questions',
			finalEyebrow: 'Less setup, more done',
			finalTitle: 'Write down the task now. Add the team when it matters.',
			finalText:
				'Start locally for free and choose a paid plan only when you need sync or collaboration.',
			footer: 'Local-first task management and collaboration.'
		},
		ru: {
			title: 'Тарифы JotDo — локальный менеджер задач и совместная работа',
			description:
				'Сравните тарифы JotDo для локальных задач, облачной синхронизации, повторяющихся задач, общего доступа и групп. Начните бесплатно.',
			about: 'О сервисе',
			pricing: 'Тарифы',
			open: 'Открыть приложение',
			eyebrow: 'Простые тарифы по возможностям',
			hero1: 'Начните с быстрой локальной задачи.',
			hero2: 'Подключайте команду, когда это нужно.',
			lead: 'JotDo — локальный менеджер задач для быстрого ввода, работы без интернета и удобного взаимодействия. Пользуйтесь основными функциями бесплатно и подключайте облако и совместную работу только при необходимости.',
			start: 'Начать пользоваться JotDo',
			compare: 'Сравнить тарифы',
			freeNote: 'Для локальных задач аккаунт не нужен · Цены в долларах США',
			plansTitle: 'Тариф для каждого способа работы',
			plansLead: 'Добавляйте возможности поэтапно: синхронизацию, участие, общий доступ и группы.',
			monthly: 'Ежемесячно',
			yearly: 'За год',
			fiveYears: 'На 5 лет',
			flexibility: 'Максимальная гибкость',
			better: 'Выгоднее',
			best: 'Максимальная выгода',
			freeAudience: 'Для личных задач в одном браузере',
			freeTagline: 'Полноценный приватный список задач, работающий локально без регистрации.',
			forever: 'навсегда',
			useFree: 'Использовать бесплатно',
			choose: 'Выбрать',
			perMonth: '/ месяц',
			billedMonthly: 'Оплата ежемесячно',
			billedEveryYear: 'оплата за год',
			billedFiveYears: 'оплата за 5 лет',
			popular: 'Популярный',
			billingNote:
				'Подписка приобретается в приложении JotDo, а платёж безопасно обрабатывает Paddle. Эквивалент месячной цены округлён; при оформлении показывается полная сумма.',
			why: 'Почему JotDo',
			whyTitle: 'Простота сохраняется, даже когда задача становится общей',
			whyText:
				'Большинство дел начинается с короткой мысли. JotDo позволяет сразу записать её без создания проекта, выбора доски или заполнения длинной формы. Дополнительная структура появляется только тогда, когда она действительно нужна.',
			compareCapabilities: 'Сравнение возможностей',
			chooseNeed: 'Выберите то, что нужно именно вам',
			capability: 'Возможность',
			faq: 'Вопросы и ответы',
			faqTitle: 'Вопросы о тарифах JotDo',
			finalEyebrow: 'Меньше настройки — больше результата',
			finalTitle: 'Запишите задачу сейчас. Подключите команду при необходимости.',
			finalText:
				'Начните бесплатно с локальной работы и выберите платный тариф, когда понадобятся синхронизация или совместная работа.',
			footer: 'Локальное управление задачами и совместная работа.'
		},
		es: {
			title: 'Precios de JotDo — gestión de tareas local y colaborativa',
			description:
				'Compara los planes de JotDo para tareas locales, sincronización, tareas recurrentes, uso compartido y grupos. Empieza gratis.',
			about: 'Acerca de',
			pricing: 'Precios',
			open: 'Abrir aplicación',
			eyebrow: 'Planes sencillos según tus necesidades',
			hero1: 'Empieza con una tarea local al instante.',
			hero2: 'Añade colaboración cuando la necesites.',
			lead: 'JotDo es un gestor de tareas local-first para capturar ideas rápidamente, trabajar sin conexión y colaborar con claridad. Usa la aplicación básica gratis y añade nube y colaboración solo cuando las necesites.',
			start: 'Empezar con JotDo',
			compare: 'Comparar planes',
			freeNote: 'No necesitas una cuenta para tareas locales · Precios en USD',
			plansTitle: 'Un plan para cada forma de trabajar',
			plansLead: 'Añade funciones paso a paso: sincroniza, participa, comparte y organiza grupos.',
			monthly: 'Mensual',
			yearly: 'Anual',
			fiveYears: '5 años',
			flexibility: 'Máxima flexibilidad',
			better: 'Mejor precio',
			best: 'Máximo ahorro',
			freeAudience: 'Para tareas personales en un navegador',
			freeTagline: 'Una lista de tareas privada y completa que funciona localmente sin registro.',
			forever: 'para siempre',
			useFree: 'Usar JotDo gratis',
			choose: 'Elegir',
			perMonth: '/ mes',
			billedMonthly: 'Facturación mensual',
			billedEveryYear: 'facturado cada año',
			billedFiveYears: 'facturado cada 5 años',
			popular: 'Más popular',
			billingNote:
				'Las suscripciones se compran dentro de JotDo y Paddle procesa el pago de forma segura. El equivalente mensual está redondeado; el checkout muestra el importe total.',
			why: 'Por qué JotDo',
			whyTitle: 'Una aplicación sencilla incluso cuando el trabajo se comparte',
			whyText:
				'La mayoría de las tareas empiezan con una idea breve. JotDo permite capturarla al instante sin crear un proyecto, elegir un tablero ni completar formularios largos. La estructura adicional aparece solo cuando hace falta.',
			compareCapabilities: 'Comparar funciones',
			chooseNeed: 'Elige según lo que necesitas hacer',
			capability: 'Función',
			faq: 'Preguntas frecuentes',
			faqTitle: 'Preguntas sobre los precios de JotDo',
			finalEyebrow: 'Menos configuración, más resultados',
			finalTitle: 'Anota la tarea ahora. Añade al equipo cuando sea necesario.',
			finalText:
				'Empieza gratis de forma local y elige un plan de pago cuando necesites sincronización o colaboración.',
			footer: 'Gestión de tareas local-first y colaboración.'
		}
	} as const;
	let c = $derived(i18n[locale]);

	let periods = $derived([
		{ id: 'month' as const, label: c.monthly, note: c.flexibility },
		{ id: 'year' as const, label: c.yearly, note: c.better },
		{ id: 'five-years' as const, label: c.fiveYears, note: c.best }
	]);

	const englishPlanCopy: Record<
		PaidPlan,
		{ tagline: string; features: string[]; audience: string }
	> = {
		cloud: {
			tagline: 'Keep your tasks in sync and make recurring work effortless.',
			audience: 'For one person working across devices',
			features: ['Cloud synchronization', 'Recurring tasks', 'Everything in Free']
		},
		join: {
			tagline: 'Join tasks shared by other people and work together in context.',
			audience: 'For collaborators who are invited to shared work',
			features: ['Everything in Cloud', 'Join shared tasks', 'Task discussions and updates']
		},
		share: {
			tagline: 'Create shared tasks, invite people, and coordinate the work.',
			audience: 'For people who organize collaborative tasks',
			features: [
				'Everything in Join',
				'Share tasks with other users',
				'Invite links and access control'
			]
		},
		group: {
			tagline: 'Organize contacts into groups and share work with a whole team.',
			audience: 'For teams, families, and recurring groups',
			features: ['Everything in Share', 'Contact group management', 'Fast group sharing']
		}
	};
	const translatedPlanCopy = {
		ru: {
			cloud: {
				tagline: 'Синхронизируйте задачи и автоматизируйте повторяющиеся дела.',
				audience: 'Для работы одного человека на разных устройствах',
				features: ['Облачная синхронизация', 'Повторяющиеся задачи', 'Все возможности Free']
			},
			join: {
				tagline: 'Присоединяйтесь к общим задачам и работайте вместе в одном контексте.',
				audience: 'Для участников, приглашённых к совместной работе',
				features: [
					'Все возможности Cloud',
					'Участие в общих задачах',
					'Обсуждения и обновления задач'
				]
			},
			share: {
				tagline: 'Создавайте общие задачи, приглашайте людей и координируйте работу.',
				audience: 'Для тех, кто организует совместные задачи',
				features: [
					'Все возможности Join',
					'Общий доступ к задачам',
					'Ссылки-приглашения и управление доступом'
				]
			},
			group: {
				tagline: 'Объединяйте контакты в группы и делитесь задачами со всей командой.',
				audience: 'Для команд, семей и постоянных групп',
				features: [
					'Все возможности Share',
					'Управление группами контактов',
					'Быстрый общий доступ для группы'
				]
			}
		},
		es: {
			cloud: {
				tagline: 'Sincroniza tus tareas y simplifica el trabajo recurrente.',
				audience: 'Para una persona que trabaja en varios dispositivos',
				features: ['Sincronización en la nube', 'Tareas recurrentes', 'Todo lo incluido en Free']
			},
			join: {
				tagline: 'Únete a tareas compartidas y colabora con todo el contexto.',
				audience: 'Para colaboradores invitados a tareas compartidas',
				features: [
					'Todo lo incluido en Cloud',
					'Participar en tareas compartidas',
					'Conversaciones y actualizaciones'
				]
			},
			share: {
				tagline: 'Crea tareas compartidas, invita a otras personas y coordina el trabajo.',
				audience: 'Para quienes organizan tareas colaborativas',
				features: [
					'Todo lo incluido en Join',
					'Compartir tareas con otros usuarios',
					'Enlaces de invitación y control de acceso'
				]
			},
			group: {
				tagline: 'Organiza contactos en grupos y comparte tareas con todo el equipo.',
				audience: 'Para equipos, familias y grupos habituales',
				features: [
					'Todo lo incluido en Share',
					'Gestión de grupos de contactos',
					'Uso compartido rápido con grupos'
				]
			}
		}
	} satisfies Record<
		Exclude<AppLocale, 'en'>,
		Record<PaidPlan, { tagline: string; features: string[]; audience: string }>
	>;
	let planCopy = $derived(locale === 'en' ? englishPlanCopy : translatedPlanCopy[locale]);

	const englishFaq = [
		{
			question: 'Can I use JotDo for free?',
			answer:
				'Yes. The Free plan lets you create, edit, search, filter, complete, and reopen tasks locally in your browser. You can start without an account.'
		},
		{
			question: 'What does local-first mean?',
			answer:
				'Your local tasks remain available in the browser, including when you are offline. Paid plans add account-based cloud synchronization and collaboration capabilities.'
		},
		{
			question: 'Which plan do I need for sharing?',
			answer:
				'Choose Share if you want to create shared tasks and invite other people. Group adds contact groups for sharing with the same set of people more quickly.'
		},
		{
			question: 'How are subscriptions billed?',
			answer:
				'Paid plans are available monthly, yearly, or for five years. Prices are displayed in US dollars, and checkout is securely processed by Paddle.'
		}
	];
	const translatedFaq = {
		ru: [
			{
				question: 'Можно ли пользоваться JotDo бесплатно?',
				answer:
					'Да. Тариф Free позволяет создавать, редактировать, искать, фильтровать, закрывать и возвращать задачи локально в браузере. Начать можно без аккаунта.'
			},
			{
				question: 'Что означает local-first?',
				answer:
					'Локальные задачи остаются доступными в браузере, даже без интернета. Платные тарифы добавляют облачную синхронизацию и совместную работу через аккаунт.'
			},
			{
				question: 'Какой тариф нужен для общего доступа?',
				answer:
					'Выберите Share, если хотите создавать общие задачи и приглашать людей. Group дополнительно позволяет объединять контакты в группы.'
			},
			{
				question: 'Как оплачивается подписка?',
				answer:
					'Доступны ежемесячная, годовая и пятилетняя подписки. Цены указаны в долларах США, а платежи безопасно обрабатывает Paddle.'
			}
		],
		es: [
			{
				question: '¿Puedo usar JotDo gratis?',
				answer:
					'Sí. El plan Free permite crear, editar, buscar, filtrar, completar y reabrir tareas localmente en el navegador. Puedes empezar sin una cuenta.'
			},
			{
				question: '¿Qué significa local-first?',
				answer:
					'Tus tareas locales siguen disponibles en el navegador incluso sin conexión. Los planes de pago añaden sincronización y colaboración mediante una cuenta.'
			},
			{
				question: '¿Qué plan necesito para compartir?',
				answer:
					'Elige Share para crear tareas compartidas e invitar a otras personas. Group añade grupos de contactos para compartir más rápidamente.'
			},
			{
				question: '¿Cómo se facturan las suscripciones?',
				answer:
					'Hay suscripciones mensuales, anuales y de cinco años. Los precios están en dólares estadounidenses y Paddle procesa el pago de forma segura.'
			}
		]
	};
	let faq = $derived(locale === 'en' ? englishFaq : translatedFaq[locale]);
	const details = {
		en: {
			free: [
				'Fast task capture and editing',
				'Offline browser storage',
				'Search, filters, images, and task discussions'
			],
			features: [
				[
					'Local-first and offline',
					'Tasks are saved in the browser first, so creating and reviewing work does not depend on a network connection.'
				],
				[
					'Cloud synchronization',
					'Sign in with an eligible plan to keep tasks, images, discussions, and status synchronized across devices.'
				],
				[
					'Sharing with context',
					'Share a task with a person or group, assign participants, discuss details, and track who is doing or has finished the work.'
				],
				[
					'Recurring tasks',
					'Create schedules for daily, weekday, interval, weekly, and monthly routines without rebuilding the same task.'
				],
				[
					'Rich task content',
					'Combine ordered text and image blocks, annotate images, and keep the supporting conversation next to the task.'
				],
				[
					'Made for real life',
					'Use JotDo for personal reminders, family coordination, small teams, repeatable processes, and lightweight project work.'
				]
			],
			rows: [
				'Local task management',
				'Cloud sync',
				'Recurring tasks',
				'Join shared tasks',
				'Create and share tasks',
				'Manage contact groups'
			]
		},
		ru: {
			free: [
				'Быстрое создание и редактирование задач',
				'Работа без интернета в браузере',
				'Поиск, фильтры, изображения и обсуждения'
			],
			features: [
				[
					'Локальная работа без интернета',
					'Задачи сначала сохраняются в браузере, поэтому их можно создавать и просматривать без подключения к сети.'
				],
				[
					'Облачная синхронизация',
					'Войдите в аккаунт с подходящим тарифом, чтобы синхронизировать задачи, изображения, обсуждения и статусы между устройствами.'
				],
				[
					'Общий контекст работы',
					'Делитесь задачей с человеком или группой, назначайте участников, обсуждайте детали и отслеживайте выполнение.'
				],
				[
					'Повторяющиеся задачи',
					'Создавайте расписания для ежедневных, будничных, интервальных, еженедельных и ежемесячных дел.'
				],
				[
					'Содержательные задачи',
					'Объединяйте текст и изображения, делайте пометки на картинках и храните обсуждение рядом с задачей.'
				],
				[
					'Для повседневной жизни',
					'Используйте JotDo для личных напоминаний, семьи, небольших команд, регулярных процессов и лёгких проектов.'
				]
			],
			rows: [
				'Локальное управление задачами',
				'Облачная синхронизация',
				'Повторяющиеся задачи',
				'Участие в общих задачах',
				'Создание общих задач',
				'Управление группами контактов'
			]
		},
		es: {
			free: [
				'Captura y edición rápida de tareas',
				'Almacenamiento sin conexión en el navegador',
				'Búsqueda, filtros, imágenes y conversaciones'
			],
			features: [
				[
					'Local-first y sin conexión',
					'Las tareas se guardan primero en el navegador, por lo que puedes crearlas y revisarlas sin depender de la red.'
				],
				[
					'Sincronización en la nube',
					'Inicia sesión con un plan compatible para sincronizar tareas, imágenes, conversaciones y estados entre dispositivos.'
				],
				[
					'Colaboración con contexto',
					'Comparte una tarea con una persona o grupo, asigna participantes, comenta detalles y sigue el progreso.'
				],
				[
					'Tareas recurrentes',
					'Crea horarios diarios, laborables, por intervalos, semanales y mensuales sin reconstruir la misma tarea.'
				],
				[
					'Contenido enriquecido',
					'Combina texto e imágenes, anota imágenes y conserva la conversación junto a la tarea.'
				],
				[
					'Para la vida real',
					'Usa JotDo para recordatorios personales, coordinación familiar, equipos pequeños, procesos repetibles y proyectos ligeros.'
				]
			],
			rows: [
				'Gestión local de tareas',
				'Sincronización en la nube',
				'Tareas recurrentes',
				'Participar en tareas compartidas',
				'Crear y compartir tareas',
				'Gestionar grupos de contactos'
			]
		}
	} as const;
	let d = $derived(details[locale]);

	let softwareSchema = $derived({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'JotDo',
		url: canonicalUrl,
		applicationCategory: 'ProductivityApplication',
		operatingSystem: 'Web',
		description: c.description,
		inLanguage: locale,
		offers: [
			{ '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
			...PAID_PLANS.map((plan) => ({
				'@type': 'Offer',
				name: PLAN_DEFINITIONS[plan].label,
				price: (getPeriodPriceCents(plan, 'month') / 100).toFixed(2),
				priceCurrency: 'USD',
				url: canonicalUrl
			}))
		]
	});

	let faqSchema = $derived({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faq.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: { '@type': 'Answer', text: item.answer }
		}))
	});
</script>

<svelte:head>
	<title>{c.title}</title>
	<meta name="description" content={c.description} />
	<meta
		name="keywords"
		content="JotDo pricing, task management app, local-first todo app, collaborative task manager, offline todo app, recurring tasks, team task sharing"
	/>
	<meta
		name="robots"
		content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
	/>
	<link rel="canonical" href={canonicalUrl} />
	<link rel="alternate" hreflang="en" href={`${origin}/pricing`} />
	<link rel="alternate" hreflang="ru" href={`${origin}/ru/pricing`} />
	<link rel="alternate" hreflang="es" href={`${origin}/es/pricing`} />
	<link rel="alternate" hreflang="x-default" href={`${origin}/pricing`} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="JotDo" />
	<meta property="og:title" content={c.title} />
	<meta property="og:description" content={c.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={c.title} />
	<meta name="twitter:description" content={c.description} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${JSON.stringify(softwareSchema)}<${'/'}script>`}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}<${'/'}script>`}
</svelte:head>

<header class="site-header">
	<a class="brand" href={resolve('/app')} aria-label="Open JotDo">Jot<span>DO</span></a>
	<nav aria-label="Primary navigation">
		<span class="language-switch" aria-label="Language">
			<a class:active={locale === 'en'} href="/pricing">EN</a>
			<a class:active={locale === 'ru'} href="/ru/pricing">RU</a>
			<a class:active={locale === 'es'} href="/es/pricing">ES</a>
		</span>
		<a href={locale === 'en' ? '/about' : `/${locale}/about`}>{c.about}</a>
		<a class="active" href={canonicalPath}>{c.pricing}</a>
		<a class="open-app" href={resolve('/app')}>{c.open}</a>
	</nav>
</header>

<main>
	<section class="hero">
		<p class="eyebrow">{c.eyebrow}</p>
		<h1>{c.hero1}<br />{c.hero2}</h1>
		<p class="lead">{c.lead}</p>
		<div class="hero-actions">
			<a class="primary" href={resolve('/app')}>{c.start}</a>
			<a class="secondary" href="#plans">{c.compare}</a>
		</div>
		<p class="free-note">{c.freeNote}</p>
	</section>

	<section class="pricing" id="plans" aria-labelledby="plans-title">
		<div class="section-heading">
			<p class="eyebrow">{c.pricing}</p>
			<h2 id="plans-title">{c.plansTitle}</h2>
			<p>{c.plansLead}</p>
		</div>

		<div class="period-tabs" role="tablist" aria-label="Billing period">
			{#each periods as item}
				<button
					type="button"
					role="tab"
					aria-selected={period === item.id}
					class:active={period === item.id}
					onclick={() => (period = item.id)}
				>
					<strong>{item.label}</strong><span>{item.note}</span>
				</button>
			{/each}
		</div>

		<div class="plan-grid">
			<article class="plan-card free-card">
				<div>
					<p class="audience">{c.freeAudience}</p>
					<h3>Free</h3>
				</div>
				<p class="tagline">{c.freeTagline}</p>
				<p class="price"><strong>$0</strong><span>{c.forever}</span></p>
				<ul>
					{#each d.free as feature}<li>{feature}</li>{/each}
				</ul>
				<a href={resolve('/app')}>{c.useFree}</a>
			</article>

			{#each PAID_PLANS as plan}
				<article class:featured={plan === 'share'} class="plan-card">
					{#if plan === 'share'}<span class="popular">{c.popular}</span>{/if}
					<div>
						<p class="audience">{planCopy[plan].audience}</p>
						<h3>{PLAN_DEFINITIONS[plan].label}</h3>
					</div>
					<p class="tagline">{planCopy[plan].tagline}</p>
					<p class="price">
						<strong>{formatUsd(getMonthlyEquivalentCents(plan, period))}</strong><span
							>{c.perMonth}</span
						>
					</p>
					<p class="total">
						{period === 'month'
							? c.billedMonthly
							: `${formatUsd(getPeriodPriceCents(plan, period))} ${BILLING_PERIODS[period].months === 12 ? c.billedEveryYear : c.billedFiveYears}`}
					</p>
					<ul>
						{#each planCopy[plan].features as feature}<li>{feature}</li>{/each}
					</ul>
					<a href={resolve('/app')}>{c.choose} {PLAN_DEFINITIONS[plan].label}</a>
				</article>
			{/each}
		</div>
		<p class="billing-note">{c.billingNote}</p>
	</section>

	<section class="story" aria-labelledby="why-jotdo">
		<div class="story-intro">
			<p class="eyebrow">{c.why}</p>
			<h2 id="why-jotdo">{c.whyTitle}</h2>
			<p>{c.whyText}</p>
		</div>
		<div class="feature-grid">
			{#each d.features as feature, index}
				<article>
					<span>{String(index + 1).padStart(2, '0')}</span>
					<h3>{feature[0]}</h3>
					<p>{feature[1]}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="comparison" aria-labelledby="comparison-title">
		<div class="section-heading">
			<p class="eyebrow">{c.compareCapabilities}</p>
			<h2 id="comparison-title">{c.chooseNeed}</h2>
		</div>
		<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>{c.capability}</th><th>Free</th><th>Cloud</th><th>Join</th><th>Share</th><th
							>Group</th
						></tr
					></thead
				>
				<tbody>
					<tr><th>{d.rows[0]}</th><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
					<tr><th>{d.rows[1]}</th><td>—</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
					<tr><th>{d.rows[2]}</th><td>—</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
					<tr><th>{d.rows[3]}</th><td>—</td><td>—</td><td>✓</td><td>✓</td><td>✓</td></tr>
					<tr><th>{d.rows[4]}</th><td>—</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
					<tr><th>{d.rows[5]}</th><td>—</td><td>—</td><td>—</td><td>—</td><td>✓</td></tr>
				</tbody>
			</table>
		</div>
	</section>

	<section class="faq" aria-labelledby="faq-title">
		<div class="section-heading">
			<p class="eyebrow">{c.faq}</p>
			<h2 id="faq-title">{c.faqTitle}</h2>
		</div>
		<div class="faq-list">
			{#each faq as item}<details>
					<summary>{item.question}</summary>
					<p>{item.answer}</p>
				</details>{/each}
		</div>
	</section>

	<section class="final-cta">
		<p class="eyebrow">{c.finalEyebrow}</p>
		<h2>{c.finalTitle}</h2>
		<p>{c.finalText}</p>
		<a class="primary" href={resolve('/app')}>{c.open}</a>
	</section>
</main>

<footer>
	<a class="brand" href={resolve('/app')}>Jot<span>DO</span></a>
	<p>{c.footer}</p>
	<nav aria-label="Footer navigation">
		<a href={locale === 'en' ? '/about' : `/${locale}/about`}>{c.about}</a><a href={canonicalPath}
			>{c.pricing}</a
		>
	</nav>
	<nav class="legal-links" aria-label="Legal navigation">
		<a href={locale === 'en' ? '/terms' : `/${locale}/terms`}>Terms</a>
		<a href={locale === 'en' ? '/privacy' : `/${locale}/privacy`}>Privacy</a>
		<a href={locale === 'en' ? '/refunds' : `/${locale}/refunds`}>Refunds</a>
	</nav>
	<small>© {new Date().getFullYear()} JotDo</small>
</footer>

<style>
	:global(body) {
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	.site-header {
		position: sticky;
		z-index: 20;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 4rem;
		border-bottom: 1px solid var(--color-border);
		background: color-mix(in srgb, var(--color-surface) 92%, transparent);
		padding: 0.65rem max(1rem, calc((100% - 72rem) / 2));
		backdrop-filter: blur(12px);
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
	nav {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	nav a {
		border-radius: var(--radius-md);
		padding: 0.65rem 0.8rem;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		font-weight: 700;
		text-decoration: none;
	}
	nav a.active {
		color: var(--color-accent);
	}
	.language-switch {
		display: flex;
		gap: 0.1rem;
		margin-right: 0.35rem;
	}
	.language-switch a {
		padding: 0.42rem;
		font-size: 0.68rem;
	}
	nav a.open-app,
	.primary {
		background: var(--color-accent);
		color: var(--color-accent-contrast);
	}
	main {
		overflow: hidden;
	}
	section {
		padding: clamp(4rem, 8vw, 7rem) max(1rem, calc((100% - 72rem) / 2));
	}
	.hero {
		position: relative;
		isolation: isolate;
		min-height: 39rem;
		display: grid;
		align-content: center;
		background:
			radial-gradient(circle at 78% 15%, rgb(50 106 75 / 18%), transparent 32%),
			linear-gradient(145deg, var(--color-surface), var(--color-bg));
	}
	.hero::after {
		position: absolute;
		z-index: -1;
		right: -7rem;
		bottom: -11rem;
		width: 31rem;
		height: 31rem;
		border: 1px solid var(--color-border);
		border-radius: 50%;
		content: '';
		box-shadow:
			0 0 0 4rem rgb(50 106 75 / 4%),
			0 0 0 8rem rgb(50 106 75 / 3%);
	}
	.eyebrow {
		margin: 0 0 1rem;
		color: var(--color-accent);
		font-size: 0.76rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		max-width: 57rem;
		margin: 0;
		font-size: clamp(2.7rem, 6vw, 5.6rem);
		line-height: 0.98;
		letter-spacing: -0.065em;
	}
	.lead {
		max-width: 46rem;
		margin: 1.7rem 0 0;
		color: var(--color-text-muted);
		font-size: clamp(1.05rem, 2vw, 1.3rem);
		line-height: 1.7;
	}
	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 2rem;
	}
	.hero-actions a,
	.final-cta > a {
		border-radius: 0.75rem;
		padding: 0.9rem 1.2rem;
		font-weight: 800;
		text-decoration: none;
	}
	.secondary {
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
	}
	.free-note {
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}
	.pricing {
		background: var(--color-surface);
	}
	.section-heading {
		max-width: 48rem;
		margin: 0 auto 2.2rem;
		text-align: center;
	}
	.section-heading h2,
	.story h2,
	.final-cta h2 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3.5rem);
		line-height: 1.08;
		letter-spacing: -0.045em;
	}
	.section-heading > p:last-child,
	.story-intro > p:last-child,
	.final-cta > p {
		color: var(--color-text-muted);
		line-height: 1.7;
	}
	.period-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		width: min(100%, 38rem);
		margin: 0 auto 2.2rem;
		border-radius: 0.9rem;
		background: var(--color-bg);
		padding: 0.35rem;
	}
	.period-tabs button {
		display: grid;
		gap: 0.15rem;
		border: 0;
		border-radius: 0.65rem;
		background: transparent;
		padding: 0.65rem;
		cursor: pointer;
	}
	.period-tabs button.active {
		background: var(--color-surface);
		color: var(--color-accent);
		box-shadow: var(--shadow-sm);
	}
	.period-tabs span {
		color: var(--color-text-muted);
		font-size: 0.67rem;
	}
	.plan-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.8rem;
	}
	.plan-card {
		position: relative;
		display: flex;
		min-width: 0;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		background: var(--color-surface);
		padding: 1.25rem;
	}
	.plan-card.featured {
		border: 2px solid var(--color-accent);
		padding: calc(1.25rem - 1px);
		box-shadow: var(--shadow-md);
	}
	.popular {
		position: absolute;
		top: -0.75rem;
		left: 50%;
		transform: translateX(-50%);
		border-radius: 2rem;
		background: var(--color-accent);
		padding: 0.25rem 0.65rem;
		color: var(--color-accent-contrast);
		font-size: 0.64rem;
		font-weight: 850;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.audience {
		min-height: 2.7rem;
		margin: 0 0 0.5rem;
		color: var(--color-text-muted);
		font-size: 0.72rem;
		line-height: 1.4;
	}
	.plan-card h3 {
		margin: 0;
		font-size: 1.45rem;
	}
	.tagline {
		min-height: 5.7rem;
		color: var(--color-text-muted);
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.price {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
		margin: 0.6rem 0 0;
	}
	.price strong {
		font-size: 1.65rem;
		letter-spacing: -0.04em;
	}
	.price span,
	.total {
		color: var(--color-text-muted);
		font-size: 0.68rem;
	}
	.total {
		min-height: 2rem;
		margin: 0.25rem 0 1rem;
	}
	.plan-card ul {
		display: grid;
		gap: 0.65rem;
		margin: 0 0 1.2rem;
		padding: 0;
		list-style: none;
		font-size: 0.76rem;
		line-height: 1.4;
	}
	.plan-card li::before {
		margin-right: 0.35rem;
		color: var(--color-accent);
		content: '✓';
		font-weight: 900;
	}
	.plan-card > a {
		margin-top: auto;
		border: 1px solid var(--color-accent);
		border-radius: 0.65rem;
		padding: 0.7rem;
		color: var(--color-accent);
		font-size: 0.78rem;
		font-weight: 800;
		text-align: center;
		text-decoration: none;
	}
	.featured > a {
		background: var(--color-accent);
		color: var(--color-accent-contrast);
	}
	.billing-note {
		max-width: 48rem;
		margin: 1.5rem auto 0;
		color: var(--color-text-muted);
		font-size: 0.74rem;
		line-height: 1.6;
		text-align: center;
	}
	.story {
		background: var(--color-bg);
	}
	.story-intro {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		gap: 3rem;
		align-items: end;
	}
	.story-intro .eyebrow {
		grid-column: 1 / -1;
		margin-bottom: -2rem;
	}
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		margin-top: 4rem;
		border: 1px solid var(--color-border);
		background: var(--color-border);
	}
	.feature-grid article {
		background: var(--color-surface);
		padding: 2rem;
	}
	.feature-grid span {
		color: var(--color-accent);
		font-size: 0.72rem;
		font-weight: 900;
	}
	.feature-grid h3 {
		margin: 1rem 0 0.6rem;
		font-size: 1.15rem;
	}
	.feature-grid p {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.88rem;
		line-height: 1.65;
	}
	.comparison {
		background: var(--color-surface);
	}
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: 1rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 43rem;
	}
	th,
	td {
		border-bottom: 1px solid var(--color-border);
		padding: 1rem;
		text-align: center;
	}
	th:first-child {
		text-align: left;
	}
	thead {
		background: var(--color-bg);
	}
	tbody td {
		color: var(--color-accent);
		font-weight: 900;
	}
	.faq {
		background: var(--color-bg);
	}
	.faq-list {
		width: min(100%, 50rem);
		margin: auto;
	}
	details {
		border-bottom: 1px solid var(--color-border);
		padding: 1.2rem 0;
	}
	summary {
		font-size: 1.05rem;
		font-weight: 800;
		cursor: pointer;
	}
	details p {
		color: var(--color-text-muted);
		line-height: 1.7;
	}
	.final-cta {
		background: #173224;
		color: #fff;
		text-align: center;
	}
	.final-cta .eyebrow,
	.final-cta > p {
		color: #b8d7c3;
	}
	.final-cta > p {
		max-width: 42rem;
		margin: 1rem auto 2rem;
	}
	.final-cta > a {
		display: inline-block;
		background: #fff;
		color: #173224;
	}
	footer {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 1rem 2rem;
		border-top: 1px solid var(--color-border);
		padding: 2rem max(1rem, calc((100% - 72rem) / 2));
	}
	footer p,
	footer small {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
	footer small {
		grid-column: 1 / -1;
	}
	@media (max-width: 1050px) {
		.plan-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.free-card {
			grid-column: 1 / -1;
		}
		.tagline,
		.audience {
			min-height: 0;
		}
	}
	@media (max-width: 720px) {
		.site-header nav > a:not(.open-app) {
			display: none;
		}
		.plan-grid,
		.feature-grid,
		.story-intro {
			grid-template-columns: 1fr;
		}
		.free-card {
			grid-column: auto;
		}
		.story-intro .eyebrow {
			grid-column: auto;
			margin-bottom: -1.7rem;
		}
		footer {
			grid-template-columns: 1fr;
		}
		footer small {
			grid-column: auto;
		}
		.period-tabs span {
			display: none;
		}
	}
</style>
