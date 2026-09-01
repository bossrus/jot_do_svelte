<script lang="ts">
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeState, localeVersion, type AppLocale } from '$lib/client/locale';
	import {
		IconBolt,
		IconCheck,
		IconChevronRight,
		IconFriends,
		IconMessageCircle,
		IconPhoto,
		IconRefresh,
		IconSearch,
		IconShare3,
		IconUsersGroup
	} from '@tabler/icons-svelte-runes';

	$localeVersion;
	let {
		onclose = () => {},
		standalone = false,
		locale
	}: { onclose?: () => void; standalone?: boolean; locale?: AppLocale } = $props();
	let contentLocale = $derived(locale ?? $localeState);
	function t<I extends object>(
		message: (inputs: I, options?: { locale?: AppLocale }) => string,
		inputs = {} as I
	) {
		return message(inputs, { locale: contentLocale });
	}

	const steps = [
		{
			number: '01',
			title: () => t(m.about_step1_title),
			text: () => t(m.about_step1_text),
			kind: 'create'
		},
		{
			number: '02',
			title: () => t(m.about_step2_title),
			text: () => t(m.about_step2_text),
			kind: 'details'
		},
		{
			number: '03',
			title: () => t(m.about_step3_title),
			text: () => t(m.about_step3_text),
			kind: 'share'
		},
		{
			number: '04',
			title: () => t(m.about_step4_title),
			text: () => t(m.about_step4_text),
			kind: 'work'
		},
		{
			number: '05',
			title: () => t(m.about_step5_title),
			text: () => t(m.about_step5_text),
			kind: 'finish'
		}
	];
</script>

{#snippet content()}
	<article class="about">
		<section class="hero">
			<div class="hero-copy">
				<p class="eyebrow"><IconBolt size={17} /> {t(m.about_eyebrow)}</p>
				<h1>{t(m.about_hero_1)}<br /><span>{t(m.about_hero_2)}</span></h1>
				<p class="lead">{t(m.about_lead)}</p>
			</div>
			<div class="hero-mark" aria-hidden="true">
				<span>Jot</span><b>DO</b><small>{t(m.about_tagline)}</small>
			</div>
		</section>

		<section class="promise" aria-label={t(m.about_together_title)}>
			<div>
				<IconBolt size={25} /><strong>{t(m.about_speed_title)}</strong><span
					>{t(m.about_speed_text)}</span
				>
			</div>
			<div>
				<IconShare3 size={25} /><strong>{t(m.about_access_title)}</strong><span
					>{t(m.about_access_text)}</span
				>
			</div>
			<div>
				<IconMessageCircle size={25} /><strong>{t(m.about_together_title)}</strong><span
					>{t(m.about_together_text)}</span
				>
			</div>
		</section>

		<section class="story">
			<div>
				<p class="section-kicker">{t(m.about_why)}</p>
				<h3>{t(m.about_story_title)}</h3>
			</div>
			<div class="story-text">
				<p>{t(m.about_story_1)}</p>
				<p>{t(m.about_story_2)}</p>
			</div>
		</section>

		<section class="guide">
			<div class="guide-heading">
				<div>
					<p class="section-kicker">{t(m.about_manual)}</p>
					<h3>{t(m.about_manual_title)}</h3>
				</div>
				<p>{t(m.about_manual_intro)}</p>
			</div>

			<div class="steps">
				{#each steps as step (step.number)}
					<section class="step">
						<div class="step-copy">
							<span class="step-number">{step.number}</span>
							<div>
								<h4>{step.title()}</h4>
								<p>{step.text()}</p>
							</div>
						</div>
						<div
							class="screen"
							class:screen-create={step.kind === 'create'}
							aria-label={step.title()}
						>
							<div class="screen-top"><i></i><i></i><i></i><span>JotDO</span></div>
							{#if step.kind === 'create'}
								<div class="fake-input">
									<span>{t(m.demo_todo)}</span><b><IconChevronRight size={18} /></b>
								</div>
							{:else if step.kind === 'details'}
								<div class="fake-card">
									<strong>{t(m.demo_todo)}</strong><span>{t(m.demo_description)}</span><button
										><IconPhoto size={16} /> {t(m.image)}</button
									>
								</div>
							{:else if step.kind === 'share'}
								<div class="fake-panel">
									<strong><IconShare3 size={17} /> {t(m.todo_access)}</strong><span
										><i>AK</i> {t(m.demo_person)}</span
									><span><IconUsersGroup size={18} /> {t(m.demo_team)}</span><button
										>{t(m.add)}</button
									>
								</div>
							{:else if step.kind === 'work'}
								<div class="fake-task">
									<div><i>AK</i><i>M</i><strong>{t(m.demo_participants)}</strong></div>
									<p>{t(m.demo_comment)}</p>
									<button><IconMessageCircle size={16} /> {t(m.reply)}</button>
								</div>
							{:else}
								<div class="fake-finish">
									<div class="fake-search"><IconSearch size={16} /> {t(m.search_todos)}</div>
									<p>
										<IconCheck size={19} /><span
											><strong>{t(m.demo_todo)}</strong><small>{t(m.closed_today)}</small></span
										>
									</p>
								</div>
							{/if}
						</div>
					</section>
				{/each}
			</div>
		</section>

		<section class="tips">
			<p class="section-kicker">{t(m.about_tips)}</p>
			<div class="tip-grid">
				<div>
					<IconFriends size={21} />
					<p>
						<strong>{t(m.about_contacts_title)}</strong><span>{t(m.about_contacts_text)}</span>
					</p>
				</div>
				<div>
					<IconRefresh size={21} />
					<p>
						<strong>{t(m.about_recurring_title)}</strong><span>{t(m.about_recurring_text)}</span>
					</p>
				</div>
				<div>
					<IconSearch size={21} />
					<p>
						<strong>{t(m.about_search_title)}</strong><span>{t(m.about_search_text)}</span>
					</p>
				</div>
			</div>
		</section>
	</article>
{/snippet}

{#if standalone}
	{@render content()}
{:else}
	<Modal
		title={t(m.about_modal_title)}
		{onclose}
		width="66rem"
		maxHeight="calc(100dvh - 2rem)"
		zIndex={1100}
	>
		{@render content()}
	</Modal>
{/if}

<style>
	.about {
		color: var(--color-text);
		background: var(--color-surface);
		line-height: 1.55;
	}
	.about section {
		min-width: 0;
	}
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(230px, 0.7fr);
		gap: 2rem;
		align-items: center;
		padding: 3.4rem 3.5rem;
		background: linear-gradient(135deg, #edf8f0 0%, #f8faf7 55%, #edf4ee 100%);
		border-bottom: 1px solid var(--color-border);
	}
	.eyebrow,
	.section-kicker {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 0.7rem;
		color: var(--color-accent);
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.hero h1,
	.story h3,
	.guide h3 {
		margin: 0;
		color: #17241b;
		line-height: 1.08;
	}
	.hero h1 {
		font-size: clamp(2rem, 4vw, 3.25rem);
		letter-spacing: -0.045em;
	}
	.hero h1 span {
		color: var(--color-accent);
	}
	.lead {
		max-width: 46rem;
		margin: 1.25rem 0 0;
		color: #536158;
		font-size: 1.02rem;
	}
	.hero-mark {
		display: grid;
		place-content: center;
		aspect-ratio: 1;
		border: 1px solid #cee2d3;
		border-radius: 50%;
		background: rgb(255 255 255 / 64%);
		box-shadow: 0 20px 55px rgb(44 83 56 / 12%);
		color: #243229;
		text-align: center;
		font-size: 2.8rem;
		letter-spacing: -0.08em;
	}
	.hero-mark b {
		color: var(--color-accent);
	}
	.hero-mark small {
		grid-column: 1/-1;
		margin-top: 0.4rem;
		color: #738078;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.promise {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-bottom: 1px solid var(--color-border);
	}
	.promise > div {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.1rem 0.75rem;
		padding: 1.4rem 1.6rem;
	}
	.promise > div + div {
		border-left: 1px solid var(--color-border);
	}
	.promise :global(svg) {
		grid-row: 1/3;
		color: var(--color-accent);
	}
	.promise strong {
		font-size: 0.9rem;
	}
	.promise span {
		color: #6c766f;
		font-size: 0.78rem;
	}
	.story {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		gap: 3rem;
		padding: 3.5rem;
	}
	.story h3,
	.guide h3 {
		font-size: clamp(1.7rem, 3vw, 2.35rem);
		letter-spacing: -0.035em;
	}
	.story-text {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		color: #58635b;
	}
	.story-text p {
		margin: 0;
	}
	.guide {
		padding: 3.5rem;
		background: #19261d;
		color: #f5f8f5;
	}
	.guide-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 2rem;
	}
	.guide .section-kicker {
		color: #79cb8f;
	}
	.guide h3 {
		color: white;
	}
	.guide-heading > p {
		max-width: 20rem;
		margin: 0;
		color: #aebbb1;
	}
	.steps {
		display: grid;
		gap: 1rem;
	}
	.step {
		display: grid;
		grid-template-columns: 1fr minmax(300px, 0.82fr);
		gap: 2.5rem;
		align-items: center;
		padding: 1.4rem;
		border: 1px solid #344239;
		border-radius: 1rem;
		background: #202e25;
	}
	.step-copy {
		display: flex;
		gap: 1rem;
	}
	.step-number {
		flex: none;
		color: #79cb8f;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
	}
	.step h4 {
		margin: 0 0 0.4rem;
		font-size: 1.15rem;
	}
	.step p {
		margin: 0;
		color: #b6c0b9;
		font-size: 0.9rem;
	}
	.screen {
		min-height: 150px;
		overflow: hidden;
		border: 1px solid #526158;
		border-radius: 0.65rem;
		background: #f6f8f6;
		color: #263129;
		box-shadow: 0 14px 30px rgb(0 0 0 / 18%);
	}
	.screen-top {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		height: 28px;
		padding: 0 0.6rem;
		background: #e8ece8;
		border-bottom: 1px solid #d7ddd8;
	}
	.screen-top i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #b7c0b9;
	}
	.screen-top span {
		margin-left: auto;
		color: #718077;
		font-size: 0.55rem;
		font-weight: 800;
	}
	.fake-input {
		display: flex;
		align-items: center;
		margin: 2rem 1.2rem;
		border: 1px solid #cbd5cd;
		border-radius: 0.55rem;
		background: white;
		padding: 0.65rem 0.7rem;
		font-size: 0.72rem;
	}
	.fake-input span {
		flex: 1;
	}
	.fake-input b {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 0.4rem;
		background: #397a50;
		color: white;
	}
	.fake-card,
	.fake-panel,
	.fake-task,
	.fake-finish {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin: 1rem;
		padding: 0.8rem;
		border: 1px solid #dce2dd;
		border-radius: 0.55rem;
		background: #fff;
		font-size: 0.68rem;
	}
	.fake-card span {
		min-height: 28px;
		color: #859088;
	}
	.fake-card button,
	.fake-panel button,
	.fake-task button {
		align-self: flex-start;
		border: 1px solid #cdd7cf;
		border-radius: 0.35rem;
		background: #f7f9f7;
		padding: 0.3rem 0.5rem;
		color: #536158;
		font: inherit;
	}
	.fake-panel strong,
	.fake-panel span,
	.fake-task div,
	.fake-task button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.fake-panel span i,
	.fake-task i {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		margin: 0;
		border-radius: 50%;
		background: #dcecdf;
		color: #326a4b;
		font-size: 0.55rem;
		font-style: normal;
	}
	.fake-panel button {
		align-self: stretch;
		background: #397a50;
		color: white;
		text-align: center;
	}
	.fake-task div i + i {
		margin-left: -0.7rem;
		background: #e5e0f0;
		color: #684f83;
	}
	.fake-task p {
		margin: 0;
		padding: 0.5rem;
		border-radius: 0.4rem;
		background: #f0f4f0;
		color: #536158;
	}
	.fake-search {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid #d7ded8;
		border-radius: 0.35rem;
		padding: 0.4rem;
		color: #8a948d;
	}
	.fake-finish p {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: #397a50;
	}
	.fake-finish p span {
		display: flex;
		flex-direction: column;
	}
	.fake-finish small {
		color: #8a948d;
	}
	.tips {
		padding: 3rem 3.5rem;
	}
	.tip-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}
	.tip-grid > div {
		display: flex;
		gap: 0.7rem;
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-bg);
	}
	.tip-grid :global(svg) {
		flex: none;
		color: var(--color-accent);
	}
	.tip-grid p {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
	}
	.tip-grid strong {
		font-size: 0.86rem;
	}
	.tip-grid span {
		color: #68736b;
		font-size: 0.76rem;
	}
	@media (max-width: 760px) {
		.hero {
			grid-template-columns: 1fr;
			padding: 2.2rem 1.3rem;
		}
		.hero-mark {
			display: none;
		}
		.promise {
			grid-template-columns: 1fr;
		}
		.promise > div + div {
			border-left: 0;
			border-top: 1px solid var(--color-border);
		}
		.story {
			grid-template-columns: 1fr;
			gap: 1.5rem;
			padding: 2.3rem 1.3rem;
		}
		.story-text {
			grid-template-columns: 1fr;
		}
		.guide {
			padding: 2.3rem 1rem;
		}
		.guide-heading {
			display: block;
		}
		.guide-heading > p {
			margin-top: 0.8rem;
		}
		.step {
			grid-template-columns: 1fr;
			gap: 1.2rem;
			padding: 1rem;
		}
		.screen {
			min-height: 140px;
		}
		.tips {
			padding: 2.3rem 1.3rem;
		}
		.tip-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
