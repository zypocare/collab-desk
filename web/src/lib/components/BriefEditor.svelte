<script lang="ts">
	import type { BriefDetails } from '../types';
	import { parseTags } from '../util';

	// The structured brief. Used on the brand's request form and in her studio.
	let { value = $bindable({}), idp = 'bf', onchange }: { value?: BriefDetails; idp?: string; onchange?: (v: BriefDetails) => void } = $props();

	let tagsText = $state((value.hashtags ?? []).join(' '));
	let mentionsText = $state((value.mentions ?? []).join(' '));

	function set(patch: Partial<BriefDetails>) {
		value = { ...value, ...patch };
		onchange?.(value);
	}
	const txt = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

<div class="fields brief-ed">
	<div class="f span2">
		<label for="{idp}-msg">Key message</label>
		<textarea class="inp" id="{idp}-msg" rows="2" placeholder="The one thing people should remember" value={value.message ?? ''} onchange={(e) => set({ message: txt(e) })}></textarea>
	</div>
	<div class="f">
		<label for="{idp}-tags">Hashtags to include</label>
		<input class="inp" id="{idp}-tags" placeholder="#GlowWithLumiere #VitaminC" bind:value={tagsText} onchange={() => set({ hashtags: parseTags(tagsText, '#') })} />
		{#if value.hashtags?.length}<div class="tag-chips">{#each value.hashtags as t (t)}<span>{t}</span>{/each}</div>{/if}
	</div>
	<div class="f">
		<label for="{idp}-men">Accounts to tag</label>
		<input class="inp" id="{idp}-men" placeholder="@brand @campaignpage" bind:value={mentionsText} onchange={() => set({ mentions: parseTags(mentionsText, '@') })} />
		{#if value.mentions?.length}<div class="tag-chips">{#each value.mentions as t (t)}<span>{t}</span>{/each}</div>{/if}
	</div>
	<div class="f span2">
		<label for="{idp}-link">Link to share <span class="hint">(optional)</span></label>
		<input class="inp" id="{idp}-link" inputmode="url" placeholder="https://" value={value.link ?? ''} onchange={(e) => set({ link: txt(e) })} />
	</div>
	<div class="f">
		<label for="{idp}-dos">Do's</label>
		<textarea class="inp" id="{idp}-dos" rows="3" placeholder="Show the texture, morning routine" value={value.dos ?? ''} onchange={(e) => set({ dos: txt(e) })}></textarea>
	</div>
	<div class="f">
		<label for="{idp}-donts">Don'ts</label>
		<textarea class="inp" id="{idp}-donts" rows="3" placeholder="No medical claims, no competitor products in frame" value={value.donts ?? ''} onchange={(e) => set({ donts: txt(e) })}></textarea>
	</div>
	<div class="f span2">
		<label for="{idp}-refs">References <span class="hint">(links to posts you like)</span></label>
		<textarea class="inp" id="{idp}-refs" rows="2" value={value.references ?? ''} onchange={(e) => set({ references: txt(e) })}></textarea>
	</div>
</div>
