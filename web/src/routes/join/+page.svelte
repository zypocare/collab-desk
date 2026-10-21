<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { auth, refreshAccount, signOut } from '#lib/auth.svelte.ts';
	import { pageSlug, supabase, turnstileSiteKey } from '#lib/supabase.ts';
	import type { CreatorRequest } from '#lib/types.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// A creator claims name.miracleapp.live: check the name, sign in with an email code, send a short
	// request, then see where it stands (waiting, or declined with a way to send it again).
	type Turnstile = {
		render: (el: HTMLElement, opts: Record<string, unknown>) => string;
		reset: (id?: string) => void;
		remove?: (id: string) => void;
	};
	type Owner = { id: number; slug: string; name: string; handle: string } | null;

	const ROOT = 'miracleapp.live';
	const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/;
	const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);

	// On name.miracleapp.live the name is the address; anywhere else (testing) it's typed here.
	let slug = $state(pageSlug);
	let owner = $state<Owner | undefined>(pageSlug ? undefined : null);
	let free = $state<boolean | null>(null);
	let checking = $state(false);

	const request = $derived<CreatorRequest | null>(auth.account?.role === 'pending' ? auth.account.request : null);
	// Re-opening a declined request: the form comes back with what she sent.
	let editing = $state(false);
	const mine = $derived(!!request && request.slug === slug);

	// Already a creator: her studio. (A full load, like after sign-in.)
	$effect(() => {
		if (auth.account?.role === 'creator') location.replace('/studio');
	});

	onMount(() => {
		if (!pageSlug) return;
		supabase.rpc('page_owner').then(({ data, error }) => (owner = error ? null : ((data as Owner) ?? null)));
	});

	// Is the name free? Checked as she types (a moment after she stops).
	let checkTimer: ReturnType<typeof setTimeout> | undefined;
	let asked = '';
	$effect(() => {
		const s = slug;
		clearTimeout(checkTimer);
		free = null;
		checking = false;
		if (!s || !SLUG_RE.test(s)) return;
		checking = true;
		checkTimer = setTimeout(async () => {
			asked = s;
			const { data, error } = await supabase.rpc('slug_free', { p_slug: s });
			if (asked !== s) return;
			checking = false;
			free = error ? null : !!data;
		}, pageSlug ? 0 : 350);
	});
	const nameOk = $derived(mine || free === true);
	const nameProblem = $derived(
		!slug ? '' : !SLUG_RE.test(slug) ? 'Use letters and numbers (a dash in the middle is fine), up to 30.' : free === false && !mine ? `${slug}.${ROOT} is taken or can't be used.` : ''
	);

	// ---------- Email code (the same as Sign in) ----------
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

	// The check box is drawn whenever the email step is on screen.
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
		if (!nameOk) {
			error = slug ? nameProblem || 'One moment, checking the name…' : 'Type the name you want first.';
			return;
		}
		const addr = email.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
			error = 'Enter a valid email, like name@gmail.com.';
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
		const { data, error: err } = await supabase.auth
			.verifyOtp({ email, token, type: 'email' })
			.catch((x) => ({ data: { session: null }, error: x as Error }));
		if (err || !data.session) {
			busy = false;
			error = 'That code is wrong or has expired. Check the latest email or send a new code.';
			return;
		}
		auth.session = data.session;
		// Who is this: already a creator (her studio), waiting (her request), or new (the form).
		await Promise.race([refreshAccount().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
		busy = false;
		step = 'email';
		code = '';
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

	// ---------- The request ----------
	let f = $state({ name: '', handle: '', niche: '', city: '', note: '' });
	let sending = $state(false);
	let formErr = $state('');

	function sendAgain() {
		if (request) {
			f = { name: request.name, handle: request.handle, niche: request.niche, city: request.city, note: request.note };
			if (!pageSlug) slug = request.slug;
		}
		formErr = '';
		editing = true;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		formErr = '';
		if (!nameOk) return (formErr = nameProblem || (slug ? 'One moment, checking the name…' : 'Type the name you want first.'));
		if (f.name.trim().length < 2) return (formErr = 'Add your name as brands should see it.');
		const handle = f.handle.trim().replace(/^@+/, '');
		if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return (formErr = 'Add your Instagram handle (letters, numbers, dots and underscores).');
		sending = true;
		const { error: err } = await supabase.rpc('request_creator_account', {
			p_slug: slug,
			p_name: f.name.trim(),
			p_handle: handle,
			p_niche: f.niche.trim(),
			p_city: f.city.trim(),
			p_note: f.note.trim()
		});
		if (err) {
			sending = false;
			// Two people can't share an Instagram handle or an address: say so in words.
			const dup = err.code === '23505';
			return (formErr =
				dup && /handle/i.test(err.message) ? `@${handle} is already on Miracle. If it's yours, write to admin@miracleapp.live and we'll sort it out.`
				: dup && /slug/i.test(err.message) ? `${slug}.${ROOT} was just taken. Try another name.`
				: dup ? 'Something you entered is already on Miracle. Check your handle and try again.'
				: errMessage(err));
		}
		await refreshAccount();
		sending = false;
		editing = false;
	}

	async function leave() {
		await signOut();
		editing = false;
		step = 'email';
		email = '';
	}

	function ago(ts: string | null) {
		if (!ts) return '';
		const m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
		if (m < 2) return 'just now';
		if (m < 60) return `${m} minutes ago`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
		const d = Math.round(h / 24);
		return `${d} day${d === 1 ? '' : 's'} ago`;
	}

	// Which screen: her request's status, an address that's taken, signing in, or the form.
	const view = $derived(
		auth.account?.role === 'creator'
			? 'loading'
			: request && !editing
				? 'status'
				: owner === undefined
					? 'loading'
					: owner && !mine
						? 'owned'
						: !auth.session
							? 'claim'
							: 'form'
	);
	const address = $derived(`${slug || 'yourname'}.${ROOT}`);
</script>

<svelte:head><title>{view === 'status' ? 'Your request' : `Claim ${address}`}</title></svelte:head>

<header class="topbar">
	<a class="brandmark" href="/" aria-label="Miracle home"><span class="ring"><span></span></span><b>Miracle</b></a>
	{#if auth.session}
		<button class="btn sm" onclick={leave}><Icon name="logout" /><span>Sign out</span></button>
	{/if}
</header>

<div class="auth-wrap">
	<div class="auth-card jn">
		{#if view === 'loading'}
			<div class="jn-load"><span class="spinner"></span></div>
		{:else if view === 'owned'}
			<span class="mini-ic tint k-new" style="--hue:var(--accent)"><Icon name="link" /></span>
			<h1>Already <em>taken</em></h1>
			<p class="lead"><b>{address}</b> is {owner?.name ? `${owner.name}'s` : 'a creator’s'} page on Miracle.</p>
			<a class="btn grad lg" href="/"><Icon name="arrow" />Open the page</a>
			<p class="jn-alt">Want your own link? <a class="lnk" href="https://{ROOT}/#claim">Pick another name</a></p>
		{:else if view === 'status' && request}
			{#if request.status === 'pending'}
				<span class="mini-ic tint k-new" style="--hue:var(--accent)"><Icon name="clock" /></span>
				<h1>Your request is <em>in</em></h1>
				<p class="lead"><b>{request.slug}.{ROOT}</b> is held for you. We'll email you when it's approved, usually within a day.</p>
			{:else}
				<span class="mini-ic tint k-new" style="--hue:var(--accent)"><Icon name="heart" /></span>
				<h1>Not <em>just yet</em></h1>
				<p class="lead">Thank you for wanting to join Miracle. We couldn't approve this request right now. That's often because we couldn't match the Instagram account, or we needed a little more about your work. Add a few words and send it again; we read every one.</p>
			{/if}
			<div class="jn-tk" class:off={request.status === 'declined'}>
				<div class="jn-tk-h">
					<small>{request.status === 'pending' ? 'Waiting for approval' : 'Not approved'}</small>
					<b>{request.slug}.{ROOT}</b>
				</div>
				<i class="jn-cut" aria-hidden="true"></i>
				<dl>
					<div><dt>Name</dt><dd>{request.name}</dd></div>
					<div><dt>Instagram</dt><dd>@{request.handle}</dd></div>
					{#if request.niche || request.city}<div><dt>Work</dt><dd>{[request.niche, request.city].filter(Boolean).join(' · ')}</dd></div>{/if}
					{#if request.requested_at}<div><dt>Sent</dt><dd>{ago(request.requested_at)}</dd></div>{/if}
				</dl>
			</div>
			{#if request.status === 'declined'}
				<button class="btn grad lg" onclick={sendAgain}><Icon name="refresh" />Send it again</button>
			{/if}
			<p class="jn-alt">Signed in as <b>{auth.account?.email}</b>.</p>
		{:else}
			<span class="mini-ic tint k-new" style="--hue:var(--accent)"><Icon name={view === 'form' ? 'edit' : step === 'code' ? 'check' : 'link'} /></span>
			{#if view === 'claim' && step === 'code'}
				<h1>Check your <em>email</em></h1>
				<p class="lead">We sent a 6-digit code to <b>{email}</b>. It works for one hour.</p>
				<form onsubmit={verify} novalidate>
					<div class="f">
						<label for="code">Code</label>
						<input class="inp code-inp" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" bind:value={code} bind:this={codeInput} />
					</div>
					{#if error}<div class="err">{error}</div>{/if}
					<button class="btn grad lg" type="submit" disabled={busy}>
						{#if busy}<span class="spinner"></span>Checking…{:else}Continue{/if}
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
			{:else}
				<h1>{view === 'form' ? 'Tell us about' : 'Claim'} <em>{view === 'form' ? 'you' : 'your link'}</em></h1>
				{#if pageSlug}
					<div class="jn-addr" class:ok={nameOk} class:bad={!!nameProblem}>
						<b>{slug}</b><span>.{ROOT}</span>
						<i aria-hidden="true">{#if checking}<span class="spinner"></span>{:else if nameOk}<Icon name="check" />{:else if nameProblem}<Icon name="x" />{/if}</i>
					</div>
				{:else}
					<div class="f jn-nof">
						<label for="jn-slug">Your link</label>
						<div class="jn-addr jn-type" class:ok={nameOk} class:bad={!!nameProblem}>
							<input id="jn-slug" placeholder="yourname" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="30" value={slug} oninput={(e) => (slug = e.currentTarget.value = clean(e.currentTarget.value))} />
							<span>.{ROOT}</span>
							<i aria-hidden="true">{#if checking}<span class="spinner"></span>{:else if nameOk}<Icon name="check" />{:else if nameProblem}<Icon name="x" />{/if}</i>
						</div>
					</div>
				{/if}
				{#if nameProblem}
					<p class="jn-note bad">{nameProblem} {#if pageSlug}<a class="lnk" href="https://{ROOT}/#claim">Pick another name</a>{:else}Try another name.{/if}</p>
				{:else if view === 'claim'}
					<p class="lead">Your own page for brands, plus a studio for every collab. Enter your email and we'll send you a 6-digit code.</p>
				{:else}
					<p class="lead">A few things brands will see. We look at every request and email you when it's approved.</p>
				{/if}

				{#if view === 'claim'}
					<form onsubmit={sendCode} novalidate>
						<div class="f">
							<label for="email">Email address</label>
							<input class="inp" id="email" type="email" inputmode="email" autocomplete="email" placeholder="name@gmail.com" bind:value={email} />
						</div>
						{#if turnstileSiteKey}<div class="ts-box" bind:this={tsBox}></div>{/if}
						{#if error}<div class="err">{error}</div>{/if}
						<button class="btn grad lg" type="submit" disabled={busy || !nameOk}>
							{#if busy}<span class="spinner"></span>Sending code…{:else}<Icon name="send" />Send code{/if}
						</button>
						<p class="jn-alt">Already on Miracle? <a class="lnk" href="/login">Sign in</a></p>
					</form>
				{:else}
					<form onsubmit={submit} novalidate>
						<div class="f">
							<label for="jn-name">Your name <span class="hint">(as brands see it)</span></label>
							<input class="inp" id="jn-name" autocomplete="name" maxlength="60" placeholder="Ananya Rao" bind:value={f.name} />
						</div>
						<div class="f">
							<label for="jn-handle">Instagram handle</label>
							<div class="pre"><span>@</span><input class="inp" id="jn-handle" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="31" placeholder="yourhandle" bind:value={f.handle} oninput={() => (f.handle = f.handle.replace(/^@+/, ''))} /></div>
						</div>
						<div class="jn-two">
							<div class="f">
								<label for="jn-niche">What you create</label>
								<input class="inp" id="jn-niche" maxlength="80" placeholder="Skincare, travel…" bind:value={f.niche} />
							</div>
							<div class="f">
								<label for="jn-city">City</label>
								<input class="inp" id="jn-city" autocomplete="address-level2" maxlength="60" placeholder="Bengaluru" bind:value={f.city} />
							</div>
						</div>
						<div class="f">
							<label for="jn-note">Anything we should know <span class="hint">(optional)</span></label>
							<textarea class="inp" id="jn-note" rows="3" maxlength="600" placeholder="Your manager, other accounts, brands you've worked with" bind:value={f.note}></textarea>
						</div>
						{#if formErr}<div class="err">{formErr}</div>{/if}
						<button class="btn grad lg" type="submit" disabled={sending}>
							{#if sending}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Send request{/if}
						</button>
						{#if editing}
							<button type="button" class="lnk jn-back" onclick={() => (editing = false)}>Back to my request</button>
						{/if}
						<p class="jn-alt">Signed in as <b>{auth.session?.user.email}</b>.</p>
					</form>
				{/if}
			{/if}
		{/if}
	</div>
</div>

<style>
	.jn-load { min-height: 220px; display: grid; place-items: center; }
	.jn .lead b { color: var(--ink); word-break: break-word; }
	.jn > .btn.lg { width: 100%; justify-content: center; }
	.jn-alt { margin: 14px 0 0; font-size: 14.5px; color: var(--ink-3); text-align: center; word-break: break-word; }
	.jn-alt b { color: var(--ink-2); font-weight: 600; }
	
	/* The address being claimed, square like the rest of the CRED look. */
	.jn-addr { display: flex; align-items: center; gap: 0; min-height: 54px; margin: 0 0 12px; padding: 0 14px; border: 1px solid var(--line-strong); background: var(--surface-2); font-size: 19px; overflow: hidden; }
	.jn-addr b { font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.jn-addr span { color: var(--ink-3); white-space: nowrap; }
	.jn-addr i { margin-left: auto; padding-left: 10px; display: grid; place-items: center; font-style: normal; }
	.jn-addr i :global(.ic) { width: 20px; height: 20px; stroke-width: 2.4; }
	.jn-addr.ok { border-color: color-mix(in oklab, var(--ok) 55%, var(--line-strong)); }
	.jn-addr.ok i { color: var(--ok); }
	.jn-addr.bad { border-color: color-mix(in oklab, var(--bad) 60%, var(--line-strong)); }
	.jn-addr.bad i { color: var(--bad); }
	.jn-type { margin: 0; padding-left: 0; }
	.f.jn-nof::after { display: none; }
	.jn-type:focus-within { border-color: var(--accent); }
	.jn-type input { flex: 1 1 auto; min-width: 60px; height: 52px; padding: 0 2px 0 14px; border: 0; background: none; outline: 0; font: 700 19px var(--f-body); color: var(--ink); text-align: right; }
	.jn-note { margin: 0 0 18px; font-size: 15px; color: var(--ink-2); }
	.jn-note.bad { color: color-mix(in oklab, var(--bad) 80%, var(--ink)); }

	.jn-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.jn-back { align-self: center; font-size: 14.5px; color: var(--ink-2); }

	/* Her request as a ticket: the address on a band, a torn line, then what she sent. */
	.jn-tk { position: relative; margin: 0 0 18px; border: 1px solid var(--line-strong); background: var(--surface-2); }
	.jn-tk-h { display: grid; gap: 3px; padding: 14px 16px; color: #fff; background: linear-gradient(110deg, var(--g1), var(--g2) 55%, var(--g3)); }
	.jn-tk.off .jn-tk-h { background: linear-gradient(110deg, #3a2f39, #2a2229); }
	.jn-tk-h small { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; opacity: .85; }
	.jn-tk-h b { font-size: 17px; word-break: break-all; }
	.jn-cut { display: block; height: 0; border-top: 2px dashed var(--line-strong); margin: 0 12px; }
	.jn-tk dl { margin: 0; padding: 10px 16px 14px; display: grid; gap: 8px; }
	.jn-tk dl div { display: flex; gap: 12px; justify-content: space-between; font-size: 15px; }
	.jn-tk dt { color: var(--ink-3); }
	.jn-tk dd { margin: 0; font-weight: 600; text-align: right; word-break: break-word; }

	@media (max-width: 420px) {
		.jn-two { grid-template-columns: 1fr; }
		.jn-addr { font-size: 16px; }
		.jn-type input { font-size: 16px; }
	}
</style>
