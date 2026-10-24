<script lang="ts">
	import { onMount } from 'svelte';
	import { loadTickets, STATUS, support, topicLabel } from '../../support.svelte';
	import Icon from '../Icon.svelte';

	// All of this login's tickets: the ones still going first, then solved ones.
	let { base }: { base: string } = $props();
	onMount(() => {
		loadTickets().catch(() => {});
	});
	const live = $derived(support.list.filter((t) => t.status !== 'solved'));
	const done = $derived(support.list.filter((t) => t.status === 'solved'));
	const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
</script>

<div class="tl">
	<header class="tl-h rv">
		<div><span class="tl-eb">Help & support</span><h1>Your <em>tickets</em></h1></div>
		<a class="btn primary" href="{base}/new"><Icon name="plus" />New ticket</a>
	</header>

	{#if !support.loaded}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{:else if !support.list.length}
		<div class="tl-empty rv"><Icon name="send" /><b>No tickets yet</b><small>Most answers are in Help. If something's wrong, tell us and a person will help.</small><a class="btn" href={base}>Go to Help</a></div>
	{:else}
		{#each [['Going on', live], ['Solved', done]] as const as [label, list] (label)}
			{#if list.length}
				<section class="tl-sec rv">
					<h2>{label} <small>{list.length}</small></h2>
					<ul>
						{#each list as t (t.id)}
							<li>
								<a href="{base}/tickets/{t.id}" class:unread={t.user_unread}>
									<span class="tl-top"><span class="tl-st {STATUS[t.status].tone}"><i></i>{STATUS[t.status].label}</span><small>#{t.number} · {when(t.updated_at)}</small></span>
									<b>{t.subject}</b>
									<small class="tl-last">{t.last ? `${t.last.from_team ? 'Miracle: ' : 'You: '}${t.last.body}` : topicLabel(t.category)}</small>
									{#if t.user_unread}<em>New reply</em>{/if}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.tl {
		display: grid;
		gap: 20px;
		max-width: 760px;
		padding-bottom: 20px;
	}
	.tl-h {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px;
	}
	.tl-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tl-h h1 {
		margin: 4px 0 0;
		font: 400 36px/1.05 var(--f-serif, Georgia, serif);
	}
	.tl-h h1 em {
		font-style: italic;
		background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 4px;
	}
	.tl-sec {
		display: grid;
		gap: 10px;
	}
	.tl-sec h2 {
		display: flex;
		gap: 8px;
		align-items: baseline;
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tl-sec ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.tl-sec a {
		position: relative;
		display: grid;
		gap: 5px;
		padding: 16px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		text-decoration: none;
	}
	.tl-sec a.unread {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g2) 55%, var(--line)), 0 16px 36px -28px var(--g2);
	}
	.tl-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.tl-top small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.tl-st {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tl-st i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
	}
	.tl-st.hot i {
		background: var(--g2);
	}
	.tl-st.ok i {
		background: var(--ok);
	}
	.tl-sec b {
		font: 400 20px/1.2 var(--f-serif, Georgia, serif);
	}
	.tl-last {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 13px;
		color: var(--ink-3);
	}
	.tl-sec em {
		justify-self: start;
		padding: 3px 8px;
		border-radius: 99px;
		background: var(--g2);
		color: #fff;
		font-size: 10.5px;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.tl-empty {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 44px 20px;
		border: 1px dashed var(--line-strong, var(--line));
		border-radius: 22px;
		text-align: center;
		color: var(--ink-3);
	}
	.tl-empty > :global(.ic) {
		width: 28px;
		height: 28px;
	}
	.tl-empty b {
		font: 400 24px/1.2 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.tl-empty small {
		max-width: 36ch;
		margin-bottom: 8px;
	}
</style>
