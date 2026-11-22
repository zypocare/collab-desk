<script lang="ts">
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import {
		calcCreatorPackage,
		createCreatorLink,
		downloadCreatorTaxCsv,
		getBudgetGate,
		listBrandMemories,
		listCreatorLinks,
		listCreatorPosts,
		openCreatorProofPdf,
		saveBrandMemory,
		saveBudgetGate,
		saveCreatorPost,
		updateCreatorPostStatus,
		type BrandMemory,
		type CreatorApprovalLink,
		type CreatorPost
	} from '#lib/creatorOs.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, inr } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	const creatorName = $derived(studio.settings?.display_name || 'Creator');
	const handle = $derived(studio.settings?.handle || 'creator');

	let tab = $state<'links' | 'calc' | 'crm' | 'viral' | 'tax'>('links');

	// 1. Off-Platform Contract & Draft Approval Links
	let links = $state<CreatorApprovalLink[]>([]);
	let lKind = $state<'contract' | 'draft'>('contract');
	let lBrand = $state('');
	let lTitle = $state('');
	let lFee = $state('');
	let lTerms = $state('1 Reel + 2 Stories · Organic usage only · Max 2 revisions · Payment within 7 days of live post · ASCI #ad included');
	let lUrl = $state('');
	let lBusy = $state(false);

	// 2. Fair Rate, Usage Rights & Take-Home Calculator
	let baseReel = $state(12000);
	let reels = $state(1);
	let stories = $state(2);
	let shortsOrUgc = $state(0);
	let usageDays = $state<0 | 30 | 90 | 180>(90);
	let exclDays = $state<0 | 15 | 30 | 60>(30);
	let gstReg = $state(false);
	let tdsPct = $state<0 | 2 | 10>(10);
	const pkg = $derived(calcCreatorPackage({ baseReel, reels, stories, shortsOrUgc, usageDays, exclDays, gstRegistered: gstReg, tdsPct }));

	// 3. Private Brand CRM & Payment Memory
	let memories = $state<BrandMemory[]>([]);
	let bmBrand = $state('');
	let bmQuoted = $state('');
	let bmSettled = $state('');
	let bmPayDays = $state('7');
	let bmRev = $state('1');
	let bmNotes = $state('');
	let bmBusy = $state(false);

	// 4. Viral Upsell & Shorts / UGC Tracker
	let posts = $state<CreatorPost[]>([]);
	let pBrand = $state('');
	let pPlat = $state<'instagram' | 'youtube_shorts' | 'ugc_raw'>('youtube_shorts');
	let pUrl = $state('');
	let p48 = $state('');
	let p7 = $state('');
	let pBusy = $state(false);

	// 5. Tax Pack + Bio Budget Gate
	let gateMin = $state(5000);
	let gateBarter = $state(false);
	let gateAutoSort = $state(true);
	let gateNote = $state('');
	let gateBusy = $state(false);

	onMount(async () => {
		const [lk, bm, ps, gt] = await Promise.all([
			listCreatorLinks().catch(() => []),
			listBrandMemories().catch(() => []),
			listCreatorPosts().catch(() => []),
			getBudgetGate().catch(() => null)
		]);
		links = lk;
		memories = bm;
		posts = ps;
		if (gt) {
			gateMin = Number(gt.min_reel_budget || 0);
			gateBarter = !!gt.accept_barter;
			gateAutoSort = !!gt.auto_sort_low;
			gateNote = gt.note_for_brands || '';
		}
	});

	async function makeLink(e: SubmitEvent) {
		e.preventDefault();
		if (!lBrand.trim() || !lTitle.trim()) return toast('Enter brand name and title', 'alert');
		lBusy = true;
		try {
			const rec = await createCreatorLink({
				kind: lKind,
				brand: lBrand.trim(),
				title: lTitle.trim(),
				fee: lFee.trim(),
				terms: lTerms.trim(),
				draftUrl: lUrl.trim(),
				creatorName
			});
			links = [rec, ...links];
			lBrand = '';
			lTitle = '';
			lFee = '';
			lUrl = '';
			copyText(`${location.origin}/c-approve/${rec.token}`, 'Link created & copied for WhatsApp');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			lBusy = false;
		}
	}

	async function addMemory(e: SubmitEvent) {
		e.preventDefault();
		if (!bmBrand.trim()) return toast('Enter brand name', 'alert');
		bmBusy = true;
		try {
			const rec = await saveBrandMemory({
				brand_name: bmBrand.trim(),
				last_quoted: Number(bmQuoted) || 0,
				last_settled: Number(bmSettled) || 0,
				avg_pay_days: Number(bmPayDays) || 7,
				revision_count: Number(bmRev) || 1,
				private_notes: bmNotes.trim()
			});
			memories = [rec, ...memories.filter((x) => x.brand_name !== rec.brand_name)];
			bmBrand = '';
			bmQuoted = '';
			bmSettled = '';
			bmNotes = '';
			toast('Brand memory saved privately', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			bmBusy = false;
		}
	}

	async function addPost(e: SubmitEvent) {
		e.preventDefault();
		if (!pBrand.trim() || !pUrl.trim()) return toast('Enter brand name and post URL', 'alert');
		pBusy = true;
		try {
			const rec = await saveCreatorPost({
				brand: pBrand.trim(),
				platform: pPlat,
				url: pUrl.trim(),
				views48h: Number(p48) || 0,
				views7d: Number(p7) || 0
			});
			posts = [rec, ...posts];
			pBrand = '';
			pUrl = '';
			p48 = '';
			p7 = '';
			toast(rec.status === 'viral_ready' ? 'Viral threshold hit! Ready to pitch upsell.' : 'Post added to tracker', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			pBusy = false;
		}
	}

	async function copyUpsell(p: CreatorPost) {
		const views = Math.max(p.views_48h, p.views_7d, p.views_30d);
		const msg = `Hi ${p.brand_name} team! Our collab post just crossed ${compact(views)} views organically (${p.post_url}). Would you like to extend 90-day Meta paid-ad rights or lock a follow-up Reel while momentum is high?`;
		copyText(msg, 'Viral upsell pitch copied for WhatsApp');
		try {
			const u = await updateCreatorPostStatus(p.id, 'pitched');
			posts = posts.map((x) => (x.id === p.id ? u : x));
		} catch {
			// Optimistic copy still succeeded.
		}
	}

	function exportTaxPack() {
		const paid = studio.collabs.filter((c) => Number(c.fee) > 0);
		if (!paid.length) return toast('No paid collabs to export yet', 'alert');
		downloadCreatorTaxCsv(
			creatorName,
			paid.map((c) => ({
				brand: c.brand.name,
				code: c.code,
				stage: c.stage,
				gross: Number(c.fee),
				gstPct: gstReg ? 18 : 0,
				tdsPct
			}))
		);
		toast('Downloaded Form 26AS TDS & GST Pack CSV', 'download');
	}

	function exportProofPdf() {
		const ok = openCreatorProofPdf({
			creatorName,
			handle,
			followers: studio.settings?.followers || (studio.ig?.followers ? compact(studio.ig.followers) : '—'),
			engagement: studio.settings?.engagement || (studio.ig?.engagement_rate ? `${studio.ig.engagement_rate}%` : '—'),
			collabs: studio.collabs.map((c) => ({ brand: c.brand.name, fee: Number(c.fee || 0), stage: c.stage }))
		});
		if (!ok) toast('Allow pop-ups to print the Proof Report PDF', 'alert');
	}

	async function saveGate(e: SubmitEvent) {
		e.preventDefault();
		gateBusy = true;
		try {
			await saveBudgetGate({ min_reel_budget: Number(gateMin) || 0, accept_barter: gateBarter, auto_sort_low: gateAutoSort, note_for_brands: gateNote.trim() });
			toast('Bio Budget Gate saved', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			gateBusy = false;
		}
	}
</script>

<svelte:head><title>Creator OS · Miracle</title></svelte:head>

<div class="co-wrap">
	<header class="co-head">
		<span class="co-eb">Creator Growth OS · All-in-One Suite</span>
		<h1>Run your <em>creator</em> business.</h1>
		<p>Off-platform WhatsApp contracts &amp; approvals, fair rate &amp; take-home calculator, private brand CRM, viral upsells, Form 26AS tax pack, and budget gate.</p>
	</header>

	<nav class="co-pills" aria-label="Creator OS tools">
		<button type="button" class="co-pill" class:on={tab === 'links'} onclick={() => (tab = 'links')}>Contracts &amp; Links</button>
		<button type="button" class="co-pill" class:on={tab === 'calc'} onclick={() => (tab = 'calc')}>Rate &amp; Take-Home</button>
		<button type="button" class="co-pill" class:on={tab === 'crm'} onclick={() => (tab = 'crm')}>Brand CRM</button>
		<button type="button" class="co-pill" class:on={tab === 'viral'} onclick={() => (tab = 'viral')}>Viral &amp; Shorts</button>
		<button type="button" class="co-pill" class:on={tab === 'tax'} onclick={() => (tab = 'tax')}>Tax, Proof &amp; Gate</button>
	</nav>

	{#if tab === 'links'}
		<div class="co-grid">
			<section class="co-card">
				<span class="co-eb">For WhatsApp &amp; DM Brands · No Login</span>
				<h2>Send 1-tap approval or contract</h2>
				<form class="co-form" onsubmit={makeLink}>
					<div class="co-chips">
						<button type="button" class="co-chip" class:on={lKind === 'contract'} onclick={() => (lKind = 'contract')}>Smart Contract</button>
						<button type="button" class="co-chip" class:on={lKind === 'draft'} onclick={() => (lKind = 'draft')}>Draft Approval</button>
					</div>
					<div class="co-two">
						<input class="co-inp" placeholder="Brand name" bind:value={lBrand} required />
						<input class="co-inp" placeholder="Agreed fee (e.g. ₹18,000)" bind:value={lFee} />
					</div>
					<input class="co-inp" placeholder="Title (e.g. Winter Serum Reel Deal)" bind:value={lTitle} required />
					{#if lKind === 'draft'}
						<input class="co-inp" type="url" placeholder="Draft video / Google Drive link" bind:value={lUrl} />
					{/if}
					<textarea class="co-ta" rows="3" placeholder="Key terms & ASCI rules…" bind:value={lTerms}></textarea>
					<button type="submit" class="co-grad" disabled={lBusy}>{#if lBusy}<span class="spinner"></span>Creating…{:else}Create &amp; copy WhatsApp link{/if}</button>
				</form>
			</section>

			<section class="co-card">
				<span class="co-eb">Sent Links ({links.length})</span>
				<h2>Brand sign-off status</h2>
				{#each links as l (l.token)}
					<div class="co-row">
						<div>
							<b>{l.brand_name} · {l.title}</b>
							<small>{l.status === 'pending' ? 'Waiting for brand manager' : `${l.status} by ${l.signer_name}`}</small>
						</div>
						<button type="button" class="co-soft" onclick={() => copyText(`${location.origin}/c-approve/${l.token}`, 'Link copied')}>Copy</button>
					</div>
				{:else}
					<p class="co-note">No off-platform links yet. Send a 1-tap contract or draft link to any brand over WhatsApp without making them sign up.</p>
				{/each}
			</section>
		</div>
	{:else if tab === 'calc'}
		<div class="co-grid">
			<section class="co-card">
				<span class="co-eb">Pricing &amp; Usage Rights</span>
				<h2>Build your quote</h2>
				<div class="co-form">
					<label class="co-lbl"><span>Base 1 Reel Rate (₹)</span><input class="co-inp" type="number" min="1000" step="1000" bind:value={baseReel} /></label>
					<div class="co-three">
						<label class="co-lbl"><span>Reels</span><input class="co-inp" type="number" min="0" max="10" bind:value={reels} /></label>
						<label class="co-lbl"><span>Stories</span><input class="co-inp" type="number" min="0" max="10" bind:value={stories} /></label>
						<label class="co-lbl"><span>Shorts / UGC</span><input class="co-inp" type="number" min="0" max="10" bind:value={shortsOrUgc} /></label>
					</div>
					<span class="co-lbl"><span>Paid Ad Usage Rights</span></span>
					<div class="co-chips">
						{#each [0, 30, 90, 180] as d (d)}
							<button type="button" class="co-chip" class:on={usageDays === d} onclick={() => (usageDays = d as 0 | 30 | 90 | 180)}>{d === 0 ? 'Organic' : `${d}d Ads`}</button>
						{/each}
					</div>
					<span class="co-lbl"><span>Category Exclusivity</span></span>
					<div class="co-chips">
						{#each [0, 15, 30, 60] as d (d)}
							<button type="button" class="co-chip" class:on={exclDays === d} onclick={() => (exclDays = d as 0 | 15 | 30 | 60)}>{d === 0 ? 'None' : `${d}d`}</button>
						{/each}
					</div>
					<div class="co-chips">
						<button type="button" class="co-chip" class:on={gstReg} onclick={() => (gstReg = !gstReg)}>{gstReg ? 'GST 18% On' : 'No GST'}</button>
						<button type="button" class="co-chip" class:on={tdsPct === 10} onclick={() => (tdsPct = 10)}>10% TDS (194J)</button>
						<button type="button" class="co-chip" class:on={tdsPct === 2} onclick={() => (tdsPct = 2)}>2% TDS (194C)</button>
						<button type="button" class="co-chip" class:on={tdsPct === 0} onclick={() => (tdsPct = 0)}>0% TDS</button>
					</div>
				</div>
			</section>

			<section class="co-card">
				<span class="co-eb">Quote &amp; Net Take-Home</span>
				<h2>What you should charge</h2>
				<div class="co-kpis">
					<div><small>Content Base</small><b>{inr(pkg.contentBase)}</b></div>
					<div><small>Usage Rights</small><b>+{inr(pkg.usageFee)}</b></div>
					<div><small>Exclusivity</small><b>+{inr(pkg.exclFee)}</b></div>
					<div><small>Invoice Total</small><b>{inr(pkg.invoiceTotal)}</b></div>
					<div><small>TDS ({tdsPct}%)</small><b class="warn">−{inr(pkg.tds)}</b></div>
					<div><small>Net In Bank</small><b class="ok">{inr(pkg.netTakeHome)}</b></div>
				</div>
				<button type="button" class="co-grad" onclick={() => copyText(`Quote: ${inr(pkg.invoiceTotal)} (${reels} Reel, ${stories} Stories, ${usageDays ? `${usageDays}d paid ads` : 'organic'}, ${exclDays ? `${exclDays}d exclusivity` : 'no exclusivity'}).`, 'Quote summary copied')}>
					Copy Quote Summary
				</button>
			</section>
		</div>
	{:else if tab === 'crm'}
		<div class="co-grid">
			<section class="co-card">
				<span class="co-eb">Strictly Private · Only You See This</span>
				<h2>Log brand payment memory</h2>
				<form class="co-form" onsubmit={addMemory}>
					<input class="co-inp" placeholder="Brand name" bind:value={bmBrand} required />
					<div class="co-two">
						<input class="co-inp" type="number" min="0" placeholder="Last quoted (₹)" bind:value={bmQuoted} />
						<input class="co-inp" type="number" min="0" placeholder="Last settled (₹)" bind:value={bmSettled} />
					</div>
					<div class="co-two">
						<input class="co-inp" type="number" min="0" placeholder="Days taken to pay" bind:value={bmPayDays} />
						<input class="co-inp" type="number" min="0" placeholder="Revisions asked" bind:value={bmRev} />
					</div>
					<textarea class="co-ta" rows="2" placeholder="Private notes (e.g. Paid on time, super smooth team / Asked for 4 revisions)…" bind:value={bmNotes}></textarea>
					<button type="submit" class="co-grad" disabled={bmBusy}>{#if bmBusy}<span class="spinner"></span>Saving…{:else}Save brand memory{/if}</button>
				</form>
			</section>

			<section class="co-card">
				<span class="co-eb">Your Brand Ledger ({memories.length})</span>
				<h2>Past rates &amp; payout speed</h2>
				{#each memories as m (m.brand_name)}
					<div class="co-row">
						<div>
							<b>{m.brand_name}</b>
							<small>Settled {inr(m.last_settled)} (quoted {inr(m.last_quoted)}) · Paid in {m.avg_pay_days}d · {m.revision_count} rev</small>
							{#if m.private_notes}<small style="color:#cfc6d6">{m.private_notes}</small>{/if}
						</div>
					</div>
				{:else}
					<p class="co-note">No brands logged yet. Record what brands paid and how fast they cleared invoices so you never undersell on repeat deals.</p>
				{/each}
			</section>
		</div>
	{:else if tab === 'viral'}
		<div class="co-grid">
			<section class="co-card">
				<span class="co-eb">Reels · YouTube Shorts · Raw UGC</span>
				<h2>Track post &amp; viral upsells</h2>
				<form class="co-form" onsubmit={addPost}>
					<div class="co-chips">
						<button type="button" class="co-chip" class:on={pPlat === 'instagram'} onclick={() => (pPlat = 'instagram')}>Instagram</button>
						<button type="button" class="co-chip" class:on={pPlat === 'youtube_shorts'} onclick={() => (pPlat = 'youtube_shorts')}>YouTube Shorts</button>
						<button type="button" class="co-chip" class:on={pPlat === 'ugc_raw'} onclick={() => (pPlat = 'ugc_raw')}>Raw UGC</button>
					</div>
					<input class="co-inp" placeholder="Brand name" bind:value={pBrand} required />
					<input class="co-inp" type="url" placeholder="Post / YouTube Shorts / UGC link" bind:value={pUrl} required />
					<div class="co-two">
						<input class="co-inp" type="number" min="0" placeholder="48h views" bind:value={p48} />
						<input class="co-inp" type="number" min="0" placeholder="7d views" bind:value={p7} />
					</div>
					<button type="submit" class="co-grad" disabled={pBusy}>{#if pBusy}<span class="spinner"></span>Saving…{:else}Track post{/if}</button>
				</form>
			</section>

			<section class="co-card">
				<span class="co-eb">Viral Upsell Triggers ({posts.length})</span>
				<h2>Tracked posts</h2>
				{#each posts as p (p.id)}
					<div class="co-row">
						<div>
							<b>{p.brand_name} · {p.platform.replace('_', ' ')}</b>
							<small>48h: {compact(p.views_48h)} · 7d: {compact(p.views_7d)} · {p.status === 'viral_ready' ? 'Viral! Pitch ad rights' : p.status}</small>
						</div>
						<button type="button" class="co-soft" onclick={() => copyUpsell(p)}>Copy Upsell</button>
					</div>
				{:else}
					<p class="co-note">Add your live Reels, YouTube Shorts, or UGC links. When a post crosses 50K views, copy a 1-tap ad-rights upsell pitch for the brand.</p>
				{/each}
			</section>
		</div>
	{:else}
		<div class="co-grid">
			<section class="co-card">
				<span class="co-eb">CA-Ready Exports</span>
				<h2>Form 26AS TDS Pack &amp; Proof PDF</h2>
				<p class="co-note">Export every paid collab with TDS deducted for your CA, or generate a 1-click Proof Report PDF to attach to future pitches.</p>
				<div class="co-two">
					<button type="button" class="co-grad" onclick={exportTaxPack}><Icon name="download" />Form 26AS CSV</button>
					<button type="button" class="co-white" onclick={exportProofPdf}><Icon name="download" />Proof Report PDF</button>
				</div>
			</section>

			<section class="co-card">
				<span class="co-eb">Inbound Bio Link Filter</span>
				<h2>Work With Me Budget Gate</h2>
				<form class="co-form" onsubmit={saveGate}>
					<label class="co-lbl"><span>Minimum Paid Reel Budget (₹)</span><input class="co-inp" type="number" min="0" step="1000" bind:value={gateMin} /></label>
					<div class="co-chips">
						<button type="button" class="co-chip" class:on={gateBarter} onclick={() => (gateBarter = !gateBarter)}>{gateBarter ? 'Accepting Barter' : 'Paid Only (No Barter)'}</button>
						<button type="button" class="co-chip" class:on={gateAutoSort} onclick={() => (gateAutoSort = !gateAutoSort)}>{gateAutoSort ? 'Auto-sort Low Offers' : 'Show All Inquiries'}</button>
					</div>
					<input class="co-inp" placeholder="Short note shown to brands (e.g. Paid skincare & lifestyle only)" bind:value={gateNote} />
					<button type="submit" class="co-grad" disabled={gateBusy}>{#if gateBusy}<span class="spinner"></span>Saving…{:else}Save Budget Gate{/if}</button>
				</form>
			</section>
		</div>
	{/if}
</div>

<style>
	.co-wrap { display: grid; gap: 16px; color: #faf7fc; }
	.co-head h1 { margin: 4px 0 6px; font: 400 clamp(28px, 5vw, 38px)/1.06 var(--f-serif, Georgia, serif); }
	.co-head h1 em { font-style: italic; background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
	.co-head p { margin: 0; font-size: 13px; color: #8f8499; }
	.co-eb {
		display: inline-block; font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em; text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
	}
	.co-pills { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
	.co-pill {
		flex-shrink: 0; padding: 9px 14px; border-radius: 11px;
		background: #1a141d; border: 1px solid rgba(255, 255, 255, 0.1);
		color: #cfc6d6; font: 700 12px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.co-pill.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; box-shadow: 0 3px 0 0 #f25a90; }

	.co-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
	@media (min-width: 840px) { .co-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

	.co-card {
		padding: 18px; border-radius: 22px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.09);
		display: grid; gap: 12px; align-content: start;
	}
	.co-card h2 { margin: 2px 0 0; font: 400 24px/1.1 var(--f-serif, Georgia, serif); }
	.co-form { display: grid; gap: 10px; }
	.co-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.co-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.co-chips { display: flex; flex-wrap: wrap; gap: 7px; }
	.co-chip {
		padding: 7px 11px; border-radius: 9px; background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14); color: #cfc6d6; font: 600 12px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.co-chip.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; box-shadow: 0 2px 0 0 #f25a90; }
	.co-inp, .co-ta {
		width: 100%; padding: 11px 13px; box-sizing: border-box; border-radius: 12px;
		background: rgba(12, 9, 14, 0.9); border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc; font: 400 14px/1.35 var(--f-body, system-ui, sans-serif); outline: none;
	}
	.co-inp:focus, .co-ta:focus { border-color: #f25a90; }
	.co-lbl { display: grid; gap: 5px; font-size: 11.5px; color: #8f8499; font-weight: 600; }
	.co-grad {
		min-height: 44px; padding: 0 15px; border: 0; border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14; font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.08em; text-transform: uppercase;
		display: inline-flex; align-items: center; justify-content: center; gap: 7px;
		box-shadow: 3px 3px 0 0 #5b3b99; cursor: pointer;
	}
	.co-white {
		min-height: 44px; padding: 0 15px; border: 0; border-radius: 10px;
		background: #faf7fc; color: #140e16; font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		display: inline-flex; align-items: center; justify-content: center; gap: 7px;
		box-shadow: 0 3px 0 0 #f25a90; cursor: pointer;
	}
	.co-grad :global(.ic), .co-white :global(.ic) { width: 14px; height: 14px; }
	.co-soft {
		padding: 7px 11px; border-radius: 9px; background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14); color: #faf7fc; font: 700 11.5px/1 var(--f-body, system-ui, sans-serif); cursor: pointer; white-space: nowrap;
	}
	.co-row {
		display: flex; align-items: center; justify-content: space-between; gap: 10px;
		padding: 11px 12px; border-radius: 14px; background: rgba(13, 10, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.co-row b { display: block; font-size: 13.5px; }
	.co-row small { display: block; font-size: 11.5px; color: #8f8499; }
	.co-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
	@media (min-width: 540px) { .co-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.co-kpis > div { padding: 12px; border-radius: 14px; background: rgba(13, 10, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); }
	.co-kpis small { display: block; font-size: 10.5px; color: #8f8499; margin-bottom: 3px; }
	.co-kpis b { font: 700 17px/1.1 var(--f-mono, ui-monospace, monospace); }
	.co-kpis b.warn { color: #ffb85c; }
	.co-kpis b.ok { color: #3ce29b; }
	.co-note { margin: 0; font-size: 12.5px; color: #8f8499; line-height: 1.5; }
</style>
