import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js';

let loader: Promise<Paddle> | null = null;
let eventHandler: (event: PaddleEventData) => void = () => undefined;

export async function loadPaddle(
	token: string,
	onEvent: (event: PaddleEventData) => void
): Promise<Paddle> {
	eventHandler = onEvent;
	if (!loader) {
		loader = initializePaddle({
			token,
			environment: 'sandbox',
			eventCallback: (event) => eventHandler(event)
		}).then((paddle) => {
			if (!paddle) throw new Error('Paddle.js не загрузился');
			return paddle;
		});
	}
	return loader;
}

export type { PaddleEventData as PaddleCheckoutEvent };
