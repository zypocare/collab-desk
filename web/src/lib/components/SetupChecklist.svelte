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
	// Instagram and packages arrive a moment after the studio: wait for them so a finished setup never flashes.
	let settled = $state(false);
	onMount(() => {
		const t = setTimeout(() => (settled = true), 1500);
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
	const show = $derived(settled && studio.loaded && owner && !hidden && steps.length > 0 && doneN < steps.length);

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

<style>
	.ob { position: relative; overflow: hidden; padding: 24px 26px 22px; border-radius: 26px; border: 1px solid var(--line); background: var(--surface); display: grid; gap: 16px; }
	.ob::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: linear-gradient(90deg, var(--g1), var(--g2) 55%, var(--g3)); }
	.ob-h { display: flex; align-items: flex-start; gap: 12px; }
	.ob-t { flex: 1; min-width: 0; display: grid; gap: 6px; }
	.ob-eb { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.ob h2 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 34px; line-height: 1.05; letter-spacing: -.01em; }
	.ob h2 em { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }
	.ob-x { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid var(--line-strong); border-radius: 0; background: none; color: var(--ink-3); cursor: pointer; }
	.ob-x:hover { color: var(--ink); }
	.ob-x :global(.ic) { width: 16px; height: 16px; stroke-width: 2.2; }

	.ob-bar { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 5px; }
	.ob-bar i { height: 6px; background: var(--line); }
	.ob-bar i.on { background: linear-gradient(90deg, var(--g2), var(--g3)); }

	.ob-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 10px 22px; }
	.ob-list li { display: flex; align-items: center; gap: 14px; min-width: 0; padding: 12px 0; border-top: 1px solid var(--line); }
	.ob-tick { flex: none; width: 26px; height: 26px; padding: 0; display: grid; place-items: center; border: 1.5px solid var(--line-strong); border-radius: 50%; background: none; color: #fff; }
	button.ob-tick { cursor: pointer; }
	button.ob-tick:hover { border-color: var(--g3); }
	.done .ob-tick { border-color: transparent; background: linear-gradient(135deg, var(--g2), var(--g3)); }
	.ob-tick :global(.ic) { width: 14px; height: 14px; stroke-width: 3; }
	.ob-s { flex: 1; min-width: 0; display: grid; gap: 2px; }
	.ob-s b { font-size: 15px; font-weight: 600; }
	.ob-s small { font-size: 13px; color: var(--ink-3); overflow-wrap: anywhere; }
	.done .ob-s b { color: var(--ink-3); text-decoration: line-through; text-decoration-color: var(--line-strong); }

	/* NeoPOP square button, like the rest of Today. */
	.ob-neo { flex: none; display: inline-flex; align-items: center; gap: 4px; height: 36px; padding: 0 12px; border: 0; border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: 3px 3px 0 var(--g2); font: 700 13px var(--f-body, inherit); text-decoration: none; white-space: nowrap; cursor: pointer; transition: transform .07s, box-shadow .07s; }
	.ob-neo:active { transform: translate(3px, 3px); box-shadow: none; }
	.ob-neo :global(.ic) { width: 14px; height: 14px; stroke-width: 2.4; }

	/* Phone: one column, a little tighter, same spacing as the other Today sections. */
	.ob-ph { margin: 0 0 22px; padding: 20px 18px 16px; border-radius: 22px; gap: 14px; }
	.ob-ph h2 { font-size: 28px; }
	.ob-ph .ob-list { grid-template-columns: 1fr; gap: 0; }
	.ob-ph .ob-list li { padding: 11px 0; gap: 12px; }
	.ob-ph .ob-neo { height: 34px; padding: 0 10px; font-size: 12.5px; }
</style>
