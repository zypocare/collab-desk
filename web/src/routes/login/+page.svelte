<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { auth, homeFor, refreshAccount } from '#lib/auth.svelte.ts';
	import { supabase, turnstileSiteKey } from '#lib/supabase.ts';
	import type { Account } from '#lib/types.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

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

	// Where to land. A link to the other side's area (creator → /brand…) goes home instead.
	function targetFor(account: Account | null) {
		const home = homeFor(account);
		if (!next || !next.startsWith('/') || next.startsWith('//')) return home;
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

<svelte:head><title>Sign in</title></svelte:head>

<header class="topbar">
	<a class="brandmark" href="/" aria-label="Collab Desk home"><span class="ring"><span></span></span><b>Collab Desk</b></a>
</header>

<div class="auth-wrap">
	<div class="auth-card">
		<span class="mini-ic tint k-new" style="--hue:var(--accent)"><Icon name={step === 'email' ? 'mail' : 'check'} /></span>
		{#if step === 'email'}
			<h1>Sign <em>in</em></h1>
			<p class="lead">Enter your email and we'll send you a 6-digit code. No password needed.</p>
			<form onsubmit={sendCode} novalidate>
				<div class="f">
					<label for="email">Email address</label>
					<input class="inp" id="email" type="email" inputmode="email" autocomplete="email" placeholder="name@brand.com" bind:value={email} />
				</div>
				{#if turnstileSiteKey}<div class="ts-box" bind:this={tsBox}></div>{/if}
				{#if error}<div class="err">{error}</div>{/if}
				<button class="btn grad lg" type="submit" disabled={busy}>
					{#if busy}<span class="spinner"></span>Sending code…{:else}<Icon name="send" />Send code{/if}
				</button>
			</form>
		{:else}
			<h1>Check your <em>email</em></h1>
			<p class="lead">We sent a 6-digit code to <b>{email}</b>. It works for one hour.</p>
			<form onsubmit={verify} novalidate>
				<div class="f">
					<label for="code">Code</label>
					<input
						class="inp code-inp"
						id="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						placeholder="······"
						bind:value={code}
						bind:this={codeInput}
					/>
				</div>
				{#if error}<div class="err">{error}</div>{/if}
				<button class="btn grad lg" type="submit" disabled={busy}>
					{#if busy}<span class="spinner"></span>Checking…{:else}Sign in{/if}
				</button>
				<div class="auth-alt">
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
