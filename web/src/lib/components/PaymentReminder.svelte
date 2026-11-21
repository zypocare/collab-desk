<script lang="ts">
	import type { Collab } from '../types';
	import { inr, outstanding, waShare } from '../util';
	import { openOutside } from '../native';
	import { copyText } from '../ui.svelte';
	import Icon from './Icon.svelte';

	let { c }: { c: Collab } = $props();
	let tone = $state('Polite');
	const message = $derived.by(() => {
		const name = c.contact_name?.trim().split(/\s+/)[0] || c.brand.name;
		const amount = inr(outstanding(c));
		const invoice = c.invoices.find(i => i.public_token && ['sent', 'partly_paid'].includes(i.status));
		const link = invoice ? location.origin + '/invoice/' + invoice.public_token : location.origin + '/t/' + c.track_token;
		const request = tone === 'Final' ? 'Please confirm when you can clear the remaining ' + amount + '.'
			: tone === 'Firm' ? 'Please arrange payment of the outstanding ' + amount + '.'
			: 'Just checking in on the remaining ' + amount + '.';
		return 'Hi ' + name + ', ' + request + ' Here are the details for ' + c.code + ': ' + link;
	});
</script>

<details class="reminder">
	<summary>Payment reminder</summary>
	<div class="tones" role="group" aria-label="Reminder tone">{#each ['Polite', 'Firm', 'Final'] as label (label)}<button aria-pressed={label === tone} onclick={() => tone = label}>{label}</button>{/each}</div>
	<p>{message}</p>
	<button class="btn sm" onclick={() => { copyText(message, 'Reminder copied'); openOutside(waShare(c.contact_phone || '', message)); }}><Icon name="send" />Share on WhatsApp</button>
</details>

<style>
	.reminder{margin:12px 0;padding:0 12px 8px;border:1px solid var(--line);border-radius:12px}
	summary{padding:12px 0 6px;color:var(--ink);cursor:pointer;font-weight:650}
	.tones{display:flex;gap:6px;margin-top:8px}.tones button{min-height:40px;flex:1;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px}
	.tones button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
	p{overflow-wrap:anywhere;color:var(--ink-2);font-size:14px;line-height:1.5}
</style>
