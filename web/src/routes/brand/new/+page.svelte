<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { auth, refreshAccount } from '#lib/auth.svelte.ts';
	import { CATS } from '#lib/util.ts';
	import { brandData, loadRequests } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import type { BriefDetails, CollabType } from '#lib/types.ts';
	import { confetti, copyText } from '#lib/ui.svelte.ts';
	import { KINDS, USAGE, delivText, errMessage, firstName, inr, offeredKinds, packageOffered, rel } from '#lib/util.ts';
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
			if (d && !page.url.searchParams.get('package')) untrack(() => Object.assign(g, d.g ?? {}));
		} catch {
			/* storage blocked */
		}
	});
	$effect(() => {
		if (!guest) return;
		const snapshot = JSON.stringify({ g });
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
		const { error: err } = await supabase.auth.verifyOtp({ email: g.email.trim().toLowerCase(), token, type: 'email' });
		if (err) {
			codeBusy = false;
			return (codeErr = 'That code is wrong or has expired. Check the latest email or send a new code.');
		}
		const account = await refreshAccount();
		if (account?.role === 'creator') {
			codeBusy = false;
			return (codeErr = "This is the creator's email. Use your brand's email to send a request.");
		}
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
	let preferred = $state('');
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
		{ v: 'barter', t: 'Barter', d: 'Product in exchange for content', i: 'gift', tag: barter?.mode === 'closed' ? 'Paused' : 'Reviewed after paid', off: barter?.mode === 'closed' }
	]);

	// Live guidance from the creator's priority rules (same engine the studio uses).
	const shown = $derived(offeredKinds(pub.data?.offered));
	const lines = $derived(shown.filter((k) => qty[k] > 0).map((k) => ({ kind: k, qty: qty[k] })));
	const advice = $derived<Advice | null>(
		pkg
			? { tone: 'good', title: 'Booking a package', lines: [`This is one of ${creator}'s own packages at the listed price, so it goes to the top of the list.`] }
			: pub.data
				? brandAdvice({ type, fee: Number(fee) || 0, productValue: Number(productValue) || 0, lines }, pub.data, creator)
				: null
	);
	// Weeks she is full or away can't be picked as the go-live date.
	const weekOf = (isoDate: string) => {
		const d = new Date(isoDate + 'T00:00:00');
		d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const unavailable = (isoDate: string) => {
		const w = pub.data?.availability?.find((x) => x.start === weekOf(isoDate));
		return w?.status === 'full' || w?.status === 'away';
	};
	const busyWeek = $derived(pub.data?.availability?.some((w) => w.status === 'full' || w.status === 'away') ? `Greyed-out dates are weeks ${creator || 'the creator'} is fully booked or away.` : '');
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
		if (type !== 'paid' && !product.trim()) errProduct = 'Tell us which product you will send.';
		if (errDel || errProduct) return;
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
		loadRequests();
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

	<section class="panel rv" style="--i:1;overflow:clip" bind:this={panel}>
		{#if sent}
			<div class="success panel-in">
				<div class="big-check">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				</div>
				<h2>Request sent to <em>{creator}</em></h2>
				<p>{creator} usually replies within {sentReply ?? '2 days'}. We've also emailed you a copy. Follow it any time from My requests.</p>
				<div class="codebox"><b>{sent}</b><button class="btn sm" onclick={() => copyText(sent!, 'Code copied')}><Icon name="copy" />Copy</button></div>
				<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
					<a class="btn primary" href="/brand/r/{sent}">See its status</a>
					<a class="btn" href="/brand">My requests</a>
				</div>
			</div>
		{:else}
			<form onsubmit={submit} novalidate>
				{#if guest}
					<div class="bsec" id="g-sec">
						<div class="bsec-h"><i>00</i><h2>About you</h2></div>
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
				{#if pkg}
					<div class="pkg-banner">
						<Icon name="gift" />
						<div><b>{pkg.name}</b><small>{delivText(pkg.items)} · {inr(pkg.price)}</small></div>
						<button type="button" class="lnk" onclick={() => (packageId = '')}>Customise instead</button>
					</div>
				{/if}
				<div class="bsec">
					<div class="bsec-h"><i>01</i><h2>Type of collaboration</h2></div>
					<div class="types" role="radiogroup" aria-label="Type of collaboration">
						{#each types as t (t.v)}
							<label class="type-card" class:off={t.off}><Icon name={t.i} /><input type="radio" name="btype" value={t.v} bind:group={type} /><b>{t.t}</b><small>{t.d}</small><em class="type-tag" class:first={t.v !== 'barter'}>{t.tag}</em></label>
						{/each}
					</div>
				</div>
				<div class="bsec">
					<div class="bsec-h"><i>02</i><h2>What you'd like</h2></div>
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
				</div>
				<div class="bsec">
					<div class="bsec-h"><i>03</i><h2>Budget, product and timing</h2></div>
					<div class="fields">
						{#if type !== 'barter'}
							<div class="f"><label for="b-budget">Budget</label><div class="pre"><span>₹</span><input class="inp num" id="b-budget" type="number" inputmode="numeric" min="0" placeholder="Leave blank for a quote" bind:value={fee} /></div></div>
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
							<div class="f"><label for="b-value">Product value</label><div class="pre"><span>₹</span><input class="inp num" id="b-value" type="number" inputmode="numeric" min="0" bind:value={productValue} /></div></div>
							<div class="f span2">
								<label for="b-product">Product you'll send</label>
								<input class="inp" class:bad={!!errProduct} id="b-product" placeholder="e.g. Vitamin C serum, 30 ml" bind:value={product} oninput={() => (errProduct = '')} />
								{#if errProduct}<div class="err">{errProduct}</div>{/if}
							</div>
						{/if}
						<div class="f"><label for="b-date">Preferred go-live date</label><DatePicker id="b-date" min={rel(3)} bind:value={preferred} placeholder="No preference" {unavailable} />{#if busyWeek}<p class="hint" style="margin-top:6px">{busyWeek}</p>{/if}</div>
						<div class="f"><label for="b-usage">Usage rights</label><Select id="b-usage" bind:value={usage} options={USAGE.map((u) => ({ value: u, label: u }))} /></div>
					</div>
				</div>
				<div class="bsec">
					<div class="bsec-h"><i>04</i><h2>Brief</h2></div>
					<BriefEditor bind:value={briefDetails} idp="b" category={acc?.brand?.category ?? g.category} />
					<div class="f" style="margin-top:12px"><label for="b-brief">Anything else</label><textarea class="inp" id="b-brief" rows="3" placeholder="What's launching, context, timing notes" bind:value={brief}></textarea></div>
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
				{#if lines.length}<ExpectedResults {lines} cost={pkg ? pkg.price : type === 'barter' ? 0 : Number(fee) || estimate} />{/if}
				<div class="submit-row live-total">
					<p>
						{#if error}<span class="err" style="display:block;margin:0">{error}</span>
						{:else if lines.length && (estimate || pkg)}
							<span class="lt-what">{delivText(lines)}</span>
							<b class="lt-sum">{inr(pkg ? pkg.price : estimate)}</b>
							<span class="lt-note">{pkg ? 'package price' : type === 'barter' ? `at ${creator}'s rates, for your product` : `at ${creator}'s rates`}{#if !pkg && type !== 'barter' && Number(fee) > 0}{' · '}your budget {inr(Number(fee))}{Number(fee) < estimate ? ` (${Math.round((Number(fee) / estimate) * 100)}%)` : ''}{/if}</span>
						{:else}You'll get a request code and an email copy.{/if}
					</p>
					<button class="btn grad lg" class:blocked={advice?.tone === 'block'} type="submit" disabled={busy || advice?.tone === 'block'} title={advice?.tone === 'block' ? advice.title : undefined}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Send request{/if}</button>
				</div>
			</form>
		{/if}
	</section>
{/if}
