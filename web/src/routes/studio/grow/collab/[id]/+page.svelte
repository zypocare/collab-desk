<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { grow, inviteCollab, loadGrow, nextSlots } from '#lib/grow.svelte.ts';
	import { loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, firstName } from '#lib/util.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';

	// Invite another creator on Miracle to a collab reel: one reel, posted with both as co-authors, so it
	// shows to both audiences. No money changes hands; the one who posts adds the other as collaborator.
	const id = $derived(Number(page.params.id));
	onMount(async () => {
		if (!grow.loaded) await loadGrow();
		if (!studio.media.length) loadInstagram();
	});
	const c = $derived(grow.matches.find((x) => x.id === id) ?? null);
	const me = $derived(studio.settings);
	const myNiche = $derived((me?.niche ?? '').split(',')[0]?.trim() || 'everyday');
	// A few ready ideas for two creators (tap "Another idea" for the next).
	const ideas = $derived(
		c
			? [
					me?.city && c.city && me.city.toLowerCase() !== c.city.toLowerCase()
						? `${me.city} vs ${c.city}: the same ${myNiche.toLowerCase()} routine in two cities. Who did it better?`
						: `Two takes on one ${myNiche.toLowerCase()} routine: same products, two styles. Who did it better?`,
					`We swap: I try ${firstName(c.name)}'s go-to ${myNiche.toLowerCase()} pick, ${firstName(c.name)} tries mine.`,
					`Rating each other's 3 favourite ${myNiche.toLowerCase()} finds under ₹500.`,
					`Myths vs facts: ${firstName(c.name)} and I answer your top ${myNiche.toLowerCase()} questions in 20 seconds.`
				]
			: []
	);
	let k = $state(0);
	let idea = $state('');
	$effect(() => {
		if (!idea && ideas.length) idea = ideas[0];
	});
	let poster = $state<'from' | 'to'>('from');
	const slot = $derived(nextSlots(studio.media, 3)[1] ?? new Date(Date.now() + 7 * 864e5));
	const isoLocal = (d: Date) => new Date(d.getTime() + 330 * 60e3).toISOString().slice(0, 16);
	let postAt = $state('');
	let shootBy = $state('');
	$effect(() => {
		if (!postAt) postAt = isoLocal(slot);
		if (!shootBy) shootBy = new Date(slot.getTime() - 2 * 864e5 + 330 * 60e3).toISOString().slice(0, 10);
	});
	let busy = $state(false);
	async function send() {
		if (!c) return;
		busy = true;
		try {
			// The time she picked is India time.
			const at = postAt ? new Date(`${postAt}:00+05:30`) : null;
			await inviteCollab(c.id, idea.trim(), poster, shootBy || null, at);
			toast(`Invite sent to ${firstName(c.name)}`, 'send');
			goto('/studio/grow#collab');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Collab reel · Miracle</title></svelte:head>

<a class="back rv" href="/studio/grow#collab"><Icon name="back" />Grow</a>
{#if !grow.loaded}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else if !c}
	<div class="empty-card"><h2>That creator isn't available</h2><p>They may have turned collab invites off.</p><a class="btn primary" href="/studio/grow">Back to Grow</a></div>
{:else}
	<div class="ci">
		<section class="hero-card glow m-hero ci-hero rv" aria-label="The two of you">
			<div class="mesh" aria-hidden="true"></div>
			<div class="hc-in">
				<div class="ci-avs"><Avatar name={me?.display_name ?? 'You'} size="56px" /><Avatar name={c.name} src={c.photo ?? ''} size="56px" /></div>
				<div class="ci-h">You and {c.name}</div>
				<div class="ci-nums">
					{#if c.followers}<span><b class="num">{compact(c.followers)}</b>Their followers</span>{/if}
					<span><b>{(c.niche || '').split(',')[0] || '—'}</b>{c.match === 'niche' ? 'Your niche too' : 'Their niche'}</span>
					<span><b>{c.city || '—'}</b>City</span>
				</div>
			</div>
		</section>

		<form class="panel ci-form rv" style="--i:1" onsubmit={(e) => (e.preventDefault(), send())}>
			<label class="f"><span class="ci-eb">The idea</span><textarea class="inp" rows="3" maxlength="400" bind:value={idea}></textarea></label>
			<div><button class="btn sm" type="button" onclick={() => ((k = (k + 1) % ideas.length), (idea = ideas[k]))}><Icon name="refresh" />Another idea</button></div>
			<fieldset class="ci-who">
				<legend class="ci-eb">Who posts it</legend>
				<label class:on={poster === 'from'}><input type="radio" bind:group={poster} value="from" />I post, {firstName(c.name)} is the collaborator</label>
				<label class:on={poster === 'to'}><input type="radio" bind:group={poster} value="to" />{firstName(c.name)} posts, I'm the collaborator</label>
			</fieldset>
			<div class="ci-dates">
				<label class="f"><span class="ci-eb">Shoot by</span><input class="inp" type="date" bind:value={shootBy} /></label>
				<label class="f"><span class="ci-eb">Post on</span><input class="inp" type="datetime-local" bind:value={postAt} /></label>
			</div>
			<button class="btn primary" type="submit" disabled={busy || idea.trim().length < 3}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send {firstName(c.name)} the invite</button>
			<small class="hint">{firstName(c.name)} gets it by email and in Grow. When they say yes, it goes in both your Calendars. Whoever posts adds the other as collaborator; the other taps Accept in Instagram and it shows on both profiles. No money changes hands.</small>
		</form>
	</div>
{/if}

<style>
	.ci {
		display: grid;
		grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}
	.ci-avs {
		display: flex;
	}
	.ci-avs :global(> :last-child) {
		margin-left: -14px;
	}
	.ci-h {
		margin-top: 12px;
		font: 400 30px/1.1 var(--f-serif, Georgia, serif);
	}
	.ci-nums {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin-top: 12px;
		font-size: 12px;
		opacity: 0.9;
	}
	.ci-nums span {
		display: grid;
		min-width: 0;
	}
	.ci-nums b {
		font-size: 16px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ci-form {
		display: grid;
		gap: 14px;
		padding: 20px;
	}
	.ci-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ci-who {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		gap: 6px;
	}
	.ci-who legend {
		padding-bottom: 8px;
	}
	.ci-who label {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 46px;
		padding: 0 14px;
		border-radius: 12px;
		box-shadow: inset 0 0 0 1px var(--line);
		font-size: 14px;
		cursor: pointer;
	}
	.ci-who label.on {
		background: var(--surface-2, var(--surface));
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.ci-who input {
		accent-color: var(--accent);
	}
	.ci-dates {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.ci-form > :global(.btn.primary) {
		height: 50px;
		justify-content: center;
	}
	@media (max-width: 900px) {
		.ci {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
