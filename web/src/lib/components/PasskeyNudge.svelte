<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { deviceName, listPasskeys, passkeysHere } from '../passkeys';
	import Icon from './Icon.svelte';

	// Once, a little after she signs in: offer fingerprint sign-in for this device (when the app has
	// passkeys switched on and she hasn't made one yet). "Not now" never asks again on this device.
	const KEY = 'cd-pk-asked';
	let show = $state(false);
	let busy = $state(false);
	const asked = () => {
		try {
			return !!localStorage.getItem(KEY);
		} catch {
			return true;
		}
	};
	const done = () => {
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			/* storage blocked */
		}
		show = false;
	};
	onMount(() => {
		if (!passkeysHere() || asked()) return;
		const t = setTimeout(async () => {
			const keys = await listPasskeys();
			if (keys && !keys.length) show = true;
		}, 8000);
		return () => clearTimeout(t);
	});
	async function turnOn() {
		busy = true;
		const { error } = await supabase.auth.registerPasskey();
		busy = false;
		if (error) {
			if (!/cancel|abort|not allowed/i.test(error.message)) toast("Couldn't turn it on. Try again from Settings.", 'alert');
			return;
		}
		const k = (await listPasskeys())?.[0];
		if (k) await supabase.auth.passkey.update({ passkeyId: k.id, friendlyName: deviceName() }).catch(() => null);
		toast('Done. Next time, sign in with your fingerprint or face', 'shield');
		done();
	}
</script>

{#if show}
	<div class="pk" role="dialog" aria-label="Fingerprint sign-in">
		<span class="pk-ic"><Icon name="shield" /></span>
		<div class="pk-t"><b>Sign in with your fingerprint next time?</b><small>No email code on this device. You can turn it off in Settings.</small></div>
		<div class="pk-b">
			<button class="btn sm grad" disabled={busy} onclick={turnOn}>{#if busy}<span class="spinner"></span>{/if}Turn on</button>
			<button class="btn sm" disabled={busy} onclick={done}>Not now</button>
		</div>
	</div>
{/if}

<style>
	.pk { position: fixed; z-index: 60; right: max(20px, env(safe-area-inset-right, 0px)); bottom: calc(20px + env(safe-area-inset-bottom, 0px)); width: min(420px, calc(100vw - 32px)); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px 14px; padding: 16px 18px; border-radius: 22px; background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow-lg); animation: pk-in .4s cubic-bezier(.2, .8, .2, 1); }
	.pk-ic { width: 40px; height: 40px; border-radius: 14px; display: grid; place-items: center; background: var(--grad); color: #fff; }
	.pk-ic :global(.ic) { width: 20px; height: 20px; }
	.pk-t { display: grid; gap: 2px; }
	.pk-t b { font-size: 15px; }
	.pk-t small { font-size: 13px; color: var(--ink-3); }
	.pk-b { grid-column: 2; display: flex; gap: 8px; }
	@media (max-width: 760px) { .pk { left: 16px; right: 16px; width: auto; bottom: calc(84px + env(safe-area-inset-bottom, 0px)); } }
	@keyframes pk-in { from { opacity: 0; transform: translateY(14px); } }
	@media (prefers-reduced-motion: reduce) { .pk { animation: none; } }
</style>
