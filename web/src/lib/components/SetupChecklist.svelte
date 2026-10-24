<script module lang="ts">
	let settledOnce = false;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { copyText, ui } from '#lib/ui.svelte.ts';
	import { firstName } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// A newly approved creator's first steps, at the top of Today. Each step ticks itself from her real
	// data (only "link in bio" is ticked by hand); the card goes away when all are done or she hides it.
	let { phone = false }: { phone?: boolean } = $props();

	// The rate card every new studio starts with: changing it counts as "rates added".
	const START_RATES: Record<string, number> = { Reel: 25000, Story: 6000, 'Static post': 12000, Carousel: 16000, 'UGC video': 15000 };

	const s = $derived(studio.settings);
	const key = (k: string) => `cd-setup-${k}-${s?.id ?? ''}`;
	let bio = $state(false);
	let hidden = $state(true);
	// Instagram and packages arrive a moment after the studio: wait for them (studio.extras, or 1.5 s at most)
	// so a finished setup never flashes.
	// Only once per visit to the app: coming back to Today later, the card is there at once instead of
	// popping in and pushing the page down.
	let settled = $state(settledOnce);
	onMount(() => {
		if (settled) return;
		// Counted from when the app opened, so arriving at Today later doesn't wait again.
		const t = setTimeout(() => (settled = settledOnce = true), Math.max(0, 1500 - performance.now()));
		return () => clearTimeout(t);
	});
	$effect(() => {
		if (!s) return;
		try {
			bio = localStorage.getItem(key('bio')) === '1';
			hidden = localStorage.getItem(key('hide')) === '1';
		} catch {
			hidden = false;
		}
	});
	function remember(k: string) {
		try {
			localStorage.setItem(key(k), '1');
		} catch {
			/* storage blocked */
		}
	}

	const ratesSet = $derived(
		!!s &&
			(studio.packages.some((p) => p.active) ||
				Object.keys({ ...START_RATES, ...s.rates }).some((k) => Number(s.rates?.[k] ?? 0) !== (START_RATES[k] ?? 0)))
	);
	const link = $derived((s?.site_url ?? '').replace(/\/$/, ''));
	type Step = { id: string; done: boolean; title: string; sub: string; href?: string; act: string; run?: () => void };
	const steps = $derived<Step[]>(
		s
			? [
					{ id: 'profile', done: !!(s.display_name?.trim() && s.niche?.trim() && s.city?.trim()), title: 'Profile basics', sub: 'Your name, what you create and your city', href: '/studio/settings?s=profile', act: 'Add' },
					{ id: 'rates', done: ratesSet, title: 'Your rates or packages', sub: 'What a Reel, a Story or a bundle costs', href: '/studio/settings?s=rates', act: 'Set rates' },
					{ id: 'ig', done: !!studio.ig?.connected, title: 'Connect Instagram', sub: 'Live followers, reach and insights for brands', href: '/studio/settings?s=profile', act: 'Connect' },
					{ id: 'pay', done: !!(s.upi_id?.trim() || s.bank_details?.trim()), title: 'Payment details', sub: 'UPI ID or bank account, printed on invoices', href: '/studio/settings?s=payments', act: 'Add' },
					{
						id: 'bio',
						// A brand already sent a request from her page: the link is out there.
						done: bio || studio.collabs.some((c) => c.source === 'brand_page'),
						title: 'Put your link in your Instagram bio',
						sub: link.replace(/^https?:\/\//, ''),
						act: 'Copy link',
						run: () => copyText(link, 'Link copied. Paste it in your Instagram bio.')
					},
					{ id: 'collab', done: studio.collabs.length > 0, title: 'Add your first collab', sub: 'A brand you are talking to, or one from before', act: 'Add collab', run: () => (ui.newCollab = true) }
				]
			: []
	);
	const doneN = $derived(steps.filter((x) => x.done).length);
	const owner = $derived(studio.me?.team_role === 'owner');
	const show = $derived((settled || studio.extras) && studio.loaded && owner && !hidden && steps.length > 0 && doneN < steps.length);

	function tickBio() {
		bio = !bio;
		try {
			if (bio) localStorage.setItem(key('bio'), '1');
			else localStorage.removeItem(key('bio'));
		} catch {
			/* storage blocked */
		}
	}
	function hide() {
		hidden = true;
		remember('hide');
	}
</script>

{#if show && s}
	<section class="ob" class:ob-ph={phone} aria-label="Finish setting up">
		<header class="ob-h">
			<div class="ob-t">
				<span class="ob-eb">Set up · {doneN} of {steps.length} done</span>
				<h2>Finish setting up, <em>{firstName(s.display_name) || 'you'}</em></h2>
			</div>
			<button class="ob-x" onclick={hide} aria-label="Hide this for good"><Icon name="x" /></button>
		</header>
		<div class="ob-bar" style="--n:{steps.length}" aria-hidden="true">{#each steps as st (st.id)}<i class:on={st.done}></i>{/each}</div>
		<ol class="ob-list">
			{#each steps as st (st.id)}
				<li class:done={st.done}>
					{#if st.id === 'bio'}
						<button class="ob-tick" onclick={tickBio} aria-pressed={st.done} aria-label={st.done ? 'Mark as not done' : 'Mark as done'}>{#if st.done}<Icon name="check" />{/if}</button>
					{:else}
						<span class="ob-tick" aria-hidden="true">{#if st.done}<Icon name="check" />{/if}</span>
					{/if}
					<span class="ob-s"><b>{st.title}</b><small>{st.sub}</small></span>
					{#if !st.done}
						{#if st.href}
							<a class="ob-neo" href={st.href}>{st.act}<Icon name="chevR" /></a>
						{:else}
							<button class="ob-neo" onclick={st.run}>{st.act}</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ol>
	</section>
{/if}

