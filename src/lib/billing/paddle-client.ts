import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js';

let loader: Promise<Paddle> | null = null;
let eventHandler: (event: PaddleEventData) => void = () => undefined;

export function getPaddleJsEnvironment(token: string): 'sandbox' | 'production' {
	return token.startsWith('test_') ? 'sandbox' : 'production';
}

export async function loadPaddle(
	token: string,
	onEvent: (event: PaddleEventData) => void
): Promise<Paddle> {
	eventHandler = onEvent;
	if (!loader) {
		loader = initializePaddle({
			token,
			environment: getPaddleJsEnvironment(token),
			eventCallback: (event) => eventHandler(event)
		}).then((paddle) => {
			if (!paddle) throw new Error('Paddle.js не загрузился');
			return paddle;
		});
	}
	return loader;
}

export type { PaddleEventData as PaddleCheckoutEvent };
