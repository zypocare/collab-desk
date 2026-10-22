<script lang="ts">
	import { tick } from 'svelte';
	import { auth, refreshAccount } from '#lib/auth.svelte.ts';
	import { supabase, turnstileSiteKey } from '#lib/supabase.ts';
	import { errMessage } from '#lib/util.ts';

	// Step 1: creator or brand, then the email and its 6-digit code (the same sign-in as everywhere).
	let { as = $bindable() }: { as: 'creator' | 'brand' } = $props();

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

	// The bot check is drawn whenever the email step is on screen.
	$effect(() => {
		const el = tsBox;
		if (!el || !turnstileSiteKey) return;
		const w = window as unknown as { turnstile?: Turnstile; onTurnstileLoad?: () => void };
		const draw = () => {
			if (!w.turnstile || !el.isConnected) return;
			tsId = w.turnstile.render(el, {
				sitekey: turnstileSiteKey,
				callback: (t: string) => (captchaToken = t),
				'expired-callback': () => (captchaToken = ''),
				theme: 'auto'
			});
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
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return (error = 'Enter a valid email, like name@gmail.com.');
		if (turnstileSiteKey && !captchaToken) return (error = 'Please complete the check above first.');
		busy = true;
		const { error: err } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, captchaToken: captchaToken || undefined } });
		busy = false;
		captchaToken = '';
		if (tsId) (window as unknown as { turnstile?: Turnstile }).turnstile?.reset(tsId);
		if (err) return (error = err.status === 429 ? 'Too many codes asked for. Please wait a minute and try again.' : errMessage(err));
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
		if (err || !data.session) {
			busy = false;
			return (error = 'That code is wrong or has expired. Check the latest email or send a new code.');
		}
		auth.session = data.session;
		await Promise.race([refreshAccount().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
		busy = false;
	}

	// Signs in as soon as all 6 digits are typed (once per code).
	let tried = '';
	$effect(() => {
		const token = code.replace(/\D/g, '');
		if (step === 'code' && token.length === 6 && token !== tried) {
			tried = token;
			verify();
		}
	});
</script>

{#if step === 'email'}
	<form class="su-card" onsubmit={sendCode} novalidate>
		<div style="display:grid;gap:8px">
			<h1 class="su-h1">Join <em>Miracle</em></h1>
			<p class="su-lead">First, who are you joining as?</p>
		</div>
		<fieldset class="su-as">
			<legend class="sr-only">Join as</legend>
			<label style="--c:var(--g2)">
				<input type="radio" name="su-as" value="creator" bind:group={as} />
				<b>A creator</b>
				<span>Run my brand collabs. We review your profile first.</span>
			</label>
			<label style="--c:var(--g1)">
				<input type="radio" name="su-as" value="brand" bind:group={as} />
				<b>A brand</b>
				<span>Work with creators. Start straight away.</span>
			</label>
		</fieldset>
		<div class="su-f">
			<label for="su-email">{as === 'brand' ? 'Your work email' : 'Your email'}</label>
			<input class="su-in" id="su-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" bind:value={email} />
			<small>We'll send a 6-digit code. No password needed.</small>
		</div>
		{#if turnstileSiteKey}<div bind:this={tsBox}></div>{/if}
		{#if error}<p class="su-err" role="alert">{error}</p>{/if}
		<button class="su-neo su-go su-block" disabled={busy}>{busy ? 'Sending…' : 'Send my code'}</button>
		<span class="su-terms">By continuing you agree to Miracle's <a href="https://www.miracleapp.live/privacy" target="_blank" rel="noopener">privacy policy</a>.</span>
	</form>
{:else}
	<form class="su-card" onsubmit={verify} novalidate>
		<div style="display:grid;gap:8px">
			<h1 class="su-h1">Check your <em>email</em></h1>
			<p class="su-lead">We sent a 6-digit code to <b>{email}</b>.</p>
		</div>
		<div class="su-f">
			<label for="su-code">6-digit code</label>
			<input class="su-in su-code" id="su-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" bind:value={code} bind:this={codeInput} />
		</div>
		{#if error}<p class="su-err" role="alert">{error}</p>{/if}
		<button class="su-neo su-go su-block" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
		<div class="su-row">
			<button type="button" class="su-link" onclick={() => ((step = 'email'), (code = ''), (error = ''))}>Use another email</button>
			{#if resendIn > 0}<span class="su-hint">New code in {resendIn}s</span>{:else}<button type="button" class="su-link" onclick={() => ((step = 'email'), (code = ''))}>Send a new code</button>{/if}
		</div>
	</form>
{/if}
