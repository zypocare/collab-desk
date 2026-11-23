<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { igConnect } from '#lib/studio.svelte.ts';
	import { confetti, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';

	let status = $state<'working' | 'error'>('working');
	let step = $state(0);
	let message = $state('Connecting your Instagram…');

	const STEPS = [
		'Verifying Instagram access',
		'Enabling DM inbox & webhooks',
		'Syncing your profile & numbers'
	];

	onMount(() => {
		const timer = setInterval(() => {
			if (step < STEPS.length - 1) step += 1;
		}, 1100);

		(async () => {
			const q = page.url.searchParams;
			const code = (q.get('code') ?? '').replace(/#_$/, '');
			const state = q.get('state') ?? '';
			const fromServerCb = q.get('cb') === '1';
			let expected: string | null = null;
			try {
				expected = sessionStorage.getItem('ig_state');
				sessionStorage.removeItem('ig_state');
			} catch {
				/* storage blocked */
			}
			if (q.get('error')) {
				clearInterval(timer);
				status = 'error';
				message = q.get('error_description') || 'Instagram sign-in was cancelled.';
				return;
			}
			if (!code || (!fromServerCb && expected && state !== expected)) {
				clearInterval(timer);
				status = 'error';
				message = "This sign-in link isn't valid any more. Start again from My page.";
				return;
			}
			try {
				await igConnect(code, fromServerCb ? 'server' : `${location.origin}/studio/instagram`);
				step = STEPS.length - 1;
				clearInterval(timer);
				confetti();
				toast('Instagram connected');
				goto('/studio/settings?s=profile', { replaceState: true });
			} catch (e) {
				clearInterval(timer);
				status = 'error';
				message = errMessage(e);
			}
		})();

		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Connecting Instagram · Miracle</title></svelte:head>

<div class="igc-wrap">
	<section class="igc-card" aria-live="polite">
		{#if status === 'working'}
			<div class="igc-orb" aria-hidden="true">
				<span class="igc-ring"></span>
				<span class="igc-core"><Logo size={30} /></span>
			</div>
			<span class="igc-eb">Instagram Connect</span>
			<h1>Connecting your account</h1>
			<p class="igc-sub">Hang tight—we're linking your Instagram account and syncing your profile in the background.</p>

			<div class="igc-steps">
				{#each STEPS as label, i (label)}
					<div class="igc-step" class:done={i < step} class:active={i === step}>
						<span class="igc-dot" aria-hidden="true">
							{#if i < step}<Icon name="check" />{:else}<i></i>{/if}
						</span>
						<span>{label}</span>
					</div>
				{/each}
			</div>
		{:else}
			<span class="igc-err-ic" aria-hidden="true"><Icon name="alert" /></span>
			<span class="igc-eb">Connection failed</span>
			<h1>Couldn't connect Instagram</h1>
			<p class="igc-sub">{message}</p>
			<a class="igc-btn" href="/studio/settings?s=profile">Back to Edit Profile</a>
		{/if}
	</section>
</div>

<style>
	@property --igc-rim {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes igcSpin {
		to { --igc-rim: 360deg; }
	}
	@keyframes igcPulse {
		0%, 100% { transform: scale(1); opacity: 0.7; }
		50% { transform: scale(1.16); opacity: 1; }
	}

	.igc-wrap {
		min-height: 70vh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
	}
	.igc-card {
		position: relative;
		width: 100%;
		max-width: 420px;
		padding: 32px 24px 28px;
		border-radius: 24px;
		background:
			radial-gradient(120% 90% at 95% 0%, rgba(242, 90, 144, 0.16), transparent 55%),
			radial-gradient(95% 95% at 5% 100%, rgba(156, 123, 255, 0.14), transparent 55%),
			#19131e;
		text-align: center;
		display: grid;
		justify-items: center;
		gap: 10px;
		box-shadow: 0 24px 50px -28px rgba(0, 0, 0, 0.75);
	}
	.igc-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.25px;
		background: conic-gradient(from var(--igc-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.08) 48%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: igcSpin 5s linear infinite;
	}

	.igc-orb {
		position: relative;
		width: 74px;
		height: 74px;
		margin-bottom: 6px;
		display: grid;
		place-items: center;
	}
	.igc-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		padding: 2.5px;
		background: conic-gradient(from var(--igc-rim), #9c7bff, #f25a90, #ffae6b, transparent 62%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		animation: igcSpin 1.8s linear infinite;
	}
	.igc-core {
		width: 58px;
		height: 58px;
		border-radius: 50%;
		background: #140f17;
		border: 1px solid rgba(255, 255, 255, 0.08);
		display: grid;
		place-items: center;
	}

	.igc-eb {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #9b8fa8;
	}
	.igc-card h1 {
		margin: 0;
		font: 400 28px/1.1 var(--f-serif, Georgia, serif);
		color: #faf7fc;
	}
	.igc-sub {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: #cfc6d6;
		max-width: 34ch;
	}

	.igc-steps {
		width: 100%;
		margin-top: 12px;
		padding-top: 14px;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		display: grid;
		gap: 10px;
		text-align: left;
	}
	.igc-step {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: #7d7288;
		transition: color 0.2s;
	}
	.igc-step.active {
		color: #faf7fc;
		font-weight: 500;
	}
	.igc-step.done {
		color: #4ade80;
	}
	.igc-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.14);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.igc-step.active .igc-dot {
		border-color: #f25a90;
	}
	.igc-step.active .igc-dot i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: linear-gradient(135deg, #9c7bff, #f25a90, #ffae6b);
		animation: igcPulse 1.1s ease-in-out infinite;
	}
	.igc-step.done .igc-dot {
		border-color: rgba(74, 222, 128, 0.45);
		background: rgba(74, 222, 128, 0.12);
		color: #4ade80;
	}
	.igc-step.done .igc-dot :global(.ic) {
		width: 12px;
		height: 12px;
	}

	.igc-err-ic {
		width: 48px;
		height: 48px;
		border-radius: 14px;
		background: rgba(244, 63, 94, 0.14);
		border: 1px solid rgba(244, 63, 94, 0.35);
		color: #fda4af;
		display: grid;
		place-items: center;
		margin-bottom: 4px;
	}
	.igc-err-ic :global(.ic) {
		width: 22px;
		height: 22px;
	}
	.igc-btn {
		margin-top: 10px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 20px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		color: #faf7fc;
		font: 600 13.5px/1 var(--f-body, system-ui, sans-serif);
		text-decoration: none;
	}
</style>
