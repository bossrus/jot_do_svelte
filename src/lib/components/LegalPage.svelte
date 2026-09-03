<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { AppLocale } from '$lib/client/locale';

	type LegalKind = 'terms' | 'privacy' | 'refunds';
	type Section = { heading: string; paragraphs: string[] };
	let { locale, kind }: { locale: AppLocale; kind: LegalKind } = $props();
	let origin = $derived(page.url.origin);
	let path = $derived(locale === 'en' ? `/${kind}` : `/${locale}/${kind}`);
	const updated = 'September 3, 2026';

	const common = {
		en: {
			about: 'About',
			pricing: 'Pricing',
			terms: 'Terms of Service',
			privacy: 'Privacy Policy',
			refunds: 'Refund Policy',
			open: 'Open app',
			updated: 'Last updated',
			contact: 'Contact',
			footer: 'JotDo is operated by Vasilii Bulykin in Kyrgyzstan.'
		},
		ru: {
			about: 'О сервисе',
			pricing: 'Тарифы',
			terms: 'Условия использования',
			privacy: 'Политика конфиденциальности',
			refunds: 'Политика возврата',
			open: 'Открыть приложение',
			updated: 'Последнее обновление',
			contact: 'Контакты',
			footer: 'Оператор сервиса JotDo — Vasilii Bulykin, Kyrgyzstan.'
		},
		es: {
			about: 'Acerca de',
			pricing: 'Precios',
			terms: 'Términos del servicio',
			privacy: 'Política de privacidad',
			refunds: 'Política de reembolso',
			open: 'Abrir aplicación',
			updated: 'Última actualización',
			contact: 'Contacto',
			footer: 'JotDo está operado por Vasilii Bulykin en Kyrgyzstan.'
		}
	} as const;

	const content: Record<AppLocale, Record<LegalKind, { intro: string; sections: Section[] }>> = {
		en: {
			terms: {
				intro:
					'These Terms govern access to and use of the JotDo task management and collaboration service operated by Vasilii Bulykin in Kyrgyzstan.',
				sections: [
					{
						heading: '1. The service',
						paragraphs: [
							'JotDo is a local-first web application for creating and organizing tasks, working offline, synchronizing data, sharing tasks, discussing work, assigning participants, and creating recurring tasks.',
							'Local features may be used without an account. An account and an eligible paid plan are required for specific cloud and collaboration capabilities.'
						]
					},
					{
						heading: '2. Accounts and acceptable use',
						paragraphs: [
							'You are responsible for the accuracy of account information and for keeping your credentials secure. You must not use JotDo unlawfully, interfere with the service, attempt unauthorized access, distribute malicious content, infringe third-party rights, or abuse sharing and communication features.'
						]
					},
					{
						heading: '3. Your content',
						paragraphs: [
							'You retain ownership of the task text, images, discussions, and other content you submit. You grant JotDo the limited permission necessary to store, process, synchronize, display, and transmit that content solely to provide the features you request.',
							'You are responsible for having the rights and permissions required for content you upload or share.'
						]
					},
					{
						heading: '4. Paid plans and billing',
						paragraphs: [
							'Current features and prices are listed on the JotDo pricing page. Paid transactions are processed by Paddle, which acts as merchant of record and may apply its buyer terms, taxes, invoices, payment methods, and mandatory consumer protections.',
							'Subscriptions renew for the selected billing period until canceled. Cancellation prevents the next renewal; access normally continues through the already-paid period.'
						]
					},
					{
						heading: '5. Availability and changes',
						paragraphs: [
							'We aim to keep JotDo reliable but do not guarantee uninterrupted or error-free operation. Features may change to improve security, performance, legal compliance, or the product. Material changes to these Terms will be published on this page.'
						]
					},
					{
						heading: '6. Limitation of liability',
						paragraphs: [
							'To the extent permitted by applicable law, JotDo is provided without warranties beyond those that cannot legally be excluded. Vasilii Bulykin is not liable for indirect, incidental, or consequential losses. Nothing in these Terms limits mandatory consumer rights or liability that cannot be limited by law.'
						]
					},
					{
						heading: '7. Termination and governing law',
						paragraphs: [
							'You may stop using JotDo at any time. Access may be suspended for serious or repeated violations, security threats, fraud, or legal requirements.',
							'These Terms are governed by the laws of the Kyrgyz Republic, without limiting mandatory rights available to consumers in their country of residence.'
						]
					}
				]
			},
			privacy: {
				intro:
					'This Policy explains how JotDo, operated by Vasilii Bulykin in Kyrgyzstan, handles personal data when you use the website and application.',
				sections: [
					{
						heading: '1. Data we process',
						paragraphs: [
							'We may process account data such as your name, email address, verification status, plan, and session information; task and collaboration data you choose to synchronize or share; support messages; and technical data needed for security, diagnostics, and operation.',
							'Tasks kept only in local browser storage are not uploaded unless you use a feature that synchronizes or transmits them.'
						]
					},
					{
						heading: '2. Why we process data',
						paragraphs: [
							'We process data to create and secure accounts, provide synchronization and collaboration, deliver support, prevent abuse, maintain the service, fulfill purchases, comply with legal obligations, and communicate essential service information.'
						]
					},
					{
						heading: '3. Service providers',
						paragraphs: [
							'We use service providers for hosting, databases, object storage, transactional email, and operational infrastructure. Paddle acts as merchant of record for paid transactions and processes payment, billing, tax, fraud-prevention, and transaction data under its own privacy notice.',
							'We share only the information reasonably necessary for these providers to perform their services or when disclosure is required by law.'
						]
					},
					{
						heading: '4. Retention and security',
						paragraphs: [
							'We retain personal data only for as long as needed for the purposes described, account administration, dispute resolution, security, and legal obligations. We use reasonable technical and organizational safeguards, but no online system can guarantee absolute security.'
						]
					},
					{
						heading: '5. Your choices and rights',
						paragraphs: [
							'Depending on applicable law, you may request access, correction, deletion, restriction, portability, or objection to certain processing. You may also withdraw consent where consent is the legal basis. Requests can be sent to the contact email below.',
							'You can keep using local tasks without an account, stop synchronization, or request account assistance. Some records may be retained when legally required.'
						]
					},
					{
						heading: '6. International processing and children',
						paragraphs: [
							'Data may be processed in countries where our service providers operate, subject to appropriate legal safeguards. JotDo is not directed to children who cannot lawfully consent to data processing in their jurisdiction.'
						]
					},
					{
						heading: '7. Changes',
						paragraphs: [
							'We may update this Policy as the service or legal requirements change. The current version and effective date will remain available on this page.'
						]
					}
				]
			},
			refunds: {
				intro:
					'This Policy describes the voluntary JotDo refund window and how cancellations and refunds for purchases processed by Paddle are handled.',
				sections: [
					{
						heading: '1. Seven-day refund window',
						paragraphs: [
							'You may request a refund within 7 calendar days of the initial purchase or renewal. Requests are reviewed based on the circumstances, including use of paid cloud and collaboration features, abuse, fraud, and technical problems.',
							'This voluntary policy does not reduce any mandatory cancellation, withdrawal, refund, or consumer rights that apply under the law of your country. Where mandatory law or Paddle’s buyer terms provide greater protection, that protection prevails.'
						]
					},
					{
						heading: '2. How to request a refund',
						paragraphs: [
							'Because Paddle is the merchant of record, submit transaction and refund requests through Paddle Buyer Support at paddle.net or contact us at boss_soft@mail.ru so we can help identify the purchase. Do not send full payment-card details by email.'
						]
					},
					{
						heading: '3. Subscriptions and cancellation',
						paragraphs: [
							'You may cancel a subscription at any time through the Paddle customer portal or the link in your purchase email. Cancellation takes effect at the end of the current paid period and prevents future renewal charges; it does not automatically refund the current period.'
						]
					},
					{
						heading: '4. Technical failures and duplicate charges',
						paragraphs: [
							'If paid functionality was not delivered because of a verified technical failure, or you believe you were charged twice, contact us or Paddle promptly. Paddle may approve a full or partial refund and returns approved funds to the original payment method.'
						]
					},
					{
						heading: '5. Exclusions',
						paragraphs: [
							'A discretionary refund may be declined where the request is fraudulent or abusive, the paid service has been substantially used, or the request falls outside the stated window and no mandatory legal right applies.'
						]
					}
				]
			}
		},
		ru: {} as Record<LegalKind, { intro: string; sections: Section[] }>,
		es: {} as Record<LegalKind, { intro: string; sections: Section[] }>
	};

	// Russian and Spanish pages intentionally present the same binding policy in localized form.
	content.ru = {
		terms: {
			intro:
				'Настоящие Условия регулируют использование сервиса управления задачами JotDo, оператором которого является Vasilii Bulykin, Kyrgyzstan.',
			sections: [
				{
					heading: '1. Сервис',
					paragraphs: [
						'JotDo — локальное веб-приложение для создания задач, работы без интернета, синхронизации, общего доступа, обсуждений, назначения участников и повторяющихся задач. Локальные функции доступны без аккаунта; облачные и совместные возможности требуют аккаунта и подходящего тарифа.'
					]
				},
				{
					heading: '2. Аккаунт и допустимое использование',
					paragraphs: [
						'Вы отвечаете за точность данных и безопасность доступа. Запрещено незаконное использование, вмешательство в работу сервиса, несанкционированный доступ, вредоносный контент, нарушение прав третьих лиц и злоупотребление функциями общения.'
					]
				},
				{
					heading: '3. Пользовательский контент',
					paragraphs: [
						'Вы сохраняете права на свои задачи, изображения и обсуждения и предоставляете JotDo только разрешение, необходимое для хранения, обработки, синхронизации и передачи данных ради выбранных вами функций.'
					]
				},
				{
					heading: '4. Тарифы и платежи',
					paragraphs: [
						'Актуальные возможности и цены размещены на странице тарифов. Платежи обрабатывает Paddle как merchant of record; применяются условия покупателей Paddle, налоги и обязательные права потребителей. Подписка продлевается до отмены.'
					]
				},
				{
					heading: '5. Доступность и изменения',
					paragraphs: [
						'Мы стремимся обеспечить надёжную работу, но не гарантируем отсутствие перерывов и ошибок. Функции могут меняться ради безопасности, производительности, закона или развития продукта.'
					]
				},
				{
					heading: '6. Ответственность',
					paragraphs: [
						'В пределах, разрешённых законом, JotDo предоставляется без дополнительных гарантий. Ответственность, которую нельзя исключить законом, и обязательные права потребителей не ограничиваются.'
					]
				},
				{
					heading: '7. Прекращение и применимое право',
					paragraphs: [
						'Доступ может быть приостановлен при серьёзных нарушениях, угрозах безопасности, мошенничестве или требованиях закона. Применяется право Кыргызской Республики без ограничения обязательных прав потребителей по месту проживания.'
					]
				}
			]
		},
		privacy: {
			intro:
				'Политика объясняет, как JotDo, оператор Vasilii Bulykin, Kyrgyzstan, обрабатывает персональные данные.',
			sections: [
				{
					heading: '1. Какие данные обрабатываются',
					paragraphs: [
						'Мы можем обрабатывать имя, email, статус подтверждения, тариф и сессии; синхронизируемые задачи и данные совместной работы; обращения в поддержку и технические сведения для безопасности. Локальные задачи не загружаются, пока вы не используете функцию передачи или синхронизации.'
					]
				},
				{
					heading: '2. Цели обработки',
					paragraphs: [
						'Данные нужны для аккаунтов, синхронизации, совместной работы, поддержки, предотвращения злоупотреблений, покупок, выполнения закона и важных сервисных сообщений.'
					]
				},
				{
					heading: '3. Поставщики услуг',
					paragraphs: [
						'Поставщики помогают с хостингом, базами данных, хранением файлов, почтой и инфраструктурой. Paddle обрабатывает платёжные, налоговые и антифрод-данные как merchant of record по собственной политике конфиденциальности.'
					]
				},
				{
					heading: '4. Хранение и безопасность',
					paragraphs: [
						'Данные хранятся только необходимый срок с учётом администрирования, споров, безопасности и закона. Применяются разумные меры защиты, но абсолютная безопасность онлайн-систем не гарантируется.'
					]
				},
				{
					heading: '5. Ваши права',
					paragraphs: [
						'В зависимости от закона вы можете запросить доступ, исправление, удаление, ограничение, переносимость или возразить против обработки. Запрос направляется на контактный email ниже. Отдельные записи могут сохраняться по закону.'
					]
				},
				{
					heading: '6. Международная обработка и дети',
					paragraphs: [
						'Данные могут обрабатываться в странах работы поставщиков с применением необходимых правовых гарантий. JotDo не предназначен для детей, которые не могут законно согласиться на обработку данных.'
					]
				},
				{
					heading: '7. Изменения',
					paragraphs: [
						'Актуальная редакция и дата её обновления всегда публикуются на этой странице.'
					]
				}
			]
		},
		refunds: {
			intro:
				'Политика описывает добровольный срок возврата JotDo и порядок возвратов покупок, обработанных Paddle.',
			sections: [
				{
					heading: '1. Возврат в течение 7 дней',
					paragraphs: [
						'Запрос можно подать в течение 7 календарных дней после первой покупки или продления. Учитываются использование платных функций, злоупотребления, мошенничество и технические проблемы.',
						'Политика не ограничивает обязательные права потребителя. Если закон страны покупателя или условия Paddle дают большую защиту, применяется большая защита.'
					]
				},
				{
					heading: '2. Как запросить возврат',
					paragraphs: [
						'Поскольку Paddle является merchant of record, запрос направляется через поддержку покупателей Paddle на paddle.net либо на boss_soft@mail.ru. Не отправляйте полные данные банковской карты по email.'
					]
				},
				{
					heading: '3. Отмена подписки',
					paragraphs: [
						'Подписку можно отменить через портал Paddle или ссылку в письме о покупке. Отмена прекращает будущие продления после оплаченного периода и сама по себе не возвращает оплату за текущий период.'
					]
				},
				{
					heading: '4. Технические ошибки',
					paragraphs: [
						'При недоступности оплаченной функции или двойном списании свяжитесь с нами или Paddle. Одобренный полный или частичный возврат выполняется Paddle на исходный способ оплаты.'
					]
				},
				{
					heading: '5. Исключения',
					paragraphs: [
						'В добровольном возврате может быть отказано при мошенничестве, злоупотреблении, существенном использовании сервиса или обращении после 7 дней, если обязательное право на возврат отсутствует.'
					]
				}
			]
		}
	};
	content.es = {
		terms: {
			intro:
				'Estos Términos regulan el uso de JotDo, un servicio operado por Vasilii Bulykin en Kyrgyzstan.',
			sections: [
				{
					heading: '1. El servicio',
					paragraphs: [
						'JotDo es una aplicación local-first para tareas, trabajo sin conexión, sincronización, uso compartido, conversaciones, participantes y tareas recurrentes. Las funciones locales no requieren cuenta; ciertas funciones de nube y colaboración requieren una cuenta y un plan compatible.'
					]
				},
				{
					heading: '2. Cuenta y uso aceptable',
					paragraphs: [
						'Eres responsable de tus datos y credenciales. No puedes usar JotDo ilegalmente, interferir con el servicio, acceder sin autorización, distribuir contenido malicioso, infringir derechos ni abusar de las funciones de comunicación.'
					]
				},
				{
					heading: '3. Tu contenido',
					paragraphs: [
						'Conservas la propiedad de tus tareas, imágenes y conversaciones. Concedes a JotDo únicamente el permiso necesario para almacenar, procesar, sincronizar y transmitir el contenido para prestar las funciones solicitadas.'
					]
				},
				{
					heading: '4. Planes y pagos',
					paragraphs: [
						'Las funciones y precios actuales figuran en la página de precios. Paddle procesa las transacciones como merchant of record y aplica sus términos para compradores, impuestos y protecciones obligatorias. Las suscripciones se renuevan hasta su cancelación.'
					]
				},
				{
					heading: '5. Disponibilidad y cambios',
					paragraphs: [
						'Intentamos mantener JotDo fiable, pero no garantizamos un funcionamiento ininterrumpido. Podemos modificar funciones por seguridad, rendimiento, cumplimiento legal o evolución del producto.'
					]
				},
				{
					heading: '6. Responsabilidad',
					paragraphs: [
						'En la medida permitida por la ley, JotDo se ofrece sin garantías adicionales. No se limitan los derechos obligatorios del consumidor ni la responsabilidad que no pueda limitarse legalmente.'
					]
				},
				{
					heading: '7. Terminación y ley aplicable',
					paragraphs: [
						'Podemos suspender el acceso por infracciones graves, riesgos de seguridad, fraude o exigencias legales. Se aplica la ley de la República Kirguisa sin limitar los derechos obligatorios del consumidor en su país.'
					]
				}
			]
		},
		privacy: {
			intro:
				'Esta Política explica cómo JotDo, operado por Vasilii Bulykin en Kyrgyzstan, trata datos personales.',
			sections: [
				{
					heading: '1. Datos tratados',
					paragraphs: [
						'Podemos tratar nombre, correo, verificación, plan y sesión; tareas y colaboración que decidas sincronizar; solicitudes de soporte y datos técnicos de seguridad. Las tareas exclusivamente locales no se cargan salvo que uses una función de transmisión o sincronización.'
					]
				},
				{
					heading: '2. Finalidades',
					paragraphs: [
						'Tratamos datos para cuentas, seguridad, sincronización, colaboración, soporte, prevención de abusos, compras, obligaciones legales y comunicaciones esenciales.'
					]
				},
				{
					heading: '3. Proveedores',
					paragraphs: [
						'Usamos proveedores de alojamiento, bases de datos, almacenamiento, correo e infraestructura. Paddle actúa como merchant of record y trata datos de pagos, impuestos y fraude bajo su propia política de privacidad.'
					]
				},
				{
					heading: '4. Conservación y seguridad',
					paragraphs: [
						'Conservamos datos solo durante el tiempo necesario para las finalidades indicadas, administración, disputas, seguridad y ley. Aplicamos medidas razonables, pero ningún sistema en línea ofrece seguridad absoluta.'
					]
				},
				{
					heading: '5. Tus derechos',
					paragraphs: [
						'Según la ley aplicable, puedes solicitar acceso, rectificación, eliminación, limitación, portabilidad u oposición. Envía la solicitud al correo indicado abajo. Algunos registros pueden conservarse por obligación legal.'
					]
				},
				{
					heading: '6. Tratamiento internacional y menores',
					paragraphs: [
						'Los proveedores pueden tratar datos en otros países con las salvaguardas legales necesarias. JotDo no está dirigido a menores que no puedan consentir legalmente el tratamiento.'
					]
				},
				{
					heading: '7. Cambios',
					paragraphs: [
						'La versión vigente y su fecha de actualización permanecerán publicadas en esta página.'
					]
				}
			]
		},
		refunds: {
			intro:
				'Esta Política describe el plazo voluntario de reembolso de JotDo y los reembolsos procesados por Paddle.',
			sections: [
				{
					heading: '1. Plazo de 7 días',
					paragraphs: [
						'Puedes solicitar un reembolso durante los 7 días naturales posteriores a la compra inicial o renovación. Se consideran el uso del servicio, abuso, fraude y problemas técnicos.',
						'Esta política no reduce derechos obligatorios. Si la ley del comprador o los términos de Paddle ofrecen mayor protección, prevalece esa protección.'
					]
				},
				{
					heading: '2. Cómo solicitarlo',
					paragraphs: [
						'Como Paddle es merchant of record, solicita el reembolso en paddle.net o escribe a boss_soft@mail.ru. No envíes datos completos de la tarjeta por correo.'
					]
				},
				{
					heading: '3. Cancelación',
					paragraphs: [
						'Cancela la suscripción mediante el portal de Paddle o el enlace del correo de compra. La cancelación evita futuras renovaciones al terminar el periodo pagado y no reembolsa automáticamente el periodo actual.'
					]
				},
				{
					heading: '4. Fallos técnicos',
					paragraphs: [
						'Si una función pagada no se entrega o existe un cargo duplicado, contacta con nosotros o Paddle. Paddle devuelve los reembolsos aprobados al método de pago original.'
					]
				},
				{
					heading: '5. Exclusiones',
					paragraphs: [
						'Puede rechazarse un reembolso voluntario por fraude, abuso, uso sustancial o solicitud fuera de los 7 días cuando no exista un derecho legal obligatorio.'
					]
				}
			]
		}
	};
	let c = $derived(common[locale]);
	let document = $derived(content[locale][kind]);
</script>

<svelte:head>
	<title>{c[kind]} - JotDo</title>
	<meta name="description" content={document.intro} />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={`${origin}${path}`} />
	<link rel="alternate" hreflang="en" href={`${origin}/${kind}`} />
	<link rel="alternate" hreflang="ru" href={`${origin}/ru/${kind}`} />
	<link rel="alternate" hreflang="es" href={`${origin}/es/${kind}`} />
	<link rel="alternate" hreflang="x-default" href={`${origin}/${kind}`} />
</svelte:head>

<header>
	<a class="brand" href={resolve('/app')}>Jot<span>DO</span></a>
	<nav>
		<a href={locale === 'en' ? '/about' : `/${locale}/about`}>{c.about}</a><a
			href={locale === 'en' ? '/pricing' : `/${locale}/pricing`}>{c.pricing}</a
		><a class="button" href={resolve('/app')}>{c.open}</a>
	</nav>
</header>
<main>
	<aside aria-label="Language">
		<a class:active={locale === 'en'} href={`/${kind}`}>English</a><a
			class:active={locale === 'ru'}
			href={`/ru/${kind}`}>Русский</a
		><a class:active={locale === 'es'} href={`/es/${kind}`}>Español</a>
	</aside>
	<article>
		<p class="eyebrow">JotDo Legal</p>
		<h1>{c[kind]}</h1>
		<p class="updated">{c.updated}: {updated}</p>
		<p class="intro">{document.intro}</p>
		{#each document.sections as section}<section>
				<h2>{section.heading}</h2>
				{#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}
			</section>{/each}
		<section>
			<h2>{c.contact}</h2>
			<p>{c.footer} <a href="mailto:boss_soft@mail.ru">boss_soft@mail.ru</a></p>
		</section>
	</article>
</main>
<footer>
	<strong>JotDO</strong>
	<nav>
		<a href={locale === 'en' ? '/terms' : `/${locale}/terms`}>{c.terms}</a><a
			href={locale === 'en' ? '/privacy' : `/${locale}/privacy`}>{c.privacy}</a
		><a href={locale === 'en' ? '/refunds' : `/${locale}/refunds`}>{c.refunds}</a>
	</nav>
</footer>

<style>
	:global(body) {
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		padding: 1rem max(1rem, calc((100% - 66rem) / 2));
	}
	.brand {
		color: var(--color-text);
		font-size: 1.7rem;
		font-weight: 900;
		letter-spacing: -0.07em;
		text-decoration: none;
	}
	.brand span,
	.eyebrow,
	main a {
		color: var(--color-accent);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	nav a {
		border-radius: var(--radius-md);
		padding: 0.65rem;
		color: var(--color-text-muted);
		font-size: 0.8rem;
		font-weight: 700;
		text-decoration: none;
	}
	.button {
		background: var(--color-accent);
		color: var(--color-accent-contrast);
	}
	main {
		display: grid;
		grid-template-columns: 9rem minmax(0, 46rem);
		gap: 3rem;
		justify-content: center;
		padding: 4rem 1rem 6rem;
	}
	aside {
		display: grid;
		align-content: start;
		gap: 0.35rem;
		position: sticky;
		top: 1rem;
		height: max-content;
	}
	aside a {
		border-radius: 0.5rem;
		padding: 0.5rem;
		text-decoration: none;
		font-size: 0.78rem;
	}
	aside a.active {
		background: var(--color-surface-hover);
		font-weight: 800;
	}
	article {
		min-width: 0;
	}
	.eyebrow {
		font-size: 0.72rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0.6rem 0;
		font-size: clamp(2.5rem, 6vw, 4.3rem);
		letter-spacing: -0.06em;
	}
	.updated {
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}
	.intro {
		margin: 2rem 0 3rem;
		font-size: 1.15rem;
		line-height: 1.7;
	}
	section {
		border-top: 1px solid var(--color-border);
		padding: 1.5rem 0;
	}
	h2 {
		font-size: 1.2rem;
	}
	p {
		line-height: 1.75;
	}
	section p {
		color: var(--color-text-muted);
	}
	footer {
		border-top: 1px solid var(--color-border);
		border-bottom: 0;
	}
	footer nav {
		flex-wrap: wrap;
	}
	@media (max-width: 680px) {
		header nav > a:not(.button) {
			display: none;
		}
		main {
			grid-template-columns: 1fr;
			padding-top: 2rem;
		}
		aside {
			position: static;
			display: flex;
			flex-wrap: wrap;
		}
		footer {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
