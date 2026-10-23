<script lang="ts">
	import Logo from '#lib/components/Logo.svelte';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { auth, homeFor, refreshAccount } from '#lib/auth.svelte.ts';
	import { supabase, turnstileSiteKey } from '#lib/supabase.ts';
	import type { Account } from '#lib/types.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { passkeysHere } from '#lib/passkeys.ts';

	type Turnstile = {
		render: (el: HTMLElement, opts: Record<string, unknown>) => string;
		reset: (id?: string) => void;
	};

	const next = $derived(page.url.searchParams.get('next') || '');
	let step = $state<'email' | 'code'>('email');
	// Links can carry the email to use (from a tracking page): it's filled in for them.
	let email = $state(page.url.searchParams.get('email') ?? '');
	let code = $state('');
	let busy = $state(false);
	let error = $state('');
	let captchaToken = $state('');
	let resendIn = $state(0);
	let tsBox = $state<HTMLElement>();
	let tsId = '';
	let codeInput = $state<HTMLInputElement>();
	// A password instead of an email code, only for accounts that were given one (Meta's app reviewers,
	// who can't receive our codes). Reached with /login?pw=1; everyone else never sees it.
	const withPw = page.url.searchParams.get('pw') === '1';
	let password = $state('');

	// Already signed in? Go straight to the right area.
	let signingIn = false;
	$effect(() => {
		if (auth.session && auth.account && !signingIn) location.replace(targetFor(auth.account));
	});

	onMount(() => {
		if (!turnstileSiteKey) return;
		const w = window as unknown as { turnstile?: Turnstile; onTurnstileLoad?: () => void };
		const renderWidget = () => {
			if (!tsBox || !w.turnstile) return;
			tsId = w.turnstile.render(tsBox, {
				sitekey: turnstileSiteKey,
				callback: (t: string) => (captchaToken = t),
				'expired-callback': () => (captchaToken = ''),
				theme: 'auto'
			});
		};
		if (w.turnstile) renderWidget();
		else {
			w.onTurnstileLoad = renderWidget;
			const s = document.createElement('script');
			s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
			s.async = true;
			document.head.appendChild(s);
		}
	});

	function resetCaptcha() {
		captchaToken = '';
		const w = window as unknown as { turnstile?: Turnstile };
		if (tsId) w.turnstile?.reset(tsId);
	}

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
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
			error = 'Enter a valid email, like name@brand.com.';
			return;
		}
		if (turnstileSiteKey && !captchaToken) {
			error = 'Please complete the check above first.';
			return;
		}
		busy = true;
		const { error: err } = await supabase.auth.signInWithOtp({
			email: addr,
			options: { shouldCreateUser: true, captchaToken: captchaToken || undefined }
		});
		busy = false;
		resetCaptcha();
		if (err) {
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
		if (token.length !== 6) {
			error = 'Enter the 6-digit code from the email.';
			return;
		}
		busy = true;
		signingIn = true;
		const { data, error: err } = await supabase.auth
			.verifyOtp({ email, token, type: 'email' })
			.catch((x) => ({ data: { session: null }, error: x as Error }));
		if (err || !data.session) {
			busy = false;
			signingIn = false;
			error = 'That code is wrong or has expired. Check the latest email or send a new code.';
			return;
		}
		auth.session = data.session;
		// Who is this: the creator or a brand? Don't wait forever for the answer.
		const account = await Promise.race([
			refreshAccount().catch(() => null),
			new Promise<null>((r) => setTimeout(() => r(null), 8000))
		]);
		// A full page load, not an in-app jump: if the website was updated while this page was
		// open, the in-app jump would ask for files the old version had and get stuck.
		location.replace(targetFor(account));
	}

	async function signInPw(e?: SubmitEvent) {
		e?.preventDefault();
		error = '';
		if (!email.trim() || !password) {
			error = 'Enter the email and password you were given.';
			return;
		}
		busy = true;
		signingIn = true;
		const { data, error: err } = await supabase.auth
			.signInWithPassword({ email: email.trim(), password, options: captchaToken ? { captchaToken } : undefined })
			.catch((x) => ({ data: { session: null }, error: x as Error }));
		if (err || !data.session) {
			busy = false;
			signingIn = false;
			error = 'That email and password don’t match.';
			return;
		}
		auth.session = data.session;
		const account = await Promise.race([refreshAccount().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
		location.replace(targetFor(account));
	}

	// Fingerprint / face sign-in (a passkey made earlier on this device), no email code.
	const canPasskey = passkeysHere();
	async function withPasskey() {
		error = '';
		busy = true;
		signingIn = true;
		const { data, error: err } = await supabase.auth.signInWithPasskey().catch((x) => ({ data: { session: null, user: null }, error: x as Error }));
		if (err || !data?.session) {
			busy = false;
			signingIn = false;
			const m = String(err?.message ?? '');
			if (/cancel|abort|not allowed|timed out/i.test(m)) return;
			error = /disabled|not enabled|not found|404/i.test(m) ? "Fingerprint sign-in isn't switched on yet. Use the email code." : 'That didn’t work. Use the email code, then turn on fingerprint sign-in in Settings.';
			return;
		}
		auth.session = data.session;
		const account = await Promise.race([refreshAccount().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
		location.replace(targetFor(account));
	}

	// Where to land. A link to the other side's area (creator → /brand…) goes home instead.
	function targetFor(account: Account | null) {
		const home = homeFor(account);
		if (!next || !next.startsWith('/') || next.startsWith('//')) return home;
		if (account?.role === 'pending') return home;
		if (account?.role === 'creator' && next.startsWith('/brand')) return home;
		if (account?.role === 'brand' && next.startsWith('/studio')) return home;
		return next;
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

<svelte:head><title>Sign in · Miracle</title></svelte:head>

<!-- Sign in, in the website's look: Miracle on a glowing panel, the email-code card beside it. -->
<div class="lg">
	<div class="lg-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	<!-- Behind the card: the Miracle "m" drawing itself in light, again and again, and a few sparks. -->
	<svg class="lg-mark" viewBox="0 0 512 512" aria-hidden="true">
		<defs><linearGradient id="lg-mg" gradientUnits="userSpaceOnUse" x1="60" y1="100" x2="560" y2="440"><stop offset="0" stop-color="#9C7BFF" /><stop offset=".52" stop-color="#F25A90" /><stop offset="1" stop-color="#FFAE6B" /></linearGradient></defs>
		<g transform="translate(256 256) scale(.79) skewX(-13) translate(-304.5 -266)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="22">
			<path class="lg-m1" stroke="url(#lg-mg)" pathLength="1" d="M64 128C92 104 132 112 144 156C154 220 158 330 156 392C155 420 182 420 182 392C182 300 176 200 196 160C220 104 290 104 300 160C310 220 312 330 310 392C309 420 336 420 336 392C336 300 330 200 350 160C374 104 444 104 452 160C460 230 456 330 452 392C450 440 500 440 540 360M499 384L540 360L545 408" />
		</g>
	</svg>
	<div class="lg-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
	<aside class="lg-side">
		<a class="lg-brand" href="/" aria-label="Miracle home"><Logo size={40} /><b>Miracle</b></a>
		<div class="lg-pitch">
			<span class="lg-eb">Welcome back</span>
			<h2>Every collab, <em>handled.</em></h2>
			<ul>
				<li><i></i>Requests, quotes, drafts and invoices in one place</li>
				<li><i></i>Brands track their collab and pay the creator directly</li>
				<li><i></i>No passwords: a 6-digit code to your email</li>
			</ul>
		</div>
		<small class="lg-foot">Miracle never takes a cut of a deal.</small>
	</aside>

	<main class="lg-main">
		<a class="lg-brand lg-brand-sm" href="/" aria-label="Miracle home"><Logo size={34} /><b>Miracle</b></a>
		<div class="lg-card">
			{#if step === 'email'}
				<span class="lg-eb">Sign in</span>
				<h1>Your <em>email</em></h1>
				<p class="lg-lead">We'll send you a 6-digit code. No password needed.</p>
				<form onsubmit={withPw ? signInPw : sendCode} novalidate>
					<label class="lg-l" for="email">Email address</label>
					<input class="lg-in" id="email" type="email" inputmode="email" autocomplete="email" placeholder="name@brand.com" bind:value={email} />
					{#if withPw}
						<label class="lg-l" for="password">Password</label>
						<input class="lg-in" id="password" type="password" autocomplete="current-password" bind:value={password} />
					{/if}
					{#if turnstileSiteKey}<div class="ts-box" bind:this={tsBox}></div>{/if}
					{#if error}<div class="lg-err" role="alert">{error}</div>{/if}
					<button class="lg-neo lg-grad" type="submit" disabled={busy}>
						{#if withPw}{#if busy}<span class="spinner"></span>Signing in…{:else}Sign in{/if}{:else if busy}<span class="spinner"></span>Sending code…{:else}<Icon name="send" />Send code{/if}
					</button>
					{#if canPasskey}
						<button class="lg-neo lg-ghost" type="button" disabled={busy} onclick={withPasskey}><Icon name="shield" />Use fingerprint or face</button>
					{/if}
				</form>
			{:else}
				<span class="lg-eb">Check your email</span>
				<h1>Enter the <em>code</em></h1>
				<p class="lg-lead">We sent it to <b>{email}</b>. It works for one hour.</p>
				<form onsubmit={verify} novalidate>
					<label class="lg-l" for="code">6-digit code</label>
					<input
						class="lg-in lg-code"
						id="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						placeholder="······"
						bind:value={code}
						bind:this={codeInput}
					/>
					{#if error}<div class="lg-err" role="alert">{error}</div>{/if}
					<button class="lg-neo lg-grad" type="submit" disabled={busy}>
						{#if busy}<span class="spinner"></span>Checking…{:else}Sign in{/if}
					</button>
					<div class="lg-alt">
						<button type="button" class="lg-lnk" onclick={() => ((step = 'email'), (code = ''), (error = ''))}>Use another email</button>
						{#if resendIn > 0}
							<span>Send again in {resendIn}s</span>
						{:else}
							<button type="button" class="lg-lnk" onclick={() => ((step = 'email'), (code = ''))}>Send a new code</button>
						{/if}
					</div>
				</form>
			{/if}
		</div>
		{#if step === 'email' && !withPw}
			<div class="lg-join">
				<span class="lg-l">New to Miracle? Join free</span>
				<div class="lg-join-row">
					<a class="lg-neo lg-ghost lg-sm" href="/signup?as=creator"><Icon name="spark" />I'm a creator</a>
					<a class="lg-neo lg-ghost lg-sm" href="/signup?as=brand"><Icon name="box" />I'm a brand</a>
				</div>
			</div>
		{/if}
		<p class="lg-terms">By continuing you agree to Miracle's <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.</p>
	</main>
</div>

<style>
	/* Always the app's dark look, whatever theme the viewer picked. */
	.lg {
		--bg: #110d11; --surface: #1a151a; --surface-2: #231d23; --line: #2e262e; --line-2: #3e343e;
		--ink: #f4eef2; --ink-2: #c9bfc6; --ink-3: #a39aa1; --g1: #9c7bff; --g2: #f25a90; --g3: #ffae6b; --bad: #ff7b70;
		--grad: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3));
		--f-display: 'Instrument Serif', Georgia, serif;
		--f-ui: 'Geist', ui-sans-serif, system-ui, sans-serif;
		position: fixed;
		inset: 0;
		z-index: 30;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		overflow: auto;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--f-ui);
		isolation: isolate;
	}
	.lg-glow { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
	.lg-glow i { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.5; animation: lg-drift 18s ease-in-out infinite alternate; }
	.lg-glow i:nth-child(1) { width: 520px; height: 520px; left: -120px; top: -100px; background: var(--g1); }
	.lg-glow i:nth-child(2) { width: 460px; height: 460px; left: 22%; top: 30%; background: var(--g2); opacity: 0.35; animation-delay: -6s; }
	.lg-glow i:nth-child(3) { width: 320px; height: 320px; left: 8%; bottom: -120px; background: var(--g3); opacity: 0.22; animation-delay: -11s; }
	@keyframes lg-drift { to { transform: translate(60px, 40px) scale(1.08); } }
	.lg-mark { position: absolute; z-index: -1; left: 50%; top: 50%; width: min(150vmin, 980px); height: min(150vmin, 980px); transform: translate(-50%, -50%) rotate(-6deg); opacity: 0.34; filter: blur(0.5px) drop-shadow(0 0 30px rgba(242, 90, 144, 0.5)); pointer-events: none; }
	.lg-m1 { stroke-dasharray: 0.45 1.6; stroke-dashoffset: 1.6; animation: lg-trace 7s linear infinite; }
	@keyframes lg-trace { to { stroke-dashoffset: -0.45; } }
	.lg-sparks { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
	.lg-sparks i { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff; box-shadow: 0 0 10px 2px rgba(255, 174, 107, 0.7); opacity: 0; animation: lg-twinkle 5s ease-in-out infinite; }
	.lg-sparks i:nth-child(1) { left: 12%; top: 18%; animation-delay: -0.4s; }
	.lg-sparks i:nth-child(2) { left: 82%; top: 12%; animation-delay: -1.6s; }
	.lg-sparks i:nth-child(3) { left: 68%; top: 34%; animation-delay: -2.8s; }
	.lg-sparks i:nth-child(4) { left: 24%; top: 62%; animation-delay: -3.4s; }
	.lg-sparks i:nth-child(5) { left: 90%; top: 70%; animation-delay: -0.9s; }
	.lg-sparks i:nth-child(6) { left: 46%; top: 86%; animation-delay: -2.1s; }
	.lg-sparks i:nth-child(7) { left: 6%; top: 82%; animation-delay: -4.2s; }
	.lg-sparks i:nth-child(8) { left: 56%; top: 6%; animation-delay: -1.1s; }
	.lg-sparks i:nth-child(9) { left: 34%; top: 40%; animation-delay: -3.9s; }
	.lg-sparks i:nth-child(10) { left: 74%; top: 92%; animation-delay: -2.4s; }
	@keyframes lg-twinkle { 0%, 100% { opacity: 0; transform: translateY(0) scale(0.6); } 40% { opacity: 0.9; transform: translateY(-14px) scale(1); } 70% { opacity: 0; transform: translateY(-26px) scale(0.6); } }

	.lg-side { display: flex; flex-direction: column; justify-content: space-between; gap: 40px; padding: 40px 56px; border-right: 1px solid color-mix(in oklab, var(--ink) 8%, transparent); background: linear-gradient(90deg, transparent, rgba(17, 13, 17, 0.35)); }
	.lg-brand { display: inline-flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; }
	.lg-brand b { font: 400 32px/1 var(--f-display); font-style: italic; letter-spacing: -0.01em; }
	.lg-pitch { display: grid; gap: 22px; max-width: 520px; }
	.lg-eb { font: 700 11.5px/1 var(--f-ui); letter-spacing: 0.3em; text-transform: uppercase; color: var(--ink-2); }
	.lg-pitch h2 { margin: 0; font: 400 clamp(52px, 6vw, 88px)/0.95 var(--f-display); letter-spacing: -0.02em; }
	.lg em { font-style: italic; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 0.08em; }
	.lg-pitch ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; color: var(--ink-2); font-size: 15.5px; }
	.lg-pitch li { display: flex; align-items: center; gap: 12px; }
	.lg-pitch li i { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--grad); box-shadow: 0 0 12px var(--g2); }
	.lg-foot { color: var(--ink-3); font-size: 13px; }

	.lg-main { display: grid; align-content: center; justify-items: center; gap: 18px; padding: 40px max(20px, env(safe-area-inset-right, 0px)) 40px max(20px, env(safe-area-inset-left, 0px)); }
	.lg-brand-sm { display: none; }
	.lg-card { width: min(440px, 100%); display: grid; gap: 14px; padding: 32px; border-radius: 28px; background: radial-gradient(120% 70% at 0% 0%, rgba(242, 90, 144, 0.16), transparent 60%), rgba(26, 21, 26, 0.86); box-shadow: 0 0 0 1px var(--line-2) inset, 0 60px 120px -50px rgba(242, 90, 144, 0.45); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
	.lg-card h1 { margin: 0; font: 400 46px/1 var(--f-display); letter-spacing: -0.01em; }
	.lg-lead { margin: 0 0 6px; color: var(--ink-3); font-size: 15px; line-height: 1.55; }
	.lg-lead b { color: var(--ink); }
	.lg-card form { display: grid; gap: 12px; }
	.lg-l { font: 700 11px/1 var(--f-ui); letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3); }
	.lg-in { width: 100%; height: 56px; padding: 0 16px; border: 0; border-radius: 0; background: #0c090c; color: var(--ink); font: 500 17px/1 var(--f-ui); box-shadow: inset 0 0 0 1px var(--line-2); outline: 0; transition: box-shadow 0.2s; }
	.lg-in::placeholder { color: #6f656c; }
	.lg-in:focus { box-shadow: inset 0 0 0 1.5px var(--g2), 4px 4px 0 var(--g2); }
	.lg-code { height: 68px; text-align: center; font: 600 30px/1 'Geist Mono', ui-monospace, monospace; letter-spacing: 0.5em; padding-left: 0.5em; }
	.lg-err { padding: 10px 12px; background: color-mix(in oklab, var(--bad) 12%, transparent); box-shadow: inset 3px 0 0 var(--bad); color: var(--bad); font-size: 14px; }
	.lg-neo { display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 56px; margin-top: 4px; border: 0; border-radius: 0; cursor: pointer; font: 700 13px/1 var(--f-ui); letter-spacing: 0.14em; text-transform: uppercase; transition: transform 0.12s, box-shadow 0.12s; }
	.lg-neo :global(.ic) { width: 17px; height: 17px; }
	.lg-grad { background: var(--grad); color: #fff; box-shadow: 5px 5px 0 #6a4bc9; }
	.lg-ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line-2), 5px 5px 0 var(--line); }
	.lg-neo:hover:not(:disabled) { transform: translate(-2px, -2px); }
	.lg-neo:active:not(:disabled) { transform: translate(5px, 5px); box-shadow: none; }
	.lg-neo:disabled { opacity: 0.6; cursor: default; }
	.lg-alt { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; font-size: 13.5px; color: var(--ink-3); }
	.lg-lnk { border: 0; padding: 0; background: none; color: var(--ink-2); font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	.lg-lnk:hover { color: var(--ink); }
	.lg-join { width: min(440px, 100%); display: grid; gap: 12px; }
	.lg-join-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.lg-sm { height: 48px; margin-top: 0; font-size: 12px; letter-spacing: 0.1em; text-decoration: none; }
	.lg-terms { margin: 0; font-size: 12.5px; color: var(--ink-3); }
	.lg-terms a { color: var(--ink-2); }

	@media (max-width: 900px) {
		.lg { grid-template-columns: minmax(0, 1fr); }
		.lg-side { display: none; }
		.lg-brand-sm { display: inline-flex; }
		.lg-main { align-content: center; min-height: 100dvh; padding-top: calc(env(safe-area-inset-top, 0px) + 28px); padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 28px); gap: 26px; }
		.lg-glow i:nth-child(1) { width: 380px; height: 380px; left: -140px; top: -60px; }
		.lg-glow i:nth-child(2) { width: 360px; height: 360px; left: 30%; top: 40%; opacity: 0.42; }
		.lg-glow i:nth-child(3) { width: 300px; height: 300px; left: -40px; bottom: -80px; opacity: 0.3; }
		.lg-card { animation: lg-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
		.lg-brand-sm { animation: lg-in 0.8s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
		.lg-card { padding: 26px 22px; }
		.lg-card h1 { font-size: 40px; }
	}
	@keyframes lg-in { from { opacity: 0; transform: translateY(24px) scale(0.98); } }
	@media (prefers-reduced-motion: reduce) { .lg-glow i, .lg-m1, .lg-sparks i, .lg-card, .lg-brand-sm { animation: none; } .lg-m1 { stroke-dasharray: none; } }
</style>
