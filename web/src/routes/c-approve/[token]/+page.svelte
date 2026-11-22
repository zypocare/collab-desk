<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getCreatorLink, respondCreatorLink, type CreatorApprovalLink } from '#lib/creatorOs.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	const token = $derived(page.params.token ?? '');
	let link = $state<CreatorApprovalLink | null>(null);
	let loaded = $state(false);
	let error = $state('');
	let name = $state('');
	let note = $state('');
	let busy = $state(false);

	onMount(async () => {
		try {
			link = await getCreatorLink(token);
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
			link = await respondCreatorLink(token, status, name.trim(), note.trim());
			toast(status === 'approved' ? 'Confirmed! Creator notified.' : 'Feedback sent to creator.', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{link ? `${link.title} · ${link.creator_name}` : 'Brand Approval'} · Miracle</title></svelte:head>

<div class="ca-page">
	<div class="ca-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
		{:else if error || !link}
			<section class="ca-vault">
				<span class="ca-eb">Miracle Creator Link</span>
				<h1>Link not found</h1>
				<p class="ca-sub">{error || 'This approval link may have expired.'}</p>
			</section>
		{:else}
			<section class="ca-vault" class:ok={link.status === 'approved'}>
				<div class="ca-top">
					<div>
						<span class="ca-eb">{link.creator_name || 'Creator'} → {link.brand_name} · {link.kind === 'draft' ? 'Draft Approval' : '1-Tap Smart Contract'}</span>
						<h1>{link.title}</h1>
					</div>
					<span class="ca-pill" class:ok={link.status === 'approved'} class:warn={link.status === 'changes_requested'}>
						{link.status === 'approved' ? 'Confirmed' : link.status === 'changes_requested' ? 'Edits Requested' : 'Awaiting Brand'}
					</span>
				</div>

				{#if link.fee_text}
					<div class="ca-row"><span>Agreed Fee</span><b>{link.fee_text}</b></div>
				{/if}
				{#if link.terms_summary}
					<div class="ca-box"><small>Terms &amp; ASCI Summary</small><p>{link.terms_summary}</p></div>
				{/if}
				{#if link.draft_url}
					<a class="ca-link" href={link.draft_url} target="_blank" rel="noopener"><Icon name="eye" />Open Draft Link</a>
				{/if}

				{#if link.status !== 'pending'}
					<div class="ca-done">
						<b>{link.status === 'approved' ? 'Approved & signed' : 'Changes requested'} by {link.signer_name}</b>
						{#if link.signer_note}<p>“{link.signer_note}”</p>{/if}
					</div>
				{:else}
					<div class="ca-form">
						<input class="ca-inp" type="text" placeholder="Your full name & role (Brand Manager)" bind:value={name} disabled={busy} />
						<textarea class="ca-ta" rows="2" placeholder="Optional note or edit request…" bind:value={note} disabled={busy}></textarea>
						<div class="ca-btns">
							<button type="button" class="ca-grad" onclick={() => decide('approved')} disabled={busy || !name.trim()}>
								<Icon name="check" />{link.kind === 'draft' ? 'Approve Draft' : 'Accept & Sign Contract'}
							</button>
							<button type="button" class="ca-soft" onclick={() => decide('changes_requested')} disabled={busy || !name.trim()}>
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
	.ca-page { min-height: 100vh; background: #0d0a0e; color: #faf7fc; padding: 28px 16px; }
	.ca-wrap { max-width: 560px; margin: 0 auto; }
	.ca-vault {
		border-radius: 24px; padding: 22px;
		background: linear-gradient(165deg, #211626 0%, #141017 100%);
		border: 1px solid rgba(255, 255, 255, 0.14);
		display: grid; gap: 14px;
	}
	.ca-vault.ok { border-color: rgba(60, 226, 155, 0.45); }
	.ca-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.ca-eb {
		display: inline-block; font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em; text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
	}
	h1 { margin: 4px 0 0; font: 400 30px/1.08 var(--f-serif, Georgia, serif); }
	.ca-sub { margin: 0; font-size: 13.5px; color: #cfc6d6; }
	.ca-pill {
		padding: 4px 10px; border-radius: 999px; font: 700 10px/1 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase; background: rgba(156, 123, 255, 0.16); color: #d2c2ff; white-space: nowrap;
	}
	.ca-pill.ok { background: rgba(60, 226, 155, 0.16); color: #3ce29b; }
	.ca-pill.warn { background: rgba(255, 184, 92, 0.16); color: #ffb85c; }
	.ca-row { display: flex; justify-content: space-between; padding: 11px 13px; border-radius: 13px; background: rgba(13, 10, 14, 0.65); border: 1px solid rgba(255, 255, 255, 0.08); }
	.ca-row span { color: #8f8499; font-size: 12.5px; }
	.ca-row b { font: 700 15px/1 var(--f-mono, ui-monospace, monospace); color: #ffae6b; }
	.ca-box { padding: 13px; border-radius: 14px; background: rgba(13, 10, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); }
	.ca-box small { display: block; font: 700 10px/1 var(--f-mono, ui-monospace, monospace); text-transform: uppercase; color: #8f8499; margin-bottom: 5px; }
	.ca-box p { margin: 0; font-size: 13px; color: #cfc6d6; line-height: 1.5; white-space: pre-wrap; }
	.ca-link { display: inline-flex; align-items: center; gap: 6px; color: #f25a90; font-weight: 700; font-size: 13px; text-decoration: none; }
	.ca-form { display: grid; gap: 10px; }
	.ca-inp, .ca-ta {
		width: 100%; padding: 12px 14px; box-sizing: border-box; border-radius: 12px;
		background: rgba(12, 9, 14, 0.9); border: 1px solid rgba(255, 255, 255, 0.16);
		color: #faf7fc; font: 400 15px/1.35 var(--f-body, system-ui, sans-serif); outline: none;
	}
	.ca-btns { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
	.ca-grad {
		min-height: 46px; padding: 0 18px; border: 0; border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14; font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.08em; text-transform: uppercase;
		display: inline-flex; align-items: center; justify-content: center; gap: 7px;
		box-shadow: 3px 3px 0 0 #5b3b99; cursor: pointer;
	}
	.ca-grad:disabled { opacity: 0.45; cursor: not-allowed; }
	.ca-soft {
		min-height: 46px; padding: 0 14px; border-radius: 10px;
		background: #241c27; border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc; font: 700 12px/1 var(--f-body, system-ui, sans-serif); cursor: pointer;
	}
	.ca-done { padding: 14px; border-radius: 14px; background: rgba(60, 226, 155, 0.1); border: 1px solid rgba(60, 226, 155, 0.35); }
	.ca-done p { margin: 6px 0 0; color: #cfc6d6; font-size: 13px; }
</style>
