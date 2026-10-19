<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import { deviceName, describe, listPasskeys, passkeysHere, type Device, type Passkey } from '../passkeys';
	import Icon from './Icon.svelte';

	// Signing in: fingerprint / face (passkeys) and every device signed in to this account, with
	// sign-out from anywhere. A new device signing in sends an email.
	let keys = $state<Passkey[] | null>(null);
	let devices = $state<Device[]>([]);
	// Five at a time (this device first), so a long history doesn't fill the screen.
	let allDevices = $state(false);
	const shown = $derived(allDevices ? devices : [...devices].sort((a, b) => Number(!!b.current) - Number(!!a.current)).slice(0, 5));
	let loaded = $state(false);
	let adding = $state(false);
	const here = passkeysHere();

	async function load() {
		const [k, d] = await Promise.all([listPasskeys(), supabase.rpc('my_sessions')]);
		keys = k;
		devices = (d.data as Device[] | null) ?? [];
		loaded = true;
	}
	onMount(load);

	async function addKey() {
		adding = true;
		const { error } = await supabase.auth.registerPasskey();
		if (!error) {
			const fresh = await listPasskeys();
			const made = fresh?.find((k) => !keys?.some((o) => o.id === k.id));
			if (made) await supabase.auth.passkey.update({ passkeyId: made.id, friendlyName: deviceName() }).catch(() => null);
			try {
				localStorage.setItem('cd-pk-asked', '1');
			} catch {
				/* storage blocked */
			}
			toast('Fingerprint sign-in is on for this device', 'shield');
			await load();
		} else if (!/cancel|abort|not allowed/i.test(error.message)) toast(`Couldn't turn it on: ${errMessage(error)}`, 'alert');
		adding = false;
	}
	async function removeKey(k: Passkey) {
		if (!(await ask({ title: `Remove ${k.friendly_name || 'this passkey'}?`, body: 'That device signs in with an email code again.', ok: 'Remove', danger: true }))) return;
		const { error } = await supabase.auth.passkey.delete({ passkeyId: k.id });
		if (error) return toast(`Couldn't remove it: ${errMessage(error)}`, 'alert');
		await load();
	}
	async function endOne(d: Device) {
		const what = describe(d.agent).label;
		if (!(await ask({ title: `Sign out ${what}?`, body: "It's signed out within the hour and needs an email code to come back.", ok: 'Sign out', danger: true }))) return;
		const { error } = await supabase.rpc('end_session', { p_id: d.id });
		if (error) return toast(`Couldn't sign it out: ${errMessage(error)}`, 'alert');
		toast(`${what} signed out`, 'shield');
		await load();
	}
	async function endOthers() {
		if (!(await ask({ title: 'Sign out every other device?', body: 'Only this one stays signed in. The others need an email code to come back.', ok: 'Sign out others', danger: true }))) return;
		const { error } = await supabase.auth.signOut({ scope: 'others' });
		if (error) return toast(`Couldn't sign them out: ${errMessage(error)}`, 'alert');
		toast('Every other device is signed out', 'shield');
		await load();
	}
	const ago = (iso: string) => {
		const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	};
</script>

<section class="panel rv" style="--i:1">
	<div class="panel-h"><h2>Signing in</h2><small>fingerprint or face instead of a code</small></div>
	<div class="rv-list">
		{#if !loaded}
			<div class="rv-row"><span class="spinner"></span></div>
		{:else if keys === null}
			<div class="rv-row">
				<span class="set-ic"><Icon name="shield" /></span>
				<div><b>Fingerprint sign-in isn't switched on yet</b><small>Sign-in works with an email code for now. It turns on here once passkeys are enabled for the app.</small></div>
			</div>
		{:else}
			{#each keys as k (k.id)}
				<div class="rv-row">
					<span class="set-ic"><Icon name="shield" /></span>
					<div><b>{k.friendly_name || 'Passkey'}</b><small>added {new Date(k.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{k.last_used_at ? ` · last used ${ago(k.last_used_at)}` : ''}</small></div>
					<button class="shot-x" style="opacity:1" aria-label="Remove {k.friendly_name || 'passkey'}" onclick={() => removeKey(k)}><Icon name="x" /></button>
				</div>
			{:else}
				<div class="rv-row">
					<span class="set-ic"><Icon name="shield" /></span>
					<div><b>No fingerprint sign-in yet</b><small>Turn it on and this device signs in with your fingerprint or face, no email code.</small></div>
				</div>
			{/each}
			{#if here && keys.some((k) => k.friendly_name === deviceName())}
				<p class="hint sec-act">This device is set up. Add others by signing in on them and turning it on there.</p>
			{:else if here}
				<div class="sec-act"><button class="btn sm primary" onclick={addKey} disabled={adding}>{#if adding}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}{keys.length ? 'Add this device' : 'Turn on for this device'}</button></div>
			{:else}
				<p class="hint sec-act">This browser can't use fingerprint sign-in. Chrome, Safari and Edge can.</p>
			{/if}
		{/if}
	</div>
</section>

<section class="panel rv" style="--i:2">
	<div class="panel-h"><h2>Signed-in devices</h2><small>an email arrives when a new one signs in</small></div>
	<div class="rv-list">
		{#if devices.filter((d) => !d.current).length > 1}
			<div class="sec-act"><button class="btn sm" onclick={endOthers}><Icon name="logout" />Sign out all other devices</button></div>
		{/if}
		{#each shown as d (d.id)}
			{@const x = describe(d.agent)}
			<div class="rv-row">
				<span class="set-ic"><Icon name={x.phone ? 'grid' : 'sidebar'} /></span>
				<div><b>{x.label}{#if d.current} <span class="pill tint k-pay">This device</span>{/if}</b><small>{ago(d.last_at)}{d.ip ? ` · ${d.ip}` : ''} · signed in {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></div>
				{#if !d.current}<button class="btn sm" onclick={() => endOne(d)}>Sign out</button>{/if}
			</div>
		{:else}
			{#if loaded}<div class="rv-row"><small>No devices found.</small></div>{/if}
		{/each}
		{#if devices.length > 5}
			<div class="sec-act"><button class="cr-more" onclick={() => (allDevices = !allDevices)}>{allDevices ? 'Show fewer' : `+${devices.length - 5} more devices`}</button></div>
		{/if}
	</div>
</section>

<style>
	.sec-act { padding: 12px 18px 4px; }
</style>
