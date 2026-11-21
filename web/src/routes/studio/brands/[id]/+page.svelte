<script lang="ts">
	import { page } from '$app/state';
	import MonthlyDeals from '#lib/components/MonthlyDeals.svelte';
	import { COUNTRIES, CURRENCIES, currencyFor } from '#lib/currency.ts';
	import { brandStats } from '#lib/brandStats.ts';
	import { reloadCollabs, saveBrand, saveBrandNotes, studio } from '#lib/studio.svelte.ts';
	import { goto } from '$app/navigation';
	import { ask } from '#lib/confirm.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { CATS, errMessage, hueOf, initials, inr, inrS } from '#lib/util.ts';
	import { countUp, toast } from '#lib/ui.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import BrandRating from '#lib/components/BrandRating.svelte';
	import Select from '#lib/components/Select.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import CollabRow from '#lib/components/CollabRow.svelte';
	import BrandVerified from '#lib/components/BrandVerified.svelte';

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
	const referred = $derived(brand ? studio.collabs.filter((x) => x.referred_by === brand.id) : []);

	let mergeInto = $state<string | undefined>(undefined);
	let merging = $state(false);
	const others = $derived(brand ? studio.brands.filter((b) => b.id !== brand.id).map((b) => ({ value: b.id, label: b.instagram ? `${b.name} · @${b.instagram.replace(/^@+/, '')}` : b.name })) : []);
	async function merge() {
		if (!brand || !s || !mergeInto) return;
		const into = studio.brands.find((b) => b.id === mergeInto);
		if (!into) return;
		const n = s.collabs.length;
		const ok = await ask({
			title: `Merge ${brand.name} into ${into.name}?`,
			body: `${n ? `Its ${n} collab${n === 1 ? '' : 's'}, ` : 'Its '}monthly deals, notes and brand logins move to ${into.name}, and ${brand.name}${brand.instagram ? ` (@${brand.instagram.replace(/^@+/, '')})` : ''} is removed. This can't be undone.`,
			ok: 'Merge brands'
		});
		if (!ok) return;
		merging = true;
		const { error } = await supabase.rpc('merge_brands', { p_from: brand.id, p_into: into.id });
		merging = false;
		if (error) return toast(`Couldn't merge: ${errMessage(error)}`, 'alert');
		const from = brand.name;
		await goto(`/studio/brands/${into.id}`);
		await reloadCollabs();
		toast(`${from} merged into ${into.name}`, 'check');
	}

	const issued = $derived(s ? s.collabs.reduce((a, c) => a + c.invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled').length, 0) : 0);
	let deleting = $state(false);
	async function del() {
		if (!brand || !s) return;
		if (issued) return toast(`${brand.name} has ${issued} sent or paid invoice${issued === 1 ? '' : 's'}, kept for your tax records. Cancel ${issued === 1 ? 'it' : 'them'} first to delete the brand.`, 'alert');
		const n = s.collabs.length;
		if (!(await ask({ title: `Delete ${brand.name}?`, body: n ? `Its ${n} collab${n === 1 ? '' : 's'} go too, with their messages, quotes, drafts and notes. This can't be undone.` : "This can't be undone.", ok: 'Delete brand', danger: true }))) return;
		deleting = true;
		const { error } = await supabase.rpc('delete_brand', { p_brand: brand.id });
		deleting = false;
		if (error) return toast(`Couldn't delete: ${errMessage(error).replace(/^invoices_issued:\d+$/, 'it has sent or paid invoices.')}`, 'alert');
		const name = brand.name;
		await goto('/studio/brands');
		await reloadCollabs();
		toast(`${name} deleted`, 'check');
	}
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
				<BrandVerified brandId={brand.id} />
				{#if referred.length}<p class="ref-by"><Icon name="users" />Recommended you to {referred.length} brand{referred.length === 1 ? '' : 's'}: {[...new Set(referred.map((x) => x.brand.name))].join(', ')}</p>{/if}
			</div>
		</div>
	</header>

	<!-- Holographic Metallic Partner Vault Card -->
	<section class="bd-vault rv" style="--h:var(--m{hueOf(brand.name)})" aria-label="Brand summary">
		<div class="bdv-top">
			<span class="tk-tile">{initials(brand.name)}</span>
			<div class="bdv-who">
				<b>{brand.name}</b>
				<small>{brand.category || 'Brand'}{#if brand.instagram}{' · '}<span class="tk-ig">@{brand.instagram.replace(/^@+/, '')}</span>{/if}</small>
			</div>
			{#if s.onTimeRate !== null}
				<span class="bdv-pill">{Math.round(s.onTimeRate * 100)}% ON TIME</span>
			{/if}
		</div>
		<div class="bdv-nums">
			<div><b use:countUp={{ value: s.paid, money: true }}>{inr(s.paid)}</b><small>earned</small></div>
			<div><b>{s.count}</b><small>collab{s.count === 1 ? '' : 's'} · {s.active} active</small></div>
			<div><b>{s.avgDaysToPay === null ? '—' : s.avgDaysToPay === 0 ? 'Same day' : `${s.avgDaysToPay}d`}</b><small>pays in</small></div>
			<div><b>{s.barter ? inrS(s.barter) : '—'}</b><small>in products</small></div>
		</div>
		{#if s.outstanding}<p class="bdv-due"><i></i>{inr(s.outstanding)} yet to come</p>{/if}
		<div class="bdv-orbit">
			{#if brand.instagram}
				<a href="https://instagram.com/{brand.instagram.replace(/^@+/, '')}" target="_blank" rel="noopener"><Icon name="link" />Instagram</a>
			{:else}
				<a href="#b-ig"><Icon name="plus" />Add IG</a>
			{/if}
			{#if brand.website}
				<a href={brand.website} target="_blank" rel="noopener"><Icon name="link" />Website</a>
			{:else}
				<a href="#b-web"><Icon name="plus" />Website</a>
			{/if}
			<a href="#b-notes"><Icon name="doc" />Notes</a>
		</div>
	</section>

	<div class="page-grid">
		<div class="stack">
			<MonthlyDeals brandId={brand.id} brandName={brand.name} />
			<section class="panel rv" style="--i:5">
				<div class="panel-h"><h2>Collabs</h2><small>newest first</small></div>
				<div class="m-list m-wallet">{#each s.collabs as c, i (c.id)}<CollabRow {c} {i} />{/each}</div>
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
					<div class="f span2"><label for="b-web">Website</label><input class="inp" id="b-web" value={brand.website} placeholder="https://" onchange={(e) => {
						const w = val(e).trim();
						if (w && !/^(https?:\/\/)?[^\s/.]+\.[^\s]{2,}$/.test(w)) {
							toast('That doesn’t look like a website. Use something like brand.com.', 'alert');
							e.currentTarget.value = brand.website ?? '';
							return;
						}
						saveBrand(brand.id, { website: w && !/^https?:/.test(w) ? `https://${w}` : w });
					}} /></div>
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
			<section class="panel rv" style="--i:7" id="b-notes">
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
			{#if others.length}
				<section class="panel merge-zone rv" style="--i:9">
					<div class="panel-h"><h2>Merge into another brand</h2></div>
					<p class="hint dz-text">Added the same brand twice? Pick the one to keep. {s.collabs.length ? `This brand's ${s.collabs.length} collab${s.collabs.length === 1 ? '' : 's'}, ` : "This brand's "}monthly deals, notes and brand logins move there, and this one is removed.</p>
					<div class="mz-act">
						<Select ariaLabel="Brand to keep" placeholder="Brand to keep" value={mergeInto} options={others} onchange={(v) => (mergeInto = v)} />
						<button class="btn" onclick={merge} disabled={merging || !mergeInto}>{#if merging}<span class="spinner"></span>{:else}<Icon name="layers" />{/if}Merge</button>
					</div>
				</section>
			{/if}
			<section class="panel danger-zone rv" style="--i:9">
				<div class="panel-h"><h2>Delete brand</h2></div>
				<p class="hint dz-text">{issued ? `Has ${issued} sent or paid invoice${issued === 1 ? '' : 's'}, kept for your tax records. Cancel ${issued === 1 ? 'it' : 'them'} first to delete this brand.` : s.collabs.length ? `Removes ${brand.name} and its ${s.collabs.length} collab${s.collabs.length === 1 ? '' : 's'} for good.` : `Removes ${brand.name} for good.`}</p>
				<div class="dz-act"><button class="btn danger" onclick={del} disabled={deleting || issued > 0}>{#if deleting}<span class="spinner"></span>{:else}<Icon name="x" />{/if}Delete brand</button></div>
			</section>
		</div>
	</div>
{/if}

<style>
	@property --bd-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

	.bd-vault {
		position: relative;
		overflow: hidden;
		border-radius: 22px;
		padding: 18px;
		margin-bottom: 16px;
		border: 1px solid transparent;
		background:
			repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0 8px, transparent 8px 16px),
			linear-gradient(138deg, color-mix(in oklab, var(--h) 82%, #1a0d18) 0%, color-mix(in oklab, var(--h) 44%, #140a12) 66%, #140a12 100%) padding-box,
			conic-gradient(from var(--bd-rim), rgba(255, 255, 255, 0.42), rgba(178, 154, 255, 0.65), rgba(242, 90, 144, 0.55), rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.42)) border-box;
		animation: bd-spin 12s linear infinite;
		box-shadow: 0 24px 48px -22px rgba(0, 0, 0, 0.88);
		display: grid;
		gap: 14px;
		color: #fff;
	}
	.bd-vault::after { content: ''; position: absolute; inset: 0; width: 45%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.12), transparent); transform: translateX(-160%) skewX(-22deg); animation: bd-sheen 6.5s ease-in-out infinite; pointer-events: none; }
	.bd-vault > * { position: relative; z-index: 1; }

	.bdv-top { display: flex; align-items: center; gap: 12px; }
	.bdv-who { flex: 1; min-width: 0; display: grid; gap: 3px; }
	.bdv-who b { font: italic 400 26px/1.05 var(--f-serif, Georgia, serif); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.bdv-who small { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.78); }
	.bdv-pill { flex: none; padding: 4px 8px; border-radius: 999px; background: rgba(17, 13, 17, 0.52); border: 1px solid rgba(111, 208, 140, 0.45); color: var(--ok); font: 700 9.5px/1 ui-monospace, Consolas, monospace; letter-spacing: .06em; }

	.bdv-nums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; padding-top: 14px; border-top: 1.5px dashed rgba(255, 255, 255, 0.24); }
	.bdv-nums div { display: grid; gap: 3px; }
	.bdv-nums b { font: 400 28px/1 var(--f-serif, Georgia, serif); letter-spacing: -.6px; color: #fff; font-variant-numeric: tabular-nums; }
	.bdv-nums small { font-size: 9.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.72); }

	.bdv-due { margin: 0; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: #ffd67a; }
	.bdv-due i { width: 7px; height: 7px; border-radius: 50%; background: var(--g3); }

	.bdv-orbit { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
	.bdv-orbit a { height: 34px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(17, 13, 17, 0.42); color: #fff; text-decoration: none; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
	.bdv-orbit a :global(svg) { width: 14px; height: 14px; }

	.dz-text { margin: 0; padding: 0 20px; }
	.dz-act { padding: 14px 20px 20px; }
	.mz-act { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 14px 20px 20px; }

	@keyframes bd-spin { to { --bd-rim: 360deg; } }
	@keyframes bd-sheen { 0%, 58% { transform: translateX(-160%) skewX(-22deg); } 100% { transform: translateX(270%) skewX(-22deg); } }
	@media (prefers-reduced-motion: reduce) { .bd-vault, .bd-vault::after { animation: none; } }
</style>
