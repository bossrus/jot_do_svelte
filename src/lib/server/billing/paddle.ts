import { env } from '$env/dynamic/private';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import type { PaidPlan } from '$lib/billing/plans';
import type { BillingPeriod } from '$lib/billing/pricing';

type PaddlePriceMap = Record<PaidPlan, Record<BillingPeriod, string>>;

export class PaddleConfigurationError extends Error {}

function required(name: string, value: string | undefined): string {
	if (!value) throw new PaddleConfigurationError(`Missing Paddle configuration: ${name}`);
	return value;
}

export function getPaddlePriceMap(): PaddlePriceMap {
	return {
		cloud: {
			month: required('PADDLE_PRICE_CLOUD_MONTH', env.PADDLE_PRICE_CLOUD_MONTH),
			year: required('PADDLE_PRICE_CLOUD_YEAR', env.PADDLE_PRICE_CLOUD_YEAR),
			'five-years': required('PADDLE_PRICE_CLOUD_FIVE_YEARS', env.PADDLE_PRICE_CLOUD_FIVE_YEARS)
		},
		join: {
			month: required('PADDLE_PRICE_JOIN_MONTH', env.PADDLE_PRICE_JOIN_MONTH),
			year: required('PADDLE_PRICE_JOIN_YEAR', env.PADDLE_PRICE_JOIN_YEAR),
			'five-years': required('PADDLE_PRICE_JOIN_FIVE_YEARS', env.PADDLE_PRICE_JOIN_FIVE_YEARS)
		},
		share: {
			month: required('PADDLE_PRICE_SHARE_MONTH', env.PADDLE_PRICE_SHARE_MONTH),
			year: required('PADDLE_PRICE_SHARE_YEAR', env.PADDLE_PRICE_SHARE_YEAR),
			'five-years': required('PADDLE_PRICE_SHARE_FIVE_YEARS', env.PADDLE_PRICE_SHARE_FIVE_YEARS)
		},
		group: {
			month: required('PADDLE_PRICE_GROUP_MONTH', env.PADDLE_PRICE_GROUP_MONTH),
			year: required('PADDLE_PRICE_GROUP_YEAR', env.PADDLE_PRICE_GROUP_YEAR),
			'five-years': required('PADDLE_PRICE_GROUP_FIVE_YEARS', env.PADDLE_PRICE_GROUP_FIVE_YEARS)
		}
	};
}

export function getPaddlePriceId(plan: PaidPlan, period: BillingPeriod): string {
	return getPaddlePriceMap()[plan][period];
}

export function getPlanForPaddlePrice(
	priceId: string
): { plan: PaidPlan; period: BillingPeriod } | null {
	for (const [plan, periods] of Object.entries(getPaddlePriceMap()) as Array<
		[PaidPlan, Record<BillingPeriod, string>]
	>) {
		for (const [period, configuredPriceId] of Object.entries(periods) as Array<
			[BillingPeriod, string]
		>) {
			if (configuredPriceId === priceId) return { plan, period };
		}
	}
	return null;
}

function apiKey(): string {
	return required(
		'PADDLE_API_KEY or PADDLE_SANDBOX_API_KEY',
		env.PADDLE_API_KEY ?? env.PADDLE_SANDBOX_API_KEY
	);
}

let paddleClient: Paddle | null = null;

export function getPaddleClient(): Paddle {
	if (!paddleClient) {
		paddleClient = new Paddle(apiKey(), {
			environment: env.PADDLE_ENVIRONMENT === 'live' ? Environment.production : Environment.sandbox
		});
	}
	return paddleClient;
}
