<script lang="ts">
	import BrandTeam from '#lib/components/BrandTeam.svelte';
	import BrandAlerts from '#lib/components/BrandAlerts.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import BrandBillingForm from '#lib/components/BrandBillingForm.svelte';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import { APP_VERSION, BUILD_LABEL } from '#lib/appVersion.ts';
	import { brandHome, loadDashboard } from '#lib/brand.svelte.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import { auth, refreshAccount, signOut, switchBrand } from '#lib/auth.svelte.ts';
	import { loadRequests } from '#lib/brand.svelte.ts';
	import { brandIg, connectBrandIg, disconnectBrandIg, loadBrandIg, refreshBrandIg } from '#lib/brandIg.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { theme, toggleTheme, toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, fmt, inr } from '#lib/util.ts';

	// A brand's settings, laid out like the creator studio's: the sections on the left, the open one on the right.
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const company = $derived(acct?.brand?.name || acct?.profile?.name || 'Your brand');
	const gstin = $derived(acct?.profile?.gstin ?? '');

	type Sec = 'company' | 'billing' | 'team' | 'brands' | 'alerts' | 'account';
	const sections = $derived<{ id: Sec; label: string; icon: string; sub: string; warn?: string; href?: string }[]>([
		{
			id: 'company',
			label: 'Company & Instagram',
			icon: 'shield',
			sub: brandIg.data ? `@${brandIg.data.username} · verified` : "Connect Instagram to show you're real",
			warn: brandIg.loaded && !brandIg.data ? 'Instagram not connected' : undefined
		},
		{ id: 'billing', label: 'Billing & GST', icon: 'rupee', sub: gstin ? `GSTIN ${gstin.slice(0, 6)}…` : 'GSTIN, address and accounts email' },
		{ id: 'team', label: 'Team & approvals', icon: 'users', sub: 'Colleagues, agencies and approvals' },
		{ id: 'brands', label: 'Brands you manage', icon: 'layers', sub: (acct?.brands?.length ?? 0) > 1 ? `${acct?.brands.length} brands` : 'For agencies with several brands' },
		{ id: 'alerts', label: 'Emails & alerts', icon: 'bell', sub: 'Phone alerts, quotes, drafts and invoices' },
		{ id: 'account', label: 'Sign-in & account', icon: 'gear', sub: 'Email, look, sign out' }
	]);

	let narrow = $state(false);
	onMount(() => {
		const mq = matchMedia('(max-width: 900px)');
		const on = () => (narrow = mq.matches);
		on();
		mq.addEventListener('change', on);
		// Back from Instagram's sign-in.
		const q = page.url.searchParams;
		if (q.get('ig') === 'connected') toast('Instagram connected. Creators now see you as verified.', 'check');
		else if (q.get('ig_error')) toast(q.get('ig_error') || 'Instagram could not connect. Try again.', 'alert');
		if (q.has('ig') || q.has('ig_error')) {
			loadBrandIg();
			goto('/brand/settings?s=company', { replace: true });
		}
		return () => mq.removeEventListener('change', on);
	});
	const asked = $derived(page.url.searchParams.get('s'));
	const active = $derived<Sec | null>(sections.find((x) => x.id === asked && !x.href)?.id ?? (narrow ? null : 'company'));
	const current = $derived(sections.find((x) => x.id === active));
	function open(id: Sec) {
		goto(`?s=${id}`, narrow ? {} : { replace: true, reset: false });
	}

	let igBusy = $state<'' | 'connect' | 'refresh' | 'off'>('');
	let sure = $state(false);
	async function ig(kind: 'connect' | 'refresh' | 'off') {
		igBusy = kind;
		try {
			if (kind === 'connect') return await connectBrandIg();
			if (kind === 'refresh') {
				await refreshBrandIg();
				toast('Instagram refreshed', 'refresh');
			} else {
				await disconnectBrandIg();
				sure = false;
				toast('Instagram disconnected');
			}
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			igBusy = '';
		}
	}

	async function useBrand(id: string) {
		try {
			await switchBrand(id);
			await loadRequests();
			toast(`Now working as ${acct?.brand?.name ?? 'that brand'}`, 'refresh');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	// Phone: the creator's My page hub, for a brand. Who you are, a few swipe cards, the ticket creators
	// see on your requests, the sections in small groups and what you've done together at the bottom.
	const GROUPS: { label: string; ids: Sec[] }[] = [
		{ label: 'Your brand', ids: ['company', 'billing'] },
		{ label: 'Working together', ids: ['team', 'brands'] },
		{ label: 'Account', ids: ['alerts', 'account'] }
	];
	const byId = (id: Sec) => sections.find((x) => x.id === id)!;
	onMount(() => {
		if (!brandHome.dash) loadDashboard();
	});
	const d = $derived(brandHome.dash);
	const doneN = $derived((d?.creators ?? []).reduce((a, c) => a + (c.done ?? 0), 0));
	let cardsEl = $state<HTMLElement>();
	let cardI = $state(0);
	const onCards = () => cardsEl && (cardI = Math.round(cardsEl.scrollLeft / Math.max(1, cardsEl.clientWidth * 0.86)));
	const cards = $derived([
		brandIg.data
			? { icon: 'shield', eb: 'Instagram', text: `Verified as @${brandIg.data.username}`, act: 'Open', run: () => open('company') }
			: { icon: 'shield', eb: 'Instagram', text: "Show creators you're the real brand", act: 'Connect', run: () => ig('connect') },
		{ icon: 'search', eb: 'Creators', text: 'Find creators open to brands', act: 'Discover', run: () => goto('/brand/creators?tab=discover') },
		{ icon: 'send', eb: 'Campaigns', text: 'One brief to a whole pool', act: 'Start', run: () => goto('/brand/campaigns/new') },
		...(acct?.email ? [{ icon: 'copy', eb: 'Your sign-in', text: acct.email, act: 'Copy', run: () => copyText(acct.email, 'Email copied') }] : [])
	]);

	// Miracle's own address: the company is the signed-up profile, so billing saves there too.
	let legal = $state(auth.account?.role === 'brand' ? (auth.account.profile?.legal_name ?? '') : '');
	let gstIn = $state(auth.account?.role === 'brand' ? (auth.account.profile?.gstin ?? '') : '');
	let billBusy = $state(false);
	async function saveProfileBilling(e: SubmitEvent) {
		e.preventDefault();
		const p = acct?.profile;
		if (!acct || !p) return;
		billBusy = true;
		const { error } = await supabase.rpc('brand_signup', {
			p_name: p.name,
			p_category: p.category,
			p_website: p.website,
			p_instagram: p.instagram,
			p_full_name: acct.full_name,
			p_role: p.role,
			p_phone: acct.phone,
			p_city: p.city,
			p_goals: p.goals,
			p_legal_name: legal.trim(),
			p_gstin: gstIn.trim()
		});
		billBusy = false;
		if (error) return toast(errMessage(error), 'alert');
		await refreshAccount();
		toast('Billing details saved');
	}
</script>

<svelte:head><title>Settings</title></svelte:head>

<div class="set-intro" class:sec-open={!!active} hidden={phone.on}>
	<header class="ph rv">
		<div>
			<div class="eb">Your brand</div>
			<h1>Settings</h1>
			<p>Your company, Instagram, billing, team and sign-in.</p>
		</div>
	</header>
</div>

<div class="set-shell" class:sec-open={!!active}>
	{#if phone.on && !active}
		<div class="cs-hub">
			<header class="cs-me">
				<a class="cs-av" href="?s=company" onclick={(e) => (e.preventDefault(), open('company'))} aria-label="Company and Instagram"><Avatar name={company} src={brandIg.data?.picture ?? ''} size="64px" /><span class="cs-qr"><Icon name="shield" /></span></a>
				<div class="cs-who"><b>{company}</b><small><Icon name="shield" />{brandIg.data ? `@${brandIg.data.username} · verified` : (acct?.email ?? '')}</small></div>
				<button class="cs-edit" onclick={() => open('company')} aria-label="Edit company"><Icon name="edit" /></button>
			</header>
			<div class="cs-cards" bind:this={cardsEl} onscroll={onCards}>
				{#each cards as k (k.eb)}
					<div class="cs-card"><span class="cs-eb"><span class="cs-ci"><Icon name={k.icon} /></span>{k.eb}</span><p>{k.text}</p><button class="cs-cb" onclick={k.run} disabled={k.act === 'Connect' && !!igBusy}>{#if k.act === 'Connect' && igBusy === 'connect'}<span class="spinner"></span>{:else}{k.act}{/if}</button></div>
				{/each}
			</div>
			<div class="cs-dots" aria-hidden="true">{#each cards as k, i (k.eb)}<i class:on={i === cardI}></i>{/each}</div>
			<!-- What creators see on your requests, as a ticket like the creator's own. -->
			<div class="tks cs-tk">
				<Ticket
					name={company}
					title={brandIg.data ? 'Verified on Instagram' : 'Not verified yet'}
					sub="What creators see"
					money={brandIg.data?.followers != null ? compact(brandIg.data.followers) : ''}
					moneySub={brandIg.data?.followers != null ? 'followers' : ''}
					hue="var(--g1)"
					task={brandIg.data ? `@${brandIg.data.username}` : 'Connect Instagram to show your logo and handle'}
					status={brandIg.data ? 'Creators can trust your requests' : 'Creators see your name only'}
					tone={brandIg.data ? 'ok' : 'warn'}
					onopen={() => open('company')}
				>
					<button class="btn primary" onclick={() => open('company')}>{brandIg.data ? 'Open' : 'Connect'}</button>
				</Ticket>
			</div>
			{#each GROUPS as g (g.label)}
				<div class="cs-h">{g.label}</div>
				{#each g.ids.map(byId) as x (x.id)}
					<a class="cs-row" href={x.href ?? `?s=${x.id}`} onclick={(e) => { if (x.href) return; e.preventDefault(); open(x.id); }}><Icon name={x.icon} /><span>{x.label}</span>{#if x.warn}<i class="cs-dot" title={x.warn}></i>{/if}</a>
				{/each}
			{/each}
			<a class="cs-row" href="/brand/details?new=1"><Icon name="plus" /><span>Add another brand</span></a>
			<button class="cs-row" onclick={toggleTheme}><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /><span>{theme.value === 'dark' ? 'Light look' : 'Dark look'}</span></button>
			<!-- What you've done on Miracle, in two big numbers. -->
			<div class="cs-wins">
				<a href="/brand/business/money"><small>Paid this month</small><b>{inr(d?.spent_month ?? 0)}</b><span>See payments →</span></a>
				<a href="/brand/creators"><small>Collabs done</small><b>{doneN}</b><span>See creators →</span></a>
			</div>
			<button class="cs-logout" onclick={async () => (await signOut(), goto('/login', { replace: true }))}><Icon name="logout" /><span>Log out</span><small>{acct?.email ?? ''}</small></button>
			<footer class="cs-foot">
				<Logo size={26} />
				<b>Miracle</b>
				<span>Made for brands</span>
				<small>Version {APP_VERSION} · build {BUILD_LABEL}</small>
			</footer>
		</div>
	{/if}
	{#if active && current && phone.on}<h1 class="cs-title">{current.label}</h1>{/if}
	<nav class="set-menu rv" style="--i:1" aria-label="Settings sections" hidden={phone.on && !active}>
		{#each sections as x (x.id)}
			<a
				class="set-item"
				class:on={x.id === active}
				href={x.href ?? `?s=${x.id}`}
				aria-current={x.id === active ? 'page' : undefined}
				onclick={(e) => {
					if (x.href) return;
					e.preventDefault();
					open(x.id);
				}}
			>
				<span class="set-ic"><Icon name={x.icon} /></span>
				<span class="set-t"><b>{x.label}</b><small>{x.sub}</small></span>
				{#if x.warn}<span class="set-dot" title={x.warn}></span>{/if}
				<Icon name="chevR" class="set-chev" />
			</a>
		{/each}
	</nav>
	{#if active && current}
		<div class="set-body">
			<div class="set-head">
				<button class="set-back" onclick={() => goto('/brand/settings')}><Icon name="chevL" />All settings</button>
				<h2>{current.label}</h2>
			</div>
			{#key active}
				<div class="set-panels">
					{#if active === 'company'}
						{#if brandIg.data}
							{@const g = brandIg.data}
							<div class="bs-ig-on">
								<section class="bs-card rv" style="--i:1">
									<div class="bs-who">
										<span class="bs-ring"><Avatar name={g.name || company} src={g.picture} size="64px" /></span>
										<span class="bs-nm"><b>{g.name || company}</b><small>@{g.username}</small></span>
										<span class="bs-ok">✓ Verified</span>
									</div>
									<div class="bs-nums">
										<div><small>Followers</small><b>{g.followers != null ? compact(g.followers) : '—'}</b></div>
										<div><small>Posts</small><b>{g.media_count != null ? compact(g.media_count) : '—'}</b></div>
										<div><small>Last synced</small><b>{fmt(g.synced_at.slice(0, 10))}</b></div>
									</div>
									<div class="bs-acts">
										<button class="bs-out" onclick={() => ig('refresh')} disabled={!!igBusy}>{#if igBusy === 'refresh'}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Refresh</button>
										{#if sure}
											<span class="bs-sure">Creators stop seeing the verified mark.</span>
											<button class="bs-off" onclick={() => ig('off')} disabled={!!igBusy}>Yes, disconnect</button>
											<button class="bs-no" onclick={() => (sure = false)}>Keep it</button>
										{:else}
											<button class="bs-off" onclick={() => (sure = true)}>Disconnect</button>
										{/if}
									</div>
								</section>
								<!-- What a creator sees on a request from this brand. -->
								<section class="bs-see rv" style="--i:2">
									<span class="bs-eb">What creators see on your requests</span>
									<article class="bs-tk">
										<div class="bs-tk-top">
											<Avatar name={g.name || company} src={g.picture} size="46px" />
											<span><b>{company}</b><small>@{g.username}{g.followers != null ? ` · ${compact(g.followers)} followers` : ''} · <strong>✓ Verified on Instagram</strong></small></span>
										</div>
										<div class="bs-tk-cut" aria-hidden="true"></div>
										<div class="bs-tk-b"><b>New request</b><small>{acct?.full_name || 'You'}{acct?.profile?.role ? `, ${acct.profile.role}` : ''}</small></div>
									</article>
									<p>Creators get a lot of fake brand messages. The verified mark tells them this request comes from the account that owns @{g.username}.</p>
								</section>
							</div>
						{:else}
							<section class="bs-connect rv" style="--i:1">
								<div class="bs-c-t">
									<span class="bs-eb">Instagram</span>
									<b>Show creators you're the <em>real</em> brand</b>
									<ul>
										<li>Your logo, handle and followers on every request you send</li>
										<li>A "Verified on Instagram" mark creators can trust</li>
										<li>Your handle filled in for mentions in briefs and draft checks</li>
									</ul>
									<small>Needs a Business or Creator account. Miracle only reads your profile; it never posts or reads your messages.</small>
								</div>
								<button class="bs-grad" onclick={() => ig('connect')} disabled={!!igBusy || !brandIg.loaded}>{#if igBusy === 'connect'}<span class="spinner"></span>{/if}Connect Instagram</button>
							</section>
						{/if}
						<section class="panel rv" style="--i:3;padding:22px">
							<div class="panel-h" style="padding:0 0 14px"><h2>Company</h2><small>shown on every request you send</small></div>
							<BrandDetailsForm onsaved={() => loadRequests()} />
						</section>
					{:else if active === 'billing'}
						<section class="panel rv" style="--i:1;padding:22px">
							<div class="panel-h" style="padding:0 0 6px"><h2>Billing details</h2></div>
							<p class="hint" style="margin:0 0 16px">Printed on the invoices you receive. Add your GSTIN if you want to claim GST input credit.</p>
							{#if acct?.brand}
								<BrandBillingForm />
							{:else if acct?.profile}
								<form class="fields" onsubmit={saveProfileBilling} novalidate>
									<div class="f"><label for="bs-legal">Legal company name <span class="hint">(optional)</span></label><input class="inp" id="bs-legal" bind:value={legal} /></div>
									<div class="f"><label for="bs-gst">GSTIN <span class="hint">(optional)</span></label><input class="inp" id="bs-gst" placeholder="27AAACB1234C1Z5" bind:value={gstIn} /></div>
									<div class="f span2" style="display:flex;justify-content:flex-end"><button class="btn grad" type="submit" disabled={billBusy}>{#if billBusy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Save billing</button></div>
								</form>
								<p class="hint" style="margin:12px 0 0">Your address and accounts email are asked for on your first request to a creator.</p>
							{/if}
						</section>
					{:else if active === 'brands'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Brands you manage</h2><small>one login, several brands</small></div>
							<div class="bs-rows">
								{#each acct?.brands ?? [] as b (b.id)}
									<button class="bs-row" onclick={() => useBrand(b.id)} disabled={b.id === acct?.brand?.id}>
										<Avatar name={b.name} size="34px" />
										<span><b>{b.name}</b><small>{b.id === acct?.brand?.id ? 'Working as this brand' : 'Switch to this brand'}</small></span>
										{#if b.id === acct?.brand?.id}<Icon name="check" />{/if}
									</button>
								{:else}
									<div class="bs-row"><Avatar name={company} size="34px" /><span><b>{company}</b><small>Your brand</small></span><Icon name="check" /></div>
								{/each}
								<a class="bs-row" href="/brand/details?new=1"><span class="bs-plus"><Icon name="plus" /></span><span><b>Add another brand</b><small>For agencies working for several brands</small></span><Icon name="chevR" /></a>
							</div>
						</section>
					{:else if active === 'team'}
						<BrandTeam />
					{:else if active === 'alerts'}
						<BrandAlerts />
						<section class="panel rv" style="--i:4;padding:22px">
							<div class="panel-h" style="padding:0 0 10px"><h2>Emails</h2></div>
							<p class="hint" style="margin:0 0 10px">Miracle emails <b>{acct?.email}</b> when a creator sends a quote, a draft to approve, or an invoice, and when a post goes live.</p>
							<p class="hint" style="margin:0">Invoices also go to the accounts email in <a class="lnk" href="?s=billing" onclick={(e) => (e.preventDefault(), open('billing'))}>Billing & GST</a>. Colleagues on your <a class="lnk" href="?s=team" onclick={(e) => (e.preventDefault(), open('team'))}>team</a> get the emails for what they approve.</p>
						</section>
					{:else if active === 'account'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Sign-in & account</h2></div>
							<div class="bs-rows">
								<div class="bs-row"><span class="bs-plus"><Icon name="mail" /></span><span><b>Signed in as</b><small>{acct?.email}</small></span></div>
								<button class="bs-row" onclick={toggleTheme}><span class="bs-plus"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></span><span><b>{theme.value === 'dark' ? 'Light look' : 'Dark look'}</b><small>How the app looks on this {phone.on ? 'phone' : 'computer'}</small></span></button>
								<button class="bs-row bs-bye" onclick={async () => (await signOut(), goto('/login', { replace: true }))}><span class="bs-plus"><Icon name="logout" /></span><span><b>Sign out</b><small>{acct?.email}</small></span></button>
							</div>
						</section>
					{/if}
				</div>
			{/key}
		</div>
	{/if}
</div>

<style>
	.bs-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bs-connect {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 16px 24px;
		align-items: center;
		padding: 24px;
		margin-bottom: 18px;
		border-radius: 22px;
		background: radial-gradient(120% 120% at 0% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 55%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bs-c-t {
		display: grid;
		gap: 10px;
		min-width: 0;
	}
	.bs-c-t > b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 30px;
		line-height: 1.1;
	}
	.bs-c-t ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 6px;
		font-size: 14px;
		color: var(--ink-2);
	}
	.bs-c-t li::before {
		content: '✓  ';
		color: var(--g2);
	}
	.bs-c-t small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.bs-grad {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 50px;
		padding: 0 22px;
		border: 0;
		background: var(--grad);
		color: var(--on-grad);
		font: 700 13px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		box-shadow: 4px 4px 0 color-mix(in oklab, var(--g1) 70%, black);
		cursor: pointer;
	}
	.bs-grad:disabled {
		opacity: 0.6;
	}
	.bs-ig-on {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: 18px;
		align-items: start;
		margin-bottom: 18px;
	}
	.bs-card {
		display: grid;
		gap: 18px;
		padding: 22px;
		border-radius: 22px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bs-who {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.bs-ring {
		flex: none;
		padding: 3px;
		border-radius: 50%;
		background: conic-gradient(var(--g1), var(--g2), var(--g3), var(--g1));
		display: grid;
	}
	.bs-nm {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.bs-nm b {
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-weight: 400;
		font-size: 28px;
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bs-nm small {
		font-size: 14px;
		color: var(--ink-2);
	}
	.bs-ok {
		flex: none;
		padding: 6px 12px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ok, #2f9e5b) 16%, transparent);
		color: var(--ok, #2f9e5b);
		font-size: 12px;
		font-weight: 700;
	}
	.bs-nums {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.bs-nums div {
		display: grid;
		gap: 6px;
		padding: 14px;
		border-radius: 14px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.bs-nums small {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bs-nums b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 28px;
		line-height: 1;
	}
	.bs-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 12px;
	}
	.bs-out {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 14px;
		border: 1.5px solid var(--ink-3);
		background: none;
		color: var(--ink);
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.bs-off,
	.bs-no {
		height: 40px;
		padding: 0 10px;
		border: 0;
		background: none;
		color: var(--bad, #d6453d);
		font: 600 14px/1 var(--f-body);
		cursor: pointer;
	}
	.bs-no {
		color: var(--ink-2);
	}
	.bs-sure {
		font-size: 13px;
		color: var(--ink-3);
	}
	.bs-see {
		display: grid;
		gap: 12px;
	}
	.bs-see p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-3);
	}
	.bs-tk {
		border-radius: 20px;
		overflow: hidden;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bs-tk-top {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 18px;
		background: linear-gradient(120deg, color-mix(in oklab, var(--g1) 30%, var(--surface)), var(--surface));
	}
	.bs-tk-top span {
		display: grid;
		min-width: 0;
	}
	.bs-tk-top b {
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-weight: 400;
		font-size: 24px;
	}
	.bs-tk-top small {
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.bs-tk-top strong {
		color: var(--ok, #2f9e5b);
	}
	.bs-tk-cut {
		margin: 0 14px;
		border-top: 2px dashed var(--line-strong);
	}
	.bs-tk-b {
		display: grid;
		gap: 4px;
		padding: 16px 18px;
	}
	.bs-tk-b small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.bs-rows {
		display: grid;
		padding: 0 8px 8px;
	}
	.bs-row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		min-height: 60px;
		padding: 10px 12px;
		border: 0;
		border-top: 1px solid var(--line);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: none;
	}
	button.bs-row:not(:disabled),
	a.bs-row {
		cursor: pointer;
	}
	.bs-row > span:nth-child(2) {
		flex: 1;
		display: grid;
		min-width: 0;
	}
	.bs-row small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.bs-row > :global(.ic) {
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.bs-plus {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bs-plus :global(.ic) {
		width: 17px;
		height: 17px;
	}
	.bs-bye b {
		color: var(--bad, #d6453d);
	}
	@media (max-width: 760px) {
		.bs-connect {
			grid-template-columns: minmax(0, 1fr);
		}
		.bs-grad {
			justify-content: center;
		}
	}
</style>
