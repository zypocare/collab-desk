<script lang="ts">
	import Logo from './Logo.svelte';
	import type { Session } from '@supabase/supabase-js';
	import { tick } from 'svelte';
	import { errMessage, supabase, turnstileSiteKey } from './supabase.ts';
	import Icon from './Icon.svelte';

	// Email-code sign-in, the same steps and words as the app's Sign in.
	let { onsignedin }: { onsignedin: (s: Session) => void } = $props();

	type Turnstile = { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove?: (id: string) => void };

	let step = $state<'email' | 'code'>('email');
	let email = $state('');
	let code = $state('');
	let busy = $state(false);
	let error = $state('');
	let captchaToken = $state('');
	let resendIn = $state(0);
	let tsBox = $state<HTMLElement>();
	let tsId = '';
	let codeInput = $state<HTMLInputElement>();

	// The check box (only when a Turnstile key is set), drawn whenever the email step shows.
	$effect(() => {
		const el = tsBox;
		if (!el || !turnstileSiteKey) return;
		const w = window as unknown as { turnstile?: Turnstile; onTurnstileLoad?: () => void };
		const draw = () => {
			if (!w.turnstile || !el.isConnected) return;
			tsId = w.turnstile.render(el, { sitekey: turnstileSiteKey, callback: (t: string) => (captchaToken = t), 'expired-callback': () => (captchaToken = ''), theme: 'light' });
		};
		if (w.turnstile) draw();
		else {
			w.onTurnstileLoad = draw;
			if (!document.querySelector('script[data-ts]')) {
				const s = document.createElement('script');
				s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
				s.async = true;
				s.dataset.ts = '1';
				document.head.appendChild(s);
			}
		}
		return () => {
			if (tsId) w.turnstile?.remove?.(tsId);
			tsId = '';
			captchaToken = '';
		};
	});

	function startTimer() {
		resendIn = 45;
		const t = setInterval(() => {
			resendIn--;
			if (resendIn <= 0) clearInterval(t);
		}, 1000);
	}

	async function sendCode(e?: SubmitEvent) {
		e?.preventDefault();
		error = '';
		const addr = email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return (error = 'Enter a valid email, like name@miracleapp.live.');
		if (turnstileSiteKey && !captchaToken) return (error = 'Please complete the check above first.');
		busy = true;
		const { error: err } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, captchaToken: captchaToken || undefined } });
		busy = false;
		if (err) {
			const w = window as unknown as { turnstile?: Turnstile };
			if (tsId) w.turnstile?.reset(tsId);
			captchaToken = '';
			error = err.status === 429 ? 'Too many codes asked for. Please wait a minute and try again.' : errMessage(err);
			return;
		}
		email = addr;
		step = 'code';
		startTimer();
		await tick();
		codeInput?.focus();
	}

	async function verify(e?: SubmitEvent) {
		e?.preventDefault();
		error = '';
		const token = code.replace(/\D/g, '');
		if (token.length !== 6) return (error = 'Enter the 6-digit code from the email.');
		busy = true;
		const { data, error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' }).catch((x) => ({ data: { session: null }, error: x as Error }));
		busy = false;
		if (err || !data.session) return (error = 'That code is wrong or has expired. Check the latest email or send a new code.');
		onsignedin(data.session);
	}

	// Sign in as soon as all 6 digits are typed (once per code).
	let tried = '';
	$effect(() => {
		const token = code.replace(/\D/g, '');
		if (step === 'code' && token.length === 6 && token !== tried) {
			tried = token;
			verify();
		}
	});
</script>

<header class="lg-top">
	<Logo /><b>Miracle</b><small>Admin</small>
</header>

<div class="lg-wrap">
	<div class="lg-card">
		<span class="lg-ic"><Icon name={step === 'email' ? 'shield' : 'check'} /></span>
		{#if step === 'email'}
			<h1>Sign <em class="gt">in</em></h1>
			<p class="lead">Enter your email and we'll send you a 6-digit code. No password needed.</p>
			<form onsubmit={sendCode} novalidate>
				<div class="f">
					<label for="email">Email address</label>
					<input class="inp" id="email" type="email" inputmode="email" autocomplete="email" placeholder="name@miracleapp.live" bind:value={email} />
				</div>
				{#if turnstileSiteKey}<div class="ts-box" bind:this={tsBox}></div>{/if}
				{#if error}<div class="err">{error}</div>{/if}
				<button class="neo grad lg" type="submit" disabled={busy}>
					{#if busy}<span class="spinner"></span>Sending code…{:else}<Icon name="send" />Send code{/if}
				</button>
			</form>
		{:else}
			<h1>Check your <em class="gt">email</em></h1>
			<p class="lead">We sent a 6-digit code to <b>{email}</b>. It works for one hour.</p>
			<form onsubmit={verify} novalidate>
				<div class="f">
					<label for="code">Code</label>
					<input class="inp code" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" bind:value={code} bind:this={codeInput} />
				</div>
				{#if error}<div class="err">{error}</div>{/if}
				<button class="neo grad lg" type="submit" disabled={busy}>
					{#if busy}<span class="spinner"></span>Checking…{:else}Sign in{/if}
				</button>
				<div class="lg-alt">
					<button type="button" class="lnk" onclick={() => ((step = 'email'), (code = ''), (error = ''))}>Use another email</button>
					{#if resendIn > 0}
						<span>Send again in {resendIn}s</span>
					{:else}
						<button type="button" class="lnk" onclick={() => ((step = 'email'), (code = ''))}>Send a new code</button>
					{/if}
				</div>
			</form>
		{/if}
	</div>
</div>

<style>
	.lg-top { display: flex; align-items: center; gap: 10px; padding: 14px var(--gut); border-bottom: 1px solid var(--line); }
	.lg-top b { font-family: var(--f-display); font-size: 18px; letter-spacing: -.03em; }
	.lg-top small { font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3); padding: 3px 8px; border: 1px solid var(--line-strong); }
	.lg-wrap { min-height: calc(100vh - 64px); display: grid; place-items: center; padding: 32px 16px; }
	.lg-card { width: min(440px, 100%); padding: 30px 28px 26px; background: var(--surface); border: 1px solid var(--line); animation: rise .5s both; }
	.lg-ic { width: 46px; height: 46px; display: grid; place-items: center; color: #fff; background: var(--grad); border-radius: 10px; }
	.lg-ic :global(.ic) { width: 22px; height: 22px; stroke-width: 2; }
	h1 { margin: 20px 0 6px; font-family: var(--f-serif); font-weight: 400; font-size: 40px; letter-spacing: -.01em; }
	.lead { color: var(--ink-2); margin-bottom: 22px; }
	.lead b { color: var(--ink); word-break: break-word; }
	form { display: flex; flex-direction: column; gap: 14px; }
	.code { height: 56px; font: 600 26px var(--f-mono); letter-spacing: .4em; text-align: center; }
	.ts-box { min-height: 66px; display: flex; justify-content: center; }
	.lg-alt { display: flex; justify-content: space-between; gap: 10px; font-size: 14.5px; color: var(--ink-3); }
	@media (max-width: 480px) {
		.lg-card { padding: 24px 20px; }
	}
</style>
