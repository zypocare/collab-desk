<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { igDisconnect, igStart, igSync, loadInstagram, saveSettings, studio } from '../studio.svelte';
	import { confetti, toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { compact, fmtTime } from '../util';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';
	import Select from './Select.svelte';
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';

	const ig = $derived(studio.ig);
	const s = $derived(studio.settings!);
	let busy = $state(false);
	const daysLeft = $derived(ig?.token_expires_at ? Math.round((Date.parse(ig.token_expires_at) - Date.now()) / 864e5) : null);

	// Optional extras: DMs in the app and posting from the app (asked for only when she turns them on).
	let perms = $state('');
	onMount(() => {
		supabase.rpc('ig_permissions').then(({ data }) => (perms = String(data ?? '')));
	});
	const dmsOn = $derived(perms.includes('instagram_business_manage_messages'));
	const postOn = $derived(perms.includes('instagram_business_content_publish'));
	// Instagram sends every creator back to one server address, which saves the connection and then
	// returns her here with ?ig=connected (or to /studio/instagram with the error).
	let starting = $state(false);
	async function connect(extra = false) {
		starting = true;
		try {
			location.href = await igStart(extra || dmsOn || postOn, perms.includes('instagram_business_manage_comments'));
		} catch (e) {
			toast(errMessage(e), 'alert');
			starting = false;
		}
	}
	onMount(() => {
		if (page.url.searchParams.get('ig') !== 'connected') return;
		loadInstagram();
		confetti();
		toast('Instagram connected');
		const u = new URL(page.url.href);
		u.searchParams.delete('ig');
		goto(u.pathname + u.search, { replaceState: true });
	});
	async function sync() {
		busy = true;
		await igSync();
		busy = false;
	}
</script>

<section class="panel rv" style="--i:2">
	<div class="panel-h"><h2>Instagram</h2>{#if ig?.connected}<span class="pill tint k-pay"><span class="dt pulse"></span>Connected</span>{/if}</div>
	{#if ig?.connected}
		<div class="ig-head">
			<Avatar name={ig.name || ig.username} src={ig.profile_picture_url} size="52px" />
			<div>
				<b>@{ig.username}</b>
				<small>{compact(ig.followers)} followers · {ig.engagement_rate ?? '—'}% engagement · {compact(ig.avg_views)} avg views</small>
				<small>Updated {ig.last_sync_at ? fmtTime(ig.last_sync_at) : 'never'} · syncs every morning at 6</small>
			</div>
		</div>
		{#if ig.last_error}<p class="err" style="padding:0 20px 10px">Last sync failed: {ig.last_error}</p>{/if}
		{#if daysLeft !== null && daysLeft < 7}<p class="hint warn-text" style="padding:0 20px 10px">Instagram access ends in {daysLeft} days. Reconnect to keep stats updating.</p>{/if}
		<div class="switch-row">
			<div><b>Results reports for brands</b><small>7 days after a collab post goes live, a report with views, reach and saves is made from Instagram's numbers.</small></div>
			<Select style="width:auto;min-width:190px" ariaLabel="Results reports" value={s.report_mode as string} options={[{ value: 'review', label: 'I check, then send' }, { value: 'auto', label: 'Send automatically' }, { value: 'off', label: "Don't make reports" }]} onchange={(v) => saveSettings({ report_mode: v as 'review' | 'auto' | 'off' })} />
		</div>
		<div class="switch-row">
			<div><b>Automatic go-live</b><small>When you post and @mention a brand you have a confirmed collab with, the collab moves to Live, the brand is told, and the caption is checked for #ad.</small></div>
		</div>
		<div class="switch-row">
			<div>
				<b>DMs and posting from the app</b>
				<small>{dmsOn || postOn ? `On: ${[dmsOn && 'Instagram DMs show in Messages', postOn && 'approved Reels can be scheduled to post'].filter(Boolean).join(', ')}.` : 'See Instagram DMs in Messages and reply there, and schedule approved Reels to post with the brand tagged. Instagram asks you to allow it once.'}</small>
			</div>
			{#if !(dmsOn && postOn)}<button class="btn sm" disabled={starting} onclick={() => connect(true)}><Icon name="send" />Allow DMs and posting</button>{/if}
		</div>
		<div class="row-btns">
			<button class="btn sm primary" disabled={busy} onclick={sync}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Sync now</button>
			<button class="btn sm" disabled={starting} onclick={() => connect()}>Reconnect</button>
			<button class="btn sm ghost danger" onclick={async () => (await ask({ title: 'Disconnect Instagram?', body: 'Live stats, post matching and brand reports stop until you connect again.', ok: 'Disconnect', danger: true })) && igDisconnect()}>Disconnect</button>
		</div>
	{:else}
		<div style="padding:0 20px 20px">
			<p class="hint" style="margin-bottom:14px">
				Connect your Instagram (a Creator or Business account) to show live follower numbers and audience on your brand page, spot collab posts automatically, and send brands their results.
			</p>
			<button class="btn grad" disabled={starting} onclick={() => connect()}><Icon name="link" />Connect Instagram</button>
			{#if ig?.last_error}<p class="err" style="margin-top:10px">{ig.last_error}</p>{/if}
		</div>
	{/if}
</section>
