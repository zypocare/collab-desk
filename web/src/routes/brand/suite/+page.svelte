<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import {
		createApprovalLink,
		downloadBulkNeftCsv,
		listApprovalLinks,
		listBrandApplications,
		listPostMonitors,
		openCampaignWrapUpPdf,
		savePostMonitor,
		simulateCampaignRoi,
		slugifyBrand,
		updateApplicationStatus,
		updatePostMonitorStatus,
		type ApprovalLink,
		type BrandApplication,
		type PostMonitor
	} from '#lib/brandOs.ts';
	import { loadReports, perView, reports } from '#lib/brandReports.svelte.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, inr } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const brandName = $derived(acct?.brand?.name || acct?.profile?.name || 'Your brand');
	const brandSlug = $derived(slugifyBrand(brandName));

	let tab = $state<'approvals' | 'apply' | 'roi' | 'watchdog' | 'finance'>('approvals');

	// 1. No-Login Approvals
	let approvals = $state<ApprovalLink[]>([]);
	let apKind = $state<'shortlist' | 'draft'>('shortlist');
	let apTitle = $state('');
	let apSummary = $state('');
	let apBusy = $state(false);

	// 2. Apply Funnel
	let apps = $state<BrandApplication[]>([]);
	let appFilter = $state<'all' | 'new' | 'shortlisted'>('all');

	// 3. ROI Simulator
	let simBudget = $state(150000);
	let simNano = $state(35);
	let simMicro = $state(45);
	let simMacro = $state(20);
	let simAov = $state(1499);
	let simConv = $state(2.8);
	const sim = $derived(simulateCampaignRoi({ budget: simBudget, nanoPct: simNano, microPct: simMicro, macroPct: simMacro, aov: simAov, convRatePct: simConv }));

	// 4. Watchdog + YouTube Shorts / Raw UGC
	let monitors = $state<PostMonitor[]>([]);
	let mCreator = $state('');
	let mPlatform = $state<'instagram' | 'youtube_shorts' | 'ugc_raw'>('youtube_shorts');
	let mUrl = $state('');
	let m48 = $state('');
	let m7 = $state('');
	let mBusy = $state(false);

	// 5. Bulk NEFT + TDS
	let tdsPct = $state<10 | 2>(10);

	onMount(async () => {
		if (!reports.data) loadReports('fy').catch(() => {});
		const [a, b, m] = await Promise.all([
			listApprovalLinks().catch(() => []),
			listBrandApplications(brandSlug).catch(() => []),
			listPostMonitors().catch(() => [])
		]);
		approvals = a;
		apps = b;
		monitors = m;
	});

	async function makeApproval(e: SubmitEvent) {
		e.preventDefault();
		if (!apTitle.trim()) return toast('Enter an approval title', 'alert');
		apBusy = true;
		try {
			const top = (reports.data?.by_creator ?? []).slice(0, 4).map((c) => ({
				label: c.name,
				meta: `${compact(c.views)} views · ${c.collabs} collab${c.collabs === 1 ? '' : 's'}`,
				value: inr(c.spent)
			}));
			const created = await createApprovalLink({
				kind: apKind,
				title: apTitle.trim(),
				summary: apSummary.trim() || `Review and approve for ${brandName}`,
				items: top,
				brandName
			});
			approvals = [created, ...approvals];
			apTitle = '';
			apSummary = '';
			const url = `${location.origin}/approve/${created.token}`;
			copyText(url, 'Approval link created & copied');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			apBusy = false;
		}
	}

	async function setAppStatus(id: string, status: 'new' | 'shortlisted' | 'archived') {
		try {
			const updated = await updateApplicationStatus(id, status);
			apps = apps.map((x) => (x.id === id ? updated : x));
			toast(status === 'shortlisted' ? 'Shortlisted creator' : 'Updated status', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		}
	}

	async function addMonitor(e: SubmitEvent) {
		e.preventDefault();
		if (!mCreator.trim() || !mUrl.trim()) return toast('Enter creator name and post/asset URL', 'alert');
		mBusy = true;
		try {
			const rec = await savePostMonitor({
				creator: mCreator.trim(),
				platform: mPlatform,
				url: mUrl.trim(),
				views48h: Number(m48) || 0,
				views7d: Number(m7) || 0
			});
			monitors = [rec, ...monitors];
			mCreator = '';
			mUrl = '';
			m48 = '';
			m7 = '';
			toast('Added to Watchdog monitor', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			mBusy = false;
		}
	}

	async function setMonitorState(id: string, status: 'live' | 'viral' | 'missing') {
		try {
			const u = await updatePostMonitorStatus(id, status);
			monitors = monitors.map((x) => (x.id === id ? u : x));
			toast(`Marked post ${status}`, 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		}
	}

	function exportNeft() {
		const creators = reports.data?.by_creator ?? [];
		if (!creators.length) return toast('No invoiced creators in this period yet', 'alert');
		downloadBulkNeftCsv(
			brandName,
			creators.map((c, i) => ({
				creator: c.name,
				gross: Math.round(c.spent),
				gst: Math.round(c.spent * 0.18),
				tdsPct,
				ref: `MRC-${String(i + 1).padStart(3, '0')}`
			}))
		);
		toast(`Downloaded Bulk NEFT CSV (${tdsPct}% TDS)`, 'download');
	}

	function exportWrapUp() {
		const r = reports.data;
		if (!r) return toast('Loading report numbers…', 'alert');
		const ok = openCampaignWrapUpPdf({
			brandName,
			period: 'FY 26–27',
			spent: r.kpi.spent,
			views: r.kpi.views,
			cpv: perView(r.kpi.post_fees, r.kpi.views),
			creators: r.kpi.creators,
			posts: r.kpi.posts,
			gst: r.tax.gst,
			tds: r.tax.tds,
			topCreators: r.by_creator.slice(0, 6).map((c) => ({ name: c.name, views: c.views, spent: c.spent }))
		});
		if (!ok) toast('Allow pop-ups to print the Wrap-Up PDF', 'alert');
	}

	const filteredApps = $derived(apps.filter((a) => (appFilter === 'all' ? a.status !== 'archived' : a.status === appFilter)));
	const applyUrl = $derived(typeof location !== 'undefined' ? `${location.origin}/apply/${brandSlug}` : `/apply/${brandSlug}`);
</script>

<svelte:head><title>Brand Growth OS · Miracle</title></svelte:head>

<div class="md-wrap">
	<header class="md-head">
		<h1>Brand Growth OS</h1>
		<p>Approvals, inbound creator funnel, ROI planner, YouTube Shorts watchdog, Bulk NEFT + TDS, and campaign wrap-ups.</p>
	</header>

	<nav class="md-tabs section-tabs" aria-label="Brand OS tools">
		<button type="button" class="md-tab" class:on={tab === 'approvals'} aria-pressed={tab === 'approvals'} onclick={() => (tab = 'approvals')}>Approve</button>
		<button type="button" class="md-tab" class:on={tab === 'apply'} aria-pressed={tab === 'apply'} onclick={() => (tab = 'apply')}>Apply</button>
		<button type="button" class="md-tab" class:on={tab === 'roi'} aria-pressed={tab === 'roi'} onclick={() => (tab = 'roi')}>ROI</button>
		<button type="button" class="md-tab" class:on={tab === 'watchdog'} aria-pressed={tab === 'watchdog'} onclick={() => (tab = 'watchdog')}>Watch</button>
		<button type="button" class="md-tab" class:on={tab === 'finance'} aria-pressed={tab === 'finance'} onclick={() => (tab = 'finance')}>NEFT</button>
	</nav>

	{#if tab === 'approvals'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Create approval link</h2>
					<p>Get 1-tap founder or client sign-off without requiring a login.</p>
				</div>
			</div>
			<form class="md-form" onsubmit={makeApproval}>
				<div class="md-f">
					<span class="md-lbl">Approval type</span>
					<div class="md-seg">
						<button type="button" class:on={apKind === 'shortlist'} onclick={() => (apKind = 'shortlist')}>Creator Shortlist</button>
						<button type="button" class:on={apKind === 'draft'} onclick={() => (apKind = 'draft')}>Reel Draft</button>
					</div>
				</div>
				<div class="md-fields">
					<div class="md-f span2">
						<label class="md-lbl" for="bo-title">Title</label>
						<input class="md-inp" id="bo-title" placeholder="Diwali Shortlist · 6 Creators" bind:value={apTitle} required />
					</div>
					<div class="md-f span2">
						<label class="md-lbl" for="bo-sum">Note for founder or client</label>
						<textarea class="md-ta" id="bo-sum" rows="2" placeholder="Optional context or deliverables summary…" bind:value={apSummary}></textarea>
					</div>
				</div>
				<div class="md-acts">
					<button type="submit" class="md-btn-grad" disabled={apBusy}>
						{#if apBusy}<span class="spinner"></span>Creating…{:else}<Icon name="check" />Create &amp; copy link{/if}
					</button>
				</div>
			</form>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Sign-off tracker ({approvals.length})</h2>
					<p>Recent approval links shared with founders or clients.</p>
				</div>
			</div>
			{#if approvals.length}
				<div class="md-list">
					{#each approvals as a (a.token)}
						<div class="md-row">
							<div>
								<b>{a.title}</b>
								<small>{a.status === 'pending' ? 'Waiting for sign-off' : `${a.status} by ${a.reviewer_name}`}</small>
							</div>
							<button type="button" class="md-btn-ghost" onclick={() => copyText(`${location.origin}/approve/${a.token}`, 'Link copied')}>Copy link</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="md-note">No approval links yet. Create one above to share over WhatsApp or Slack.</p>
			{/if}
		</section>

	{:else if tab === 'apply'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Apply to Collab page</h2>
					<p>Paste this link in your Instagram bio to capture creator applications without DMs.</p>
				</div>
				<button type="button" class="md-btn-grad" onclick={() => copyText(applyUrl, 'Apply link copied')}><Icon name="check" />Copy bio link</button>
			</div>
			<div class="md-linkline">{applyUrl}</div>
			<div class="md-seg">
				<button type="button" class:on={appFilter === 'all'} onclick={() => (appFilter = 'all')}>All ({apps.filter((x) => x.status !== 'archived').length})</button>
				<button type="button" class:on={appFilter === 'new'} onclick={() => (appFilter = 'new')}>New</button>
				<button type="button" class:on={appFilter === 'shortlisted'} onclick={() => (appFilter = 'shortlisted')}>Shortlisted</button>
			</div>
			{#if filteredApps.length}
				<div class="md-list">
					{#each filteredApps as a (a.id)}
						<div class="md-row">
							<div>
								<b>{a.creator_name} · @{a.handle}</b>
								<small>{compact(a.followers)} followers · {a.engagement}% eng · {a.reel_rate ? inr(a.reel_rate) : 'Rate on ask'} · {a.city || a.niche}</small>
							</div>
							<div class="md-row-acts">
								<button type="button" class="md-btn-ghost" onclick={() => setAppStatus(a.id, 'shortlisted')}>Shortlist</button>
								<button type="button" class="md-btn-ghost" onclick={() => setAppStatus(a.id, 'archived')}>Archive</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="md-note">No creator applications yet. Share your Apply link in your bio to receive inbound creators automatically.</p>
			{/if}
		</section>

	{:else if tab === 'roi'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Budget &amp; creator mix</h2>
					<p>Simulate creator count, views, CPV, and break-even orders before spending.</p>
				</div>
			</div>
			<div class="md-form">
				<div class="md-f">
					<label class="md-lbl" for="sim-budget">Campaign budget · <b>{inr(simBudget)}</b></label>
					<input class="md-range" id="sim-budget" type="range" min="25000" max="1000000" step="25000" bind:value={simBudget} />
				</div>
				<div class="md-f">
					<label class="md-lbl" for="sim-nano">Nano share (₹6k avg) · <b>{simNano}%</b></label>
					<input class="md-range" id="sim-nano" type="range" min="0" max="100" step="5" bind:value={simNano} />
				</div>
				<div class="md-f">
					<label class="md-lbl" for="sim-micro">Micro share (₹18k avg) · <b>{simMicro}%</b></label>
					<input class="md-range" id="sim-micro" type="range" min="0" max="100" step="5" bind:value={simMicro} />
				</div>
				<div class="md-f">
					<label class="md-lbl" for="sim-macro">Macro share (₹55k avg) · <b>{simMacro}%</b></label>
					<input class="md-range" id="sim-macro" type="range" min="0" max="100" step="5" bind:value={simMacro} />
				</div>
				<div class="md-fields">
					<div class="md-f">
						<label class="md-lbl" for="sim-aov">Average order value</label>
						<div class="md-pre"><span>₹</span><input class="md-inp num" id="sim-aov" type="number" min="100" bind:value={simAov} /></div>
					</div>
					<div class="md-f">
						<label class="md-lbl" for="sim-conv">Click-to-order %</label>
						<input class="md-inp num" id="sim-conv" type="number" step="0.2" min="0.2" bind:value={simConv} />
					</div>
				</div>
			</div>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Expected ROI</h2>
					<p>Break-even target: <b>{sim.breakEvenOrders} orders</b> at {inr(simAov)} AOV.</p>
				</div>
			</div>
			<div class="md-kpis">
				<div class="md-kpi"><small>Est. creators</small><b>{sim.creators}</b></div>
				<div class="md-kpi"><small>Est. views</small><b>{compact(sim.estViews)}</b></div>
				<div class="md-kpi"><small>Est. CPV</small><b>₹{sim.estCpv.toFixed(2)}</b></div>
				<div class="md-kpi"><small>Est. orders</small><b>{sim.estOrders}</b></div>
				<div class="md-kpi"><small>Est. revenue</small><b class="ok">{inr(sim.estRevenue)}</b></div>
				<div class="md-kpi"><small>Projected ROAS</small><b class="ok">{sim.roas.toFixed(1)}×</b></div>
			</div>
		</section>

	{:else if tab === 'watchdog'}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Track a live post or asset</h2>
					<p>Monitor Instagram Reels, YouTube Shorts, and raw UGC assets for viral spikes or missing posts.</p>
				</div>
			</div>
			<form class="md-form" onsubmit={addMonitor}>
				<div class="md-f">
					<span class="md-lbl">Platform</span>
					<div class="md-seg">
						<button type="button" class:on={mPlatform === 'instagram'} onclick={() => (mPlatform = 'instagram')}>Instagram</button>
						<button type="button" class:on={mPlatform === 'youtube_shorts'} onclick={() => (mPlatform = 'youtube_shorts')}>YT Shorts</button>
						<button type="button" class:on={mPlatform === 'ugc_raw'} onclick={() => (mPlatform = 'ugc_raw')}>Raw UGC</button>
					</div>
				</div>
				<div class="md-fields">
					<div class="md-f">
						<label class="md-lbl" for="wd-creator">Creator</label>
						<input class="md-inp" id="wd-creator" placeholder="Creator name" bind:value={mCreator} required />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="wd-url">Post or Drive link</label>
						<input class="md-inp" id="wd-url" type="url" placeholder="https://youtube.com/shorts/…" bind:value={mUrl} required />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="wd-48">48h views</label>
						<input class="md-inp num" id="wd-48" type="number" min="0" placeholder="0" bind:value={m48} />
					</div>
					<div class="md-f">
						<label class="md-lbl" for="wd-7">7d views</label>
						<input class="md-inp num" id="wd-7" type="number" min="0" placeholder="0" bind:value={m7} />
					</div>
				</div>
				<div class="md-acts">
					<button type="submit" class="md-btn-grad" disabled={mBusy}>
						{#if mBusy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />Add to watchdog{/if}
					</button>
				</div>
			</form>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Monitored posts ({monitors.length})</h2>
					<p>Flag deleted posts or spot viral performers early.</p>
				</div>
			</div>
			{#if monitors.length}
				<div class="md-list">
					{#each monitors as m (m.id)}
						<div class="md-row">
							<div>
								<b>{m.creator_name} · {m.platform.replace('_', ' ')}</b>
								<small>48h: {compact(m.views_48h)} · 7d: {compact(m.views_7d)} · Status: {m.status}</small>
							</div>
							<button type="button" class="md-btn-ghost" onclick={() => setMonitorState(m.id, m.status === 'missing' ? 'live' : 'missing')}>{m.status === 'missing' ? 'Mark live' : 'Flag missing'}</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="md-note">No monitored posts yet. Add YouTube Shorts, Reels, or raw UGC assets above.</p>
			{/if}
		</section>

	{:else}
		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>Bank-ready Bulk NEFT + TDS CSV</h2>
					<p>Exports gross fee, 18% GST, auto-calculated TDS deduction, and net payable amount with zero gateway fee.</p>
				</div>
			</div>
			<div class="md-f">
				<span class="md-lbl">TDS section</span>
				<div class="md-seg">
					<button type="button" class:on={tdsPct === 10} onclick={() => (tdsPct = 10)}>194J · 10% TDS</button>
					<button type="button" class:on={tdsPct === 2} onclick={() => (tdsPct = 2)}>194C · 2% TDS</button>
				</div>
			</div>
			<div class="md-acts">
				<button type="button" class="md-btn-grad" onclick={exportNeft}><Icon name="download" />Download Bulk NEFT CSV</button>
			</div>
		</section>

		<section class="md-sec">
			<div class="md-sec-h">
				<div>
					<h2>1-click Campaign Wrap-Up PDF</h2>
					<p>Generates an executive recap with total spend, views, CPV, top creators, and claimable GST/TDS.</p>
				</div>
			</div>
			<div class="md-acts">
				<button type="button" class="md-btn-grad" onclick={exportWrapUp}><Icon name="download" />Generate Wrap-Up PDF</button>
			</div>
		</section>
	{/if}
</div>

<style>
	.md-wrap {
		max-width: 780px;
		margin: 0 auto;
		padding: 6px 2px calc(150px + env(safe-area-inset-bottom, 0px));
		display: grid;
		gap: 18px;
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
	@media (max-width: 760px) {
		.md-head h1 {
			display: none;
		}
	}
	.md-head p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-3, #9b8fa8);
		max-width: 58ch;
	}

	@media (width > 760px) {
		.md-tabs {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			border: 1px solid rgba(255, 255, 255, 0.12);
			background: rgba(255, 255, 255, 0.02);
		}
		.md-tab {
			min-width: 0;
			padding: 12px 4px;
			border: 0;
			border-right: 1px solid rgba(255, 255, 255, 0.09);
			background: transparent;
			color: var(--ink-3, #9b8fa8);
			font: 700 10px/1.15 var(--f-mono, ui-monospace, monospace);
			letter-spacing: 0.08em;
			text-transform: uppercase;
			text-align: center;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
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
		scroll-margin-bottom: 140px;
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
