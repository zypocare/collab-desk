<script lang="ts">
	import { onMount } from 'svelte';
	import { day, num } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import { FEATURE_LABEL, LIMIT_LABEL } from './billing.ts';

	// Miracle's plans (names, prices, limits, features) and the billing settings (trial, grace, founding offer,
	// seller details on invoices). Saving a new price makes Razorpay plans afresh at the next checkout.
	type R = Record<string, any>;
	type Edit = { name: string; tagline: string; price_month: number; price_year: number; founding_year: string; limits: Record<string, string>; features: string[]; active: boolean };
	let d = $state<R | null>(null);
	let err = $state('');
	let edits = $state<Record<string, Edit>>({});
	let settings = $state<R>({});
	let busy = $state('');

	function take(x: R) {
		d = x;
		edits = Object.fromEntries(
			x.plans.map((p: R) => [p.code, {
				name: p.name, tagline: p.tagline, price_month: p.price_month, price_year: p.price_year, founding_year: p.founding_year === null ? '' : String(p.founding_year),
				limits: Object.fromEntries(Object.keys(LIMIT_LABEL).map((k) => [k, p.limits?.[k] === undefined || p.limits?.[k] === null ? '' : String(p.limits[k])])),
				features: [...(p.features ?? [])], active: p.active
			}])
		);
		const s = x.settings ?? {};
		settings = { trial_days: s.trial_days, grace_days: s.grace_days, founding_on: s.founding_on, founding_left: s.founding_left,
			legal_name: s.seller?.legal_name ?? '', gstin: s.seller?.gstin ?? '', address: s.seller?.address ?? '', state: s.seller?.state ?? '' };
	}
	async function load() {
		const { data, error } = await supabase.rpc('admin_billing');
		err = error ? errMessage(error) : '';
		if (!error) take(data as R);
	}
	onMount(load);

	function changed(p: R) {
		const e = edits[p.code];
		if (!e) return false;
		const lim = Object.fromEntries(Object.entries(e.limits).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
		return e.name !== p.name || e.tagline !== p.tagline || e.price_month !== p.price_month || e.price_year !== p.price_year ||
			e.founding_year !== (p.founding_year === null ? '' : String(p.founding_year)) || e.active !== p.active ||
			JSON.stringify(lim) !== JSON.stringify(Object.fromEntries(Object.entries(p.limits ?? {}).filter(([, v]) => v !== null))) ||
			JSON.stringify([...e.features].sort()) !== JSON.stringify([...(p.features ?? [])].sort());
	}
	async function savePlan(p: R) {
		const e = edits[p.code];
		const priceChanged = e.price_month !== p.price_month || e.price_year !== p.price_year || e.founding_year !== (p.founding_year === null ? '' : String(p.founding_year));
		const reason = await askText({
			title: `Save ${e.name}?`,
			body: priceChanged ? 'The price changed. People already paying keep their price until they change plan; new checkouts use the new price.' : 'Changes apply to everyone on this plan straight away.',
			ok: 'Save',
			input: { label: 'Why (for the audit trail)', required: true }
		});
		if (reason === null) return;
		const limits = Object.fromEntries(Object.entries(e.limits).filter(([, v]) => v !== '').map(([k, v]) => [k, Math.max(0, Math.round(Number(v)))]));
		busy = p.code;
		const { data, error } = await supabase.rpc('admin_billing_plan_save', {
			p_code: p.code,
			p: { name: e.name, tagline: e.tagline, price_month: e.price_month, price_year: e.price_year, founding_year: e.founding_year, limits, features: e.features, active: e.active, reason }
		});
		busy = '';
		if (error) return toast(errMessage(error), true);
		take(data as R);
		toast(`${e.name} saved`);
	}
	async function saveSettings() {
		const reason = await askText({ title: 'Save billing settings?', ok: 'Save', input: { label: 'Why (for the audit trail)', required: true } });
		if (reason === null) return;
		busy = 'settings';
		const s = settings;
		const { data, error } = await supabase.rpc('admin_billing_settings_save', {
			p: { trial_days: Number(s.trial_days), grace_days: Number(s.grace_days), founding_on: !!s.founding_on, founding_left: Number(s.founding_left),
				seller: { legal_name: s.legal_name, gstin: s.gstin, address: s.address, state: s.state }, reason }
		});
		busy = '';
		if (error) return toast(errMessage(error), true);
		take(data as R);
		toast('Settings saved');
	}
	function toggleFeature(code: string, f: string) {
		const e = edits[code];
		e.features = e.features.includes(f) ? e.features.filter((x) => x !== f) : [...e.features, f];
	}
	const SIDE: Record<string, string> = { creator: 'For creators', brand: 'For brands', agency: 'For agencies' };
</script>

<div class="pp">
	<header>
		<div class="eb">Billing</div>
		<h1>Plans & settings</h1>
		<p class="muted lead">Prices are in rupees before GST (18% is added at checkout). An empty limit means unlimited. <a href={href('billing')}>Overview</a></p>
	</header>
	{#if err}<p class="err">{err}</p>{/if}
	{#if !d}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		<div class="plans">
			{#each d.plans as p (p.code)}
				{@const e = edits[p.code]}
				<section class="card plan" class:off={!e.active}>
					<div class="card-h"><h2 class="card-t">{p.name} <small class="muted mono">{p.code}</small></h2><span class="tag {e.active ? 't-ok' : 't-mute'}">{SIDE[p.side] ?? p.side}</span></div>
					<div class="card-b fields">
						<div class="f"><label for="n-{p.code}">Name</label><input id="n-{p.code}" class="inp" bind:value={e.name} /></div>
						<div class="f"><label for="t-{p.code}">Tagline</label><input id="t-{p.code}" class="inp" bind:value={e.tagline} /></div>
						{#if p.rank > 1 || p.price_month}
							<div class="row3">
								<div class="f"><label for="pm-{p.code}">₹ a month</label><input id="pm-{p.code}" class="inp" type="number" min="0" bind:value={e.price_month} /></div>
								<div class="f"><label for="py-{p.code}">₹ a year</label><input id="py-{p.code}" class="inp" type="number" min="0" bind:value={e.price_year} /></div>
								<div class="f"><label for="pf-{p.code}">Founding ₹ a year</label><input id="pf-{p.code}" class="inp" inputmode="numeric" placeholder="none" bind:value={e.founding_year} /></div>
							</div>
						{/if}
						<div class="sub">Limits</div>
						<div class="lims">
							{#each Object.entries(LIMIT_LABEL) as [k, l] (k)}
								<label class="lim"><span>{l}</span><input class="inp sm" inputmode="numeric" placeholder="unlimited" bind:value={e.limits[k]} /></label>
							{/each}
						</div>
						<div class="sub">Features</div>
						<div class="feats">
							{#each Object.entries(FEATURE_LABEL) as [f, l] (f)}
								<label class="feat"><input type="checkbox" checked={e.features.includes(f)} onchange={() => toggleFeature(p.code, f)} /> {l}</label>
							{/each}
						</div>
						<label class="feat"><input type="checkbox" bind:checked={e.active} /> Offered to new buyers</label>
					</div>
					<div class="pf">
						<span class="muted sm">Updated {day(p.updated_at)}{p.gateway && Object.keys(p.gateway).length ? ' · Razorpay plans made' : ''}</span>
						<button class="btn pri sm" disabled={!changed(p) || busy === p.code} onclick={() => savePlan(p)}>{busy === p.code ? 'Saving…' : 'Save plan'}</button>
					</div>
				</section>
			{/each}
		</div>

		<section class="card">
			<div class="card-h"><h2 class="card-t">Billing settings</h2><button class="btn pri sm" disabled={busy === 'settings'} onclick={saveSettings}>Save settings</button></div>
			<div class="card-b set">
				<div class="f"><label for="s-trial">Free trial (days)</label><input id="s-trial" class="inp" type="number" min="0" max="90" bind:value={settings.trial_days} /></div>
				<div class="f"><label for="s-grace">Grace after a failed payment (days)</label><input id="s-grace" class="inp" type="number" min="0" max="30" bind:value={settings.grace_days} /></div>
				<div class="f"><label for="s-fl">Founding offers left</label><input id="s-fl" class="inp" type="number" min="0" bind:value={settings.founding_left} /></div>
				<label class="feat chk"><input type="checkbox" bind:checked={settings.founding_on} /> Founding price on offer</label>
				<div class="f wide"><label for="s-ln">Seller legal name (on invoices)</label><input id="s-ln" class="inp" bind:value={settings.legal_name} /></div>
				<div class="f"><label for="s-g">Seller GSTIN</label><input id="s-g" class="inp mono" bind:value={settings.gstin} /></div>
				<div class="f"><label for="s-st">Seller state</label><input id="s-st" class="inp" bind:value={settings.state} /></div>
				<div class="f wide"><label for="s-ad">Seller address</label><textarea id="s-ad" class="inp" rows="2" bind:value={settings.address}></textarea></div>
			</div>
			<p class="card-b muted sm">{num(d.settings?.founding_left ?? 0)} founding offers left now.</p>
		</section>
	{/if}
</div>

<style>
	.pp { display: flex; flex-direction: column; gap: 16px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 16px; align-items: start; }
	.plan.off { opacity: .75; }
	.fields { display: grid; gap: 10px; }
	.row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.sub { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); margin-top: 4px; }
	.lims { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 10px; }
	.lim { display: grid; gap: 3px; font-size: 12px; color: var(--ink-2); }
	.inp.sm { height: 30px; font-family: var(--f-mono); }
	.feats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 4px 10px; }
	.feat { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
	.pf { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--line-soft); }
	.sm { font-size: 12px; }
	.set { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; align-items: end; }
	.wide { grid-column: span 2; }
	.chk { height: 36px; }
	@media (max-width: 560px) { .row3 { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
</style>
