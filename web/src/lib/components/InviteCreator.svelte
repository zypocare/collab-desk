<script lang="ts">
	import { portal } from '../portal';
	import { addToPool, inviteText } from '../campaigns.svelte';
	import { auth } from '../auth.svelte';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// A creator who isn't on Miracle: the brand types their Instagram handle and sends them the invite
	// from its own Instagram or WhatsApp. The handle joins the pool, and becomes the creator once they join.
	let { pool, poolName = '', campaign = '', onclose }: { pool: string; poolName?: string; campaign?: string; onclose: () => void } = $props();
	let handle = $state('');
	let added = '';
	const clean = $derived(handle.trim().replace(/^@+/, '').toLowerCase());
	const valid = $derived(/^[a-z0-9._]{1,30}$/.test(clean));
	const company = $derived(auth.account?.role === 'brand' ? (auth.account.brand?.name ?? auth.account.companies?.[0]?.name ?? '') : '');
	const text = $derived(inviteText(company, clean || 'yourname', campaign));

	async function ensureAdded() {
		if (!valid) {
			toast('Type their Instagram handle first.', 'alert');
			return false;
		}
		if (added === clean) return true;
		try {
			const skipped = await addToPool(pool, [], [clean]);
			added = clean;
			if (!skipped) toast(`@${clean} is in ${poolName || 'the pool'}`, 'check');
			return true;
		} catch (e) {
			toast(errMessage(e), 'alert');
			return false;
		}
	}
	async function copy() {
		if (await ensureAdded()) copyText(text, 'Invite copied. Send it to them on Instagram or WhatsApp.');
	}
	async function instagram() {
		if (!(await ensureAdded())) return;
		copyText(text, 'Invite copied. Paste it in your message to them.');
		window.open(`https://ig.me/m/${clean}`, '_blank', 'noopener');
	}
	async function whatsapp() {
		if (await ensureAdded()) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
	}
</script>

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ic-d" role="dialog" aria-modal="true" aria-labelledby="ic-title">
		<button class="ic-x" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		<span class="ic-eb">Not on Miracle yet</span>
		<h2 id="ic-title">Invite a creator{#if poolName} to <em>{poolName}</em>{/if}</h2>
		<label class="ic-l" for="ic-h">Their Instagram</label>
		<div class="ic-in"><span>@</span><input id="ic-h" bind:value={handle} placeholder="handle" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="31" /></div>
		<p class="ic-msg">{text}</p>
		<div class="ic-acts">
			<button class="ic-neo ic-grad" onclick={copy}>Copy message</button>
			<button class="ic-neo ic-ghost" onclick={instagram}>Open Instagram</button>
			<button class="ic-neo ic-ghost" onclick={whatsapp}>WhatsApp</button>
		</div>
		<p class="ic-note">You send it from your own Instagram or WhatsApp. When they join Miracle with this handle, they show up in your pool and can get your campaigns.</p>
	</div>
</div>

<style>
	.ic-d {
		position: relative;
		width: min(560px, calc(100vw - 32px));
		display: grid;
		gap: 14px;
		padding: 28px;
		border-radius: 24px;
		background:
			radial-gradient(120% 70% at 0% 0%, color-mix(in oklab, var(--g2) 14%, transparent), transparent 60%),
			var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			0 40px 80px -30px rgba(0, 0, 0, 0.8);
	}
	.ic-x {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--ink-3);
		cursor: pointer;
	}
	.ic-eb,
	.ic-l {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ic-d h2 {
		margin: 0;
		font-size: 26px;
		line-height: 1.15;
	}
	.ic-d h2 em {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
	}
	.ic-in {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 54px;
		padding: 0 14px;
		background: color-mix(in oklab, var(--ink) 4%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.ic-in:focus-within {
		box-shadow:
			inset 0 0 0 1.5px var(--g2),
			4px 4px 0 var(--g2);
	}
	.ic-in span {
		color: var(--ink-3);
	}
	.ic-in input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		outline: 0;
		color: var(--ink);
		font: 600 17px/1 var(--f-body);
	}
	.ic-msg {
		margin: 0;
		padding: 14px 16px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ink) 4%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line);
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.ic-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.ic-neo {
		height: 48px;
		padding: 0 18px;
		border: 0;
		cursor: pointer;
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.ic-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 4px 4px 0 #6a4bc9;
	}
	.ic-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			4px 4px 0 var(--line);
	}
	.ic-neo:hover {
		transform: translate(-2px, -2px);
	}
	.ic-neo:active {
		transform: translate(4px, 4px);
		box-shadow: none;
	}
	.ic-note {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-3);
	}
	@media (max-width: 560px) {
		.ic-d {
			padding: 22px 18px;
		}
		.ic-neo {
			flex: 1 1 100%;
		}
	}
</style>
