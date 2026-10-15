<script lang="ts">
	import { auth } from '#lib/auth.svelte.ts';
	import { loadRequests } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import type { CollabType } from '#lib/types.ts';
	import { confetti, copyText } from '#lib/ui.svelte.ts';
	import { KINDS, USAGE, errMessage, firstName, inr, rel } from '#lib/util.ts';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';

	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
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
	let busy = $state(false);
	let error = $state('');
	let errDel = $state('');
	let errProduct = $state('');
	let sent = $state<string | null>(null);
	let bumped = $state<string | null>(null);
	let panel = $state<HTMLElement>();

	const types: { v: CollabType; t: string; d: string; i: string }[] = [
		{ v: 'paid', t: 'Paid', d: 'A fee for content', i: 'rupee' },
		{ v: 'barter', t: 'Barter', d: 'Product in exchange for content', i: 'gift' },
		{ v: 'hybrid', t: 'Paid + product', d: 'A fee plus your product', i: 'layers' }
	];

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
		const deliverables = KINDS.filter((k) => qty[k] > 0).map((k) => ({ kind: k, qty: qty[k] }));
		if (!deliverables.length) errDel = 'Choose at least one deliverable.';
		if (type !== 'paid' && !product.trim()) errProduct = 'Tell us which product you will send.';
		if (errDel || errProduct) return;
		busy = true;
		const { data, error: err } = await supabase.rpc('submit_request', {
			p: {
				type,
				deliverables,
				fee: type === 'barter' ? 0 : Number(fee) || 0,
				product,
				product_value: Number(productValue) || 0,
				preferred_live: preferred || null,
				usage,
				brief
			}
		});
		busy = false;
		if (err) {
			error = errMessage(err);
			return;
		}
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

<a class="back" href="/brand"><Icon name="back" />My requests</a>

{#if acc && !acc.brand}
	<header class="ph rv"><div><div class="eb">Step 1 of 2</div><h1>About your <em>brand</em></h1><p>Then you'll choose what you'd like.</p></div></header>
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm submitLabel="Continue" /></section>
{:else if acc && pub.data && !pub.data.accepting}
	<div class="empty-card"><h2>{creator} is fully booked right now</h2><p>New requests are paused. You can still follow requests you already sent.</p><a class="btn" href="/brand">My requests</a></div>
{:else if acc}
	<header class="ph rv">
		<div>
			<div class="eb">Sending as {acc.brand?.name} · {acc.full_name}</div>
			<h1>New <em>request</em></h1>
			<p>Tell {creator || 'us'} what you have in mind. <a class="lnk" href="/brand/details">Edit company details</a></p>
		</div>
	</header>

	<section class="panel rv" style="--i:1;overflow:hidden" bind:this={panel}>
		{#if sent}
			<div class="success panel-in">
				<div class="big-check">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				</div>
				<h2>Request sent to <em>{creator}</em></h2>
				<p>{creator} usually replies within {pub.data?.reply_time ?? '2 days'}. We've also emailed you a copy. Follow it any time from My requests.</p>
				<div class="codebox"><b>{sent}</b><button class="btn sm" onclick={() => copyText(sent!, 'Code copied')}><Icon name="copy" />Copy</button></div>
				<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
					<a class="btn primary" href="/brand/r/{sent}">See its status</a>
					<a class="btn" href="/brand">My requests</a>
				</div>
			</div>
		{:else}
			<form onsubmit={submit} novalidate>
				<div class="bsec">
					<div class="bsec-h"><i>01</i><h2>Type of collaboration</h2></div>
					<div class="types" role="radiogroup" aria-label="Type of collaboration">
						{#each types as t (t.v)}
							<label class="type-card"><Icon name={t.i} /><input type="radio" name="btype" value={t.v} bind:group={type} /><b>{t.t}</b><small>{t.d}</small></label>
						{/each}
					</div>
				</div>
				<div class="bsec">
					<div class="bsec-h"><i>02</i><h2>What you'd like</h2></div>
					<div class="dpick">
						{#each KINDS as k (k)}
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
						{/if}
						{#if type !== 'paid'}
							<div class="f"><label for="b-value">Product value</label><div class="pre"><span>₹</span><input class="inp num" id="b-value" type="number" inputmode="numeric" min="0" bind:value={productValue} /></div></div>
							<div class="f span2">
								<label for="b-product">Product you'll send</label>
								<input class="inp" class:bad={!!errProduct} id="b-product" placeholder="e.g. Vitamin C serum, 30 ml" bind:value={product} oninput={() => (errProduct = '')} />
								{#if errProduct}<div class="err">{errProduct}</div>{/if}
							</div>
						{/if}
						<div class="f"><label for="b-date">Preferred go-live date</label><input class="inp" id="b-date" type="date" min={rel(3)} bind:value={preferred} /></div>
						<div class="f"><label for="b-usage">Usage rights</label><select class="inp" id="b-usage" bind:value={usage}>{#each USAGE as u (u)}<option value={u}>{u}</option>{/each}</select></div>
						<div class="f span2"><label for="b-brief">Brief</label><textarea class="inp" id="b-brief" rows="4" placeholder="What's launching, key messages, hashtags, links and anything to avoid." bind:value={brief}></textarea></div>
					</div>
				</div>
				<div class="submit-row">
					<p>{error ? '' : "You'll get a request code and an email copy."}{#if error}<span class="err" style="display:block;margin:0">{error}</span>{/if}</p>
					<button class="btn grad lg" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Send request{/if}</button>
				</div>
			</form>
		{/if}
	</section>
{/if}
