import { building } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import {
	sendEmailVerificationEmail,
	sendPasswordResetEmail,
	verificationMailLocale
} from '$lib/server/email';
import { generatePublicId } from './public-id';
import { USER_PLANS } from '$lib/billing/plans';

if (!building && (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)) {
	throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
}

const baseURL = env.APP_URL || 'http://localhost:5173';

export const auth = betterAuth({
	baseURL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			...schema,
			user: schema.users,
			session: schema.sessions,
			account: schema.accounts,
			verification: schema.verifications
		}
	}),
	advanced: { database: { generateId: () => crypto.randomUUID() } },
	user: {
		modelName: 'users',
		fields: { name: 'displayName' },
		changeEmail: { enabled: true },
		additionalFields: {
			publicId: { type: 'string', required: false, input: false },
			plan: {
				type: [...USER_PLANS],
				required: false,
				defaultValue: 'free',
				input: false
			},
			planExpiresAt: { type: 'date', required: false, input: false },
			billingPeriod: { type: 'string', required: false, input: false },
			deletedAt: { type: 'date', required: false, input: false },
			hardDeleteAfter: { type: 'date', required: false, input: false }
		}
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => ({ data: { ...user, publicId: generatePublicId(), plan: 'free' } })
			}
		}
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			const resetUrl = new URL(url);
			resetUrl.protocol = new URL(baseURL).protocol;
			resetUrl.host = new URL(baseURL).host;
			await sendPasswordResetEmail(user.email, resetUrl.toString());
		}
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: false,
		sendVerificationEmail: async ({ user, url }, request) => {
			const verificationUrl = new URL(url);
			verificationUrl.protocol = new URL(baseURL).protocol;
			verificationUrl.host = new URL(baseURL).host;
			await sendEmailVerificationEmail(
				user.email,
				verificationUrl.toString(),
				verificationMailLocale(verificationUrl.toString(), request)
			);
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)]
});

export type AuthSession = typeof auth.$Infer.Session;
