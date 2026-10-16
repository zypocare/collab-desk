<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { igDisconnect, igSync, saveSettings, studio } from '../studio.svelte';
	import { compact, fmtTime } from '../util';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';
	import Select from './Select.svelte';

	const appId = (import.meta.env.VITE_INSTAGRAM_APP_ID as string) || '';
	const ig = $derived(studio.ig);
	const s = $derived(studio.settings!);
	let busy = $state(false);
	const daysLeft = $derived(ig?.token_expires_at ? Math.round((Date.parse(ig.token_expires_at) - Date.now()) / 864e5) : null);

	function connect() {
		const state = crypto.randomUUID();
		try {
			sessionStorage.setItem('ig_state', state);
		} catch {
			/* private mode: the callback will still work, just without the extra check */
		}
		const redirect = `${location.origin}/studio/instagram`;
		const u = new URL('https://www.instagram.com/oauth/authorize');
		u.searchParams.set('client_id', appId);
		u.searchParams.set('redirect_uri', redirect);
		u.searchParams.set('response_type', 'code');
		u.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_insights');
		u.searchParams.set('state', state);
		location.href = u.toString();
	}
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
		<div class="row-btns">
			<button class="btn sm primary" disabled={busy} onclick={sync}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Sync now</button>
			{#if appId}<button class="btn sm" onclick={connect}>Reconnect</button>{/if}
			<button class="btn sm ghost danger" onclick={async () => (await ask({ title: 'Disconnect Instagram?', body: 'Live stats, post matching and brand reports stop until you connect again.', ok: 'Disconnect', danger: true })) && igDisconnect()}>Disconnect</button>
		</div>
	{:else}
		<div style="padding:0 20px 20px">
			<p class="hint" style="margin-bottom:14px">
				Connect her Instagram (a Creator or Business account) to show live follower numbers and audience on your brand page, spot collab posts automatically, and send brands their results.
			</p>
			{#if appId}
				<button class="btn grad" onclick={connect}><Icon name="link" />Connect Instagram</button>
			{:else}
				<p class="hint warn-text">The Instagram app isn't set up yet. Follow "Instagram" in the setup guide, then add VITE_INSTAGRAM_APP_ID to the website settings.</p>
			{/if}
			{#if ig?.last_error}<p class="err" style="margin-top:10px">{ig.last_error}</p>{/if}
		</div>
	{/if}
</section>
