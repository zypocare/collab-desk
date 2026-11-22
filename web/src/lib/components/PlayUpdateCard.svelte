<script lang="ts">
	import { onMount } from 'svelte';
	import { checkPlayStoreUpdate, PLAY_STORE_URL, type AppUpdateInfo } from '../appVersion';
	import Icon from './Icon.svelte';

	// Compact Play Store Update Available card placed right below the Home greeting card.
	// Only renders inside the Android Capacitor app when a newer version is live on Google Play.
	let info = $state<AppUpdateInfo | null>(null);
	let required = $state(false);
	let visible = $state(false);

	onMount(async () => {
		const res = await checkPlayStoreUpdate();
		if (!res.available || !res.info) return;
		const key = `miracle.upd.dismissed.${res.info.latestVersion}`;
		if (!res.required) {
			try {
				if (sessionStorage.getItem(key) === '1') return;
			} catch {
				// Ignore storage access errors.
			}
		}
		info = res.info;
		required = res.required;
		visible = true;
	});

	function dismiss() {
		visible = false;
		if (info) {
			try {
				sessionStorage.setItem(`miracle.upd.dismissed.${info.latestVersion}`, '1');
			} catch {
				// Ignore storage access errors.
			}
		}
	}

	function openStore() {
		const url = info?.playStoreUrl || PLAY_STORE_URL;
		window.open(url, '_blank', 'noopener,noreferrer');
	}
</script>

{#if visible && info}
	<section class="pu-sec" aria-label="App update available">
		<div class="pu-head">
			<span class="pu-eb">{required ? 'Required update' : 'Update available'}</span>
			<span class="pu-sub">v{info.latestVersion} on Google Play</span>
		</div>
		<div class="pu-card">
			<span class="pu-ic" aria-hidden="true"><Icon name="spark" /></span>
			<div class="pu-mid">
				<b>{info.title || 'A fresher Miracle is live'}</b>
				<small>{info.message || 'Faster tools & smoother payouts—takes 10s.'}</small>
			</div>
			<div class="pu-acts">
				<button type="button" class="pu-go" onclick={openStore}>Update</button>
				{#if !required}
					<button type="button" class="pu-x" onclick={dismiss} aria-label="Dismiss update">
						<Icon name="x" />
					</button>
				{/if}
			</div>
		</div>
	</section>
{/if}

<style>
	@property --pu-rim {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes puSpin {
		to { --pu-rim: 360deg; }
	}

	.pu-sec {
		display: grid;
		gap: 7px;
		margin: 0 0 14px;
	}
	.pu-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 0 2px;
	}
	.pu-eb {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-3, #8f8499);
	}
	.pu-sub {
		font-size: 11.5px;
		color: var(--ink-3, #8f8499);
	}

	.pu-card {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 14px;
		border-radius: 18px;
		background:
			radial-gradient(120% 100% at 96% 0%, rgba(242, 90, 144, 0.2), transparent 58%),
			radial-gradient(90% 90% at 4% 100%, rgba(156, 123, 255, 0.18), transparent 58%),
			#19131d;
		box-shadow: 0 12px 28px -16px rgba(242, 90, 144, 0.4);
		color: #faf7fc;
	}
	.pu-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.25px;
		background: conic-gradient(from var(--pu-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.09) 48%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: puSpin 9s linear infinite;
	}

	.pu-ic {
		width: 42px;
		height: 42px;
		border-radius: 13px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		background: rgba(242, 90, 144, 0.16);
		border: 1px solid rgba(242, 90, 144, 0.32);
		color: #ffae6b;
	}
	.pu-ic :global(.ic) {
		width: 19px;
		height: 19px;
	}

	.pu-mid {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.pu-mid b {
		font: 400 20px/1.08 var(--f-serif, Georgia, serif);
		color: #faf7fc;
	}
	.pu-mid small {
		font-size: 12px;
		color: #cfc6d6;
		line-height: 1.35;
	}

	.pu-acts {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.pu-go {
		height: 36px;
		padding: 0 13px;
		border: 0;
		border-radius: 9px;
		background: linear-gradient(135deg, #9c7bff, #f25a90 55%, #ffae6b);
		color: #120b14;
		font: 800 11px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		box-shadow: 2.5px 2.5px 0 0 #5b3b99;
		white-space: nowrap;
	}
	.pu-go:active {
		transform: translate(1px, 1px);
	}
	.pu-x {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #8f8499;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.pu-x :global(.ic) {
		width: 14px;
		height: 14px;
	}
</style>
