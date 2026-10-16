<script lang="ts">
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import { confetti } from '#lib/ui.svelte.ts';
	import { errMessage, firstName } from '#lib/util.ts';
	import type { BriefDetails } from '#lib/types.ts';
	import BriefEditor from '#lib/components/BriefEditor.svelte';
	import Icon from '#lib/components/Icon.svelte';

	// From the "a few details" email: the brand fills in what the brief is missing. No sign-in.
	type Info = {
		state: 'open' | 'used' | 'expired' | 'missing';
		code: string;
		brand: string;
		category: string;
		instagram: string;
		contact: string;
		creator: string;
		details: BriefDetails;
		missing: string[];
		deliverables: string;
	};
	const NAMES: Record<string, string> = { message: 'Key message', hashtags: 'Hashtags', dos: "Do's and don'ts", tag: 'Accounts to tag' };

	let info = $state<Info | null>(null);
	let details = $state<BriefDetails>({});
	let handle = $state('');
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);

	$effect(() => {
		supabase.rpc('brief_form_info', { p_token: page.params.token }).then(({ data, error: err }) => {
			info = err ? ({ state: 'missing' } as Info) : (data as Info);
			details = { ...(info?.details ?? {}) };
		});
	});
	const creator = $derived(firstName(info?.creator ?? ''));

	async function send() {
		error = '';
		busy = true;
		const { error: err } = await supabase.rpc('brief_form_submit', { p_token: page.params.token, p_details: details, p_instagram: handle });
		busy = false;
		if (err) return (error = errMessage(err));
		done = true;
		confetti();
	}
</script>

<svelte:head><title>Brief details</title></svelte:head>

<header class="topbar">
	<a class="brandmark" href="/"><span class="ring"><span></span></span><b>{info?.creator ? `Collaborate with ${creator}` : ''}</b></a>
</header>

<div class="page"><div class="wrap act-wrap">
	{#if !info}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if done}
		<div class="empty-card act-done">
			<div class="big-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div>
			<h2>Thank you!</h2>
			<p>{creator} has the details and will plan the shoot. You'll get the draft to review before anything goes live.</p>
			<a class="btn" href="/brand/r/{info.code}">See your request</a>
		</div>
	{:else if info.state !== 'open'}
		<div class="empty-card">
			<h2>{info.state === 'used' ? 'Already sent' : info.state === 'expired' ? 'This link has expired' : 'This link is not valid'}</h2>
			<p>{info.state === 'used' ? `${creator} has your details. Reply to the email if you want to add something.` : 'Check that you copied the whole link from the email.'}</p>
			{#if info.code}<a class="btn" href="/brand/r/{info.code}">Open your request</a>{/if}
		</div>
	{:else}
		<header class="ph rv">
			<div>
				<div class="eb">{info.brand} · <span class="id">{info.code}</span></div>
				<h1>A few <em>details</em></h1>
				<p>For {info.deliverables}. Two minutes now saves a round of revisions later.</p>
			</div>
		</header>
		{#if info.missing.length}
			<div class="brief-miss rv" style="--i:1"><span class="lbl-t">Still needed</span>{#each info.missing as m (m)}<span class="dm-chip">{NAMES[m] ?? m}</span>{/each}</div>
		{/if}
		<section class="panel rv" style="--i:2;padding:20px">
			{#if !info.instagram}
				<div class="f" style="margin-bottom:12px"><label for="bf-ig">Your brand's Instagram handle</label><input class="inp" id="bf-ig" placeholder="@yourbrand" bind:value={handle} /></div>
			{/if}
			<BriefEditor bind:value={details} idp="bq" category={info.category} />
		</section>
		<section class="panel rv act-box" style="--i:3">
			{#if error}<div class="err">{error}</div>{/if}
			<div class="row"><button class="btn grad lg" disabled={busy} onclick={send}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send to {creator}</button></div>
		</section>
	{/if}
</div></div>
