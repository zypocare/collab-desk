<script lang="ts">
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import { firstName } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// From the "your files are ready" email: download page, no sign-in.
	type F = { id: string; label: string; url: string; file_path: string | null; file_type: string; size: number };
	type Info = { state: 'open' | 'expired' | 'missing'; code: string; brand: string; creator: string; files: F[] };
	let info = $state<Info | null>(null);
	let urls = $state<Record<string, string>>({});

	$effect(() => {
		supabase.rpc('files_info', { p_token: page.params.token }).then(async ({ data, error }) => {
			info = error ? ({ state: 'missing' } as Info) : (data as Info);
			for (const f of info?.files ?? []) {
				if (!f.file_path) continue;
				const { data: s } = await supabase.storage.from('deliveries').createSignedUrl(f.file_path, 60 * 60 * 6, { download: f.label });
				if (s) urls[f.id] = s.signedUrl;
			}
		});
	});
	const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
	const got = (f: F) => supabase.rpc('file_downloaded', { p_token: page.params.token, p_file: f.id });
</script>

<svelte:head><title>Your files</title></svelte:head>

<header class="topbar">
	<a class="brandmark" href="/" aria-label="Miracle home"><span class="ring"><span></span></span><b>{info?.creator ? `Collaborate with ${firstName(info.creator)}` : ''}</b></a>
</header>

<div class="page"><div class="wrap act-wrap">
	{#if !info}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if info.state !== 'open'}
		<div class="empty-card">
			<h2>{info.state === 'expired' ? 'This link has expired' : 'This link is not valid'}</h2>
			<p>{info.state === 'expired' ? 'Ask for the files again, or open your request page.' : 'Check that you copied the whole link from the email.'}</p>
		</div>
	{:else}
		<header class="ph rv">
			<div>
				<div class="eb">{info.brand} · <span class="id">{info.code}</span></div>
				<h1>Your <em>files</em></h1>
				<p>From {info.creator}. Download each one below.</p>
			</div>
		</header>
		<section class="panel rv" style="--i:1">
			{#each info.files as f (f.id)}
				{@const href = f.file_path ? urls[f.id] : f.url}
				<div class="fdl-row">
					<span class="set-ic"><Icon name={f.file_path ? (f.file_type.startsWith('image') ? 'eye' : 'film') : 'link'} /></span>
					<div><b>{f.label}</b><small>{f.file_path ? size(f.size) : 'Link'}</small></div>
					{#if href}<a class="btn sm grad" {href} target="_blank" rel="noopener" onclick={() => got(f)}><Icon name={f.file_path ? 'arrow' : 'link'} />{f.file_path ? 'Download' : 'Open'}</a>{:else}<span class="spinner"></span>{/if}
				</div>
			{:else}
				<p class="hint" style="padding:20px;margin:0">No files here yet.</p>
			{/each}
		</section>
	{/if}
</div></div>
