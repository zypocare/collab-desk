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

<div class="os-wrap">
	<header class="os-head">
		<span class="os-eb">Brand Growth OS · All-in-One Suite</span>
		<h1>Run your <em>entire</em> show here.</h1>
		<p>Approvals, inbound creator funnel, ROI planner, YouTube Shorts watchdog, Bulk NEFT + TDS, and executive wrap-ups.</p>
	</header>

	<nav class="os-pills" aria-label="Brand OS tools">
		<button type="button" class="os-pill" class:on={tab === 'approvals'} onclick={() => (tab = 'approvals')}>Approvals</button>
		<button type="button" class="os-pill" class:on={tab === 'apply'} onclick={() => (tab = 'apply')}>Apply Funnel</button>
		<button type="button" class="os-pill" class:on={tab === 'roi'} onclick={() => (tab = 'roi')}>ROI Planner</button>
		<button type="button" class="os-pill" class:on={tab === 'watchdog'} onclick={() => (tab = 'watchdog')}>Watchdog &amp; Shorts</button>
		<button type="button" class="os-pill" class:on={tab === 'finance'} onclick={() => (tab = 'finance')}>NEFT &amp; Wrap-Up</button>
	</nav>

	{#if tab === 'approvals'}
		<div class="os-grid">
			<section class="os-card">
				<span class="os-eb">No-Login Founder / Client Sign-Off</span>
				<h2>Create approval link</h2>
				<form class="os-form" onsubmit={makeApproval}>
					<div class="os-chips">
						<button type="button" class="os-chip" class:on={apKind === 'shortlist'} onclick={() => (apKind = 'shortlist')}>Creator Shortlist</button>
						<button type="button" class="os-chip" class:on={apKind === 'draft'} onclick={() => (apKind = 'draft')}>Reel Draft</button>
					</div>
					<input class="os-inp" placeholder="Title (e.g. Diwali Shortlist · 6 Creators)" bind:value={apTitle} required />
					<textarea class="os-ta" rows="2" placeholder="Optional note for founder or client…" bind:value={apSummary}></textarea>
					<button type="submit" class="os-grad" disabled={apBusy}>{#if apBusy}<span class="spinner"></span>Creating…{:else}Create &amp; copy link{/if}</button>
				</form>
			</section>

			<section class="os-card">
				<span class="os-eb">Recent Approval Links ({approvals.length})</span>
				<h2>Sign-off tracker</h2>
				{#each approvals as a (a.token)}
					<div class="os-row">
						<div>
							<b>{a.title}</b>
							<small>{a.status === 'pending' ? 'Waiting for sign-off' : `${a.status} by ${a.reviewer_name}`}</small>
						</div>
						<button type="button" class="os-soft" onclick={() => copyText(`${location.origin}/approve/${a.token}`, 'Link copied')}>Copy</button>
					</div>
				{:else}
					<p class="os-note">No approval links yet. Create one to get 1-tap founder sign-off without requiring a login.</p>
				{/each}
			</section>
		</div>
	{:else if tab === 'apply'}
		<div class="os-grid">
			<section class="os-card os-wide">
				<div class="os-row-h">
					<div>
						<span class="os-eb">Public Bio Link · Zero DMs</span>
						<h2>Your "Apply to Collab" page</h2>
					</div>
					<button type="button" class="os-grad" onclick={() => copyText(applyUrl, 'Apply link copied')}>Copy Bio Link</button>
				</div>
				<div class="os-linkbox">{applyUrl}</div>
				<div class="os-chips">
					<button type="button" class="os-chip" class:on={appFilter === 'all'} onclick={() => (appFilter = 'all')}>All ({apps.filter((x) => x.status !== 'archived').length})</button>
					<button type="button" class="os-chip" class:on={appFilter === 'new'} onclick={() => (appFilter = 'new')}>New</button>
					<button type="button" class="os-chip" class:on={appFilter === 'shortlisted'} onclick={() => (appFilter = 'shortlisted')}>Shortlisted</button>
				</div>
				{#each filteredApps as a (a.id)}
					<div class="os-row">
						<div>
							<b>{a.creator_name} · @{a.handle}</b>
							<small>{compact(a.followers)} followers · {a.engagement}% eng · {a.reel_rate ? inr(a.reel_rate) : 'Rate on ask'} · {a.city || a.niche}</small>
						</div>
						<div style="display:flex;gap:6px">
							<button type="button" class="os-soft" onclick={() => setAppStatus(a.id, 'shortlisted')}>Shortlist</button>
							<button type="button" class="os-soft" onclick={() => setAppStatus(a.id, 'archived')}>Archive</button>
						</div>
					</div>
				{:else}
					<p class="os-note">No creator applications yet. Paste your Apply link into your Instagram bio to capture inbound creators automatically.</p>
				{/each}
			</section>
		</div>
	{:else if tab === 'roi'}
		<div class="os-grid">
			<section class="os-card">
				<span class="os-eb">Pre-Campaign Simulator</span>
				<h2>Budget &amp; creator mix</h2>
				<div class="os-form">
					<label class="os-lbl"><span>Campaign Budget: <b>{inr(simBudget)}</b></span><input type="range" min="25000" max="1000000" step="25000" bind:value={simBudget} /></label>
					<label class="os-lbl"><span>Nano Share (₹6k avg): <b>{simNano}%</b></span><input type="range" min="0" max="100" step="5" bind:value={simNano} /></label>
					<label class="os-lbl"><span>Micro Share (₹18k avg): <b>{simMicro}%</b></span><input type="range" min="0" max="100" step="5" bind:value={simMicro} /></label>
					<label class="os-lbl"><span>Macro Share (₹55k avg): <b>{simMacro}%</b></span><input type="range" min="0" max="100" step="5" bind:value={simMacro} /></label>
					<div class="os-two">
						<label class="os-lbl"><span>Avg Order Value (₹)</span><input class="os-inp" type="number" min="100" bind:value={simAov} /></label>
						<label class="os-lbl"><span>Click→Order %</span><input class="os-inp" type="number" step="0.2" min="0.2" bind:value={simConv} /></label>
					</div>
				</div>
			</section>

			<section class="os-card">
				<span class="os-eb">Forecasted Outcome</span>
				<h2>Expected ROI</h2>
				<div class="os-kpis">
					<div><small>Est. Creators</small><b>{sim.creators}</b></div>
					<div><small>Est. Views</small><b>{compact(sim.estViews)}</b></div>
					<div><small>Est. CPV</small><b>₹{sim.estCpv.toFixed(2)}</b></div>
					<div><small>Est. Orders</small><b>{sim.estOrders}</b></div>
					<div><small>Est. Revenue</small><b class="ok">{inr(sim.estRevenue)}</b></div>
					<div><small>Projected ROAS</small><b class="ok">{sim.roas.toFixed(1)}×</b></div>
				</div>
				<p class="os-note">Break-even target: <b>{sim.breakEvenOrders} orders</b> at {inr(simAov)} AOV.</p>
			</section>
		</div>
	{:else if tab === 'watchdog'}
		<div class="os-grid">
			<section class="os-card">
				<span class="os-eb">Instagram · YouTube Shorts · Raw UGC</span>
				<h2>Track a live post or asset</h2>
				<form class="os-form" onsubmit={addMonitor}>
					<div class="os-chips">
						<button type="button" class="os-chip" class:on={mPlatform === 'instagram'} onclick={() => (mPlatform = 'instagram')}>Instagram</button>
						<button type="button" class="os-chip" class:on={mPlatform === 'youtube_shorts'} onclick={() => (mPlatform = 'youtube_shorts')}>YouTube Shorts</button>
						<button type="button" class="os-chip" class:on={mPlatform === 'ugc_raw'} onclick={() => (mPlatform = 'ugc_raw')}>Raw UGC</button>
					</div>
					<input class="os-inp" placeholder="Creator name" bind:value={mCreator} required />
					<input class="os-inp" type="url" placeholder="https://youtube.com/shorts/… or Reel / Drive URL" bind:value={mUrl} required />
					<div class="os-two">
						<input class="os-inp" type="number" min="0" placeholder="48h views" bind:value={m48} />
						<input class="os-inp" type="number" min="0" placeholder="7d views" bind:value={m7} />
					</div>
					<button type="submit" class="os-grad" disabled={mBusy}>{#if mBusy}<span class="spinner"></span>Saving…{:else}Add to Watchdog{/if}</button>
				</form>
			</section>

			<section class="os-card">
				<span class="os-eb">Watchdog &amp; Viral Alerts ({monitors.length})</span>
				<h2>Monitored posts</h2>
				{#each monitors as m (m.id)}
					<div class="os-row">
						<div>
							<b>{m.creator_name} · {m.platform.replace('_', ' ')}</b>
							<small>48h: {compact(m.views_48h)} · 7d: {compact(m.views_7d)} · Status: {m.status}</small>
						</div>
						<div style="display:flex;gap:6px">
							<button type="button" class="os-soft" onclick={() => setMonitorState(m.id, m.status === 'missing' ? 'live' : 'missing')}>{m.status === 'missing' ? 'Mark live' : 'Flag missing'}</button>
						</div>
					</div>
				{:else}
					<p class="os-note">No monitored posts yet. Add YouTube Shorts, Reels, or raw UGC assets to track 48h/7d spikes and flag deleted posts.</p>
				{/each}
			</section>
		</div>
	{:else}
		<div class="os-grid">
			<section class="os-card">
				<span class="os-eb">Finance Pack · Zero Gateway Fee</span>
				<h2>Bank-ready Bulk NEFT + TDS CSV</h2>
				<p class="os-note">Exports every creator's gross fee, 18% GST, auto-calculated TDS deduction, and net payable amount in a bank-ready CSV.</p>
				<div class="os-chips">
					<button type="button" class="os-chip" class:on={tdsPct === 10} onclick={() => (tdsPct = 10)}>194J · 10% TDS</button>
					<button type="button" class="os-chip" class:on={tdsPct === 2} onclick={() => (tdsPct = 2)}>194C · 2% TDS</button>
				</div>
				<button type="button" class="os-grad" onclick={exportNeft}><Icon name="download" />Download Bulk NEFT CSV</button>
			</section>

			<section class="os-card">
				<span class="os-eb">Board &amp; Client Deck</span>
				<h2>1-Click Campaign Wrap-Up PDF</h2>
				<p class="os-note">Generates an executive recap with Total Spend, Total Views, CPV, Top Performing Creators, and Claimable GST/TDS ready for printing or PDF export.</p>
				<button type="button" class="os-grad" onclick={exportWrapUp}><Icon name="download" />Generate Wrap-Up PDF</button>
			</section>
		</div>
	{/if}
</div>

<style>
	.os-wrap { display: grid; gap: 16px; color: #faf7fc; }
	.os-head h1 { margin: 4px 0 6px; font: 400 clamp(28px, 5vw, 38px)/1.06 var(--f-serif, Georgia, serif); }
	.os-head h1 em { font-style: italic; background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
	.os-head p { margin: 0; font-size: 13px; color: #8f8499; }
	.os-eb {
		display: inline-block; font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em; text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; -webkit-text-fill-color: transparent;
	}
	.os-pills { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
	.os-pill {
		flex-shrink: 0; padding: 9px 14px; border-radius: 11px;
		background: #1a141d; border: 1px solid rgba(255, 255, 255, 0.1);
		color: #cfc6d6; font: 700 12px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.os-pill.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; box-shadow: 0 3px 0 0 #f25a90; }

	.os-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
	@media (min-width: 840px) { .os-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .os-wide { grid-column: span 2; } }

	.os-card {
		padding: 18px; border-radius: 22px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.09);
		display: grid; gap: 12px; align-content: start;
	}
	.os-card h2 { margin: 2px 0 0; font: 400 24px/1.1 var(--f-serif, Georgia, serif); }
	.os-row-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.os-form { display: grid; gap: 10px; }
	.os-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.os-chips { display: flex; flex-wrap: wrap; gap: 7px; }
	.os-chip {
		padding: 7px 11px; border-radius: 9px; background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14); color: #cfc6d6; font: 600 12px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.os-chip.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; box-shadow: 0 2px 0 0 #f25a90; }
	.os-inp, .os-ta {
		width: 100%; padding: 11px 13px; box-sizing: border-box; border-radius: 12px;
		background: rgba(12, 9, 14, 0.9); border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc; font: 400 14px/1.35 var(--f-body, system-ui, sans-serif); outline: none;
	}
	.os-inp:focus, .os-ta:focus { border-color: #f25a90; }
	.os-lbl { display: grid; gap: 5px; font-size: 12.5px; color: #cfc6d6; }
	.os-grad {
		min-height: 44px; padding: 0 16px; border: 0; border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14; font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.08em; text-transform: uppercase;
		display: inline-flex; align-items: center; justify-content: center; gap: 7px;
		box-shadow: 3px 3px 0 0 #5b3b99; cursor: pointer;
	}
	.os-grad :global(.ic) { width: 14px; height: 14px; }
	.os-soft {
		padding: 7px 11px; border-radius: 9px; background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14); color: #faf7fc; font: 700 11.5px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.os-row {
		display: flex; align-items: center; justify-content: space-between; gap: 10px;
		padding: 11px 12px; border-radius: 14px; background: rgba(13, 10, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.os-row b { display: block; font-size: 13.5px; }
	.os-row small { display: block; font-size: 11.5px; color: #8f8499; }
	.os-linkbox {
		padding: 11px 13px; border-radius: 12px; background: rgba(12, 9, 14, 0.75);
		border: 1px dashed rgba(242, 90, 144, 0.45); font: 600 12.5px/1.3 var(--f-mono, ui-monospace, monospace);
		color: #ffae6b; word-break: break-all;
	}
	.os-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
	@media (min-width: 540px) { .os-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	.os-kpis > div { padding: 12px; border-radius: 14px; background: rgba(13, 10, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); }
	.os-kpis small { display: block; font-size: 10.5px; color: #8f8499; margin-bottom: 3px; }
	.os-kpis b { font: 700 18px/1.1 var(--f-mono, ui-monospace, monospace); }
	.os-kpis b.ok { color: #3ce29b; }
	.os-note { margin: 0; font-size: 12.5px; color: #8f8499; line-height: 1.5; }
</style>
