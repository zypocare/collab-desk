<script lang="ts">
	import { page } from '$app/state';
	import { COUNTRIES, CURRENCIES, currencyFor } from '#lib/currency.ts';
	import { brandStats } from '#lib/brandStats.ts';
	import { saveBrand, saveBrandNotes, studio } from '#lib/studio.svelte.ts';
	import { countUp, ui } from '#lib/ui.svelte.ts';
	import { CATS, delivText, fmt, inr, stageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import BrandRating from '#lib/components/BrandRating.svelte';
	import Select from '#lib/components/Select.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import PayPill from '#lib/components/PayPill.svelte';

	const brand = $derived(studio.brands.find((b) => b.id === page.params.id));
	const s = $derived(brand ? brandStats(brand, studio.collabs) : null);
	const notes = $derived(brand ? (studio.notes[brand.id] ?? { brand_id: brand.id, notes: '', competitors: [] }) : null);
	const contacts = $derived(
		s ? [...new Map(s.collabs.filter((c) => c.contact_email || c.contact_name).map((c) => [c.contact_email || c.contact_name, c])).values()] : []
	);
	let newComp = $state('');

	function addCompetitor(e: SubmitEvent) {
		e.preventDefault();
		const v = newComp.trim();
		if (!v || !brand || !notes) return;
		if (!notes.competitors.some((x) => x.toLowerCase() === v.toLowerCase())) saveBrandNotes(brand.id, { competitors: [...notes.competitors, v] });
		newComp = '';
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

<svelte:head><title>{brand?.name ?? 'Brand'} · {studio.settings?.app_name}</title></svelte:head>

{#if !brand || !s || !notes}
	<a class="back" href="/studio/brands"><Icon name="back" />All brands</a>
	<div class="empty-card"><h2>Brand not found</h2><p>It may have been removed.</p></div>
{:else}
	<a class="back rv" href="/studio/brands"><Icon name="back" />All brands</a>
	<header class="ph rv">
		<div style="display:flex;gap:16px;align-items:center">
			<Mono name={brand.name} size="lg" />
			<div>
				<div class="eb">{brand.category}{brand.instagram ? ` · @${brand.instagram}` : ''}</div>
				<h1>{brand.name}</h1>
			</div>
		</div>
	</header>

	<section class="kpis k4" aria-label="Brand summary">
		<div class="kpi glow rv" style="--i:1"><div><div class="lbl">Earned</div><div class="big" use:countUp={{ value: s.paid, money: true }}>{inr(s.paid)}</div><div class="sub">{s.outstanding ? `${inr(s.outstanding)} still due` : 'nothing due'}</div></div></div>
		<div class="kpi glow rv" style="--i:2"><div><div class="lbl">Collabs</div><div class="big" use:countUp={{ value: s.count }}>{s.count}</div><div class="sub">{s.active} active</div></div></div>
		<div class="kpi glow rv" style="--i:3"><div><div class="lbl">Barter value</div><div class="big" use:countUp={{ value: s.barter, money: true }}>{inr(s.barter)}</div><div class="sub">products received</div></div></div>
		<div class="kpi glow rv" style="--i:4"><div><div class="lbl">Pays in</div><div class="big">{s.avgDaysToPay === null ? '—' : `${s.avgDaysToPay}d`}</div><div class="sub">{s.onTimeRate === null ? 'no paid invoices yet' : `${Math.round(s.onTimeRate * 100)}% paid on time`}</div></div></div>
	</section>

	<div class="page-grid">
		<div class="stack">
			<section class="panel rv" style="--i:5">
				<div class="panel-h"><h2>Collabs</h2><small>newest first</small></div>
				{#each s.collabs as c, i (c.id)}
					<button class="prod-row" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left;animation:rise .5s var(--ease) both;animation-delay:calc({i} * 40ms)" onclick={() => (ui.openCollab = c.id)}>
						<span class="ticon tint st-{c.stage}" style="width:34px;height:34px"><span class="dt"></span></span>
						<div><b>{delivText(c.deliverables)}</b><small><span class="id">{c.code}</span> · {stageLabel(c.stage)} · {fmt(c.live_date ?? c.received_on)}</small></div>
						<span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="v">{c.type === 'barter' ? inr(c.product_value) : inr(c.fee)}</span><PayPill {c} /></span>
					</button>
				{/each}
			</section>
		</div>
		<div class="stack">
			<section class="panel rv" style="--i:5">
				<div class="panel-h"><h2>Your rating</h2><small>private · moves their requests up or down</small></div>
				<div style="padding:0 20px 18px"><BrandRating {brand} /></div>
			</section>
			<section class="panel rv" style="--i:6">
				<div class="panel-h"><h2>Details</h2></div>
				<div class="form-b">
					<div class="f span2"><label for="b-name">Brand name</label><input class="inp" id="b-name" value={brand.name} onchange={(e) => val(e).trim() && saveBrand(brand.id, { name: val(e).trim() })} /></div>
					<div class="f"><label for="b-ig">Instagram</label><div class="pre"><span>@</span><input class="inp" id="b-ig" value={brand.instagram} onchange={(e) => saveBrand(brand.id, { instagram: val(e).replace(/^@/, '') })} /></div></div>
					<div class="f">
						<label for="b-cat">Category</label>
						<Select id="b-cat" value={brand.category} options={CATS.map((c) => ({ value: c, label: c }))} onchange={(v) => brand && saveBrand(brand.id, { category: v })} />
					</div>
					<div class="f span2"><label for="b-web">Website</label><input class="inp" id="b-web" value={brand.website} placeholder="https://" onchange={(e) => saveBrand(brand.id, { website: val(e) })} /></div>
					<div class="f">
						<label for="b-country">Country</label>
						<Select id="b-country" value={brand.country || 'India'} options={COUNTRIES.map((x) => ({ value: x, label: x }))} onchange={(v) => brand && saveBrand(brand.id, { country: v, currency: v === 'India' ? 'INR' : brand.currency !== 'INR' ? brand.currency : currencyFor(v) })} />
					</div>
					<div class="f">
						<label for="b-cur">Quotes and invoices in</label>
						<Select id="b-cur" value={brand.currency || 'INR'} options={CURRENCIES} onchange={(v) => brand && saveBrand(brand.id, { currency: v })} />
					</div>
				</div>
			</section>
			<section class="panel rv" style="--i:7">
				<div class="panel-h"><h2>Private notes</h2><small>only you see these</small></div>
				<div style="padding:0 20px 20px">
					<textarea class="inp" placeholder="What they liked, who approves content, how they pay…" value={notes.notes} onchange={(e) => saveBrandNotes(brand.id, { notes: val(e) })}></textarea>
					<div class="f" style="margin-top:16px">
						<label for="b-comp">Competitors</label>
						<p class="hint" style="margin-bottom:8px">Brands you shouldn't post close to this one.</p>
						<form style="display:flex;gap:8px" onsubmit={addCompetitor}>
							<input class="inp" id="b-comp" list="all-brands" placeholder="Add a brand" bind:value={newComp} />
							<button class="btn" type="submit"><Icon name="plus" />Add</button>
						</form>
						<datalist id="all-brands">{#each studio.brands.filter((b) => b.id !== brand.id) as b (b.id)}<option value={b.name}></option>{/each}</datalist>
						<div class="tags">
							{#each notes.competitors as comp (comp)}
								<span class="tag">{comp}<button aria-label="Remove {comp}" onclick={() => saveBrandNotes(brand.id, { competitors: notes.competitors.filter((x) => x !== comp) })}><Icon name="x" /></button></span>
							{/each}
						</div>
					</div>
				</div>
			</section>
			{#if contacts.length}
				<section class="panel rv" style="--i:8">
					<div class="panel-h"><h2>Contacts</h2></div>
					{#each contacts as c (c.id)}
						<div class="prod-row"><Mono name={c.contact_name || c.contact_email} size="sm" /><div><b>{c.contact_name || '—'}</b><small>{c.contact_email}{c.contact_phone ? ` · ${c.contact_phone}` : ''}</small></div></div>
					{/each}
				</section>
			{/if}
		</div>
	</div>
{/if}
