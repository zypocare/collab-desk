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

<div class="md-wrap">
	<header class="md-head">
		<h1>Creator OS</h1>
		<p>Off-platform WhatsApp contracts &amp; approvals, fair rate calculator, private brand CRM, viral upsells, Form 26AS tax pack, and budget gate.</p>
	</header>

	<nav class="md-tabs" aria-label="Creator OS tools">
		<button type="button" class="md-tab" class:on={tab === 'links'} onclick={() => (tab = 'links')}>Contracts &amp; Links</button>
		<button type="button" class="md-tab" class:on={tab === 'calc'} onclick={() => (tab = 'calc')}>Rate &amp; Take-Home</button>
		<button type="button" class="md-tab" class:on={tab === 'crm'} onclick={() => (tab = 'crm')}>Brand CRM</button>
		<button type="button" class="md-tab" class:on={tab === 'viral'} onclick={() => (tab = 'viral')}>Viral &amp; Shorts</button>
		<button type="button" class="md-tab" class:on={tab === 'tax'} onclick={() => (tab = 'tax')}>Tax, Proof &amp; Gate</button>
	</nav>

	{#if tab === 'links'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Send 1-tap approval or contract</h2>
					<p>For WhatsApp and DM brands—no sign-up needed on their side.</p>
				</div>
			</div>
			<form class="md-form" onsubmit={makeLink}>
				<div class="md-f">
					<span class="md-lbl">Link type</span>
					<div class="md-seg">
						<button type="button" class:on={lKind === 'contract'} onclick={() => (lKind = 'contract')}>Smart Contract</button>
						<button type="button" class:on={lKind === 'draft'} onclick={() => (lKind = 'draft')}>Draft Approval</button>
					</div>
				</div>
				<div class="md-fields">
					<div class="md-f">
						<label class="md-lbl" for="co-brand">Brand</label>
						<input class="md-inp" id="co-brand" placeholder="Brand name" bind:value={lBrand} required />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="co-fee">Agreed fee</label>
						<input class="md-inp" id="co-fee" placeholder="e.g. ₹18,000" bind:value={lFee} />
					</div>
					<div class="md-f span2">
						<label class="md-lbl" for="co-title">Name of the deal</label>
						<input class="md-inp" id="co-title" placeholder="Winter Serum Reel Deal" bind:value={lTitle} required />
					</div>
					{#if lKind === 'draft'}
						<div class="md-f span2">
							<label class="md-lbl" for="co-draft-url">Draft video or Drive link</label>
							<input class="md-inp" id="co-draft-url" type="url" placeholder="https://drive.google.com/…" bind:value={lUrl} />
						</div>
					{/if}
					<div class="md-f span2">
						<label class="md-lbl" for="co-terms">Key terms &amp; ASCI rules</label>
						<textarea class="md-ta" id="co-terms" rows="3" placeholder="1 Reel + 2 Stories · Organic usage only · Max 2 revisions · ASCI #ad included" bind:value={lTerms}></textarea>
					</div>
				</div>
				<div class="md-acts">
					<button type="submit" class="md-btn-grad" disabled={lBusy}>
						{#if lBusy}<span class="spinner"></span>Creating…{:else}<Icon name="check" />Create &amp; copy WhatsApp link{/if}
					</button>
				</div>
			</form>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Brand sign-off status ({links.length})</h2>
					<p>Track when a brand approves your draft or signs your contract.</p>
				</div>
			</div>
			{#if links.length}
				<div class="md-list">
					{#each links as l (l.token)}
						<div class="md-row">
							<div>
								<b>{l.brand_name} · {l.title}</b>
								<small>{l.status === 'pending' ? 'Waiting for brand manager' : `${l.status} by ${l.signer_name}`}</small>
							</div>
							<button type="button" class="md-btn-ghost" onclick={() => copyText(`${location.origin}/c-approve/${l.token}`, 'Link copied')}>Copy link</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="md-note">No off-platform links yet. Send a 1-tap contract or draft link to any brand over WhatsApp without making them sign up.</p>
			{/if}
		</section>

	{:else if tab === 'calc'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Build your quote</h2>
					<p>Calculate fair pricing with paid ad usage rights, category exclusivity, GST, and TDS.</p>
				</div>
			</div>
			<div class="md-form">
				<div class="md-f">
					<label class="md-lbl" for="co-base-reel">Base 1 Reel rate</label>
					<div class="md-pre"><span>₹</span><input class="md-inp num" id="co-base-reel" type="number" min="1000" step="1000" bind:value={baseReel} /></div>
				</div>

				<div class="md-f">
					<span class="md-lbl">Deliverables</span>
					<div class="md-kinds">
						<div class="md-kind" class:on={reels > 0}>
							<span>Reels</span>
							<div class="md-step">
								<button type="button" aria-label="Fewer Reels" onclick={() => (reels = Math.max(0, reels - 1))}>−</button>
								<b>{reels}</b>
								<button type="button" aria-label="More Reels" onclick={() => (reels = Math.min(10, reels + 1))}>+</button>
							</div>
						</div>
						<div class="md-kind" class:on={stories > 0}>
							<span>Stories</span>
							<div class="md-step">
								<button type="button" aria-label="Fewer Stories" onclick={() => (stories = Math.max(0, stories - 1))}>−</button>
								<b>{stories}</b>
								<button type="button" aria-label="More Stories" onclick={() => (stories = Math.min(10, stories + 1))}>+</button>
							</div>
						</div>
						<div class="md-kind" class:on={shortsOrUgc > 0}>
							<span>Shorts / UGC</span>
							<div class="md-step">
								<button type="button" aria-label="Fewer Shorts or UGC" onclick={() => (shortsOrUgc = Math.max(0, shortsOrUgc - 1))}>−</button>
								<b>{shortsOrUgc}</b>
								<button type="button" aria-label="More Shorts or UGC" onclick={() => (shortsOrUgc = Math.min(10, shortsOrUgc + 1))}>+</button>
							</div>
						</div>
					</div>
				</div>

				<div class="md-f">
					<span class="md-lbl">Paid ad usage rights</span>
					<div class="md-seg">
						{#each [0, 30, 90, 180] as d (d)}
							<button type="button" class:on={usageDays === d} onclick={() => (usageDays = d as 0 | 30 | 90 | 180)}>{d === 0 ? 'Organic' : `${d}d Ads`}</button>
						{/each}
					</div>
				</div>

				<div class="md-f">
					<span class="md-lbl">Category exclusivity</span>
					<div class="md-seg">
						{#each [0, 15, 30, 60] as d (d)}
							<button type="button" class:on={exclDays === d} onclick={() => (exclDays = d as 0 | 15 | 30 | 60)}>{d === 0 ? 'None' : `${d}d`}</button>
						{/each}
					</div>
				</div>

				<div class="md-f">
					<span class="md-lbl">Tax &amp; TDS</span>
					<div class="md-seg wrap">
						<button type="button" class:on={gstReg} onclick={() => (gstReg = !gstReg)}>{gstReg ? 'GST 18% On' : 'No GST'}</button>
						<button type="button" class:on={tdsPct === 10} onclick={() => (tdsPct = 10)}>10% TDS (194J)</button>
						<button type="button" class:on={tdsPct === 2} onclick={() => (tdsPct = 2)}>2% TDS (194C)</button>
						<button type="button" class:on={tdsPct === 0} onclick={() => (tdsPct = 0)}>0% TDS</button>
					</div>
				</div>
			</div>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>What you should charge</h2>
					<p>Breakdown of your invoice total and net payout in bank.</p>
				</div>
			</div>
			<div class="md-kpis">
				<div class="md-kpi"><small>Content base</small><b>{inr(pkg.contentBase)}</b></div>
				<div class="md-kpi"><small>Usage rights</small><b>+{inr(pkg.usageFee)}</b></div>
				<div class="md-kpi"><small>Exclusivity</small><b>+{inr(pkg.exclFee)}</b></div>
				<div class="md-kpi"><small>Invoice total</small><b>{inr(pkg.invoiceTotal)}</b></div>
				<div class="md-kpi"><small>TDS ({tdsPct}%)</small><b class="warn">−{inr(pkg.tds)}</b></div>
				<div class="md-kpi"><small>Net in bank</small><b class="ok">{inr(pkg.netTakeHome)}</b></div>
			</div>
			<div class="md-acts">
				<button type="button" class="md-btn-grad" onclick={() => copyText(`Quote: ${inr(pkg.invoiceTotal)} (${reels} Reel, ${stories} Stories, ${usageDays ? `${usageDays}d paid ads` : 'organic'}, ${exclDays ? `${exclDays}d exclusivity` : 'no exclusivity'}).`, 'Quote summary copied')}>
					<Icon name="check" />Copy quote summary
				</button>
			</div>
		</section>

	{:else if tab === 'crm'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Log brand payment memory</h2>
					<p>Strictly private—only you see past rates, payout speed, and revision notes.</p>
				</div>
			</div>
			<form class="md-form" onsubmit={addMemory}>
				<div class="md-fields">
					<div class="md-f span2">
						<label class="md-lbl" for="crm-brand">Brand</label>
						<input class="md-inp" id="crm-brand" placeholder="Brand name" bind:value={bmBrand} required />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="crm-quoted">Last quoted</label>
						<div class="md-pre"><span>₹</span><input class="md-inp num" id="crm-quoted" type="number" min="0" placeholder="0" bind:value={bmQuoted} /></div>
					</div>
					<div class="md-f">
						<label class="md-lbl" for="crm-settled">Last settled</label>
						<div class="md-pre"><span>₹</span><input class="md-inp num" id="crm-settled" type="number" min="0" placeholder="0" bind:value={bmSettled} /></div>
					</div>
					<div class="md-f">
						<label class="md-lbl" for="crm-days">Days taken to pay</label>
						<input class="md-inp num" id="crm-days" type="number" min="0" placeholder="e.g. 7" bind:value={bmPayDays} />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="crm-rev">Revisions asked</label>
						<input class="md-inp num" id="crm-rev" type="number" min="0" placeholder="e.g. 1" bind:value={bmRev} />
					</div>
					<div class="md-f span2">
						<label class="md-lbl" for="crm-notes">Private notes</label>
						<textarea class="md-ta" id="crm-notes" rows="2" placeholder="Paid on time, smooth team / Asked for 4 revisions…" bind:value={bmNotes}></textarea>
					</div>
				</div>
				<div class="md-acts">
					<button type="submit" class="md-btn-grad" disabled={bmBusy}>
						{#if bmBusy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />Save brand memory{/if}
					</button>
				</div>
			</form>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Your brand ledger ({memories.length})</h2>
					<p>Past settled rates and payout speed so you never undersell on repeat deals.</p>
				</div>
			</div>
			{#if memories.length}
				<div class="md-list">
					{#each memories as m (m.brand_name)}
						<div class="md-row">
							<div>
								<b>{m.brand_name}</b>
								<small>Settled {inr(m.last_settled)} (quoted {inr(m.last_quoted)}) · Paid in {m.avg_pay_days}d · {m.revision_count} rev</small>
								{#if m.private_notes}<small>{m.private_notes}</small>{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="md-note">No brands logged yet. Record what brands paid and how fast they cleared invoices.</p>
			{/if}
		</section>

	{:else if tab === 'viral'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Track post &amp; viral upsells</h2>
					<p>Log Reels, YouTube Shorts, or raw UGC links to pitch paid ad rights when views spike.</p>
				</div>
			</div>
			<form class="md-form" onsubmit={addPost}>
				<div class="md-f">
					<span class="md-lbl">Platform</span>
					<div class="md-seg">
						<button type="button" class:on={pPlat === 'instagram'} onclick={() => (pPlat = 'instagram')}>Instagram</button>
						<button type="button" class:on={pPlat === 'youtube_shorts'} onclick={() => (pPlat = 'youtube_shorts')}>YT Shorts</button>
						<button type="button" class:on={pPlat === 'ugc_raw'} onclick={() => (pPlat = 'ugc_raw')}>Raw UGC</button>
					</div>
				</div>
				<div class="md-fields">
					<div class="md-f">
						<label class="md-lbl" for="vp-brand">Brand</label>
						<input class="md-inp" id="vp-brand" placeholder="Brand name" bind:value={pBrand} required />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="vp-url">Post or UGC link</label>
						<input class="md-inp" id="vp-url" type="url" placeholder="https://…" bind:value={pUrl} required />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="vp-48">48h views</label>
						<input class="md-inp num" id="vp-48" type="number" min="0" placeholder="0" bind:value={p48} />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="vp-7">7d views</label>
						<input class="md-inp num" id="vp-7" type="number" min="0" placeholder="0" bind:value={p7} />
					</div>
				</div>
				<div class="md-acts">
					<button type="submit" class="md-btn-grad" disabled={pBusy}>
						{#if pBusy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />Track post{/if}
					</button>
				</div>
			</form>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Tracked posts ({posts.length})</h2>
					<p>When a post crosses 50K views, copy a 1-tap ad-rights upsell pitch.</p>
				</div>
			</div>
			{#if posts.length}
				<div class="md-list">
					{#each posts as p (p.id)}
						<div class="md-row">
							<div>
								<b>{p.brand_name} · {p.platform.replace('_', ' ')}</b>
								<small>48h: {compact(p.views_48h)} · 7d: {compact(p.views_7d)} · {p.status === 'viral_ready' ? 'Viral! Pitch ad rights' : p.status}</small>
							</div>
							<button type="button" class="md-btn-ghost" onclick={() => copyUpsell(p)}>Copy upsell</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="md-note">No tracked posts yet. Add your live Reels, YouTube Shorts, or UGC links above.</p>
			{/if}
		</section>

	{:else}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Form 26AS TDS pack &amp; Proof PDF</h2>
					<p>Export every paid collab with TDS deducted for your CA, or print a Proof Report PDF for pitches.</p>
				</div>
			</div>
			<div class="md-acts">
				<button type="button" class="md-btn-grad" onclick={exportTaxPack}><Icon name="download" />Form 26AS CSV</button>
				<button type="button" class="md-btn-ghost tall" onclick={exportProofPdf}><Icon name="download" />Proof Report PDF</button>
			</div>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Work With Me budget gate</h2>
					<p>Filter inbound bio inquiries before they reach your inbox.</p>
				</div>
			</div>
			<form class="md-form" onsubmit={saveGate}>
				<div class="md-fields">
					<div class="md-f span2">
						<label class="md-lbl" for="bg-min">Minimum paid Reel budget</label>
						<div class="md-pre"><span>₹</span><input class="md-inp num" id="bg-min" type="number" min="0" step="1000" bind:value={gateMin} /></div>
					</div>
					<div class="md-f span2">
						<span class="md-lbl">Inquiry rules</span>
						<div class="md-seg">
							<button type="button" class:on={gateBarter} onclick={() => (gateBarter = !gateBarter)}>{gateBarter ? 'Accepting Barter' : 'Paid Only'}</button>
							<button type="button" class:on={gateAutoSort} onclick={() => (gateAutoSort = !gateAutoSort)}>{gateAutoSort ? 'Auto-sort Low Offers' : 'Show All Inquiries'}</button>
						</div>
					</div>
					<div class="md-f span2">
						<label class="md-lbl" for="bg-note">Short note shown to brands</label>
						<input class="md-inp" id="bg-note" placeholder="Paid skincare & lifestyle collabs only" bind:value={gateNote} />
					</div>
				</div>
				<div class="md-acts">
					<button type="submit" class="md-btn-grad" disabled={gateBusy}>
						{#if gateBusy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />Save budget gate{/if}
					</button>
				</div>
			</form>
		</section>
	{/if}
</div>

<style>
	.md-wrap {
		max-width: 780px;
		margin: 0 auto;
		padding: 6px 2px 84px;
		display: grid;
		gap: 20px;
	}

	.md-head {
		display: grid;
		gap: 6px;
	}
	.md-head h1 {
		margin: 0;
		font: 400 clamp(28px, 6vw, 36px)/1.08 var(--f-serif, Georgia, serif);
		letter-spacing: -0.01em;
		color: var(--ink, #faf7fc);
	}
	.md-head p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-3, #9b8fa8);
		max-width: 58ch;
	}

	/* Sharp NeoPOP sub-navigation strip matching Miracle top tabs */
	.md-tabs {
		display: flex;
		overflow-x: auto;
		scrollbar-width: none;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.02);
	}
	.md-tabs::-webkit-scrollbar {
		display: none;
	}
	.md-tab {
		flex: 1 0 auto;
		padding: 12px 14px;
		border: 0;
		border-right: 1px solid rgba(255, 255, 255, 0.09);
		background: transparent;
		color: var(--ink-3, #9b8fa8);
		font: 700 10.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.md-tab:last-child {
		border-right: 0;
	}
	.md-tab.on {
		background: #ffffff;
		color: #120b14;
		box-shadow: inset 0 -3px 0 0 #f25a90;
	}

	/* Open canvas sections separated by clean hairlines (no heavy boxed cards) */
	.md-sec {
		display: grid;
		gap: 18px;
		padding-top: 2px;
	}
	.md-sec + .md-sec {
		padding-top: 24px;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
	}
	.md-sec-h {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.md-sec-h h2 {
		margin: 0;
		font: 400 24px/1.12 var(--f-serif, Georgia, serif);
		color: var(--ink, #faf7fc);
	}
	.md-sec-h p {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--ink-3, #9b8fa8);
		line-height: 1.45;
	}

	/* Native Miracle bottom-hairline form fields (matching Set up a monthly deal) */
	.md-form {
		display: grid;
		gap: 18px;
	}
	.md-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px 20px;
	}
	@media (max-width: 600px) {
		.md-fields {
			grid-template-columns: 1fr;
			gap: 16px;
		}
	}
	.md-f {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.md-f.span2 {
		grid-column: 1 / -1;
	}
	.md-lbl {
		display: block;
		font: 700 10.5px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3, #9b8fa8);
	}
	.md-lbl b {
		color: var(--ink, #faf7fc);
		font-weight: 700;
	}
	.md-inp,
	.md-ta {
		width: 100%;
		box-sizing: border-box;
		border: 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 0;
		background: transparent;
		color: var(--ink, #faf7fc);
		font: 400 16px/1.4 var(--f-body, system-ui, sans-serif);
		padding: 9px 0 10px;
		outline: none;
		transition: border-color 0.15s;
	}
	.md-inp::placeholder,
	.md-ta::placeholder {
		color: rgba(207, 198, 214, 0.42);
	}
	.md-inp:focus,
	.md-ta:focus {
		border-bottom-color: #f25a90;
	}
	.md-ta {
		resize: vertical;
		min-height: 68px;
		font-size: 14.5px;
		line-height: 1.5;
	}
	.md-pre {
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.14);
		transition: border-color 0.15s;
	}
	.md-pre:focus-within {
		border-bottom-color: #f25a90;
	}
	.md-pre span {
		color: var(--ink-3, #9b8fa8);
		font-size: 15px;
	}
	.md-pre .md-inp {
		border-bottom: 0;
		padding-left: 0;
	}

	/* Range slider matching dark accent */
	.md-range {
		width: 100%;
		accent-color: #f25a90;
		margin: 4px 0 0;
		cursor: pointer;
	}

	/* Sharp segmented selector matching Invoice each month in monthly deal */
	.md-seg {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.02);
	}
	.md-seg.wrap {
		display: flex;
		flex-wrap: wrap;
	}
	.md-seg.wrap button {
		flex: 1 1 auto;
	}
	.md-seg button {
		padding: 11px 10px;
		border: 0;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		background: transparent;
		color: var(--ink-3, #9b8fa8);
		font: 700 11px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.md-seg button:last-child {
		border-right: 0;
	}
	.md-seg button.on {
		background: rgba(242, 90, 144, 0.14);
		color: var(--ink, #faf7fc);
		box-shadow: inset 0 -2px 0 0 #f25a90;
	}

	/* Counter tiles matching Reels - 2 + / Stories - 3 + in Set up a monthly deal */
	.md-kinds {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	@media (max-width: 420px) {
		.md-kinds {
			grid-template-columns: 1fr;
		}
	}
	.md-kind {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 11px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.02);
		color: var(--ink-3, #9b8fa8);
		font-size: 13.5px;
		font-weight: 500;
	}
	.md-kind.on {
		border-color: rgba(242, 90, 144, 0.45);
		background: rgba(242, 90, 144, 0.07);
		color: var(--ink, #faf7fc);
	}
	.md-step {
		display: inline-flex;
		align-items: center;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(0, 0, 0, 0.25);
	}
	.md-step button {
		width: 28px;
		height: 28px;
		border: 0;
		background: transparent;
		color: var(--ink, #faf7fc);
		font-size: 15px;
		cursor: pointer;
	}
	.md-step b {
		min-width: 24px;
		text-align: center;
		font: 700 13px/1 var(--f-mono, ui-monospace, monospace);
		color: var(--ink, #faf7fc);
	}

	/* Summary & KPI band matching q-total in Set up a monthly deal */
	.md-kpis {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		border-bottom: 1px solid rgba(255, 255, 255, 0.12);
	}
	@media (max-width: 520px) {
		.md-kpis {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.md-kpi {
		padding: 13px 10px 13px 0;
		display: grid;
		gap: 4px;
	}
	.md-kpi small {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: var(--ink-3, #9b8fa8);
	}
	.md-kpi b {
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink, #faf7fc);
	}
	.md-kpi b.ok {
		color: #4ade80;
	}
	.md-kpi b.warn {
		color: #ffae6b;
	}

	/* NeoPOP sharp action buttons matching Cancel | Start the deal */
	.md-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.md-btn-grad {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 46px;
		padding: 0 20px;
		border: 0;
		border-radius: 0;
		background: linear-gradient(95deg, #9c7bff 0%, #f25a90 55%, #ffae6b 100%);
		color: #ffffff;
		font: 700 14px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		box-shadow: 3px 3px 0 0 rgba(156, 123, 255, 0.45);
		transition: transform 0.12s;
	}
	.md-btn-grad:active {
		transform: translate(1px, 1px);
	}
	.md-btn-grad:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.md-btn-grad :global(.ic),
	.md-btn-ghost :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.md-btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 38px;
		padding: 0 14px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0;
		background: rgba(255, 255, 255, 0.02);
		color: var(--ink, #faf7fc);
		font: 600 13px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.md-btn-ghost.tall {
		min-height: 46px;
		padding: 0 18px;
		font-size: 14px;
	}

	/* Clean hairline list rows */
	.md-list {
		display: grid;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
	}
	.md-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 13px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.09);
	}
	.md-row > div {
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.md-row b {
		font-size: 14.5px;
		font-weight: 600;
		color: var(--ink, #faf7fc);
	}
	.md-row small {
		font-size: 12.5px;
		color: var(--ink-3, #9b8fa8);
		line-height: 1.4;
	}
	.md-row-acts {
		display: inline-flex;
		gap: 8px;
		flex-shrink: 0;
	}
	.md-note {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-3, #9b8fa8);
	}
	.md-linkline {
		padding: 10px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.14);
		font: 500 13px/1.4 var(--f-mono, ui-monospace, monospace);
		color: #cfc6d6;
		word-break: break-all;
	}
</style>
