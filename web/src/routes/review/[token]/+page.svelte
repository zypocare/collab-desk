<script lang="ts">
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import { confetti } from '#lib/ui.svelte.ts';
	import { errMessage, firstName } from '#lib/util.ts';

	// A brand leaves a quick review after a collab (one-tap link from email, no sign-in).
	type Info = { state: 'open' | 'used' | 'expired' | 'missing'; code: string; brand: string; contact: string; creator: string };
	let info = $state<Info | null>(null);
	let rating = $state(0);
	let hover = $state(0);
	let body = $state('');
	let name = $state('');
	let busy = $state(false);
	let error = $state('');
	let done = $state(false);

	$effect(() => {
		supabase.rpc('review_info', { p_token: page.params.token }).then(({ data }) => {
			info = (data as Info) ?? { state: 'missing' };
			name = info?.contact ?? '';
		});
	});
	const creator = $derived(firstName(info?.creator ?? ''));
	const words = ['', 'Not great', 'Okay', 'Good', 'Great', 'Loved it'];

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!rating) return (error = 'Tap the stars to rate.');
		busy = true;
		const { error: err } = await supabase.rpc('review_submit', { p_token: page.params.token, p_rating: rating, p_body: body, p_name: name });
		busy = false;
		if (err) return (error = errMessage(err));
		done = true;
		if (rating >= 4) confetti();
	}
</script>

<svelte:head><title>Leave a review</title></svelte:head>

<header class="topbar">
	<a class="brandmark" href="/"><span class="ring"><span></span></span><b>{info?.creator ? `Collaborate with ${creator}` : ''}</b></a>
</header>

<div class="auth-wrap">
	<div class="auth-card review-card">
		{#if !info}
			<div class="loader" style="min-height:120px"><span class="ring"><span></span></span></div>
		{:else if done}
			<h1>Thank <em>you</em></h1>
			<p class="lead">Your review helps other brands decide. {creator} will be glad to hear it.</p>
			<a class="btn" href="/">See {creator}'s page</a>
		{:else if info.state !== 'open'}
			<h1>{info.state === 'used' ? 'Already reviewed' : info.state === 'expired' ? 'Link expired' : 'Link not valid'}</h1>
			<p class="lead">{info.state === 'used' ? 'Thanks, your review is already in.' : 'You can still reach out from your request page.'}</p>
		{:else}
			<h1>How was it with <em>{creator}</em>?</h1>
			<p class="lead">{info.brand} · {info.code}</p>
			<form onsubmit={submit} novalidate>
				<div class="big-stars" role="group" aria-label="Rating" onmouseleave={() => (hover = 0)}>
					{#each [1, 2, 3, 4, 5] as v (v)}
						<button type="button" class="star" class:on={v <= (hover || rating)} aria-pressed={rating === v} aria-label="{v} star{v > 1 ? 's' : ''}" onmouseenter={() => (hover = v)} onclick={() => (rating = v)}>★</button>
					{/each}
				</div>
				<p class="star-word">{words[hover || rating] || 'Tap to rate'}</p>
				<div class="f"><label for="r-body">One line about the experience <span class="hint">(optional)</span></label><textarea class="inp" id="r-body" rows="3" maxlength="300" placeholder="e.g. Delivered on time, the reel did really well for our launch." bind:value={body}></textarea></div>
				<div class="f" style="margin-top:10px"><label for="r-name">Your name</label><input class="inp" id="r-name" autocomplete="name" bind:value={name} /></div>
				{#if error}<div class="err">{error}</div>{/if}
				<button class="btn grad lg" type="submit" disabled={busy} style="margin-top:14px;width:100%;justify-content:center">{#if busy}<span class="spinner"></span>{/if}Send review</button>
			</form>
		{/if}
	</div>
</div>
