<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import type { Settings } from '../types';
	import { copyText, toast } from '../ui.svelte';
	import { INDIAN_STATES } from '../invoice';
	import Icon from './Icon.svelte';

	const s = $derived(studio.settings!);
	const webhook = $derived(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bank-alert`);
	let errors = $state<Record<string, string>>({});
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;

	const RULES: Partial<Record<keyof Settings, [RegExp, string]>> = {
		pan: [/^([A-Z]{5}[0-9]{4}[A-Z])?$/, 'A PAN has 10 characters, like ABCDE1234F.'],
		gstin: [/^([0-9]{2}[A-Z0-9]{13})?$/, 'A GSTIN has 15 characters, like 29ABCDE1234F1Z5.'],
		upi_id: [/^([\w.-]{2,}@[a-zA-Z][\w.-]*)?$/, 'A UPI ID looks like name@okicici.'],
		invoice_prefix: [/^[A-Z0-9]{1,6}$/, 'Use 1 to 6 capital letters or numbers, like INV.']
	};
	function set(key: keyof Settings, raw: string) {
		const v = ['pan', 'gstin', 'invoice_prefix'].includes(key) ? raw.trim().toUpperCase() : key === 'upi_id' ? raw.trim() : raw;
		const rule = RULES[key];
		if (rule && !rule[0].test(v)) {
			errors[key] = rule[1];
			return;
		}
		errors[key] = '';
		saveSettings({ [key]: v } as Partial<Settings>);
	}
</script>

<section class="panel rv" style="--i:6">
	<div class="panel-h"><h2>Billing and invoices</h2><small>printed on every invoice</small></div>
	<div class="form-b">
		<div class="f span2"><label for="bl-name">Name on invoices</label><input class="inp" id="bl-name" value={s.legal_name} placeholder={s.display_name} onchange={(e) => set('legal_name', val(e))} /></div>
		<div class="f"><label for="bl-pan">PAN</label><input class="inp" id="bl-pan" value={s.pan} placeholder="ABCDE1234F" onchange={(e) => set('pan', val(e))} />{#if errors.pan}<div class="err">{errors.pan}</div>{/if}</div>
		<div class="f">
			<label for="bl-state">State</label>
			<select class="inp" id="bl-state" value={s.state} onchange={(e) => set('state', val(e))}><option value="">Choose</option>{#each INDIAN_STATES as st (st)}<option value={st}>{st}</option>{/each}</select>
		</div>
		<div class="f span2"><label for="bl-addr">Address</label><textarea class="inp" id="bl-addr" rows="2" value={s.address} onchange={(e) => set('address', val(e))}></textarea></div>
		<div class="f"><label for="bl-upi">UPI ID</label><input class="inp" id="bl-upi" value={s.upi_id} placeholder="name@okicici" onchange={(e) => set('upi_id', val(e))} />{#if errors.upi_id}<div class="err">{errors.upi_id}</div>{/if}</div>
		<div class="f"><label for="bl-prefix">Invoice number prefix</label><input class="inp" id="bl-prefix" value={s.invoice_prefix} onchange={(e) => set('invoice_prefix', val(e))} />{#if errors.invoice_prefix}<div class="err">{errors.invoice_prefix}</div>{:else}<p class="hint" style="margin-top:5px">Numbers look like {s.invoice_prefix}/26-27/001</p>{/if}</div>
		<div class="f span2"><label for="bl-bank">Bank details for transfers</label><textarea class="inp" id="bl-bank" rows="3" placeholder={'Account name\nBank and branch\nA/c number · IFSC'} value={s.bank_details} onchange={(e) => set('bank_details', val(e))}></textarea></div>
		<div class="f span2"><label for="bl-foot">Line at the bottom of invoices</label><input class="inp" id="bl-foot" value={s.invoice_footer} onchange={(e) => set('invoice_footer', val(e))} /></div>
	</div>
	<div class="switch-row">
		<div><b>Registered for GST</b><small>Turn on if you have a GSTIN. Invoices then add CGST + SGST (same state) or IGST (other states).</small></div>
		<input type="checkbox" class="tgl" checked={s.gst_registered} aria-label="Registered for GST" onchange={(e) => saveSettings({ gst_registered: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	{#if s.gst_registered}
		<div class="form-b" style="padding-top:0">
			<div class="f"><label for="bl-gstin">GSTIN</label><input class="inp" id="bl-gstin" value={s.gstin} onchange={(e) => set('gstin', val(e))} />{#if errors.gstin}<div class="err">{errors.gstin}</div>{/if}</div>
			<div class="f"><label for="bl-rate">GST rate</label><select class="inp" id="bl-rate" value={String(s.gst_rate)} onchange={(e) => saveSettings({ gst_rate: Number(val(e)) })}><option value="18">18%</option><option value="12">12%</option><option value="5">5%</option></select></div>
			<div class="f"><label for="bl-sac">SAC code <span class="hint">(ask your accountant)</span></label><input class="inp" id="bl-sac" value={s.sac_code} onchange={(e) => set('sac_code', val(e))} /></div>
		</div>
	{/if}
	<div class="switch-row">
		<div><b>Payment reminders</b><small>Polite emails to brands 2 days before the due date, on the day, then 3, 7 and 14 days late. You can turn them off per invoice.</small></div>
		<input type="checkbox" class="tgl" checked={s.reminders_enabled} aria-label="Payment reminders" onchange={(e) => { const on = (e.currentTarget as HTMLInputElement).checked; saveSettings({ reminders_enabled: on }); toast(on ? 'Payment reminders on' : 'Payment reminders off'); }} />
	</div>
	<div class="switch-row" style="flex-wrap:wrap">
		<div style="min-width:220px">
			<b>Match bank credits automatically</b>
			<small>A small Google script reads your bank's "credited" emails and marks the right invoice as paid. Setup takes 5 minutes (see the setup guide, "Bank alerts").</small>
		</div>
		<button class="btn sm" onclick={() => copyText(webhook, 'Address copied')}><Icon name="copy" />Address</button>
		<button class="btn sm" onclick={() => copyText(s.inbox_token, 'Private key copied. Keep it secret.')}><Icon name="copy" />Private key</button>
	</div>
</section>
