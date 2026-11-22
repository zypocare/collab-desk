<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getApprovalLink, respondApprovalLink, type ApprovalLink } from '#lib/brandOs.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	const token = $derived(page.params.token ?? '');
	let link = $state<ApprovalLink | null>(null);
	let loaded = $state(false);
	let error = $state('');
	let name = $state('');
	let note = $state('');
	let busy = $state(false);

	onMount(async () => {
		try {
			link = await getApprovalLink(token);
		} catch (e) {
			error = errMessage(e);
		} finally {
			loaded = true;
		}
	});

	async function decide(status: 'approved' | 'changes_requested') {
		if (!name.trim()) return toast('Enter your name first', 'alert');
		busy = true;
		try {
			link = await respondApprovalLink(token, status, name.trim(), note.trim());
			toast(status === 'approved' ? 'Approved! Brand team notified.' : 'Feedback sent to the brand team.', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{link ? `${link.title} · Approval` : 'Client Approval'} · Miracle</title></svelte:head>

<div class="ap-page">
	<div class="ap-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
		{:else if error || !link}
			<section class="ap-card">
				<span class="ap-eb">Miracle Approval</span>
				<h1>Link not found</h1>
				<p class="ap-sub">{error || 'This approval link may have expired or been removed.'}</p>
			</section>
		{:else}
			<section class="ap-vault" class:ok={link.status === 'approved'}>
				<div class="ap-top">
					<div>
						<span class="ap-eb">{link.brand_name || 'Miracle Brand'} · {link.kind === 'draft' ? 'Draft Sign-Off' : 'Creator Shortlist'}</span>
						<h1>{link.title}</h1>
					</div>
					<span class="ap-pill" class:ok={link.status === 'approved'} class:warn={link.status === 'changes_requested'}>
						{link.status === 'approved' ? 'Approved' : link.status === 'changes_requested' ? 'Edits Requested' : 'Awaiting Sign-Off'}
					</span>
				</div>
				{#if link.summary}<p class="ap-sub">{link.summary}</p>{/if}

				{#if link.items?.length}
					<div class="ap-items">
						{#each link.items as it, i (i)}
							<div class="ap-item">
								<div><b>{it.label}</b><small>{it.meta}</small></div>
								{#if it.value}<span class="ap-val">{it.value}</span>{/if}
							</div>
						{/each}
					</div>
				{/if}

				{#if link.status !== 'pending'}
					<div class="ap-done">
						<b>{link.status === 'approved' ? 'Approved' : 'Changes requested'} by {link.reviewer_name}</b>
						{#if link.reviewer_note}<p>“{link.reviewer_note}”</p>{/if}
					</div>
				{:else}
					<div class="ap-form">
						<input class="ap-inp" type="text" placeholder="Your full name (e.g. Founder / Client)" bind:value={name} disabled={busy} />
						<textarea class="ap-ta" rows="2" placeholder="Optional note or feedback…" bind:value={note} disabled={busy}></textarea>
						<div class="ap-btns">
							<button type="button" class="ap-grad" onclick={() => decide('approved')} disabled={busy || !name.trim()}>
								<Icon name="check" />Approve in 1 tap
							</button>
							<button type="button" class="ap-soft" onclick={() => decide('changes_requested')} disabled={busy || !name.trim()}>
								Request changes
							</button>
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>

<style>
	.ap-page { min-height: 100vh; background: #0d0a0e; color: #faf7fc; padding: 28px 16px; }
	.ap-wrap { max-width: 560px; margin: 0 auto; }
	.ap-vault, .ap-card {
		border-radius: 24px; padding: 22px;
		background: linear-gradient(165deg, #211626 0%, #141017 100%);
		border: 1px solid rgba(255, 255, 255, 0.14);
		display: grid; gap: 14px;
	}
	.ap-vault.ok { border-color: rgba(60, 226, 155, 0.45); }
	.ap-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.ap-eb {
		display: inline-block; font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em; text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; -webkit-text-fill-color: transparent;
	}
	h1 { margin: 4px 0 0; font: 400 30px/1.08 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.ap-sub { margin: 0; font-size: 13.5px; color: #cfc6d6; line-height: 1.5; }
	.ap-pill {
		padding: 4px 10px; border-radius: 999px; font: 700 10px/1 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase; background: rgba(156, 123, 255, 0.16); color: #d2c2ff; white-space: nowrap;
	}
	.ap-pill.ok { background: rgba(60, 226, 155, 0.16); color: #3ce29b; }
	.ap-pill.warn { background: rgba(255, 184, 92, 0.16); color: #ffb85c; }
	.ap-items { display: grid; gap: 8px; }
	.ap-item {
		display: flex; align-items: center; justify-content: space-between; gap: 10px;
		padding: 12px; border-radius: 14px; background: rgba(13, 10, 14, 0.65); border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.ap-item b { display: block; font-size: 14px; }
	.ap-item small { display: block; font-size: 12px; color: #8f8499; }
	.ap-val { font: 700 14px/1 var(--f-mono, ui-monospace, monospace); color: #ffae6b; }
	.ap-form { display: grid; gap: 10px; }
	.ap-inp, .ap-ta {
		width: 100%; padding: 12px 14px; box-sizing: border-box; border-radius: 12px;
		background: rgba(12, 9, 14, 0.9); border: 1px solid rgba(255, 255, 255, 0.16);
		color: #faf7fc; font: 400 15px/1.35 var(--f-body, system-ui, sans-serif); outline: none;
	}
	.ap-btns { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
	.ap-grad {
		min-height: 46px; padding: 0 18px; border: 0; border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14; font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.08em; text-transform: uppercase;
		display: inline-flex; align-items: center; justify-content: center; gap: 7px;
		box-shadow: 3px 3px 0 0 #5b3b99; cursor: pointer;
	}
	.ap-grad:disabled { opacity: 0.45; cursor: not-allowed; }
	.ap-soft {
		min-height: 46px; padding: 0 14px; border-radius: 10px;
		background: #241c27; border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc; font: 700 12px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.ap-done { padding: 14px; border-radius: 14px; background: rgba(60, 226, 155, 0.1); border: 1px solid rgba(60, 226, 155, 0.35); }
	.ap-done p { margin: 6px 0 0; color: #cfc6d6; font-size: 13px; }
</style>
