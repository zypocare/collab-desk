<script lang="ts">
	import { tick } from 'svelte';
	import { initials } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { supabase } from '../supabase.ts';
	import Icon from '../Icon.svelte';

	// Ctrl K: find any creator, brand login, workspace, company, collab, invoice or ticket, or jump to a screen.
	let { open = $bindable(false), screens }: { open?: boolean; screens: { label: string; href: string }[] } = $props();

	type Item = { title: string; sub?: string; meta?: string; href: string; ini: string; color: string };
	type Group = { label: string; items: Item[] };
	let q = $state('');
	let groups = $state<Group[]>([]);
	let busy = $state(false);
	let hi = $state(0);
	let input = $state<HTMLInputElement>();

	const COLOR: Record<string, string> = { creator: '#1d6b45', brand_login: '#1c539f', workspace: '#2e2a33', brand: '#c2416f', collab: '#5b34c4', invoice: '#7a4f00', ticket: '#6b6570' };
	function to(kind: string, x: Record<string, any>): string {
		if (kind === 'creator') return href('creators', x.id);
		if (kind === 'brand_login') return href('brand-logins', x.id);
		if (kind === 'workspace') return href('workspaces', x.id);
		if (kind === 'brand') return href('brands');
		if ((kind === 'collab' || kind === 'invoice') && x.creator) return href('creators', x.creator);
		if (kind === 'ticket') return href('support');
		return href('dashboard');
	}

	const screenGroup = $derived.by((): Group | null => {
		const t = q.trim().toLowerCase();
		const list = screens.filter((s) => !t || s.label.toLowerCase().includes(t)).slice(0, t ? 4 : 8);
		return list.length ? { label: 'Go to', items: list.map((s) => ({ title: s.label, href: s.href, ini: '→', color: '#8e8594' })) } : null;
	});
	const all = $derived([...(screenGroup ? [screenGroup] : []), ...groups]);
	const flat = $derived(all.flatMap((g) => g.items));

	let asked = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onInput() {
		hi = 0;
		clearTimeout(timer);
		const t = q.trim();
		if (t.length < 2) {
			groups = [];
			return;
		}
		timer = setTimeout(async () => {
			const n = ++asked;
			busy = true;
			const { data } = await supabase.rpc('admin_search', { p_q: t });
			if (n !== asked) return;
			busy = false;
			groups = ((data as { kind: string; label: string; items: Record<string, any>[] }[]) ?? []).map((g) => ({
				label: g.label,
				items: g.items.map((x) => ({ title: x.title, sub: x.sub, meta: x.meta, href: to(g.kind, x), ini: g.kind === 'collab' ? 'CO' : g.kind === 'invoice' ? 'IN' : g.kind === 'ticket' ? '#' : initials(x.title), color: COLOR[g.kind] ?? '#6b6570' }))
			}));
		}, 220);
	}
	$effect(() => {
		if (open) {
			q = '';
			groups = [];
			hi = 0;
			tick().then(() => input?.focus());
		}
	});
	function pick(i: Item) {
		open = false;
		location.hash = i.href.slice(1);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			hi = Math.min(flat.length - 1, hi + 1);
			document.getElementById(`pal-${hi}`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			hi = Math.max(0, hi - 1);
			document.getElementById(`pal-${hi}`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter' && flat[hi]) {
			e.preventDefault();
			pick(flat[hi]);
		}
	}
	const indexOf = (it: Item) => flat.indexOf(it);
</script>

{#if open}
	<div class="pal-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = false)}>
		<div class="pal" role="dialog" aria-modal="true" aria-label="Search everything">
			<label class="pal-in">
				<Icon name="search" />
				<span class="sr">Search everything</span>
				<input bind:this={input} type="search" placeholder="Search creators, brand logins, workspaces, collabs, invoices, tickets…" bind:value={q} oninput={onInput} onkeydown={onKey}
					role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={flat[hi] ? `pal-${hi}` : undefined} />
				{#if busy}<span class="spinner muted"></span>{/if}
				<kbd>Esc</kbd>
			</label>
			<div class="pal-list" id="pal-list" role="listbox">
				{#each all as g (g.label)}
					<div class="grp">{g.label}</div>
					{#each g.items as it (it.href + it.title)}
						{@const i = indexOf(it)}
						<a id="pal-{i}" role="option" aria-selected={i === hi} class="res" class:hi={i === hi} href={it.href} onclick={(e) => { e.preventDefault(); pick(it); }} onmousemove={() => (hi = i)}>
							<span class="ico" style:background={it.color}>{it.ini}</span>
							<span class="rt"><b>{it.title}</b>{#if it.sub}<small>{it.sub}</small>{/if}</span>
							{#if it.meta}<span class="mono muted meta">{it.meta}</span>{/if}
						</a>
					{/each}
				{/each}
				{#if q.trim().length >= 2 && !busy && !groups.length}<div class="none">Nothing matches “{q.trim()}”.</div>{/if}
			</div>
			<div class="pal-f"><span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
		</div>
	</div>
{/if}

<style>
	.pal-scrim { position: fixed; inset: 0; z-index: 70; background: rgba(23, 19, 27, .42); display: flex; justify-content: center; align-items: flex-start; padding: 9vh 16px 16px; }
	.pal { width: 100%; max-width: 660px; background: var(--surface); border-radius: 12px; box-shadow: 0 24px 60px rgba(23, 19, 27, .3); overflow: hidden; animation: rise .15s both; }
	.pal-in { display: flex; align-items: center; gap: 10px; padding: 0 16px; height: 52px; border-bottom: 1px solid var(--line); color: var(--accent); }
	.pal-in input { flex: 1; min-width: 0; border: 0; outline: none; font-size: 15px; color: var(--ink); background: none; }
	kbd { font: 500 11px var(--f-mono); color: var(--ink-3); border: 1px solid var(--line-strong); border-radius: 4px; padding: 1px 6px; }
	.pal-list { max-height: min(520px, 62vh); overflow: auto; padding: 4px 6px 8px; }
	.grp { font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); padding: 12px 12px 4px; }
	.res { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 7px; color: var(--ink); text-decoration: none; }
	.res:hover { text-decoration: none; color: var(--ink); }
	.res.hi { background: var(--accent-soft); }
	.ico { width: 28px; height: 28px; border-radius: 7px; color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 600; flex: none; }
	.rt { flex: 1; min-width: 0; display: grid; }
	.rt b { font-weight: 500; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rt small { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.meta { font-size: 11.5px; }
	.none { padding: 16px 12px; color: var(--ink-3); font-size: 13px; }
	.pal-f { display: flex; flex-wrap: wrap; gap: 16px; padding: 9px 16px; border-top: 1px solid var(--line); background: var(--surface-2); font-size: 12px; color: var(--ink-3); }
</style>
