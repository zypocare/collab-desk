<script lang="ts">
	import { onMount } from 'svelte';
	import {
		brandSignContract,
		creatorSignContract,
		DEFAULT_ASCI,
		EXCL_OPTS,
		fmtIst,
		loadSmartContract,
		openSmartContractPrint,
		PAYOUT_OPTS,
		REV_OPTS,
		USAGE_OPTS,
		type AsciRule,
		type SmartContract
	} from '../smartContract';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	let {
		code,
		role,
		brandName,
		creatorName,
		deliverables = '',
		feeText = '',
		defaultSigner = ''
	}: {
		code: string;
		role: 'brand' | 'creator';
		brandName: string;
		creatorName: string;
		deliverables?: string;
		feeText?: string;
		defaultSigner?: string;
	} = $props();

	let contract = $state<SmartContract | null>(null);
	let loaded = $state(false);
	let busy = $state(false);
	let editing = $state(false);

	// Form state
	let usage = $state<string>(USAGE_OPTS[1]);
	let exclusivity = $state<string>(EXCL_OPTS[2]);
	let revisions = $state<number>(2);
	let payout = $state<string>(PAYOUT_OPTS[0]);
	let asci = $state<AsciRule[]>(DEFAULT_ASCI.map((a) => ({ ...a })));
	let signer = $state('');

	$effect(() => {
		if (!signer && defaultSigner) signer = defaultSigner;
	});

	function hydrate(sc: SmartContract | null) {
		contract = sc;
		if (!sc) return;
		usage = sc.usage_terms || USAGE_OPTS[1];
		exclusivity = sc.exclusivity || EXCL_OPTS[2];
		revisions = sc.revision_rounds || 2;
		payout = sc.payout_terms || PAYOUT_OPTS[0];
		if (Array.isArray(sc.asci_rules) && sc.asci_rules.length) {
			asci = sc.asci_rules.map((a) => ({ ...a }));
		}
	}

	onMount(async () => {
		try {
			hydrate(await loadSmartContract(code));
		} catch {
			// Table may not be migrated yet or collab has no contract yet.
		} finally {
			loaded = true;
		}
	});

	const brandSigned = $derived(!!contract?.brand_signed_at);
	const creatorSigned = $derived(!!contract?.creator_signed_at);
	const executed = $derived(brandSigned && creatorSigned);
	const requiredAsci = $derived(asci.filter((a) => a.required));
	const allCreatorChecked = $derived(requiredAsci.every((a) => a.creator_ok));

	async function onBrandSign() {
		if (!signer.trim()) return toast('Enter authorized signatory name', 'alert');
		busy = true;
		try {
			const res = await brandSignContract({
				code,
				usage,
				exclusivity,
				revisions,
				payout,
				asci,
				signer: signer.trim()
			});
			hydrate(res);
			editing = false;
			toast('Smart contract signed & sent to creator', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}

	async function onCreatorSign() {
		if (!signer.trim()) return toast('Enter your full name to countersign', 'alert');
		if (!allCreatorChecked) return toast('Tick all required ASCI disclosure checks first', 'alert');
		busy = true;
		try {
			const res = await creatorSignContract({ code, asci, signer: signer.trim() });
			hydrate(res);
			toast('Contract countersigned & locked', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}

	function toggleBrandAsci(id: string) {
		asci = asci.map((a) => (a.id === id ? { ...a, required: !a.required } : a));
	}

	function toggleCreatorAsci(id: string) {
		asci = asci.map((a) => (a.id === id ? { ...a, creator_ok: !a.creator_ok } : a));
	}

	function printPdf() {
		if (!contract) return;
		const ok = openSmartContractPrint({ code, brandName, creatorName, deliverables, feeText, contract });
		if (!ok) toast('Allow pop-ups to download the Agreement PDF', 'alert');
	}
</script>

{#if loaded}
	<section class="sc-vault" class:executed aria-label="Smart contract and ASCI checklist">
		<header class="sc-top">
			<div>
				<span class="sc-eb">Smart Contract &amp; ASCI · {code}</span>
				<h3 class="sc-h">
					{#if executed}Executed Agreement{:else if brandSigned}Awaiting Creator Countersign{:else}1-Tap Smart Contract{/if}
				</h3>
			</div>
			<span class="sc-pill" class:ok={executed} class:warn={brandSigned && !creatorSigned}>
				{#if executed}Executed{:else if brandSigned}Pending{:else}{requiredAsci.length}/{asci.length} ASCI{/if}
			</span>
		</header>

		{#if executed && !editing && contract}
			<!-- Dual-signed executed certificate -->
			<div class="sc-summary">
				<div><span>Usage rights</span><b>{contract.usage_terms}</b></div>
				<div><span>Exclusivity</span><b>{contract.exclusivity}</b></div>
				<div><span>Revisions</span><b>{contract.revision_rounds} round{contract.revision_rounds === 1 ? '' : 's'}</b></div>
				<div><span>Payment</span><b>{contract.payout_terms}</b></div>
				<div><span>ASCI disclosure</span><b>{requiredAsci.length} rules confirmed</b></div>
			</div>

			<div class="sc-sigs">
				<div class="sc-sig">
					<small>Brand Signatory</small>
					<b>{contract.brand_signed_name}</b>
					<span>{fmtIst(contract.brand_signed_at)}</span>
				</div>
				<div class="sc-sig">
					<small>Creator Signatory</small>
					<b>{contract.creator_signed_name}</b>
					<span>{fmtIst(contract.creator_signed_at)}</span>
				</div>
			</div>

			<div class="sc-foot">
				<button type="button" class="sc-grad-btn" onclick={printPdf}><Icon name="download" />Download Agreement PDF</button>
				{#if contract.audit_hash}
					<button type="button" class="sc-soft-btn" onclick={() => copyText(contract!.audit_hash!, 'Audit hash copied')}>Copy hash</button>
				{/if}
			</div>
		{:else if role === 'brand'}
			{#if brandSigned && !editing && contract}
				<div class="sc-summary">
					<div><span>Usage rights</span><b>{contract.usage_terms}</b></div>
					<div><span>Exclusivity</span><b>{contract.exclusivity}</b></div>
					<div><span>Revisions</span><b>{contract.revision_rounds} round{contract.revision_rounds === 1 ? '' : 's'}</b></div>
					<div><span>Payment</span><b>{contract.payout_terms}</b></div>
					<div><span>Signed by</span><b>{contract.brand_signed_name} · {fmtIst(contract.brand_signed_at)}</b></div>
				</div>
				<div class="sc-foot">
					<button type="button" class="sc-soft-btn" onclick={() => (editing = true)}>Edit terms</button>
					<button type="button" class="sc-soft-btn" onclick={printPdf}><Icon name="download" />Preview PDF</button>
				</div>
			{:else}
				<!-- Brand 1-Tap Clause Configurator -->
				<div class="sc-block">
					<span class="sc-lbl">Usage &amp; Paid Ad Rights</span>
					<div class="sc-chips">
						{#each USAGE_OPTS as opt (opt)}
							<button type="button" class="sc-chip" class:on={usage === opt} onclick={() => (usage = opt)}>{opt}</button>
						{/each}
					</div>
				</div>

				<div class="sc-block">
					<span class="sc-lbl">Category Exclusivity</span>
					<div class="sc-chips">
						{#each EXCL_OPTS as opt (opt)}
							<button type="button" class="sc-chip" class:on={exclusivity === opt} onclick={() => (exclusivity = opt)}>{opt}</button>
						{/each}
					</div>
				</div>

				<div class="sc-two">
					<div class="sc-block">
						<span class="sc-lbl">Revisions Included</span>
						<div class="sc-chips">
							{#each REV_OPTS as n (n)}
								<button type="button" class="sc-chip" class:on={revisions === n} onclick={() => (revisions = n)}>{n} round{n === 1 ? '' : 's'}</button>
							{/each}
						</div>
					</div>
					<div class="sc-block">
						<span class="sc-lbl">Payment Trigger</span>
						<div class="sc-chips">
							{#each PAYOUT_OPTS as opt (opt)}
								<button type="button" class="sc-chip" class:on={payout === opt} onclick={() => (payout = opt)}>{opt}</button>
							{/each}
						</div>
					</div>
				</div>

				<div class="sc-block">
					<span class="sc-lbl">ASCI (India) Disclosure Checklist</span>
					<div class="sc-asci-list">
						{#each asci as item (item.id)}
							<button type="button" class="sc-asci" class:checked={item.required} onclick={() => toggleBrandAsci(item.id)}>
								<span class="sc-chk">{#if item.required}<Icon name="check" />{/if}</span>
								<span class="sc-asci-t">
									<b>{item.title} <em>{item.code}</em></b>
									<small>{item.desc}</small>
								</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="sc-sign">
					<input class="sc-inp" type="text" placeholder="Authorized signatory name" bind:value={signer} disabled={busy} />
					<button type="button" class="sc-grad-btn" onclick={onBrandSign} disabled={busy || !signer.trim()}>
						{#if busy}<span class="spinner"></span>Signing…{:else}<Icon name="check" />Sign &amp; Send to {creatorName || 'Creator'}{/if}
					</button>
				</div>
			{/if}
		{:else}
			<!-- Creator View -->
			{#if !brandSigned || !contract}
				<p class="sc-note">No smart contract sent yet. Once {brandName} sets terms and signs, you can review the ASCI checklist and countersign here in 1 tap.</p>
			{:else}
				<div class="sc-summary">
					<div><span>Usage rights</span><b>{contract.usage_terms}</b></div>
					<div><span>Exclusivity</span><b>{contract.exclusivity}</b></div>
					<div><span>Revisions</span><b>{contract.revision_rounds} round{contract.revision_rounds === 1 ? '' : 's'}</b></div>
					<div><span>Payment</span><b>{contract.payout_terms}</b></div>
					<div><span>Brand signed</span><b>{contract.brand_signed_name}</b></div>
				</div>

				<div class="sc-block">
					<span class="sc-lbl">Confirm Mandatory ASCI Disclosures ({requiredAsci.filter((a) => a.creator_ok).length}/{requiredAsci.length})</span>
					<div class="sc-asci-list">
						{#each requiredAsci as item (item.id)}
							<button type="button" class="sc-asci" class:checked={item.creator_ok} onclick={() => toggleCreatorAsci(item.id)}>
								<span class="sc-chk">{#if item.creator_ok}<Icon name="check" />{/if}</span>
								<span class="sc-asci-t">
									<b>{item.title} <em>{item.code}</em></b>
									<small>{item.desc}</small>
								</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="sc-sign">
					<input class="sc-inp" type="text" placeholder="Type your full name to countersign" bind:value={signer} disabled={busy} />
					<button type="button" class="sc-grad-btn" onclick={onCreatorSign} disabled={busy || !allCreatorChecked || !signer.trim()}>
						{#if busy}<span class="spinner"></span>Countersigning…{:else if !allCreatorChecked}Tick all {requiredAsci.length} ASCI checks to sign{:else}<Icon name="check" />Accept &amp; Countersign Deal{/if}
					</button>
				</div>
			{/if}
		{/if}
	</section>
{/if}

<style>
	@property --sc-rim {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes scSpin {
		to { --sc-rim: 360deg; }
	}

	.sc-vault {
		position: relative;
		border-radius: 22px;
		padding: 17px;
		margin: 14px 0;
		background:
			radial-gradient(110% 85% at 92% 0%, rgba(242, 90, 144, 0.16), transparent 60%),
			radial-gradient(90% 80% at 8% 100%, rgba(156, 123, 255, 0.14), transparent 60%),
			linear-gradient(165deg, #1f1625 0%, #141017 100%);
		display: grid;
		gap: 14px;
		color: #faf7fc;
		z-index: 1;
	}
	.sc-vault::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.5px;
		background: conic-gradient(from var(--sc-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.08) 48%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: scSpin 10s linear infinite;
	}
	.sc-vault.executed::before {
		background: conic-gradient(from var(--sc-rim), #3ce29b, #2dd4bf, #3ce29b);
	}

	.sc-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.sc-eb {
		display: inline-block;
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.sc-h { margin: 3px 0 0; font: 400 24px/1.1 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.sc-pill {
		padding: 4px 10px;
		border-radius: 999px;
		font: 700 9.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: rgba(156, 123, 255, 0.16);
		border: 1px solid rgba(156, 123, 255, 0.35);
		color: #d2c2ff;
		white-space: nowrap;
	}
	.sc-pill.warn { background: rgba(255, 184, 92, 0.16); border-color: rgba(255, 184, 92, 0.38); color: #ffb85c; }
	.sc-pill.ok { background: rgba(60, 226, 155, 0.16); border-color: rgba(60, 226, 155, 0.38); color: #3ce29b; }

	.sc-block { display: grid; gap: 7px; }
	.sc-two { display: grid; grid-template-columns: 1fr; gap: 12px; }
	@media (min-width: 680px) { .sc-two { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	.sc-lbl {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #8f8499;
	}
	.sc-chips { display: flex; flex-wrap: wrap; gap: 7px; }
	.sc-chip {
		padding: 8px 11px;
		border-radius: 10px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #cfc6d6;
		font: 600 12px/1.1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.sc-chip.on {
		background: #faf7fc;
		color: #140e16;
		border-color: #faf7fc;
		box-shadow: 0 2.5px 0 0 #f25a90;
	}

	.sc-asci-list { display: grid; gap: 8px; }
	.sc-asci {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border-radius: 13px;
		background: rgba(13, 10, 14, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.09);
		color: #faf7fc;
		text-align: left;
		cursor: pointer;
	}
	.sc-asci.checked {
		background: rgba(60, 226, 155, 0.08);
		border-color: rgba(60, 226, 155, 0.4);
	}
	.sc-chk {
		width: 19px;
		height: 19px;
		border-radius: 6px;
		border: 1.5px solid #8f8499;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		margin-top: 1px;
		color: #0d0a0e;
	}
	.sc-asci.checked .sc-chk { background: #3ce29b; border-color: #3ce29b; }
	.sc-chk :global(.ic) { width: 13px; height: 13px; stroke-width: 2.6; }
	.sc-asci-t b { display: block; font-size: 12.5px; line-height: 1.3; margin-bottom: 2px; }
	.sc-asci-t em {
		font-style: normal;
		padding: 1px 6px;
		margin-left: 4px;
		border-radius: 5px;
		background: rgba(156, 123, 255, 0.16);
		color: #d2c2ff;
		font: 700 10px/1 var(--f-mono, ui-monospace, monospace);
	}
	.sc-asci-t small { display: block; font-size: 11.5px; color: #8f8499; line-height: 1.35; }

	.sc-summary { display: grid; gap: 2px; padding: 12px 14px; border-radius: 14px; background: rgba(12, 9, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); }
	.sc-summary > div { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.08); font-size: 12.5px; }
	.sc-summary > div:last-child { border-bottom: 0; }
	.sc-summary span { color: #8f8499; }
	.sc-summary b { color: #faf7fc; text-align: right; }

	.sc-sigs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.sc-sig { padding: 12px; border-radius: 14px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(60, 226, 155, 0.25); display: grid; gap: 3px; }
	.sc-sig small { font: 700 9.5px/1 var(--f-mono, ui-monospace, monospace); text-transform: uppercase; letter-spacing: 0.08em; color: #8f8499; }
	.sc-sig b { font: italic 400 21px/1.1 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.sc-sig span { font: 500 10.5px/1.3 var(--f-mono, ui-monospace, monospace); color: #3ce29b; }

	.sc-sign { display: grid; gap: 10px; }
	.sc-inp {
		width: 100%;
		min-height: 46px;
		height: 46px;
		padding: 0 14px;
		box-sizing: border-box;
		border-radius: 12px;
		background: rgba(12, 9, 14, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.16);
		color: #faf7fc;
		font: 400 15px/1.3 var(--f-body, system-ui, sans-serif);
		outline: none;
	}
	.sc-inp:focus { border-color: #f25a90; }

	.sc-foot { display: flex; flex-wrap: wrap; gap: 10px; }
	.sc-grad-btn {
		flex: 1;
		min-height: 46px;
		padding: 0 16px;
		border: 0;
		border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14;
		font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		cursor: pointer;
		box-shadow: 3.5px 3.5px 0 0 #5b3b99;
	}
	.sc-grad-btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.sc-grad-btn :global(.ic) { width: 15px; height: 15px; }

	.sc-soft-btn {
		min-height: 42px;
		padding: 0 14px;
		border-radius: 10px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc;
		font: 700 12px/1 var(--f-body, system-ui, sans-serif);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.sc-soft-btn :global(.ic) { width: 14px; height: 14px; }
	.sc-note { margin: 0; font-size: 12.5px; color: #8f8499; line-height: 1.5; }
</style>
