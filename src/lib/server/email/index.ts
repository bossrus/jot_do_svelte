import { env } from '$env/dynamic/private';
import nodemailer from 'nodemailer';

export type MailConfig = {
	host: string;
	port: number;
	secure: boolean;
	from: string;
	auth?: { user: string; pass: string };
};

export type MailLocale = 'ru' | 'en' | 'es';

export function readMailConfig(source: Record<string, string | undefined> = env): MailConfig {
	const host = source.SMTP_HOST;
	const port = Number(source.SMTP_PORT);
	const secure = source.SMTP_SECURE === 'true';
	const from = source.SMTP_FROM;
	const user = source.SMTP_USER?.trim();
	const password = source.SMTP_PASSWORD;
	if (
		!host ||
		!from ||
		!Number.isInteger(port) ||
		port <= 0 ||
		Boolean(user) !== Boolean(password)
	) {
		throw new Error('SMTP configuration is incomplete');
	}
	return {
		host,
		port,
		secure,
		from,
		...(user && password ? { auth: { user, pass: password } } : {})
	};
}

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

function getTransport() {
	if (transport) return transport;
	const config = readMailConfig();
	transport = nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		...(config.auth ? { auth: config.auth } : {})
	});
	return transport;
}

function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (character) => {
		const entities: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return entities[character];
	});
}

function supportedLocale(value: string | null | undefined): MailLocale | null {
	const locale = value?.trim().toLowerCase().split(/[-_]/)[0];
	return locale === 'ru' || locale === 'en' || locale === 'es' ? locale : null;
}

export function verificationMailLocale(url: string, request?: Request): MailLocale {
	try {
		const callback = new URL(url).searchParams.get('callbackURL');
		if (callback) {
			const locale = supportedLocale(
				new URL(callback, 'https://jotdo.site').searchParams.get('locale')
			);
			if (locale) return locale;
		}
	} catch {
		// Fall through to the browser language when a provider supplies a non-standard URL.
	}
	for (const language of request?.headers.get('accept-language')?.split(',') ?? []) {
		const locale = supportedLocale(language.split(';')[0]);
		if (locale) return locale;
	}
	return 'en';
}

const verificationCopy = {
	ru: {
		subject: 'Подтвердите email для JotDo',
		preheader: 'Подтвердите адрес электронной почты, указанный при регистрации на jotdo.site',
		title: 'Подтвердите адрес электронной почты',
		intro: 'Этот email был указан при регистрации аккаунта на jotdo.site.',
		action:
			'Чтобы подтвердить адрес и получить доступ к облачным возможностям JotDo, нажмите кнопку ниже.',
		button: 'Подтвердить email',
		fallback: 'Если кнопка не работает, скопируйте эту ссылку и откройте её в браузере:',
		aboutTitle: 'Что такое JotDo?',
		about:
			'JotDo — быстрый и удобный сервис для личных и совместных задач. Создавайте списки дел, настраивайте повторения, прикрепляйте изображения и делитесь задачами.',
		features: ['Быстрые списки задач', 'Повторения и вложения', 'Совместная работа'],
		learnMore: 'Узнать больше о JotDo',
		ignore:
			'Если вы не регистрировались на jotdo.site, ничего делать не нужно. Возможно, другой пользователь указал ваш адрес по ошибке. Без подтверждения адрес не будет активирован.',
		footer: 'Это автоматическое сообщение, отвечать на него не нужно.'
	},
	en: {
		subject: 'Confirm your email for JotDo',
		preheader: 'Confirm the email address used to register at jotdo.site',
		title: 'Confirm your email address',
		intro: 'This email address was used to register an account at jotdo.site.',
		action: 'Confirm the address to access JotDo cloud features.',
		button: 'Confirm email',
		fallback: 'If the button does not work, copy this link and open it in your browser:',
		aboutTitle: 'What is JotDo?',
		about:
			'JotDo is a fast, convenient service for personal and shared tasks. Create todo lists, schedule recurring tasks, attach images, and share tasks with others.',
		features: ['Fast todo lists', 'Recurring tasks and attachments', 'Collaboration'],
		learnMore: 'Learn more about JotDo',
		ignore:
			'If you did not register at jotdo.site, no action is needed. Someone may have entered your address by mistake. The address will not be activated without confirmation.',
		footer: 'This is an automated message. Please do not reply.'
	},
	es: {
		subject: 'Confirma tu correo para JotDo',
		preheader: 'Confirma la dirección de correo utilizada para registrarse en jotdo.site',
		title: 'Confirma tu dirección de correo',
		intro: 'Esta dirección de correo se utilizó para registrar una cuenta en jotdo.site.',
		action: 'Confirma la dirección para acceder a las funciones en la nube de JotDo.',
		button: 'Confirmar correo',
		fallback: 'Si el botón no funciona, copia este enlace y ábrelo en tu navegador:',
		aboutTitle: '¿Qué es JotDo?',
		about:
			'JotDo es un servicio rápido y cómodo para tareas personales y compartidas. Crea listas, programa tareas recurrentes, adjunta imágenes y comparte tareas.',
		features: ['Listas de tareas rápidas', 'Repeticiones y archivos adjuntos', 'Trabajo en equipo'],
		learnMore: 'Conoce más sobre JotDo',
		ignore:
			'Si no te registraste en jotdo.site, no tienes que hacer nada. Es posible que alguien haya indicado tu dirección por error. La dirección no se activará sin confirmación.',
		footer: 'Este es un mensaje automático. No respondas a este correo.'
	}
} as const;

export function createVerificationEmail(url: string, locale: MailLocale) {
	const copy = verificationCopy[locale];
	const safeUrl = escapeHtml(url);
	const features = copy.features
		.map((feature) => `<li style="margin:0 0 8px">${feature}</li>`)
		.join('');
	const text = `${copy.title}\n\n${copy.intro}\n\n${copy.action}\n${url}\n\n${copy.aboutTitle}\n${copy.about}\n- ${copy.features.join('\n- ')}\n\n${copy.learnMore}: https://jotdo.site/about\n\n${copy.ignore}\n\n${copy.footer}`;
	const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f3f6f4;color:#17241b;font-family:Inter,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${copy.preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f4"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce6df;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(23,36,27,.08)">
<tr><td style="padding:25px 34px;background:#eaf3ed;border-bottom:1px solid #dce6df"><strong style="font-size:25px;letter-spacing:-1px">Jot<span style="color:#32704d">DO</span></strong><div style="margin-top:5px;color:#63736a;font-size:13px">jotdo.site</div></td></tr>
<tr><td style="padding:36px 34px 22px"><h1 style="margin:0 0 20px;font-size:27px;line-height:1.2">${copy.title}</h1><p style="margin:0 0 14px;line-height:1.65">${copy.intro}</p><p style="margin:0 0 26px;line-height:1.65">${copy.action}</p><a href="${safeUrl}" style="display:inline-block;padding:14px 25px;background:#326a4b;color:#fff;text-decoration:none;font-weight:700;border-radius:10px">${copy.button}</a><p style="margin:25px 0 8px;color:#63736a;font-size:13px;line-height:1.55">${copy.fallback}</p><p style="margin:0;word-break:break-all;font-size:12px"><a href="${safeUrl}" style="color:#326a4b">${safeUrl}</a></p></td></tr>
<tr><td style="padding:12px 34px 28px"><div style="padding:23px;background:#f1f7f3;border-radius:13px"><h2 style="margin:0 0 12px;font-size:19px">${copy.aboutTitle}</h2><p style="margin:0 0 16px;line-height:1.6">${copy.about}</p><ul style="margin:0 0 17px;padding-left:20px;line-height:1.5">${features}</ul><a href="https://jotdo.site/about" style="color:#326a4b;font-weight:700">${copy.learnMore} →</a></div></td></tr>
<tr><td style="padding:22px 34px;background:#fafcfb;border-top:1px solid #e5ece7;color:#63736a;font-size:13px;line-height:1.55"><p style="margin:0 0 13px">${copy.ignore}</p><p style="margin:0">${copy.footer}<br>© JotDo · <a href="https://jotdo.site" style="color:#326a4b">jotdo.site</a></p></td></tr>
</table></td></tr></table></body></html>`;
	return { subject: copy.subject, text, html };
}

export async function sendPasswordResetEmail(to: string, url: string) {
	await getTransport().sendMail({
		from: readMailConfig().from,
		to,
		subject: 'Сброс пароля Quick Todo',
		text: `Вы запросили сброс пароля.\n\nСбросить пароль:\n${url}\n\nЕсли вы не запрашивали сброс, просто проигнорируйте это письмо.`,
		html: `<h1>Сброс пароля Quick Todo</h1><p>Вы запросили сброс пароля.</p><p><a href="${url}">Сбросить пароль</a></p><p>Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>`
	});
}

export async function sendEmailVerificationEmail(
	to: string,
	url: string,
	locale: MailLocale = 'en'
) {
	const message = createVerificationEmail(url, locale);
	await getTransport().sendMail({
		from: readMailConfig().from,
		to,
		...message
	});
}

export async function sendFriendRequestEmail(
	to: string,
	sender: { name?: string | null; email: string },
	url: string
) {
	const senderLabel = sender.name?.trim() || sender.email;
	const safeSender = escapeHtml(senderLabel);
	const safeUrl = escapeHtml(url);
	await getTransport().sendMail({
		from: readMailConfig().from,
		to,
		subject: 'Новая заявка в контакты — Quick Todo',
		text: `${senderLabel} отправил вам заявку в контакты Quick Todo.\n\nОткрыть Quick Todo:\n${url}\n\nЕсли вы не ожидали эту заявку, её можно отклонить в приложении.`,
		html: `<p><strong>${safeSender}</strong> отправил вам заявку в контакты Quick Todo.</p><p><a href="${safeUrl}">Открыть Quick Todo</a></p><p>Если вы не ожидали эту заявку, её можно отклонить в приложении.</p>`
	});
}

export type SupportEmailAttachment = {
	filename: string;
	content: Buffer;
	contentType: string;
};

export async function sendSupportEmail(
	to: string[],
	reporter: { name: string; email: string; publicId?: string | null },
	message: string,
	attachments: SupportEmailAttachment[]
) {
	const reporterLabel = `${reporter.name} <${reporter.email}>${reporter.publicId ? ` (${reporter.publicId})` : ''}`;
	await getTransport().sendMail({
		from: readMailConfig().from,
		to,
		replyTo: reporter.email,
		subject: `Техподдержка JotDO — ${reporter.name}`,
		text: `Новое обращение в техподдержку JotDO.\n\nПользователь: ${reporterLabel}\n\n${message}`,
		html: `<h1>Новое обращение в техподдержку JotDO</h1><p><strong>Пользователь:</strong> ${escapeHtml(reporterLabel)}</p><div style="white-space:pre-wrap">${escapeHtml(message)}</div>`,
		attachments
	});
}
