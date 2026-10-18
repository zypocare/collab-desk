<script lang="ts">
	import LanguagePicker from '#lib/components/LanguagePicker.svelte';
	import { langText } from '#lib/languages.ts';
	import { page } from '$app/state';
	import { useQr, useReferral } from '#lib/referral.ts';
	import { untrack } from 'svelte';
	import { auth, refreshAccount } from '#lib/auth.svelte.ts';
	import { CATS, phoneOk } from '#lib/util.ts';
	import { brandData, loadRequests } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import type { BriefDetails, CollabType } from '#lib/types.ts';
	import { confetti, copyText, toast, ui } from '#lib/ui.svelte.ts';
	import { KINDS, USAGE, TYPE_LABEL, delivText, fmtLong, usageLabel, usageOption, errMessage, firstName, inr, offeredKinds, packageOffered, rel } from '#lib/util.ts';
	import { budgetCombos, type Combo } from '#lib/suggest.ts';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ExpectedResults from '#lib/components/ExpectedResults.svelte';
	import BriefEditor from '#lib/components/BriefEditor.svelte';
	import Select from '#lib/components/Select.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import { brandAdvice, type Advice } from '#lib/priority.ts';
	import { tick } from 'svelte';

	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	// Not signed in: they fill everything in first and confirm their email with a code when sending.
	const guest = $derived(!auth.session);
	let g = $state({ brand: '', name: '', email: '', phone: '', instagram: '', category: 'Beauty' });
	let gErr = $state('');
	let codeStep = $state(false);
	let code = $state('');
	let codeBusy = $state(false);
	let codeErr = $state('');
	let resendIn = $state(0);

	// Keep a guest's half-filled form on this device, in case they leave and come back.
	const DRAFT = 'collab-request-draft';
	$effect(() => {
		if (!guest) return;
		try {
			const d = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
			if (d && !page.url.searchParams.get('package')) untrack(() => {
				Object.assign(g, d.g ?? {});
				// The request itself too (not when the link already picks something: a package, an item, "again").
				const f = d.form;
				if (f && !page.url.searchParams.get('item') && !page.url.searchParams.get('again')) {
					type = f.type ?? type;
					qty = { ...qty, ...(f.qty ?? {}) };
					fee = f.fee ?? '';
					product = f.product ?? '';
					productValue = f.productValue ?? '';
					barterKind = f.barterKind ?? 'product';
					preferred = f.preferred ?? '';
					usage = f.usage ?? usage;
					brief = f.brief ?? '';
					langs = Array.isArray(f.langs) ? f.langs : [];
				}
			});
		} catch {
			/* storage blocked */
		}
	});
	$effect(() => {
		if (!guest) return;
		const snapshot = JSON.stringify({ g, form: { type, qty, fee, product, productValue, barterKind, preferred, usage, brief, langs } });
		try {
			localStorage.setItem(DRAFT, snapshot);
		} catch {
			/* storage blocked */
		}
	});

	function validGuest() {
		gErr = '';
		if (!g.brand.trim()) gErr = 'Add your brand name.';
		else if (!g.name.trim()) gErr = 'Add your name so we know who to reply to.';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim())) gErr = 'Add a valid work email, like name@brand.com.';
		else if (!phoneOk(g.phone)) gErr = 'That phone number doesn’t look right. Use digits, like +91 98450 00000, or leave it empty.';
		if (gErr) document.getElementById('g-sec')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		return !gErr;
	}

	async function sendCode() {
		codeErr = '';
		const { error: err } = await supabase.auth.signInWithOtp({ email: g.email.trim().toLowerCase(), options: { shouldCreateUser: true } });
		if (err) {
			codeErr = err.status === 429 ? 'Too many codes asked for. Please wait a minute and try again.' : errMessage(err);
			return false;
		}
		resendIn = 45;
		const t = setInterval(() => (--resendIn <= 0 ? clearInterval(t) : null), 1000);
		return true;
	}

	async function verifyAndSend() {
		const token = code.replace(/\D/g, '');
		if (token.length !== 6) return (codeErr = 'Enter the 6-digit code from the email.');
		codeBusy = true;
		codeErr = '';
		ui.holdRedirect = true;
		const { error: err } = await supabase.auth.verifyOtp({ email: g.email.trim().toLowerCase(), token, type: 'email' });
		if (err) {
			codeBusy = false;
			ui.holdRedirect = false;
			return (codeErr = 'That code is wrong or has expired. Check the latest email or send a new code.');
		}
		const account = await refreshAccount();
		if (account?.role === 'creator') {
			// Not a brand: sign that out again here (the form stays as it was) and say why.
			await supabase.auth.signOut({ scope: 'local' });
			auth.session = null;
			auth.account = null;
			ui.holdRedirect = false;
			codeBusy = false;
			codeStep = false;
			return (gErr = "This is the creator's email. Use your brand's work email to send a request.");
		}
		ui.holdRedirect = false;
		// This email already belongs to a company: the request goes there; say so.
		if (account?.role === 'brand' && account.brand && account.brand.name.trim().toLowerCase() !== g.brand.trim().toLowerCase())
			toast(`This email is already set up for ${account.brand.name}, so the request is sent as ${account.brand.name}.`, 'info');
		if (account?.role === 'brand' && !account.brand) {
			const { error: rErr } = await supabase.rpc('register_brand', {
				p_name: g.brand, p_instagram: g.instagram, p_website: '', p_category: g.category, p_full_name: g.name, p_phone: g.phone
			});
			if (rErr) {
				codeBusy = false;
				return (codeErr = errMessage(rErr));
			}
			await refreshAccount();
		}
		try {
			localStorage.removeItem(DRAFT);
		} catch {
			/* storage blocked */
		}
		codeBusy = false;
		codeStep = false;
		await sendRequest();
	}
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
	const rates = $derived(pub.data?.rates ?? null);

	let type = $state<CollabType>('paid');
	let qty = $state<Record<string, number>>(Object.fromEntries(KINDS.map((k) => [k, 0])));
	let fee = $state('');
	let product = $state('');
	let productValue = $state('');
	// Barter can be a product they send, or an experience (a stay, a meal at their place, an event).
	let barterKind = $state<'product' | 'experience'>('product');
	const exp = $derived(barterKind === 'experience');
	let preferred = $state('');
	// The language(s) for the content (several = mixed); none = no preference.
	let langs = $state<string[]>([]);
	const myLangs = $derived(pub.data?.content_languages ?? []);
	let booked = $state('');
	let usage = $state('Organic only');
	let brief = $state('');
	let briefDetails = $state<BriefDetails>({});
	let busy = $state(false);
	let error = $state('');
	let errDel = $state('');
	let errProduct = $state('');
	let sent = $state<string | null>(null);
	let sentReply = $state<string | null>(null);

	// Booking one of her packages (/brand/new?package=ID): fill the form from it.
	let packageId = $state('');
	const pkg = $derived(pub.data?.packages?.find((k) => k.id === packageId) ?? null);
	// Instant booking: one of her packages, confirmed at once for an open week.
	const instant = $derived(!!pkg && !!pub.data?.instant_booking);
	$effect(() => {
		const id = page.url.searchParams.get('package');
		const k = id ? pub.data?.packages?.find((x) => x.id === id) : null;
		if (!k) return;
		untrack(() => {
			packageId = k.id;
			type = 'paid';
			qty = Object.fromEntries(KINDS.map((kind) => [kind, k.items.find((i) => i.kind === kind)?.qty ?? 0]));
			fee = String(k.price);
		});
	});
	// One item from the brand page (/brand/new?item=Reel): start with just that.
	$effect(() => {
		const item = page.url.searchParams.get('item');
		if (!item || !KINDS.includes(item) || page.url.searchParams.get('package')) return;
		untrack(() => {
			qty = Object.fromEntries(KINDS.map((kind) => [kind, kind === item ? 1 : 0]));
		});
	});
	// Their usual type and usage, unless a package or "book again" says otherwise.
	$effect(() => {
		const last = brandData.requests[0];
		if (!last || page.url.searchParams.get('package') || page.url.searchParams.get('again')) return;
		untrack(() => {
			if (last.type !== 'barter' || pub.data?.barter?.mode !== 'closed') type = last.type;
			usage = last.usage || usage;
		});
	});

	// Booking again (/brand/new?again=CODE): start from that collab.
	let againCode = $state('');
	// Returning brand: the offer from the "Book again" email (shown here, applied to the quote).
	let loyalty = $state<{ pct: number; until: string } | null>(null);
	$effect(() => {
		const code = page.url.searchParams.get('again');
		if (!code || !acc) return;
		supabase.rpc('rebook_offer', { p_code: code }).then(({ data }) => (loyalty = (data as typeof loyalty) ?? null));
	});
	$effect(() => {
		const code = page.url.searchParams.get('again');
		const r = code ? brandData.requests.find((x) => x.code.toUpperCase() === code.toUpperCase()) : null;
		if (!r) return;
		untrack(() => {
			againCode = r.code;
			type = r.type;
			qty = Object.fromEntries(KINDS.map((kind) => [kind, r.deliverables.find((d) => d.kind === kind)?.qty ?? 0]));
			fee = r.type === 'barter' || !r.fee ? '' : String(r.fee);
			product = r.product;
			productValue = r.product_value ? String(r.product_value) : '';
			usage = r.usage;
			brief = r.brief;
		});
	});

	// Changing what's included means it's a custom request, not the package.
	$effect(() => {
		if (!pkg) return;
		const same = KINDS.every((kind) => (qty[kind] ?? 0) === (pkg.items.find((i) => i.kind === kind)?.qty ?? 0)) && type !== 'barter';
		if (!same) untrack(() => (packageId = ''));
	});
	let bumped = $state<string | null>(null);
	let panel = $state<HTMLElement>();

	const barter = $derived(pub.data?.barter ?? null);
	const types = $derived<{ v: CollabType; t: string; d: string; i: string; tag: string; off?: boolean }[]>([
		{ v: 'paid', t: 'Paid', d: 'A fee for content', i: 'rupee', tag: 'Reviewed first' },
		{ v: 'hybrid', t: 'Paid + product', d: 'A fee plus your product', i: 'layers', tag: 'Reviewed first' },
		{ v: 'barter', t: 'Barter', d: 'A product or an experience for content', i: 'gift', tag: barter?.mode === 'closed' ? 'Paused' : 'Reviewed after paid', off: barter?.mode === 'closed' }
	]);

	// Live guidance from the creator's priority rules (same engine the studio uses).
	const shown = $derived(offeredKinds(pub.data?.offered));
	const lines = $derived(shown.filter((k) => qty[k] > 0).map((k) => ({ kind: k, qty: qty[k] })));
	const advice = $derived<Advice | null>(
		pkg
			? { tone: 'good', title: 'Booking a package', lines: [`This is one of ${creator}'s own packages at the listed price, so it goes to the top of the list.`] }
			: pub.data
				? brandAdvice({ type, fee: Number(fee) || 0, productValue: Number(productValue) || 0, lines, exp }, pub.data, creator)
				: null
	);
	// Weeks she is full or away can't be picked as the go-live date.
	const weekOf = (isoDate: string) => {
		const d = new Date(isoDate + 'T00:00:00');
		d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const unavailable = (isoDate: string) => {
		const w = (pub.data?.availability ?? pub.data?.weeks)?.find((x) => x.start === weekOf(isoDate));
		return w?.status === 'full' || w?.status === 'away';
	};
	const busyWeek = $derived((pub.data?.availability ?? pub.data?.weeks)?.some((w) => w.status === 'full' || w.status === 'away') ? `Greyed-out dates are weeks ${creator || 'the creator'} is fully booked or away.` : '');
	// What their budget gets (her public rates and packages).
	const combos = $derived(type !== 'barter' && Number(fee) >= 500 && pub.data ? budgetCombos(Number(fee), pub.data.rates, shown, (pub.data.packages ?? []).filter((x) => packageOffered(x.items, pub.data?.offered))) : []);
	const comboOn = (cb: Combo) => KINDS.every((k) => (qty[k] ?? 0) === (cb.items.find((i) => i.kind === k)?.qty ?? 0));
	function useCombo(cb: Combo) {
		qty = Object.fromEntries(KINDS.map((k) => [k, cb.items.find((i) => i.kind === k)?.qty ?? 0]));
		if (cb.packageId) {
			packageId = cb.packageId;
			fee = String(cb.total);
		}
		document.querySelector('.dpick')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
	// Running total at her public rates (nothing shown if she keeps rates private).
	const estimate = $derived(rates ? lines.reduce((a, l) => a + (Number(rates[l.kind]) || 0) * l.qty, 0) : 0);
		const replyIn = $derived(type === 'barter' ? (barter?.reply_time ?? pub.data?.reply_time) : pub.data?.reply_time);

	// Progress bar: each step is ticked once it has what it needs; tap to jump to it.
	const steps = $derived(
		[
			...(guest ? [{ id: 'rq-about', label: 'About you', done: !!(g.brand.trim() && g.name.trim() && /.+@.+\..+/.test(g.email)) }] : []),
			{ id: 'rq-type', label: 'Type', done: !!type },
			{ id: 'rq-content', label: 'Content', done: lines.length > 0 },
			{ id: 'rq-budget', label: 'Budget & timing', done: (type === 'paid' || !!product.trim()) && (!!pkg || type === 'barter' || Number(fee) > 0 || !!preferred) },
			{ id: 'rq-brief', label: 'Brief', done: !!(briefDetails.message || brief.trim()) }
		]
	);
	const doneCount = $derived(steps.filter((x) => x.done).length);

	async function takeSuggestion() {
		const sg = advice?.suggest;
		if (!sg) return;
		type = sg.type;
		if (sg.fee) fee = String(sg.fee);
		await tick();
		const el = document.getElementById('b-budget') as HTMLInputElement | null;
		el?.focus();
		if (!sg.fee) el?.select();
	}

	function step(k: string, d: number) {
		const before = qty[k];
		qty[k] = Math.max(0, Math.min(9, qty[k] + d));
		if (before !== qty[k]) {
			bumped = null;
			requestAnimationFrame(() => (bumped = k));
		}
		errDel = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = errDel = errProduct = '';
		const deliverables = shown.filter((k) => qty[k] > 0).map((k) => ({ kind: k, qty: qty[k] }));
		if (!deliverables.length) errDel = 'Choose at least one deliverable.';
		if (type !== 'paid' && !product.trim()) errProduct = exp ? 'Tell us what you are offering: the stay, meal or event.' : 'Tell us which product you will send.';
		// Amounts that can't be right are caught here (not saved as a 'Great fit').
		const f = Number(fee) || 0, pv = Number(productValue) || 0;
		if (f < 0 || pv < 0) error = 'Amounts can’t be below ₹0.';
		else if (f > 50000000 || pv > 50000000) error = 'That amount looks too large. Check the number of zeros.';
		if (errDel || errProduct || error) return;
		if (guest) {
			if (!validGuest()) return;
			busy = true;
			const ok = await sendCode();
			busy = false;
			if (ok) {
				codeStep = true;
				await tick();
				(document.getElementById('g-code') as HTMLInputElement | null)?.focus();
			}
			return;
		}
		await sendRequest();
	}

	async function sendRequest() {
		const deliverables = shown.filter((k) => qty[k] > 0).map((k) => ({ kind: k, qty: qty[k] }));
		busy = true;
		const { data, error: err } = await supabase.rpc('submit_request', {
			p: {
				type,
				package_id: packageId || null,
				deliverables,
				fee: type === 'barter' ? 0 : Number(fee) || 0,
				product,
				product_value: Number(productValue) || 0,
				barter_kind: type === 'paid' ? 'product' : barterKind,
				content_language: langs,
				preferred_live: preferred || null,
				usage,
				brief,
				brief_details: briefDetails
			}
		});
		busy = false;
		if (err) {
			error = errMessage(err);
			return;
		}
		sentReply = replyIn ?? null;
		sent = (data as { code: string }).code;
		useReferral(sent);
		useQr(sent);
		if (loyalty && againCode) await supabase.rpc('claim_rebook', { p_new: sent, p_old: againCode });
		await loadRequests();
		const mine = brandData.requests.find((r) => r.code === sent);
		booked = mine && mine.stage === 'confirmed' ? (mine.live_date ?? preferred) : '';
		scrollTo({ top: 0, behavior: 'smooth' });
		setTimeout(() => {
			const r = panel?.getBoundingClientRect();
			if (r) confetti(r.left + r.width / 2, Math.max(140, r.top + 90));
		}, 400);
	}
</script>

<svelte:head><title>New request</title></svelte:head>

{#if guest}<a class="back" href="/"><Icon name="back" />Back</a>{:else}<a class="back" href="/brand"><Icon name="back" />My requests</a>{/if}

{#if acc && !acc.brand && !codeBusy}
	<header class="ph rv"><div><div class="eb">Step 1 of 2</div><h1>About your <em>brand</em></h1><p>Then you'll choose what you'd like.</p></div></header>
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm submitLabel="Continue" /></section>
{:else if pub.data && !pub.data.accepting}
	<div class="empty-card"><h2>{creator} is fully booked right now</h2><p>New requests are paused. You can still follow requests you already sent.</p><a class="btn" href="/brand">My requests</a></div>
{:else if acc || guest}
	<header class="ph rv">
		<div>
			{#if acc}
				<div class="eb">Sending as {acc.brand?.name} · {acc.full_name}</div>
				<h1>New <em>request</em></h1>
				<p>Tell {creator || 'us'} what you have in mind. <a class="lnk" href="/brand/details">Edit company details</a></p>
			{:else}
				<div class="eb">No account needed</div>
				<h1>Work with <em>{creator || 'us'}</em></h1>
				<p>Fill this in and press Send. We'll email you a 6-digit code to confirm it's you, then you can follow your request any time. <a class="lnk" href="/login?next=/brand">Already sent one? Sign in</a></p>
			{/if}
		</div>
	</header>

	<section class="rq-wrap rv" class:panel={!!sent} style="--i:1" bind:this={panel}>
		{#if sent}
			<div class="success panel-in">
				<div class="big-check">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				</div>
				{#if booked}
					<h2>Booked with <em>{creator}</em></h2>
					<p>Confirmed for {fmtLong(booked)}. We've emailed you the agreement. Add the brief and anything {creator} needs from your request page.</p>
				{:else}
					<h2>Request sent to <em>{creator}</em></h2>
					<p>{creator} usually replies within {sentReply ?? '2 days'}. We've also emailed you a copy. Follow it any time from My requests.</p>
				{/if}
				<div class="codebox"><b>{sent}</b><button class="btn sm" onclick={() => copyText(sent!, 'Code copied')}><Icon name="copy" />Copy</button></div>
				<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
					<a class="btn primary" href="/brand/r/{sent}">See its status</a>
					<a class="btn" href="/brand">My requests</a>
				</div>
			</div>
		{:else}
			<form class="rq" onsubmit={submit} novalidate>
			<div class="rq-main">
				<nav class="rq-steps" aria-label="Your progress" style="--p:{doneCount / steps.length}">
					{#each steps as st, i (st.id)}
						<a href="#{st.id}" class:done={st.done}><span>{#if st.done}<Icon name="check" />{:else}{i + 1}{/if}</span><b>{st.label}</b></a>
					{/each}
					<i class="rq-prog" aria-hidden="true"></i>
				</nav>
				{#if guest}
					<div class="bsec rq-card" id="rq-about">
						<div class="bsec-h"><i>01</i><h2>About you</h2></div>
						<div class="fields">
							<div class="f"><label for="g-brand">Brand name</label><input class="inp" id="g-brand" autocomplete="organization" bind:value={g.brand} /></div>
							<div class="f"><label for="g-name">Your name</label><input class="inp" id="g-name" autocomplete="name" bind:value={g.name} /></div>
							<div class="f"><label for="g-email">Work email</label><input class="inp" id="g-email" type="email" inputmode="email" autocomplete="email" placeholder="name@brand.com" bind:value={g.email} /></div>
							<div class="f"><label for="g-phone">Phone or WhatsApp <span class="hint">(optional)</span></label><input class="inp" id="g-phone" inputmode="tel" autocomplete="tel" bind:value={g.phone} /></div>
							<div class="f"><label for="g-ig">Brand Instagram <span class="hint">(optional)</span></label><div class="pre"><span>@</span><input class="inp" id="g-ig" placeholder="yourbrand" bind:value={g.instagram} /></div></div>
							<div class="f"><label for="g-cat">Category</label><Select id="g-cat" bind:value={g.category} options={CATS.map((c) => ({ value: c, label: c }))} /></div>
						</div>
						{#if gErr}<div class="err" style="margin-top:10px">{gErr}</div>{/if}
					</div>
				{/if}
				{#if againCode && !pkg}
					<div class="pkg-banner">
						<Icon name="refresh" />
						<div><b>Booking again</b><small>Filled in from {againCode}. Change anything you like.</small></div>
					</div>
				{/if}
				{#if loyalty}
					<div class="pkg-banner loyal"><Icon name="gift" /><div><b>Welcome back! {loyalty.pct}% off this collab</b><small>Your returning-brand discount comes off the quote. Valid until {fmtLong(loyalty.until)}.</small></div></div>
				{/if}
				{#if pkg}
					<div class="pkg-banner">
						<Icon name="gift" />
						<div><b>{pkg.name}</b><small>{delivText(pkg.items)} · {inr(pkg.price)}</small>{#if instant}<small class="instant-note"><Icon name="check" />Instant booking: pick an open go-live date and it's confirmed straight away.</small>{/if}</div>
						<button type="button" class="lnk" onclick={() => (packageId = '')}>Customise instead</button>
					</div>
				{/if}
				<div class="bsec rq-card" id="rq-type">
					<div class="bsec-h"><i>{guest ? '02' : '01'}</i><h2>Type of collaboration</h2></div>
					<div class="types" role="radiogroup" aria-label="Type of collaboration">
						{#each types as t (t.v)}
							<label class="type-card" class:off={t.off}><Icon name={t.i} /><input type="radio" name="btype" value={t.v} bind:group={type} /><b>{t.t}</b><small>{t.d}</small><em class="type-tag" class:first={t.v !== 'barter'}>{t.tag}</em></label>
						{/each}
					</div>
					{#if type !== 'paid'}
						<div class="bk" role="radiogroup" aria-label="What you'll give">
							<span class="lbl-t">What you'll give</span>
							<div class="bk-opts">
								<label class="bk-opt" class:on={!exp}><input type="radio" name="bkind" value="product" bind:group={barterKind} /><Icon name="box" /><span><b>A product</b><small>Sent to {creator || 'the creator'}</small></span></label>
								<label class="bk-opt" class:on={exp}><input type="radio" name="bkind" value="experience" bind:group={barterKind} /><Icon name="gift" /><span><b>An experience</b><small>A stay, a meal at your place, an event or a service</small></span></label>
							</div>
						</div>
					{/if}
					{#if type === 'barter' && barter && barter.mode !== 'closed'}
						<p class="bk-note"><Icon name="info" />{creator || 'The creator'} reviews paid requests first.{' '}{#if barter.min_value}Barter worth less than {inr(barter.min_value)} can still be sent, but it's reviewed last.{/if}</p>
					{/if}
				</div>
				<div class="bsec rq-card" id="rq-content">
					<div class="bsec-h"><i>{guest ? '03' : '02'}</i><h2>What you'd like</h2></div>
					<div class="dpick">
						{#each shown as k (k)}
							<div class="dp" class:on={qty[k] > 0}>
								<div><b>{k}</b>{#if rates?.[k]}<small>from {inr(rates[k])}</small>{/if}</div>
								<div class="stepper">
									<button type="button" onclick={() => step(k, -1)} aria-label="One less {k}">−</button>
									<output class:bump={bumped === k} aria-live="polite">{qty[k]}</output>
									<button type="button" onclick={() => step(k, 1)} aria-label="One more {k}">+</button>
								</div>
							</div>
						{/each}
					</div>
					{#if errDel}<div class="err" style="margin-top:10px">{errDel}</div>{/if}
					{#if myLangs.length}
						<div class="rq-lang">
							<span class="lbl-t">Language of the content</span>
							<LanguagePicker label="Language of the content" options={myLangs} value={langs} onchange={(v) => (langs = v)} />
							<small class="hint">{langs.length > 1 ? `Mixed: ${creator || 'the creator'} will use ${langs.join(' and ')} together.` : langs.length ? `All in ${langs[0]}.` : `Pick one, or more than one for mixed-language content. Leave it empty for no preference.`}</small>
						</div>
					{/if}
				</div>
				<div class="bsec rq-card" id="rq-budget">
					<div class="bsec-h"><i>{guest ? '04' : '03'}</i><h2>Budget, product and timing</h2></div>
					<div class="fields">
						{#if type !== 'barter'}
							<div class="f"><label for="b-budget">Budget</label><div class="pre"><span>₹</span><input class="inp num" id="b-budget" type="number" inputmode="numeric" min="0" max="50000000" placeholder="Leave blank for a quote" bind:value={fee} /></div></div>
							{#if combos.length && !pkg}
								<div class="f span2 combos">
									<span class="lbl-t">{inr(Number(fee))} gets you</span>
									<div>
										{#each combos as cb (cb.label)}
											<button type="button" class="combo" class:on={comboOn(cb)} onclick={() => useCombo(cb)}>
												<b>{cb.label}</b><small>{cb.packageId ? 'Package · ' : ''}{inr(cb.total)}</small>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						{/if}
						{#if type !== 'paid'}
							<div class="f"><label for="b-value">{exp ? 'Value of the experience' : 'Product value'}</label><div class="pre"><span>₹</span><input class="inp num" id="b-value" type="number" inputmode="numeric" min="0" bind:value={productValue} /></div></div>
							<div class="f span2">
								<label for="b-product">{exp ? "What you're offering" : "Product you'll send"}</label>
								<input class="inp" class:bad={!!errProduct} id="b-product" placeholder={exp ? 'e.g. Dinner for two at our Indiranagar outlet' : 'e.g. Vitamin C serum, 30 ml'} maxlength="200" bind:value={product} oninput={() => (errProduct = '')} />
								{#if errProduct}<div class="err">{errProduct}</div>{/if}
							</div>
						{/if}
						<div class="f"><label for="b-date">Preferred go-live date</label><DatePicker id="b-date" min={rel(3)} bind:value={preferred} placeholder="No preference" {unavailable} />{#if busyWeek}<p class="hint" style="margin-top:6px">{busyWeek}</p>{/if}</div>
						<div class="f"><label for="b-usage">Usage rights</label><Select id="b-usage" bind:value={usage} options={USAGE.map((u) => ({ value: u, label: usageOption(u) }))} /><p class="hint" style="margin-top:6px">{usage === 'Organic only' ? `${creator} posts it on Instagram. No ads.` : `Your brand runs ${creator}'s content as ads from your own ad account. This is charged on top of the content fee; the quote shows the amount.`}</p></div>
					</div>
					{#if advice}
						{#key advice.title}
							<div class="advice tone-{advice.tone}" role="status">
								<span class="adv-ic"><Icon name={advice.tone === 'good' ? 'check' : advice.tone === 'block' || advice.tone === 'warn' ? 'alert' : 'spark'} /></span>
								<div>
									<b>{advice.title}</b>
									{#each advice.lines as l (l)}<p>{l}</p>{/each}
									{#if advice.suggest}<button type="button" class="btn sm {advice.tone === 'block' ? 'grad' : ''}" onclick={takeSuggestion}><Icon name="rupee" />{advice.suggest.label}</button>{/if}
								</div>
							</div>
						{/key}
					{/if}
				</div>
				<div class="bsec rq-card" id="rq-brief">
					<div class="bsec-h"><i>{guest ? '05' : '04'}</i><h2>Brief</h2></div>
					<BriefEditor bind:value={briefDetails} idp="b" category={acc?.brand?.category ?? g.category} />
					<div class="f" style="margin-top:12px"><label for="b-brief">Anything else</label><textarea class="inp" id="b-brief" rows="3" placeholder="What's launching, context, timing notes" maxlength="4000" bind:value={brief}></textarea>{#if brief.length > 3600}<small class="hint">{4000 - brief.length} characters left</small>{/if}</div>
				</div>
				{#if codeStep}
					<div class="code-step" role="dialog" aria-label="Confirm your email">
						<Icon name="mail" />
						<div>
							<b>Check your email</b>
							<small>We sent a 6-digit code to {g.email}. Enter it to send your request.</small>
							<div class="code-row">
								<input class="inp code-inp" id="g-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" bind:value={code} oninput={() => code.replace(/\D/g, '').length === 6 && verifyAndSend()} />
								<button type="button" class="btn grad" disabled={codeBusy} onclick={verifyAndSend}>{#if codeBusy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Confirm and send{/if}</button>
							</div>
							{#if codeErr}<div class="err">{codeErr}</div>{/if}
							<small>{#if resendIn > 0}Send again in {resendIn}s{:else}<button type="button" class="lnk" onclick={sendCode}>Send a new code</button>{/if} · <button type="button" class="lnk" onclick={() => (codeStep = false)}>Change email</button></small>
						</div>
					</div>
				{/if}
				{#if lines.length}<div class="rq-phone"><ExpectedResults {lines} cost={pkg ? pkg.price : type === 'barter' ? 0 : Number(fee) || estimate} /></div>{/if}
				<div class="submit-row live-total rq-bar">
					<p>
						{#if error}<span class="err" style="display:block;margin:0">{error}</span>
						{:else if lines.length && (estimate || pkg)}
							<span class="lt-what">{delivText(lines)}</span>
							<b class="lt-sum">{pkg ? inr(pkg.price) : type === 'barter' ? 'Barter' : inr(estimate)}</b>
							<span class="lt-note">{pkg ? 'package price' : type === 'barter' ? `worth ${inr(estimate)} at ${creator}'s rates, for your ${exp ? 'experience' : 'product'}` : `at ${creator}'s rates`}{#if !pkg && type !== 'barter' && Number(fee) > 0}{' · '}your budget {inr(Number(fee))}{Number(fee) < estimate ? ` (${Math.round((Number(fee) / estimate) * 100)}%)` : ''}{/if}</span>
						{:else}<span class="rq-default">You'll get a request code and an email copy.</span>{/if}
					</p>
					<button class="btn grad lg" class:blocked={advice?.tone === 'block'} type="submit" disabled={busy || advice?.tone === 'block'} title={advice?.tone === 'block' ? advice.title : undefined}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />{instant && preferred ? 'Book now' : 'Send request'}{/if}</button>
				</div>
			</div>
			<!-- Wide screens: what they're asking for, always in view, with the Send button. -->
			<aside class="rq-side">
				<div class="rq-sum">
					<span class="bx-eb">Your request</span>
					<h3>{pkg ? pkg.name : lines.length ? delivText(lines) : 'Pick what you need'}</h3>
					{#if !lines.length}<p class="rq-empty">Choose at least one piece of content to see the total.</p>{/if}
					<dl>
						<div><dt>Type</dt><dd>{TYPE_LABEL[type]}</dd></div>
						<div><dt>Budget</dt><dd>{pkg ? inr(pkg.price) : type === 'barter' ? (exp ? 'Your experience' : 'Your product') : Number(fee) > 0 ? inr(Number(fee)) : 'Asking for a quote'}</dd></div>
						{#if estimate && !pkg && lines.length}<div><dt>At {creator}'s rates</dt><dd>{inr(estimate)}</dd></div>{/if}
						{#if type !== 'paid' && product.trim()}<div><dt>Product</dt><dd>{product}</dd></div>{/if}
						<div><dt>Go-live</dt><dd>{preferred ? fmtLong(preferred) : 'No preference'}</dd></div>
						<div><dt>Usage</dt><dd>{usageLabel(usage)}</dd></div>
						{#if langs.length}<div><dt>Language</dt><dd>{langText(langs.join(' + '))}</dd></div>{/if}
					</dl>
					{#if lines.length}<ExpectedResults {lines} cost={pkg ? pkg.price : type === 'barter' ? 0 : Number(fee) || estimate} />{/if}
					{#if error}<div class="err">{error}</div>{/if}
					<button class="btn grad lg" class:blocked={advice?.tone === 'block'} type="submit" disabled={busy || advice?.tone === 'block'} title={advice?.tone === 'block' ? advice.title : undefined}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />{instant && preferred ? 'Book now' : 'Send request'}{/if}</button>
					<small class="rq-note">{guest ? "We'll email you a 6-digit code to confirm. " : ''}{creator} usually replies within {replyIn ?? '2 days'}.</small>
				</div>
			</aside>
			</form>
		{/if}
	</section>
{/if}
