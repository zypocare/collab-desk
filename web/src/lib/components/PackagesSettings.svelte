<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { deletePackage, savePackage, studio } from '../studio.svelte';
	import type { Package, PackageItem } from '../types';
	import { rateValue } from '../priority';
	import { KINDS, inr, offeredKinds, packageOffered } from '../util';
	import Icon from './Icon.svelte';

	const s = $derived(studio.settings!);
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim();
	const round = (n: number) => Math.round(n / 500) * 500;

	function qtyOf(p: Package, kind: string) {
		return p.items.find((i) => i.kind === kind)?.qty ?? 0;
	}
	function setQty(p: Package, kind: string, d: number) {
		const q = Math.max(0, Math.min(9, qtyOf(p, kind) + d));
		const items: PackageItem[] = KINDS.map((k) => ({ kind: k, qty: k === kind ? q : qtyOf(p, k) })).filter((i) => i.qty > 0);
		savePackage({ id: p.id, items });
	}
	const saving = (p: Package) => {
		const r = rateValue(p.items, s.rates);
		return r > p.price && p.price > 0 ? Math.round((1 - p.price / r) * 100) : 0;
	};

	// A sensible starting set from her rate card, a little cheaper than booking each piece.
	function starterSet() {
		const r = (items: PackageItem[], off: number) => round(rateValue(items, s.rates) * (1 - off)) || 0;
		const sets: { name: string; description: string; items: PackageItem[]; off: number; badge: string }[] = [
			{ name: 'Story bundle', description: 'Quick awareness across a day of Stories.', items: [{ kind: 'Story', qty: 3 }], off: 0.1, badge: '' },
			{ name: 'Launch pack', description: 'A Reel plus Stories to drive people to it.', items: [{ kind: 'Reel', qty: 1 }, { kind: 'Story', qty: 3 }], off: 0.1, badge: 'Most booked' },
			{ name: 'Full campaign', description: 'Two Reels, a carousel and a week of Stories.', items: [{ kind: 'Reel', qty: 2 }, { kind: 'Carousel', qty: 1 }, { kind: 'Story', qty: 5 }], off: 0.15, badge: 'Best value' }
		];
		for (const p of sets) savePackage({ name: p.name, description: p.description, items: p.items, price: r(p.items, p.off), badge: p.badge, active: true });
	}
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Packages</h2><small>bundles brands can book in one tap</small></div>
	<div class="pk-list">
		{#each studio.packages as p (p.id)}
			{@const off = saving(p)}
			<div class="pk-edit" class:off={!p.active}>
				<div class="pk-row">
					<input class="inp pk-name" aria-label="Package name" value={p.name} onchange={(e) => savePackage({ id: p.id, name: val(e) || p.name })} />
					<input type="checkbox" class="tgl" checked={p.active} aria-label="Show {p.name} on your page" onchange={(e) => savePackage({ id: p.id, active: (e.currentTarget as HTMLInputElement).checked })} />
					<button class="icon-btn sm" aria-label="Delete {p.name}" onclick={async () => (await ask({ title: `Delete “${p.name}”?`, body: 'Brands will no longer see it on your page. Requests already made with it stay as they are.', ok: 'Delete', danger: true })) && deletePackage(p.id)}><Icon name="x" /></button>
				</div>
				<input class="inp pk-desc" aria-label="Short description" placeholder="One line for brands" value={p.description} onchange={(e) => savePackage({ id: p.id, description: val(e) })} />
				<div class="pk-items">
					{#each offeredKinds(s.offered_kinds) as k (k)}
						<div class="pk-item" class:on={qtyOf(p, k) > 0}>
							<span>{k}</span>
							<div class="stepper sm">
								<button type="button" onclick={() => setQty(p, k, -1)} aria-label="One less {k}">−</button>
								<output>{qtyOf(p, k)}</output>
								<button type="button" onclick={() => setQty(p, k, 1)} aria-label="One more {k}">+</button>
							</div>
						</div>
					{/each}
				</div>
				<div class="pk-row">
					<div class="pre pk-price"><span>₹</span><input class="inp num" type="number" inputmode="numeric" min="0" aria-label="Price" value={p.price || ''} onchange={(e) => savePackage({ id: p.id, price: Math.max(0, Number(val(e)) || 0) })} /></div>
					<input class="inp pk-badge" aria-label="Badge" placeholder="Badge, e.g. Most booked" maxlength="20" value={p.badge} onchange={(e) => savePackage({ id: p.id, badge: val(e) })} />
				</div>
				{#if !packageOffered(p.items, s.offered_kinds)}<p class="hint" style="color:var(--warn)">Includes content you've switched off, so brands can't see this package.</p>{/if}
				<p class="hint">Rate card value {inr(rateValue(p.items, s.rates))}{off ? ` · brands save ${off}%` : ''}</p>
			</div>
		{:else}
			<div class="pk-empty">
				<p>No packages yet. Packages raise the average booking and make it easy for brands to say yes.</p>
				<button class="btn grad" onclick={starterSet}><Icon name="spark" />Add a starter set</button>
			</div>
		{/each}
	</div>
	<div class="row-btns">
		<button class="btn sm" onclick={() => savePackage({ name: 'New package', items: [{ kind: 'Reel', qty: 1 }], price: s.rates?.Reel ?? 0, active: false })}><Icon name="plus" />New package</button>
		{#if studio.packages.length}<span class="hint" style="align-self:center">Switched-off packages stay hidden from brands.</span>{/if}
	</div>
</section>
