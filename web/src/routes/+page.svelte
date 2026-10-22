<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import type { Action } from 'svelte/action';
	import { auth, signOut } from '#lib/auth.svelte.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import { errMessage, firstName, hueOf, inr, offeredKinds, packageOffered, plural, waLink } from '#lib/util.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { pageSlug, supabase } from '#lib/supabase.ts';
	import { appAddress } from '#lib/creatorHost.ts';
	import type { PublicPage } from '#lib/types.ts';
	import Logo from '#lib/components/Logo.svelte';

	// A creator's page for brands (name.miracleapp.live), in the website's night scene: aurora hero with her
	// numbers, the brands she's worked with, her best Reels, packages as tickets, open weeks, her audience and
	// one clear ask. Dark only. Every part comes from her data and hides when there's nothing to show.

	const preview = $derived(page.url.searchParams.has('preview'));

	// The creator works in the studio; this page is for brands (the creator can still preview it).
	$effect(() => {
		if (auth.account?.role === 'creator' && !preview) goto('/studio', { replaceState: true });
		// Waiting to be approved: she sees where her request stands.
		else if (auth.account?.role === 'pending') location.replace(appAddress('/signup'));
	});

	// The page keeps its own dark look whatever the app's theme; the app's background art steps aside.
	$effect(() => {
		const root = document.documentElement;
		root.classList.add('mp-on');
		return () => root.classList.remove('mp-on');
	});

	// Came back from signing in to ask a question: put the question back in the box.
	const ASK_KEY = 'pp.ask';
	let askBack = false;
	onMount(() => {
		loadPublicPage();
		if (page.url.searchParams.get('ask') === '1') {
			const u = new URL(page.url.href);
			u.searchParams.delete('ask');
			history.replaceState(history.state, '', u.pathname + u.search);
			askBack = true;
			try {
				question = sessionStorage.getItem(ASK_KEY) ?? '';
				sessionStorage.removeItem(ASK_KEY);
			} catch {
				/* private mode: they type it again */
			}
		}
	});

	const p = $derived(pub.data);
	const ins = $derived(pub.ins);
	const first = $derived(firstName(p?.display_name ?? ''));
	const signedInBrand = $derived(auth.account?.role === 'brand');
	const isCreator = $derived(auth.account?.role === 'creator');
	const email = $derived(auth.session?.user.email ?? '');
	const requestHref = '/brand/new';
	const trackHref = $derived(signedInBrand ? '/brand/requests' : '/login?next=/brand/requests');

	// ---------- numbers ----------
	/** 20076 -> "20.1K", 146959 -> "147K" (the count-ups). */
	const kfmt = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e5 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(Math.round(n)));
	/** 115419 -> "115.4K" (brand cards, reach). */
	const k1 = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(Math.round(n)));
	/** 33309 -> "33K" (topics). */
	const k0 = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
	const dayMonth = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	const dateOf = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);

	// Name on two lines: first word, then the rest in the gradient (one word: all of it in the gradient).
	const nameLines = $derived.by(() => {
		const w = (p?.display_name ?? '').trim().split(/\s+/).filter(Boolean);
		return w.length > 1 ? { a: w[0], b: w.slice(1).join(' ') } : { a: '', b: w[0] ?? '' };
	});
	const mono = (name: string) => {
		const w = name.split(/[\s|\-]+/).filter((x) => x && /[A-Za-z0-9]/.test(x[0]));
		return w.slice(0, 2).map((x) => x[0]).join('').toUpperCase() || name.slice(0, 2).toUpperCase();
	};
	let picBroken = $state(false);
	const pic = $derived(picBroken ? '' : (ins?.profile_picture_url || p?.instagram?.profile_picture_url || ''));

	const status = $derived(
		!p ? null
		: p.away_until ? { off: true, text: `Away until ${dayMonth(dateOf(p.away_until))}` }
		: p.accepting ? { off: false, text: 'Open for collabs' }
		: { off: true, text: 'Not taking new collabs right now' }
	);

	// ---------- the numbers card ----------
	const ig = $derived.by(() => {
		if (!p) return null;
		const followers = ins?.followers ?? p.instagram?.followers ?? null;
		if (!followers) return null;
		const er = ins?.engagement_rate ?? p.instagram?.engagement_rate ?? null;
		const minis = [
			{ k: 'Avg views', v: ins?.avg_views ?? p.instagram?.avg_views },
			{ k: 'Avg reach', v: ins?.avg_reach ?? p.instagram?.avg_reach },
			{ k: 'Last 30 days', v: ins?.insights?.totals?.views }
		].filter((m): m is { k: string; v: number } => typeof m.v === 'number' && m.v > 0);
		const updated = ins?.updated_at ?? p.instagram?.updated_at ?? null;
		return { followers, posts: ins?.media_count ?? null, er, minis, updated: updated ? dayMonth(new Date(updated)) : '', history: (ins?.history ?? []).map((h) => h.followers).filter((n) => typeof n === 'number') };
	});
	/** A smooth line through her follower counts, in a 300 × 56 box. */
	function sparkPath(pts: number[]) {
		if (pts.length < 2) return '';
		const min = Math.min(...pts), span = Math.max(...pts) - min;
		const r = (n: number) => Math.round(n * 10) / 10;
		const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 300, span ? 46 - ((v - min) / span) * 36 : 28]);
		let d = `M${r(xy[0][0])} ${r(xy[0][1])}`;
		for (let i = 0; i < xy.length - 1; i++) {
			const a = xy[i - 1] ?? xy[i], b = xy[i], c = xy[i + 1], e = xy[i + 2] ?? c;
			d += ` C${r(b[0] + (c[0] - a[0]) / 6)} ${r(b[1] + (c[1] - a[1]) / 6)} ${r(c[0] - (e[0] - b[0]) / 6)} ${r(c[1] - (e[1] - b[1]) / 6)} ${r(c[0])} ${r(c[1])}`;
		}
		return d;
	}
	const spark = $derived(ig ? sparkPath(ig.history) : '');

	// ---------- packages and rates ----------
	// What a package's pieces would cost one at a time (at today's prices), so the saving shows.
	const oneByOne = (items: { kind: string; qty: number }[]) => {
		const r = p?.rates ?? {};
		if (!items.length || items.some((it) => !r[it.kind])) return 0;
		const f = Number(p?.demand_factor) || 1;
		return Math.ceil((items.reduce((t, it) => t + it.qty * r[it.kind], 0) * f) / 500) * 500;
	};
	// WhatsApp with a friendly first line already typed.
	const wa = $derived(p?.whatsapp ? waLink(p.whatsapp, `Hi ${firstName(p.display_name)}! I'd like to discuss a collaboration.`) : '');
	const packs = $derived(p?.packages?.filter((x) => packageOffered(x.items, p.offered)) ?? []);
	const rates = $derived(p?.rates ? Object.entries(p.rates).filter(([k, v]) => v && offeredKinds(p.offered).includes(k)) : []);
	// The ticket that stands out: "Most booked", or the middle one.
	const hot = $derived.by(() => {
		const i = packs.findIndex((k) => k.badge?.trim().toLowerCase() === 'most booked');
		return i >= 0 ? i : Math.floor((packs.length - 1) / 2);
	});
	// Ticket colours are the app's brand hues (--m1 … --m6), like the Needs-you tickets.
	const TICKET_HUES = [2, 5, 3, 4, 6];
	const ticketHue = (i: number) => `var(--m${i === hot ? 1 : TICKET_HUES[(i < hot ? i : i - 1) % TICKET_HUES.length]})`;
	const fromPrice = $derived(Math.min(...packs.map((k) => k.price), ...rates.map(([, v]) => v)));

	// Without Instagram numbers the card shows what a brand needs to start.
	const glance = $derived(
		p
			? [
					{ k: 'Replies in', v: p.reply_time },
					{ k: 'Brands', v: p.worked_with.length ? String(p.worked_with.length) : '' },
					{ k: 'Packages', v: packs.length ? String(packs.length) : '' }
				].filter((m) => m.v)
			: []
	);

	// ---------- brand catalogue ----------
	type Result = PublicPage['results'][number];
	// A brand's colour is the same one the app gives it everywhere (--m1 … --m6).
	const hue = (name: string) => `var(--m${hueOf(name)})`;
	const KIND: Record<string, [string, string]> = { REELS: ['Reel', 'Reels'], STORY: ['Story', 'Stories'], FEED: ['Post', 'Posts'], CAROUSEL_ALBUM: ['Carousel', 'Carousels'] };
	const results = $derived(p?.results ?? []);
	const catalogue = $derived.by(() => {
		if (!p?.worked_with.length) return [];
		const key = (s: string) => s.trim().toLowerCase();
		const agg = new Map<string, { kinds: Map<string, number>; best: number; reach: number }>();
		for (const r of results) {
			const a = agg.get(key(r.brand)) ?? { kinds: new Map(), best: 0, reach: 0 };
			a.kinds.set(r.kind, (a.kinds.get(r.kind) ?? 0) + 1);
			a.best = Math.max(a.best, r.views ?? 0);
			a.reach = Math.max(a.reach, r.reach ?? 0);
			agg.set(key(r.brand), a);
		}
		const names = [...p.worked_with];
		for (const r of results) if (!names.some((n) => key(n) === key(r.brand))) names.push(r.brand);
		return names
			.map((name) => {
				const a = agg.get(key(name));
				const posts = a ? [...a.kinds].map(([k, n]) => `${n} ${(KIND[k] ?? ['Post', 'Posts'])[n === 1 ? 0 : 1]}`).join(' · ') : '';
				return { name, hue: hue(name), mono: mono(name), posts, best: a?.best ?? 0, reach: a?.reach ?? 0, measured: !!a };
			})
			.sort((x, y) => y.best - x.best || Number(y.measured) - Number(x.measured) || x.name.toLowerCase().localeCompare(y.name.toLowerCase()));
	});
	const bestViews = $derived(Math.max(0, ...results.map((r) => r.views ?? 0)));

	// ---------- Reels ----------
	// Her best brand posts by views (Stories vanish after a day, so they're left out here).
	const reels = $derived([...results].filter((r) => r.kind !== 'STORY' && (r.views ?? 0) > 0).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6));
	let broken = $state<Record<string, boolean>>({});
	const proof = $derived.by(() => {
		const out: { b: string; t: string }[] = [];
		const big = results.filter((r) => r.kind === 'REELS' && (r.views ?? 0) >= 25000).length;
		if (big) out.push({ b: String(big), t: `${big === 1 ? 'Reel' : 'Reels'} past 25K views` });
		const sp = ins?.insights?.sponsored;
		const a = sp?.sponsored?.avg_views, b = sp?.regular?.avg_views;
		if (a && b && a / b >= 1.1) out.push({ b: `${(a / b).toFixed(1)}×`, t: 'more views on sponsored posts than regular ones' });
		const ms = ins?.insights?.formats?.reels?.avg_watch_ms;
		if (ms) out.push({ b: ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`, t: 'average watch time on a Reel' });
		return out;
	});

	// ---------- weeks and barter ----------
	const weeks = $derived(p?.accepting ? (p.availability ?? p.weeks ?? []).slice(0, 8) : []);
	const weekCells = $derived(
		weeks.map((w) => {
			const s = dateOf(w.start);
			const now = Date.now() >= s.getTime() && Date.now() < s.getTime() + 7 * 864e5;
			return { start: w.start, now, label: now ? 'This wk' : s.toLocaleDateString('en-IN', { month: 'short' }), day: s.getDate(), status: w.status };
		})
	);
	const weekWord = { open: 'open', limited: 'filling up', full: 'full', away: 'away' } as const;
	const barter = $derived(p?.accepting && p.barter && p.barter.mode !== 'closed' ? p.barter : null);
	const slots = $derived(barter?.slots_left ?? null);

	// ---------- audience ----------
	const demo = $derived(ins?.demographics ?? p?.instagram?.demographics ?? null);
	const share = (o: Record<string, number> | undefined) => {
		const t = Object.values(o ?? {}).reduce((a, v) => a + v, 0);
		return (v: number) => (t ? Math.round((v / t) * 100) : 0);
	};
	const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45+'];
	const age = $derived.by(() => {
		const raw = demo?.age;
		if (!raw || !Object.keys(raw).length) return null;
		const m = new Map<string, number>();
		for (const [k, v] of Object.entries(raw)) {
			const b = Number(k.slice(0, 2)) >= 45 ? '45+' : k;
			m.set(b, (m.get(b) ?? 0) + v);
		}
		const pc = share(Object.fromEntries(m));
		const rows = [...m].map(([k, v]) => ({ k, v, p: pc(v) })).sort((a, b) => b.v - a.v);
		const top = rows[0], next = rows[1];
		const lo = (k: string) => k.split(/[-+]/)[0], hi = (k: string) => k.split('-')[1];
		let head = top.k === '45+' ? '45 and over' : `${lo(top.k)} to ${hi(top.k)}`;
		const ti = AGE_ORDER.indexOf(top.k), ni = next ? AGE_ORDER.indexOf(next.k) : -9;
		if (next && top.p < 50 && Math.abs(ti - ni) === 1) {
			const [a, b] = ti < ni ? [top.k, next.k] : [next.k, top.k];
			head = b === '45+' ? `${lo(a)} and over` : `${lo(a)} to ${hi(b)}`;
		}
		return { head, rows: rows.slice(0, 5).map((r) => ({ ...r, k: r.k.replace('-', '–'), w: r.v / top.v })) };
	});
	const countryName = (code: string) => {
		try {
			return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
		} catch {
			return code;
		}
	};
	const cities = $derived.by(() => {
		const raw = (demo as { city?: Record<string, number> } | null)?.city;
		if (!raw || !Object.keys(raw).length) return null;
		const rows = Object.entries(raw).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ k: k.split(',')[0], v }));
		const country = (demo as { country?: Record<string, number> } | null)?.country;
		const cs = country ? Object.entries(country).sort((a, b) => b[1] - a[1]) : [];
		const pc = share(country);
		const india = country?.IN ? pc(country.IN) : 0;
		const topC = cs[0] ? countryName(cs[0][0]) : '';
		return {
			top: rows[0].k,
			then: topC ? `all of ${topC}` : '',
			note: india ? `${india}% of the audience is in India.` : cs[0] ? `${pc(cs[0][1])}% of the audience is in ${topC}.` : '',
			rows: rows.map((r) => ({ ...r, w: r.v / rows[0].v }))
		};
	});
	const gender = $derived.by(() => {
		const g = demo?.gender;
		if (!g || !Object.keys(g).length) return null;
		const pc = share(g);
		const rows = [
			{ k: 'Men', p: pc(g.M ?? 0), c: 'var(--h-request)' },
			{ k: 'Women', p: pc(g.F ?? 0), c: 'var(--g2)' },
			{ k: 'Not shared', p: pc(g.U ?? 0), c: 'var(--line-strong)' }
		].filter((r) => r.p > 0);
		const said = rows.filter((r) => r.k !== 'Not shared').sort((a, b) => b.p - a.p);
		return { rows, head: rows.some((r) => r.k === 'Not shared') || !said[0] ? 'Who said' : `Mostly ${said[0].k.toLowerCase()}` };
	});
	const sponsored = $derived.by(() => {
		const sp = ins?.insights?.sponsored;
		const a = sp?.sponsored?.avg_views, b = sp?.regular?.avg_views;
		if (!a || !b || a < b * 0.8) return null;
		return { a, b, better: a >= b };
	});
	const DAY: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
	const best = $derived.by(() => {
		const bt = ins?.insights?.best_time;
		const days = bt?.days?.filter((d) => d.med_reach) ?? [];
		if (days.length < 2) return null;
		const max = Math.max(...days.map((d) => d.med_reach ?? 0));
		const bestDay = bt?.best_day ?? days.find((d) => d.med_reach === max)?.k ?? '';
		const band = bt?.best_band?.split(' ')[0].toLowerCase() ?? '';
		const when = { morning: 'mornings', afternoon: 'afternoons', evening: 'evenings', night: 'nights' }[band] ?? '';
		return { day: DAY[bestDay] ?? bestDay, when, days: (bt?.days ?? []).map((d) => ({ k: d.k, h: Math.round(((d.med_reach ?? 0) / max) * 100), best: d.k === bestDay })) };
	});
	const reelStats = $derived.by(() => {
		const r = ins?.insights?.formats?.reels;
		if (!r) return [];
		return [
			{ v: r.med_views, t: 'median views', count: true },
			{ v: r.med_reach, t: 'median reach', count: true },
			{ v: r.share_rate, t: 'of viewers share it', count: false }
		].filter((x): x is { v: number; t: string; count: boolean } => typeof x.v === 'number' && x.v > 0);
	});
	const topics = $derived.by(() => {
		const t = (ins?.insights?.topics ?? []).filter((x) => x.avg_views).sort((a, b) => (b.avg_views ?? 0) - (a.avg_views ?? 0)).slice(0, 4);
		if (!t.length) return null;
		return { a: t[0].k, b: t[1]?.k.toLowerCase() ?? '', rows: t.map((x) => ({ k: x.k, v: x.avg_views ?? 0, w: (x.avg_views ?? 0) / (t[0].avg_views ?? 1) })) };
	});
	// The bento keeps the design's rows; when a cell has no data the others in its row share the space.
	const bento = $derived.by(() => {
		const rows: { id: string; on: boolean; sp: number }[][] = [
			[{ id: 'age', on: !!age, sp: 5 }, { id: 'city', on: !!cities, sp: 7 }],
			[{ id: 'gender', on: !!gender, sp: 4 }, { id: 'sponsored', on: !!sponsored, sp: 4 }, { id: 'time', on: !!best, sp: 4 }],
			[{ id: 'reels', on: reelStats.length > 0, sp: 8 }, { id: 'topics', on: !!topics, sp: 4 }]
		];
		const out: Record<string, number> = {};
		for (const row of rows) {
			const live = row.filter((c) => c.on);
			for (const c of live) out[c.id] = live.length === row.length ? c.sp : 12 / live.length;
		}
		return out;
	});
	const hasAudience = $derived(Object.keys(bento).length > 0);

	const showPackages = $derived(!!p?.accepting && (packs.length > 0 || rates.length > 0));
	const showWeeks = $derived(weekCells.length > 0 || !!barter);
	const nav = $derived(
		[
			{ id: 'brands', label: 'Brands', on: catalogue.length > 0 },
			{ id: 'work', label: 'Work', on: reels.length > 0 },
			{ id: 'packages', label: 'Packages', on: showPackages },
			{ id: 'weeks', label: 'Open weeks', on: showWeeks },
			{ id: 'audience', label: 'Audience', on: hasAudience }
		].filter((s) => s.on)
	);

	// ---------- actions ----------
	let kitBusy = $state(false);
	async function kit() {
		if (!p || kitBusy) return;
		kitBusy = true;
		await downloadMediaKit(p, location.origin).catch(() => {});
		kitBusy = false;
	}
	async function logout() {
		await signOut();
		goto('/', { replaceState: true });
	}

	// Ask a question: answered by email, so it needs a sign-in (a code to their email) first.
	let question = $state('');
	let asking = $state(false);
	let sent = $state('');
	let sentBad = $state(false);
	let askInput = $state<HTMLInputElement | null>(null);
	async function ask(e: SubmitEvent) {
		e.preventDefault();
		const body = question.trim();
		sentBad = false;
		if (body.length < 3) {
			askInput?.focus();
			sent = 'Type your question first.';
			sentBad = true;
			return;
		}
		if (!auth.session) {
			// Back to this page after signing in, with the question still in the box.
			try {
				sessionStorage.setItem(ASK_KEY, body);
			} catch {
				/* they type it again */
			}
			sent = 'Sign in with your email first, so the reply reaches you.';
			return goto(`/login?next=${encodeURIComponent('/?ask=1')}`);
		}
		const a = auth.account?.role === 'brand' ? auth.account : null;
		asking = true;
		const { error } = await supabase.rpc('ask_question', { p_name: a?.full_name ?? '', p_email: email, p_brand: a?.brand?.name ?? '', p_body: body });
		asking = false;
		if (error) {
			sent = errMessage(error);
			sentBad = true;
			return;
		}
		sent = `Sent. ${first} will reply to ${email}.`;
		question = '';
	}
	$effect(() => {
		if (!p || !askBack) return;
		askBack = false;
		tick().then(() => {
			document.getElementById('ask')?.scrollIntoView({ block: 'center' });
			askInput?.focus({ preventScroll: true });
		});
	});

	// ---------- motion ----------
	let scrolled = $state(false);
	const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Sections rise in once as they scroll into view.
	let seen: IntersectionObserver | null = null;
	const rv: Action<HTMLElement> = (node) => {
		seen ??= new IntersectionObserver(
			(es) => {
				for (const e of es)
					if (e.isIntersecting) {
						e.target.classList.add('in');
						seen?.unobserve(e.target);
					}
			},
			{ rootMargin: '0px 0px -8% 0px' }
		);
		seen.observe(node);
		return { destroy: () => seen?.unobserve(node) };
	};

	// Numbers count up once, when they come into view.
	const countUp: Action<HTMLElement, { to: number; fmt?: (n: number) => string; delay?: number }> = (node, o) => {
		let opts = o;
		let raf = 0, timer = 0, running = false;
		const f = () => opts.fmt ?? kfmt;
		node.textContent = f()(opts.to);
		const run = () => {
			running = true;
			const t0 = performance.now(), d = 1500;
			const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
			const step = (now: number) => {
				const t = Math.min(1, Math.max(0, (now - t0) / d));
				node.textContent = f()(opts.to * ease(t));
				if (t < 1) raf = requestAnimationFrame(step);
				else running = false;
			};
			raf = requestAnimationFrame(step);
		};
		const io = new IntersectionObserver(
			([e]) => {
				if (!e.isIntersecting) return;
				io.disconnect();
				if (!reduce) timer = window.setTimeout(run, opts.delay ?? 0);
			},
			{ rootMargin: '0px 0px -8% 0px' }
		);
		io.observe(node);
		return {
			update(n) {
				opts = n;
				// Fresh numbers (the server's copy is replaced by the database's): show them unless counting.
				if (!running) node.textContent = f()(opts.to);
			},
			destroy() {
				io.disconnect();
				cancelAnimationFrame(raf);
				clearTimeout(timer);
			}
		};
	};

	// The aurora: her page in the app's colours, leaning toward the cursor. Paused when off screen.
	const aurora: Action<HTMLElement> = (hero) => {
		const canvas = hero.querySelector('canvas');
		const ctx = canvas?.getContext('2d');
		if (!canvas || !ctx) return;
		const SC = 7;
		let W = 0, H = 0, on = true, raf = 0;
		const m = { nx: 0, ny: 0, x: 0.7, y: 0.35 };
		// Colours from the app's tokens: violet top-left into magenta, the warm one low (like Today's header).
		const css = getComputedStyle(hero);
		const rgb = (v: string, k = 1) => {
			const h = css.getPropertyValue(v).trim().replace('#', '');
			const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16) || 0;
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * k)).join(',');
		};
		const blobs = [
			{ c: rgb('--g1'), a: 0.34, r: 0.6, x: 0.2, y: 0.2, ax: 0.12, ay: 0.1, sx: 0.0002, sy: 0.00028, ph: 0 },
			{ c: rgb('--g2'), a: 0.3, r: 0.52, x: 0.78, y: 0.4, ax: 0.14, ay: 0.12, sx: 0.00017, sy: 0.00023, ph: 2 },
			{ c: rgb('--g3'), a: 0.18, r: 0.34, x: 0.5, y: 0.62, ax: 0.1, ay: 0.07, sx: 0.00026, sy: 0.00019, ph: 4 },
			{ c: rgb('--g1', 0.68), a: 0.3, r: 0.48, x: 0.12, y: 0.82, ax: 0.1, ay: 0.1, sx: 0.00015, sy: 0.00021, ph: 1.3 },
			{ c: rgb('--m1'), a: 0.24, r: 0.26, x: 0, y: 0, ax: 0, ay: 0, sx: 0, sy: 0, ph: 0, follow: true }
		];
		const paint = (t: number) => {
			ctx.clearRect(0, 0, W, H);
			ctx.globalCompositeOperation = 'screen';
			const mm = Math.max(W, H);
			for (const b of blobs) {
				let x: number, y: number;
				if (b.follow) {
					m.x += (m.nx + 0.5 - m.x) * 0.04;
					m.y += (m.ny + 0.5 - m.y) * 0.04;
					x = m.x * W;
					y = m.y * H;
				} else {
					x = (b.x + Math.sin(t * b.sx + b.ph) * b.ax + m.nx * 0.05) * W;
					y = (b.y + Math.cos(t * b.sy + b.ph) * b.ay + m.ny * 0.05) * H;
				}
				const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * mm);
				g.addColorStop(0, `rgba(${b.c},${b.a})`);
				g.addColorStop(0.45, `rgba(${b.c},${b.a * 0.36})`);
				g.addColorStop(1, `rgba(${b.c},0)`);
				ctx.fillStyle = g;
				ctx.fillRect(0, 0, W, H);
			}
		};
		const size = () => {
			const r = canvas.getBoundingClientRect();
			W = Math.max(40, Math.round(r.width / SC));
			H = Math.max(40, Math.round(r.height / SC));
			canvas.width = W;
			canvas.height = H;
			if (reduce) paint(0);
		};
		const frame = (t: number) => {
			raf = 0;
			if (!on || document.hidden) return;
			paint(t);
			raf = requestAnimationFrame(frame);
		};
		const start = () => {
			if (!raf && !reduce && on && !document.hidden) raf = requestAnimationFrame(frame);
		};
		const io = new IntersectionObserver(([e]) => {
			on = e.isIntersecting;
			start();
		});
		const move = (e: PointerEvent) => {
			const r = hero.getBoundingClientRect();
			m.nx = (e.clientX - r.left) / r.width - 0.5;
			m.ny = (e.clientY - r.top) / r.height - 0.5;
		};
		size();
		io.observe(hero);
		addEventListener('resize', size);
		document.addEventListener('visibilitychange', start);
		hero.addEventListener('pointermove', move);
		start();
		return {
			destroy() {
				cancelAnimationFrame(raf);
				io.disconnect();
				removeEventListener('resize', size);
				document.removeEventListener('visibilitychange', start);
				hero.removeEventListener('pointermove', move);
			}
		};
	};

	// Spotlight on the audience cards.
	function spot(e: PointerEvent) {
		const c = (e.target as HTMLElement).closest<HTMLElement>('.mp-cell');
		if (!c) return;
		const r = c.getBoundingClientRect();
		c.style.setProperty('--mx', `${e.clientX - r.left}px`);
		c.style.setProperty('--my', `${e.clientY - r.top}px`);
	}
</script>

<svelte:head>
	<title>{p ? `Collaborate with ${p.display_name}` : 'Collaborate'}</title>
	{#if p}<meta name="description" content="Send a collaboration request to {p.display_name} (@{p.handle}) and track it any time." />{/if}
</svelte:head>

<svelte:window onscroll={() => (scrolled = scrollY > 20)} />

<div class="mp">
	<div class="mp-grain" aria-hidden="true"></div>
	<svg width="0" height="0" style="position:absolute" aria-hidden="true">
		<defs>
			<linearGradient id="mp-sg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="0"><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".55" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient>
			<linearGradient id="mp-kg" gradientUnits="userSpaceOnUse" x1="60" y1="100" x2="560" y2="440"><stop offset="0" stop-color="#6b3fd4" /><stop offset=".52" stop-color="#d4296a" /><stop offset="1" stop-color="#f2994a" /></linearGradient>
			<path id="mp-kd" d="M64 128C92 104 132 112 144 156C154 220 158 330 156 392C155 420 182 420 182 392C182 300 176 200 196 160C220 104 290 104 300 160C310 220 312 330 310 392C309 420 336 420 336 392C336 300 330 200 350 160C374 104 444 104 452 160C460 230 456 330 452 392C450 440 500 440 540 360M499 384L540 360L545 408" />
		</defs>
	</svg>

	{#if pub.error || pub.missing}
		<main class="mp-msg">
			<div class="mp-wrap">
				<div class="mp-panel">
					{#if pub.error}
						<h3>This page couldn't load</h3>
						<p>{pub.error}</p>
					{:else}
						<!-- An address nobody has yet. -->
						<h3>{pageSlug ? `${pageSlug}.miracleapp.live` : 'This page'} isn't anyone's page yet.</h3>
						<p>Creators get their own link on Miracle. <a href={appAddress('/signup?as=creator')}>Join Miracle</a></p>
					{/if}
				</div>
			</div>
		</main>
	{:else if p}
		<header class="mp-top" class:mp-scrolled={scrolled}>
			<div class="mp-wrap">
				<!-- Top left: the app, Miracle (her name and photo lead the page itself). -->
				<a class="mp-app" href="#top" aria-label="Miracle, back to the top">
					<Logo size={34} />
					<b>Miracle</b>
				</a>
				{#if nav.length}
					<nav class="mp-links" aria-label="Sections">{#each nav as s (s.id)}<a href="#{s.id}">{s.label}</a>{/each}</nav>
				{/if}
				<!-- Brands keep their way in to their requests (sign-out and switching brands live there too). -->
				{#if isCreator}
					<a class="mp-acct" class:mp-solo={!nav.length} href="/studio">Studio</a>
				{:else if signedInBrand}
					<a class="mp-acct" class:mp-solo={!nav.length} href="/brand/requests">My requests</a>
				{:else}
					<a class="mp-acct" class:mp-solo={!nav.length} href="/login">Sign in</a>
				{/if}
				{#if p.accepting}<a class="mp-neo mp-light" href={requestHref}>Send a request</a>{:else}<a class="mp-neo mp-light" href="#ask">Ask a question</a>{/if}
			</div>
		</header>

		<main id="top">
			<section class="mp-hero" aria-labelledby="mp-name" use:aurora>
				<div class="mp-hero-bg" aria-hidden="true"><div class="mp-glow"><i></i><i></i><i></i></div></div>
				<canvas class="mp-aurora" aria-hidden="true"></canvas>
				<div class="mp-veil" aria-hidden="true"></div>
				<div class="mp-wrap">
					<div class="mp-hero-l">
						<div class="mp-id mp-fade">
							<span class="mp-ring"><b>{#if pic}<img src={pic} alt="" referrerpolicy="no-referrer" onerror={() => (picBroken = true)} />{:else}{mono(p.display_name)}{/if}</b></span>
							<div style="display:grid;gap:10px">
								<span class="mp-eb">Brand collaborations{p.city ? ` · ${p.city}` : ''}</span>
								{#if status}<span class="mp-status" class:mp-off={status.off}><i></i>{status.text}</span>{/if}
							</div>
						</div>
						<h1 id="mp-name">
							{#if nameLines.a}<span class="mp-ln"><span>{nameLines.a}</span></span>{/if}
							<span class="mp-ln"><span class="mp-gt">{nameLines.b}</span></span>
						</h1>
						{#if p.bio}<p class="mp-lede mp-fade" style="animation-delay:.4s">{p.bio}</p>
						{:else if p.niche || p.city}<p class="mp-lede mp-fade" style="animation-delay:.4s">{p.niche ? `${p.niche}${p.city ? ` from ${p.city}` : ''}.` : `From ${p.city}.`}</p>{/if}
						{#if p.content_languages?.length}
							<div class="mp-chips mp-fade" style="animation-delay:.5s" aria-label="Content languages">{#each p.content_languages as l (l)}<span class="mp-chip">{l}</span>{/each}</div>
						{/if}
						<div class="mp-ctas mp-fade" style="animation-delay:.6s">
							{#if p.accepting}
								<a class="mp-neo mp-grad" href={requestHref}><span class="mp-shine" aria-hidden="true"></span>Send a request</a>
								<a class="mp-neo mp-ghost" href="#ask">Ask a question</a>
							{:else}
								<a class="mp-neo mp-grad" href="#ask"><span class="mp-shine" aria-hidden="true"></span>Ask a question</a>
							{/if}
							{#if wa}
								<a class="mp-neo mp-wa" href={wa} target="_blank" rel="noopener" aria-label="Message {first} on WhatsApp"
									><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4c0-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.2-.3-.3-.5-.4Z"/></svg
									>WhatsApp</a
								>
							{/if}
						</div>
						<span class="mp-reply mp-fade" style="animation-delay:.7s">{#if p.reply_time}Usually replies within <b>{p.reply_time}</b>{' · '}{/if}No middlemen, you deal with {first} directly</span>
						<span class="mp-reply mp-fade" style="animation-delay:.75s"><button class="mp-tl" onclick={kit} disabled={kitBusy}>{kitBusy ? 'Making the media kit…' : 'Download the media kit (PDF)'}</button></span>
					</div>

					<div class="mp-card mp-fade" style="animation-delay:.3s" aria-label="{first}'s Instagram numbers">
						<div class="mp-mesh" aria-hidden="true"></div>
						<div class="mp-card-in">
							{#if ig}
								<div style="display:flex;justify-content:space-between;align-items:center"><span class="mp-eb" style="font-size:10.5px">Instagram today</span>{#if ig.updated}<span class="mp-updated">updated {ig.updated}</span>{/if}</div>
								<div class="mp-big-n">
									<div><span class="mp-num" use:countUp={{ to: ig.followers, delay: 400 }}></span><p>followers{ig.posts ? ` · ${ig.posts.toLocaleString('en-IN')} posts` : ''}</p></div>
									{#if ig.er !== null}
										<div class="mp-orb"><span class="mp-orb-ring" aria-hidden="true"></span><span class="mp-orb-in"><b>{ig.er}%</b><i>engagement</i></span><span class="mp-spk mp-s1" aria-hidden="true"></span><span class="mp-spk mp-s2" aria-hidden="true"></span><span class="mp-spk mp-s3" aria-hidden="true"></span></div>
									{/if}
								</div>
								{#if spark}
									<div class="mp-spark" role="img" aria-label="Followers over the last {ig.history.length} days"><svg viewBox="0 0 300 56" preserveAspectRatio="none"><path class="mp-l" d={spark} /></svg></div>
								{/if}
								{#if ig.minis.length}
									<div class="mp-minis" style="grid-template-columns:repeat({ig.minis.length},minmax(0,1fr))">
										{#each ig.minis as m (m.k)}<div class="mp-mini-s"><small>{m.k}</small><b use:countUp={{ to: m.v, delay: 400 }}></b></div>{/each}
									</div>
								{/if}
							{:else}
								<div style="display:flex;justify-content:space-between;align-items:center"><span class="mp-eb" style="font-size:10.5px">At a glance</span></div>
								<div class="mp-big-n">
									{#if Number.isFinite(fromPrice)}
										<div><span class="mp-num">{inr(fromPrice)}</span><p>{packs.length ? 'packages from' : 'content from'}</p></div>
									{:else}
										<div><span class="mp-num">{p.worked_with.length || p.reply_time}</span><p>{p.worked_with.length ? 'brands worked with' : 'usual reply time'}</p></div>
									{/if}
								</div>
								{#if glance.length}
									<div class="mp-minis" style="grid-template-columns:repeat({glance.length},minmax(0,1fr))">
										{#each glance as m (m.k)}<div class="mp-mini-s"><small>{m.k}</small><b>{m.v}</b></div>{/each}
									</div>
								{/if}
							{/if}
						</div>
					</div>
				</div>
			</section>

			{#if catalogue.length}
				<section class="mp-sec mp-cat" id="brands" aria-labelledby="mp-br-t">
					<div class="mp-wrap">
						<div class="mp-sec-head">
							<div><span class="mp-eb" data-r use:rv>Brand catalogue</span><h2 class="mp-h2" id="mp-br-t" data-r use:rv>Brands {first} has <span class="mp-gt">worked with.</span></h2></div>
							<div class="mp-cat-sum" data-r="2" use:rv>
								<span><b>{catalogue.length}</b>{catalogue.length === 1 ? 'brand' : 'brands'}</span>
								{#if results.length}<span><b>{results.length}</b>{results.length === 1 ? 'post' : 'posts'} measured</span>{/if}
								{#if bestViews}<span><b>{k1(bestViews)}</b>best views</span>{/if}
							</div>
						</div>
						<div class="mp-brands">
							{#each catalogue as b, i (b.name)}
								<article class="mp-br" class:mp-hit={b.best >= 25000} data-r={(i % 4) + 1} use:rv style="--h:{b.hue}">
									<span class="mp-mono">{b.mono}</span><span class="mp-bn">{b.name}</span>
									{#if b.best}<span class="mp-bl">{b.posts}<b>{k1(b.best)} <small>views</small></b></span>
									{:else if b.reach}<span class="mp-bl">{b.posts}<b>{k1(b.reach)} <small>reach</small></b></span>
									{:else}<span class="mp-bl">{b.posts || 'Collab'}<b>&nbsp;</b></span>{/if}
								</article>
							{/each}
							<a class="mp-br mp-next" data-r="4" use:rv href={p.accepting ? requestHref : '#ask'}><span class="mp-mono"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg></span><span class="mp-bn">Your brand, <span class="mp-gt">next</span></span><span class="mp-bl">{p.accepting ? 'Send a request' : 'Ask a question'}<b>&rarr;</b></span></a>
						</div>
					</div>
				</section>
			{/if}

			{#if reels.length}
				<section class="mp-sec" id="work" aria-labelledby="mp-work-t">
					<div class="mp-wrap">
						<div class="mp-sec-head">
							<div><span class="mp-eb" data-r use:rv>Results for brands</span><h2 class="mp-h2" id="mp-work-t" data-r use:rv>Reels that <span class="mp-gt">get watched.</span></h2></div>
							<p class="mp-lede" data-r="2" use:rv>{first}'s latest brand collaborations, with the numbers Instagram reports. Tap one to watch it.</p>
						</div>
						<div class="mp-reels">
							{#each reels as r, i (r.permalink + i)}
								<a class="mp-reel" data-r={i < 4 ? (i ? i + 1 : '') : i - 1} use:rv href={r.permalink} target="_blank" rel="noopener" style="--h:{hue(r.brand)}">
									<span class="mp-poster">{#if r.thumbnail && !broken[r.permalink]}<img src={r.thumbnail} alt="{r.brand} Reel" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken[r.permalink] = true)} />{/if}</span>
									<span class="mp-play"><svg viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z" /></svg></span>
									<span class="mp-meta"><span class="mp-views"><span use:countUp={{ to: r.views ?? 0 }}></span><small>views</small></span><span class="mp-brand">{r.brand}</span></span>
								</a>
							{/each}
						</div>
						{#if proof.length}
							<div class="mp-proof" data-r use:rv>{#each proof as x (x.t)}<span><b>{x.b}</b>{x.t}</span>{/each}</div>
						{/if}
					</div>
				</section>
			{/if}

			{#if showPackages}
				<section class="mp-sec" id="packages" aria-labelledby="mp-pk-t">
					<div class="mp-wrap">
						<div class="mp-sec-head">
							<div><span class="mp-eb" data-r use:rv>Packages</span><h2 class="mp-h2" id="mp-pk-t" data-r use:rv>Pick a package, <span class="mp-gt">or build your own.</span></h2></div>
							<p class="mp-lede" data-r="2" use:rv>Prices are for one campaign, paid by invoice. {first} replies with a confirmed quote{p.reply_time ? `, usually within ${p.reply_time}` : ''}.</p>
						</div>
						{#if packs.length}
							<div class="mp-tickets">
								{#each packs as k, i (k.id)}
									<article class="mp-ticket" class:mp-hot={i === hot && packs.length > 1} data-r={(i % 3) + 1 === 1 ? '' : (i % 3) + 1} use:rv style="--h:{ticketHue(i)}">
										<div class="mp-t-top">
											{#if k.badge}<div class="mp-t-row"><span class="mp-badge">{k.badge}</span><span></span></div>{/if}
											<h3>{k.name}</h3>
											{#if k.description}<p>{k.description}</p>{/if}
											<span class="mp-price">{inr(k.price)}</span>
											{#if oneByOne(k.items) > k.price}<span class="mp-save"><s>{inr(oneByOne(k.items))}</s> one by one<b>Save {inr(oneByOne(k.items) - k.price)}</b></span>{/if}
										</div>
										<div class="mp-t-cut"></div>
										<div class="mp-t-bot">
											<ul>{#each k.items as it (it.kind)}<li><b>{it.qty}</b>{plural(it.kind, it.qty)}</li>{/each}</ul>
											{#if i === hot && packs.length > 1}
												<a class="mp-neo mp-grad" href="/brand/new?package={k.id}"><span class="mp-shine" aria-hidden="true"></span>Request this</a>
											{:else}
												<a class="mp-neo mp-ghost" href="/brand/new?package={k.id}">Request this</a>
											{/if}
										</div>
									</article>
								{/each}
							</div>
						{/if}
						{#if rates.length}
							<div class="mp-rates" class:mp-only={!packs.length} data-r use:rv>
								<span class="mp-eb" style="font-size:10.5px">{packs.length ? 'Or one at a time' : 'One at a time'}</span>
								{#each rates as [k, v] (k)}<a class="mp-rate" href="/brand/new?item={encodeURIComponent(k)}">{k}<b>{inr(v)}</b></a>{/each}
							</div>
						{/if}
					</div>
				</section>
			{/if}

			{#if showWeeks}
				<section class="mp-sec" id="weeks" aria-labelledby="mp-wk-t">
					<div class="mp-wrap">
						<div class="mp-sec-head"><div><span class="mp-eb" data-r use:rv>Calendar</span><h2 class="mp-h2" id="mp-wk-t" data-r use:rv>{#if weekCells.length}Weeks <span class="mp-gt">still open.</span>{:else}Barter <span class="mp-gt">collabs.</span>{/if}</h2></div></div>
						<div class="mp-weeks-wrap" class:mp-one={!weekCells.length || !barter}>
							{#if weekCells.length}
								<div class="mp-panel" data-r use:rv>
									<h3>Pick a week to go live</h3>
									<div class="mp-weeks">
										{#each weekCells as w (w.start)}
											<span class="mp-wk" class:mp-now={w.now} class:mp-limited={w.status === 'limited'} class:mp-full={w.status === 'full' || w.status === 'away'} aria-label="Week of {w.day} {w.label}: {weekWord[w.status]}">{w.label}<b>{w.day}</b><i></i></span>
										{/each}
									</div>
									<div class="mp-legend"><span><i style="background:var(--ok)"></i>Open</span><span><i style="background:var(--warn)"></i>Filling up</span><span><i style="background:var(--line-strong)"></i>Full</span></div>
								</div>
							{/if}
							{#if barter}
								<div class="mp-panel mp-barter" data-r="2" use:rv>
									<span class="mp-eb" style="font-size:10.5px">Barter collabs</span>
									<h3>{barter.mode === 'open' ? 'Open' : 'Selective'}{#if barter.min_value}, from <span class="mp-gt">{inr(barter.min_value)}</span> in product{:else} to <span class="mp-gt">product collabs</span>{/if}</h3>
									{#if slots !== null}
										<div class="mp-slots" aria-label="{slots} barter {slots === 1 ? 'slot' : 'slots'} left this month">{#each Array.from({ length: Math.max(3, slots) }, (_, j) => j) as j (j)}<i class:mp-on={j < slots}></i>{/each}</div>
									{/if}
									<p>{#if slots !== null}{slots ? `${slots} ${slots === 1 ? 'slot' : 'slots'} left this month.` : 'No barter slots left this month.'}{' '}{/if}{barter.reply_time ? `Barter requests get a reply within ${barter.reply_time}.` : ''}</p>
								</div>
							{/if}
						</div>
					</div>
				</section>
			{/if}

			{#if hasAudience}
				<section class="mp-sec" id="audience" aria-labelledby="mp-au-t">
					<div class="mp-wrap">
						<div class="mp-sec-head">
							<div><span class="mp-eb" data-r use:rv>Audience</span><h2 class="mp-h2" id="mp-au-t" data-r use:rv>Who you'll <span class="mp-gt">reach.</span></h2></div>
							<p class="mp-lede" data-r="2" use:rv>From {first}'s Instagram account insights, last 30 days.</p>
						</div>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="mp-bento" onpointermove={spot}>
							{#if age}
								<article class="mp-cell" style="--sp:{bento.age}" data-r use:rv>
									<span class="mp-eb" style="font-size:10.5px">Age</span><h3>Mostly <span class="mp-gt">{age.head}</span></h3>
									<div class="mp-bars">
										{#each age.rows as r (r.k)}<div class="mp-bar"><span>{r.k}</span><span class="mp-tr"><span class="mp-fl" style="--w:{r.w.toFixed(2)}"></span></span><b>{r.p}%</b></div>{/each}
									</div>
								</article>
							{/if}
							{#if cities}
								<article class="mp-cell" style="--sp:{bento.city}" data-r="2" use:rv>
									<span class="mp-eb" style="font-size:10.5px">Where they are</span><h3><span class="mp-gt">{cities.top}</span> first{cities.then ? `, then ${cities.then}` : ''}</h3>
									<div class="mp-bars">
										{#each cities.rows as r (r.k)}<div class="mp-bar" style="grid-template-columns:120px minmax(0,1fr) 54px"><span>{r.k}</span><span class="mp-tr"><span class="mp-fl" style="--w:{r.w.toFixed(2)}"></span></span><b>{r.v.toLocaleString('en-IN')}</b></div>{/each}
									</div>
									{#if cities.note}<p class="mp-note">{cities.note}</p>{/if}
								</article>
							{/if}
							{#if gender}
								<article class="mp-cell" style="--sp:{bento.gender}" data-r use:rv>
									<span class="mp-eb" style="font-size:10.5px">Men and women</span><h3>{gender.head}</h3>
									<div class="mp-split" role="img" aria-label={gender.rows.map((r) => `${r.k} ${r.p}%`).join(', ')}>{#each gender.rows as r (r.k)}<i style="flex:{r.p};background:{r.c}"></i>{/each}</div>
									<div class="mp-split-l">{#each gender.rows as r (r.k)}<span><i style="background:{r.c}"></i>{r.k} <b>{r.p}%</b></span>{/each}</div>
								</article>
							{/if}
							{#if sponsored}
								<article class="mp-cell" style="--sp:{bento.sponsored}" data-r="2" use:rv>
									<span class="mp-eb" style="font-size:10.5px">Sponsored vs regular posts</span><h3>Brand posts <span class="mp-gt">{sponsored.better ? 'do better' : 'hold their own'}</span></h3>
									<div class="mp-vs"><div class="mp-hi"><small>Sponsored</small><b use:countUp={{ to: sponsored.a }}></b></div><div><small>Regular</small><b use:countUp={{ to: sponsored.b }}></b></div></div>
									<p class="mp-note">Average views per post, last 30 days.</p>
								</article>
							{/if}
							{#if best}
								<article class="mp-cell" style="--sp:{bento.time}" data-r="3" use:rv>
									<span class="mp-eb" style="font-size:10.5px">Best time to post</span><h3>{#if best.when}{best.day} <span class="mp-gt">{best.when}</span>{:else}<span class="mp-gt">{best.day}s</span>{/if}</h3>
									<div class="mp-days">
										{#each best.days as d (d.k)}<div class:mp-best={d.best}><i style="height:{d.h}%"></i>{d.k}</div>{/each}
									</div>
								</article>
							{/if}
							{#if reelStats.length}
								<article class="mp-cell" style="--sp:{bento.reels}" data-r use:rv>
									<span class="mp-eb" style="font-size:10.5px">What a Reel usually does</span>
									<div style="display:flex;flex-wrap:wrap;gap:28px 48px;align-items:flex-end;margin-top:auto">
										{#each reelStats as s (s.t)}<div>{#if s.count}<span class="mp-huge" use:countUp={{ to: s.v }}></span>{:else}<span class="mp-huge">{s.v.toFixed(1)}%</span>{/if}<p class="mp-note">{s.t}</p></div>{/each}
									</div>
								</article>
							{/if}
							{#if topics}
								<article class="mp-cell" style="--sp:{bento.topics}" data-r="2" use:rv>
									<span class="mp-eb" style="font-size:10.5px">Topics that travel</span><h3><span class="mp-gt">{topics.a}</span>{topics.b ? ` and ${topics.b}` : ''}</h3>
									<div class="mp-bars">
										{#each topics.rows as r (r.k)}<div class="mp-bar" style="grid-template-columns:76px minmax(0,1fr) 50px"><span>{r.k}</span><span class="mp-tr"><span class="mp-fl" style="--w:{r.w.toFixed(2)}"></span></span><b>{k0(r.v)}</b></div>{/each}
									</div>
								</article>
							{/if}
						</div>
					</div>
				</section>
			{/if}

			<section class="mp-sec" aria-labelledby="mp-how-t">
				<div class="mp-wrap">
					<div class="mp-sec-head"><div><span class="mp-eb" data-r use:rv>How it works</span><h2 class="mp-h2" id="mp-how-t" data-r use:rv>Simple, <span class="mp-gt">start to paid.</span></h2></div></div>
					<div class="mp-steps">
						<div class="mp-step" data-r use:rv style="--c:var(--h-request)"><b>Send a request</b><p>Your brief, budget and dates, in two minutes.</p></div>
						<div class="mp-step" data-r="2" use:rv style="--c:var(--h-nego)"><b>Get a quote</b><p>A confirmed price and timeline, usually within a day.</p></div>
						<div class="mp-step" data-r="3" use:rv style="--c:var(--h-confirmed)"><b>Approve the draft</b><p>Comment on the cut before anything goes live.</p></div>
						<div class="mp-step" data-r="4" use:rv style="--c:var(--h-live)"><b>See it live</b><p>A link with the post's numbers, any time you want them.</p></div>
						<div class="mp-step" data-r="4" use:rv style="--c:var(--ok)"><b>Pay by invoice</b><p>A GST invoice with a UPI QR for the exact amount.</p></div>
					</div>
				</div>
			</section>

			<section class="mp-final" id="ask" aria-labelledby="mp-ask-t">
				<div class="mp-wrap">
					<span class="mp-eb" data-r use:rv>Work with {first}</span>
					<h2 class="mp-h2" id="mp-ask-t" data-r use:rv>Let's make something <span class="mp-gt">together.</span></h2>
					{#if p.accepting}
						<div class="mp-ctas" data-r="2" use:rv>
							<a class="mp-neo mp-grad" href={requestHref}><span class="mp-shine" aria-hidden="true"></span>Send a request</a>
							{#if showWeeks}<a class="mp-neo mp-ghost" href="#weeks">See open weeks</a>{:else if showPackages}<a class="mp-neo mp-ghost" href="#packages">See packages</a>{/if}
						</div>
					{/if}
					<form class="mp-ask" data-r="3" use:rv novalidate onsubmit={ask}>
						<label for="mp-q">Ask {first} a question</label>
						<input id="mp-q" bind:this={askInput} bind:value={question} placeholder="Ask a question before you book…" autocomplete="off" maxlength="2000" />
						<button class="mp-neo mp-light" type="submit" disabled={asking}>{asking ? 'Sending…' : 'Ask'}</button>
					</form>
					<p class="mp-sent" class:mp-bad={sentBad} role="status">{sent}</p>
					<p class="mp-small">
						{#if p.whatsapp && waLink(p.whatsapp, '')}<a href={waLink(p.whatsapp, `Hi ${first}! I'd like to discuss a collaboration.`)} target="_blank" rel="noopener">WhatsApp {first}</a><span aria-hidden="true">·</span>{/if}
						<a href={trackHref}>Track my requests</a>
					</p>
				</div>
			</section>
		</main>

		<footer>
			<div class="mp-wrap">
				<a class="mp-pw" href="https://miracleapp.live" aria-label="Made with Miracle"><svg viewBox="0 0 512 512" aria-hidden="true"><g transform="translate(256 256) scale(1.04) translate(-256 -256)"><g transform="translate(256 256) scale(.79) skewX(-13) translate(-304.5 -266)" fill="none" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"><use href="#mp-kd" transform="translate(-13 -10)" stroke="#F4EEF2" /><use href="#mp-kd" transform="translate(13 10)" stroke="url(#mp-kg)" /></g></g></svg><span>Made with <b>Miracle</b></span></a>
				<span>Brands pay {first} directly. Miracle never takes a cut.</span>
				{#if ins}<a href="/insights" style="color:var(--ink-2)">See {first}'s full insights</a>{/if}
				{#if signedInBrand}
					<span class="mp-me">{email} · <a href="/brand/requests">My requests</a> · <button class="mp-tl" onclick={logout}>Sign out</button></span>
				{:else if !isCreator}
					<a class="mp-me" href="/login" style="color:var(--ink-2)">Sign in</a>
				{/if}
				<a href={appAddress('/signup?as=creator')} style="color:var(--ink-2)">Are you a creator? Get your own page</a>
			</div>
		</footer>
	{:else}
		<main class="mp-msg" aria-label="Loading"><div class="mp-load" aria-hidden="true"><span class="mp-ring"><b></b></span></div></main>
	{/if}
</div>

<style>
	/* The app's theme and background art step aside on this page (it's dark only). */
	:global(html.mp-on) {
		scroll-behavior: smooth;
		overflow-x: clip;
		color-scheme: dark;
		background: #110d11;
	}
	:global(html.mp-on body) {
		margin: 0;
		background: #110d11;
		overflow-x: clip;
	}
	:global(html.mp-on .aurora),
	:global(html.mp-on .grain) {
		display: none;
	}

	.mp {
		color-scheme: dark;
		/* The app's dark theme tokens (app.css :root[data-theme='dark']), set here so the page stays dark. */
		--bg: #110d11;
		--surface: #1a151a;
		--surface-2: #231d23;
		--line: #2e262e;
		--line-strong: #3e343e;
		--ink: #f4eef2;
		--ink-2: #c9bfc6;
		--ink-3: #a39aa1;
		--accent: #f25a90;
		--g1: #9c7bff;
		--g2: #f25a90;
		--g3: #ffae6b;
		--hero: #1f151e;
		--hero-ink: #fbf2f6;
		--chrome: #09070a;
		--h-request: #7ea2ff;
		--h-nego: #efb35a;
		--h-confirmed: #b49cff;
		--h-live: #4ccfc2;
		--ok: #6fd08c;
		--warn: #efb35a;
		--bad: #ff7b70;
		--m1: #e58ab0;
		--m2: #7db4e3;
		--m3: #7cc7ae;
		--m4: #e3a665;
		--m5: #ae9cf0;
		--m6: #cdb083;
		--grad: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3));
		--f-display: 'Instrument Serif', Georgia, 'Times New Roman', serif;
		--f-body: 'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
		--f-mono: 'Geist Mono', ui-monospace, 'SF Mono', Consolas, monospace;
		--ease: cubic-bezier(0.2, 0.8, 0.2, 1);
		position: relative;
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
		font: 400 16px/1.6 var(--f-body);
		-webkit-font-smoothing: antialiased;
		text-align: left;
		letter-spacing: normal;
		overflow-x: clip;
	}
	* {
		box-sizing: border-box;
	}
	/* The app's own element styles (headings, links, lists, inputs) don't reach in. */
	h1,
	h2,
	h3,
	p,
	ul,
	li,
	small,
	b,
	article,
	section,
	header,
	footer,
	main,
	nav,
	form,
	label,
	input,
	button,
	img,
	canvas,
	svg {
		color: inherit;
		text-transform: none;
		text-shadow: none;
	}
	h1,
	h2,
	h3 {
		letter-spacing: normal;
		text-wrap: wrap;
	}
	a {
		color: inherit;
		text-decoration: none;
	}
	button {
		font: inherit;
		color: inherit;
	}
	:focus-visible {
		outline: 2px solid var(--g3);
		outline-offset: 3px;
	}
	.mp-wrap {
		width: min(1200px, 100%);
		margin: 0 auto;
		padding-left: max(16px, env(safe-area-inset-left, 0px));
		padding-right: max(16px, env(safe-area-inset-right, 0px));
	}
	@media (min-width: 900px) {
		.mp-wrap {
			padding-left: max(40px, env(safe-area-inset-left, 0px));
			padding-right: max(40px, env(safe-area-inset-right, 0px));
		}
	}
	.mp-gt {
		font-style: italic;
		background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.08em;
	}
	.mp-eb {
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.mp-h2 {
		margin: 0;
		font: 400 clamp(40px, 5.4vw, 80px) / 0.98 var(--f-display);
		letter-spacing: -0.015em;
		text-wrap: balance;
	}
	.mp-lede {
		margin: 0;
		max-width: 44ch;
		color: var(--ink-3);
		font-size: clamp(15px, 1.25vw, 18px);
	}
	.mp-grain {
		position: fixed;
		inset: 0;
		z-index: 60;
		pointer-events: none;
		opacity: 0.06;
		mix-blend-mode: soft-light;
		background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>");
	}
	section {
		position: relative;
	}
	.mp-sec {
		padding-block: 120px 0;
	}
	.mp-sec-head {
		display: flex;
		flex-wrap: wrap;
		gap: 18px 40px;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 44px;
	}
	.mp-sec-head > div {
		display: grid;
		gap: 16px;
	}
	.mp-tl {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-2);
		font: inherit;
		text-decoration: underline;
		text-decoration-color: var(--line-strong);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.mp-tl:hover {
		color: var(--ink);
	}
	.mp-tl:disabled {
		cursor: progress;
		opacity: 0.7;
	}

	/* NeoPOP */
	.mp-neo {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 54px;
		padding: 0 24px;
		border: 0;
		border-radius: 0;
		cursor: pointer;
		font: 700 13px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		white-space: nowrap;
		transition:
			transform 0.12s var(--ease),
			box-shadow 0.12s var(--ease);
	}
	.mp-neo.mp-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 5px 5px 0 color-mix(in oklab, var(--g1) 72%, #000);
	}
	.mp-neo.mp-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 5px 5px 0 var(--accent);
	}
	.mp-neo.mp-ghost {
		background: var(--surface);
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1px var(--line),
			5px 5px 0 var(--line-strong);
	}
	.mp-neo:hover {
		transform: translate(-2px, -2px);
	}
	.mp-neo:active {
		transform: translate(5px, 5px);
		box-shadow: none;
	}
	.mp-neo:disabled {
		cursor: progress;
		opacity: 0.75;
	}
	.mp-neo .mp-shine {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.mp-neo .mp-shine::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: -50%;
		width: 35%;
		background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.38), transparent);
		transform: skewX(-18deg);
		animation: sweep 4.5s ease-in-out 1.5s infinite;
	}
	@keyframes sweep {
		0%,
		70% {
			transform: translateX(0) skewX(-18deg);
		}
		100% {
			transform: translateX(560%) skewX(-18deg);
		}
	}

	/* top bar */
	.mp-top {
		position: fixed;
		z-index: 50;
		top: 0;
		left: 0;
		right: 0;
		padding-top: env(safe-area-inset-top, 0px);
		transition:
			background 0.4s,
			box-shadow 0.4s;
	}
	.mp-top.mp-scrolled {
		background: color-mix(in oklab, var(--bg) 94%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		box-shadow: 0 1px 0 var(--line);
	}
	.mp-top .mp-wrap {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 72px;
	}
	.mp-app {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		text-decoration: none;
	}
	.mp-app b {
		font: 400 28px/1 var(--f-display);
		font-style: italic;
		letter-spacing: -0.01em;
	}
	.mp-top .mp-links {
		display: flex;
		gap: 24px;
		margin-left: auto;
		font-size: 14px;
		color: var(--ink-2);
	}
	.mp-top .mp-links a:hover,
	.mp-acct:hover {
		color: var(--ink);
	}
	.mp-acct {
		font-size: 13px;
		color: var(--ink-3);
		white-space: nowrap;
	}
	.mp-acct.mp-solo {
		margin-left: auto;
	}
	.mp-top .mp-neo {
		height: 42px;
		padding: 0 16px;
		font-size: 11.5px;
	}
	@media (max-width: 900px) {
		.mp-top .mp-links {
			display: none;
		}
		.mp-acct {
			margin-left: auto;
		}
	}
	@media (max-width: 560px) {
		.mp-acct {
			display: none;
		}
		.mp-top .mp-neo {
			margin-left: auto;
		}
	}

	/* hero */
	.mp-hero {
		overflow: hidden;
		padding-top: 120px;
		padding-bottom: 70px;
		isolation: isolate;
	}
	.mp-hero-bg {
		position: absolute;
		inset: 0;
		z-index: -3;
		background: var(--bg);
		overflow: hidden;
	}
	/* Today's header glow (.ht-glow): violet top-left, magenta right, the warm one between, blurred. */
	.mp-glow {
		position: absolute;
		inset: -60px 0 auto;
		height: clamp(340px, 62vw, 820px);
		-webkit-mask-image: linear-gradient(#000 30%, transparent 96%);
		mask-image: linear-gradient(#000 30%, transparent 96%);
	}
	.mp-glow i {
		position: absolute;
		width: clamp(230px, 34vw, 520px);
		aspect-ratio: 1;
		border-radius: 50%;
		filter: blur(clamp(56px, 7vw, 110px));
		opacity: 0.5;
		animation: blob 14s ease-in-out infinite alternate;
	}
	.mp-glow i:nth-child(1) {
		background: var(--g1);
		left: -30px;
		top: 10px;
	}
	.mp-glow i:nth-child(2) {
		background: var(--g2);
		right: -40px;
		top: 30px;
		animation-delay: -5s;
		animation-duration: 17s;
	}
	.mp-glow i:nth-child(3) {
		background: var(--g3);
		left: 35%;
		top: clamp(120px, 16vw, 260px);
		width: clamp(170px, 25vw, 380px);
		opacity: 0.35;
		animation-delay: -9s;
	}
	@keyframes blob {
		0% {
			transform: translate(0, 0) scale(1);
		}
		50% {
			transform: translate(28px, 18px) scale(1.15);
		}
		100% {
			transform: translate(-18px, 10px) scale(0.95);
		}
	}
	.mp-aurora {
		position: absolute;
		inset: -4%;
		z-index: -2;
		width: 108%;
		height: 108%;
		opacity: 0.85;
	}
	.mp-veil {
		position: absolute;
		inset: 0;
		z-index: -1;
		background:
			linear-gradient(90deg, color-mix(in oklab, var(--bg) 38%, transparent), color-mix(in oklab, var(--bg) 10%, transparent) 58%, transparent),
			linear-gradient(transparent 70%, var(--bg));
		pointer-events: none;
	}
	.mp-hero .mp-wrap {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
		gap: 48px;
		align-items: center;
	}
	.mp-hero-l {
		display: grid;
		gap: 26px;
	}
	.mp-id {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.mp-ring {
		width: 96px;
		height: 96px;
		flex: none;
		border-radius: 50%;
		padding: 3px;
		background: conic-gradient(from 210deg, var(--g3), var(--g2), var(--g1), var(--g3));
		animation: spin 14s linear infinite;
	}
	.mp-ring b {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 3px solid var(--bg);
		background: var(--surface-2);
		font: 400 36px/1 var(--f-display);
		overflow: hidden;
		animation: spin 14s linear infinite reverse;
	}
	.mp-ring img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.mp-status {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 8px 14px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--ok) 12%, transparent);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--ok) 35%, transparent) inset;
		color: var(--ok);
		font: 600 13px/1 var(--f-body);
	}
	.mp-status i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ok);
		box-shadow: 0 0 10px var(--ok);
		animation: pulse 2s ease-in-out infinite;
	}
	.mp-status.mp-off {
		background: color-mix(in oklab, var(--warn) 12%, transparent);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--warn) 35%, transparent) inset;
		color: var(--warn);
	}
	.mp-status.mp-off i {
		background: var(--warn);
		box-shadow: 0 0 10px var(--warn);
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	.mp-hero h1 {
		margin: 0;
		font: 400 clamp(58px, 8.2vw, 124px) / 0.9 var(--f-display);
		letter-spacing: -0.025em;
	}
	.mp-hero h1 .mp-ln {
		display: block;
		overflow: hidden;
		padding-bottom: 0.08em;
		margin-bottom: -0.08em;
	}
	.mp-hero h1 .mp-ln > span {
		display: inline-block;
		animation: rise 1.1s var(--ease) both;
	}
	.mp-hero h1 .mp-ln:nth-child(2) > span {
		animation-delay: 0.12s;
	}
	/* The name: Today's ".ht-hi em" gradient with its slow shine. */
	.mp-hero h1 .mp-gt {
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3), var(--g2), var(--g1));
		background-size: 250% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		animation:
			rise 1.1s var(--ease) both,
			shine 7s linear infinite;
	}
	.mp-hero h1 .mp-ln:nth-child(2) > .mp-gt {
		animation-delay: 0.12s, 0s;
	}
	@keyframes shine {
		to {
			background-position: 250% 0;
		}
	}
	@keyframes rise {
		from {
			transform: translateY(105%) rotate(4deg);
		}
		to {
			transform: none;
		}
	}
	.mp-fade {
		animation: fadeup 1s var(--ease) both;
	}
	@keyframes fadeup {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.mp-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.mp-chip {
		padding: 7px 13px;
		border-radius: 999px;
		box-shadow: 0 0 0 1px var(--line-strong) inset;
		font-size: 13px;
		color: var(--ink);
		background: transparent;
	}
	.mp-neo.mp-wa {
		background: #0c090c;
		color: #f4eef2;
		box-shadow:
			inset 0 0 0 1.5px color-mix(in oklab, #25d366 55%, transparent),
			5px 5px 0 color-mix(in oklab, #25d366 45%, #0c090c);
	}
	.mp-neo.mp-wa svg {
		width: 18px;
		height: 18px;
		flex: none;
		color: #25d366;
	}
	.mp-ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 20px;
		align-items: center;
	}
	.mp-reply {
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.mp-reply b {
		color: var(--ink);
	}
	.mp-hero-l .mp-reply + .mp-reply {
		margin-top: -16px;
	}

	/* the numbers card */
	/* Today's "Received in ..." card: the hero colour, the slowly turning mesh glow, glass tiles. */
	.mp-card {
		position: relative;
		overflow: hidden;
		isolation: isolate;
		border-radius: 28px;
		background: var(--hero);
		color: var(--hero-ink);
		border: 1px solid color-mix(in oklab, var(--hero-ink) 10%, transparent);
		box-shadow:
			0 30px 60px -28px rgba(40, 14, 40, 0.65),
			0 2px 6px rgba(0, 0, 0, 0.2);
	}
	.mp-mesh {
		position: absolute;
		inset: -45%;
		z-index: -1;
		pointer-events: none;
		background:
			radial-gradient(closest-side at 28% 38%, color-mix(in oklab, var(--g2) 75%, transparent), transparent 72%),
			radial-gradient(closest-side at 74% 28%, color-mix(in oklab, var(--g1) 75%, transparent), transparent 72%),
			radial-gradient(closest-side at 62% 78%, color-mix(in oklab, var(--g3) 65%, transparent), transparent 72%);
		filter: blur(34px);
		opacity: 0.62;
		animation: spin 36s linear infinite;
	}
	.mp-card-in {
		padding: 26px;
		display: grid;
		gap: 20px;
	}
	.mp-card .mp-eb,
	.mp-card .mp-updated,
	.mp-big-n p {
		color: color-mix(in oklab, var(--hero-ink) 72%, transparent);
	}
	.mp-big-n {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px 16px;
		align-items: center;
	}
	.mp-big-n .mp-num {
		font: 400 76px/0.9 var(--f-display);
		font-variant-numeric: tabular-nums;
	}
	.mp-big-n p {
		margin: 4px 0 0;
		font-size: 13.5px;
	}
	/* Engagement in Today's followers orb: a turning gradient ring with sparkles, a glass middle and the
	   green "eng." pill. */
	.mp-orb {
		position: relative;
		width: 108px;
		height: 108px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		animation: orb-in 0.8s 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
	}
	.mp-orb-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		padding: 3px;
		background: conic-gradient(from 0deg, var(--g3), var(--g2), var(--g1), transparent 70%, var(--g3));
		-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
		mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
		animation: spin 6s linear infinite;
	}
	.mp-orb-in {
		position: absolute;
		inset: 9px;
		border-radius: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		color: var(--ink);
		background: radial-gradient(circle at 30% 25%, color-mix(in oklab, var(--surface) 70%, transparent), color-mix(in oklab, var(--bg) 55%, transparent));
		border: 1px solid color-mix(in oklab, var(--ink) 10%, transparent);
		-webkit-backdrop-filter: blur(14px);
		backdrop-filter: blur(14px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 18px 36px -18px color-mix(in oklab, var(--g2) 60%, transparent);
	}
	.mp-orb-in b {
		font: 800 20px/1 var(--f-body);
		letter-spacing: -0.02em;
	}
	.mp-orb-in i {
		margin-top: 6px;
		padding: 2px 8px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
		font: normal 700 10.5px/1.4 var(--f-body);
	}
	.mp-spk {
		position: absolute;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 10px 2px color-mix(in oklab, var(--g2) 80%, transparent);
		animation: twinkle 2.8s ease-in-out infinite;
	}
	.mp-spk.mp-s1 {
		top: 3px;
		left: 19px;
	}
	.mp-spk.mp-s2 {
		bottom: 10px;
		right: 2px;
		width: 4px;
		height: 4px;
		animation-delay: 0.9s;
	}
	.mp-spk.mp-s3 {
		top: 40px;
		left: -5px;
		width: 3px;
		height: 3px;
		animation-delay: 1.7s;
	}
	@keyframes orb-in {
		from {
			opacity: 0;
			transform: scale(0.6) rotate(-20deg);
		}
	}
	@keyframes twinkle {
		0%,
		100% {
			opacity: 0.2;
			transform: scale(0.6);
		}
		50% {
			opacity: 1;
			transform: scale(1.2);
		}
	}
	.mp-spark {
		height: 56px;
	}
	.mp-spark svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.mp-spark path.mp-l {
		fill: none;
		stroke: url(#mp-sg);
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-dasharray: 600;
		stroke-dashoffset: 600;
		animation: draw 2s var(--ease) 0.5s forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	.mp-minis {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.mp-mini-s {
		padding: 12px 13px;
		border-radius: 16px;
		background: color-mix(in oklab, var(--hero-ink) 6%, transparent);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--hero-ink) 12%, transparent) inset;
	}
	.mp-mini-s small {
		display: block;
		font: 600 10px/1.3 var(--f-body);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: color-mix(in oklab, var(--hero-ink) 66%, transparent);
	}
	.mp-mini-s b {
		display: block;
		margin-top: 6px;
		font: 400 26px/1 var(--f-display);
		font-variant-numeric: tabular-nums;
	}
	.mp-updated {
		font: 500 11px/1 var(--f-mono);
	}

	/* the brand catalogue */
	.mp-cat {
		padding-top: 110px;
	}
	.mp-sec-head > .mp-cat-sum {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.mp-cat-sum span {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		padding: 12px 16px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.mp-cat-sum b {
		font: 400 28px/1 var(--f-display);
		color: var(--ink);
	}
	.mp-brands {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
	}
	.mp-br {
		position: relative;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 14px;
		min-height: 178px;
		padding: 18px;
		border-radius: 22px;
		background: linear-gradient(160deg, color-mix(in oklab, var(--h) 22%, var(--surface)), var(--surface) 60%);
		box-shadow: 0 0 0 1px var(--line) inset;
		overflow: hidden;
		isolation: isolate;
		transition:
			transform 0.5s var(--ease),
			box-shadow 0.5s var(--ease);
	}
	.mp-br::after {
		content: '';
		position: absolute;
		right: -40px;
		top: -40px;
		z-index: -1;
		width: 140px;
		height: 140px;
		border-radius: 50%;
		background: radial-gradient(circle, color-mix(in oklab, var(--h) 55%, transparent), transparent 70%);
		opacity: 0.5;
		transition: opacity 0.5s;
	}
	.mp-br:hover {
		transform: translateY(-6px);
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--h) 60%, var(--line-strong)) inset,
			0 30px 60px -30px color-mix(in oklab, var(--h) 70%, transparent);
	}
	.mp-br:hover::after {
		opacity: 0.9;
	}
	.mp-br:hover .mp-mono {
		transform: rotate(-6deg) scale(1.06);
	}
	.mp-mono {
		width: 46px;
		height: 46px;
		display: grid;
		place-items: center;
		border-radius: 14px;
		background: linear-gradient(135deg, color-mix(in oklab, var(--h) 82%, #1a0d18), color-mix(in oklab, var(--h) 45%, #140a12));
		font: 700 15px/1 var(--f-body);
		color: #fff;
		letter-spacing: 0.02em;
		box-shadow: 0 10px 24px -10px var(--h);
		transition: transform 0.5s var(--ease);
	}
	.mp-bn {
		font: 400 24px/1.05 var(--f-display);
		align-self: end;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}
	.mp-bl {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px dashed var(--line-strong);
		font-size: 12px;
		color: var(--ink-3);
	}
	.mp-bl b {
		font: 400 22px/1 var(--f-display);
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.mp-bl b small {
		font: 600 9.5px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mp-br.mp-hit .mp-bl b {
		background: var(--grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.mp-br.mp-next {
		--h: var(--g2);
		background: transparent;
		box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--g2) 45%, transparent);
		border: 0;
	}
	.mp-br.mp-next .mp-mono {
		background: var(--grad);
		color: #fff;
	}
	.mp-br.mp-next .mp-mono svg {
		width: 20px;
		height: 20px;
	}
	.mp-br.mp-next .mp-bl {
		color: var(--ink-2);
		font-weight: 600;
	}
	@media (max-width: 1100px) {
		.mp-brands {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 800px) {
		.mp-brands {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.mp-br {
			min-height: 150px;
			padding: 14px;
		}
		.mp-bn {
			font-size: 20px;
		}
		.mp-mono {
			width: 40px;
			height: 40px;
		}
	}

	/* results */
	.mp-reels {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 14px;
	}
	.mp-reel {
		position: relative;
		aspect-ratio: 9/16;
		max-width: 100%;
		border-radius: 20px;
		overflow: hidden;
		isolation: isolate;
		box-shadow: 0 0 0 1px var(--line) inset;
		transition: transform 0.5s var(--ease);
	}
	.mp-reel:hover {
		transform: translateY(-8px) rotate(-1deg);
	}
	.mp-reel .mp-poster {
		position: absolute;
		inset: 0;
		z-index: -1;
		background: radial-gradient(120% 80% at 40% 25%, color-mix(in oklab, var(--h) 60%, #1a0d18), color-mix(in oklab, var(--h) 22%, #140a12) 55%, var(--bg));
	}
	.mp-reel .mp-poster img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.mp-reel .mp-poster::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(transparent 40%, color-mix(in oklab, var(--chrome) 92%, transparent));
	}
	.mp-reel .mp-play {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.18);
		backdrop-filter: blur(6px);
	}
	.mp-reel .mp-play svg {
		width: 12px;
		height: 12px;
		fill: #fff;
	}
	.mp-reel .mp-meta {
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 12px;
		display: grid;
		gap: 4px;
	}
	.mp-reel .mp-views {
		font: 400 34px/1 var(--f-display);
		font-variant-numeric: tabular-nums;
	}
	.mp-reel .mp-views small {
		font: 600 10px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-2);
		margin-left: 4px;
	}
	.mp-reel .mp-brand {
		font: 600 12.5px/1.2 var(--f-body);
	}
	.mp-proof {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 22px;
	}
	.mp-proof span {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		font-size: 14px;
		color: var(--ink-2);
	}
	.mp-proof b {
		font: 400 26px/1 var(--f-display);
		color: var(--ink);
	}

	/* packages: the app's ticket cards */
	.mp-tickets {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 22px;
		align-items: start;
	}
	.mp-ticket {
		--h: var(--m5);
		--edge: var(--line-strong);
		--edge-w: 1px;
		position: relative;
		border-radius: 24px;
		box-shadow: 0 40px 80px -40px rgba(0, 0, 0, 0.9);
		transition: transform 0.5s var(--ease);
	}
	/* The two halves are cut where they meet: a round hole on each side, like a ticket. */
	.mp-t-top,
	.mp-t-bot {
		-webkit-mask:
			radial-gradient(circle at 0 var(--hy), #0000 12px, #000 12.5px) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% var(--hy), #0000 12px, #000 12.5px) right / 51% 100% no-repeat;
		mask:
			radial-gradient(circle at 0 var(--hy), #0000 12px, #000 12.5px) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% var(--hy), #0000 12px, #000 12.5px) right / 51% 100% no-repeat;
	}
	.mp-ticket:hover {
		transform: translateY(-6px);
	}
	.mp-ticket.mp-hot {
		--edge: color-mix(in oklab, var(--g3) 60%, transparent);
		--edge-w: 1.5px;
		transform: translateY(-14px);
		box-shadow: 0 50px 100px -40px color-mix(in oklab, var(--g2) 60%, transparent);
	}
	.mp-ticket.mp-hot:hover {
		transform: translateY(-20px);
	}
	.mp-t-top {
		--hy: 100%;
		padding: 22px 22px 20px;
		border-radius: 24px 24px 0 0;
		box-shadow:
			inset var(--edge-w) 0 0 var(--edge),
			inset calc(-1 * var(--edge-w)) 0 0 var(--edge),
			inset 0 var(--edge-w) 0 var(--edge);
		background: linear-gradient(135deg, color-mix(in oklab, var(--h) 82%, #1a0d18) 0%, color-mix(in oklab, var(--h) 45%, #140a12) 70%, #140a12 100%);
		color: #fff;
		display: grid;
		gap: 10px;
	}
	.mp-t-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.mp-badge {
		padding: 5px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.2);
		font: 700 10px/1 var(--f-body);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.mp-t-top h3 {
		margin: 0;
		font: 400 34px/1 var(--f-display);
		font-style: italic;
	}
	.mp-t-top p {
		margin: 0;
		font-size: 13.5px;
		opacity: 0.85;
	}
	.mp-price {
		font: 400 46px/1 var(--f-display);
		font-variant-numeric: tabular-nums;
	}
	.mp-t-cut {
		position: relative;
		z-index: 1;
		height: 0;
		margin: 0 22px;
		border-top: 2px dashed var(--line-strong);
	}
	.mp-save {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		font-size: 12.5px;
		color: rgba(255, 255, 255, 0.72);
	}
	.mp-save s {
		color: rgba(255, 255, 255, 0.6);
	}
	.mp-save b {
		padding: 4px 9px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--ok) 22%, transparent);
		color: var(--ok);
		font: 700 11px/1 var(--f-body);
		letter-spacing: 0.04em;
	}
	.mp-t-bot {
		--hy: 0%;
		padding: 20px 22px 22px;
		border-radius: 0 0 24px 24px;
		background: var(--surface);
		box-shadow:
			inset var(--edge-w) 0 0 var(--edge),
			inset calc(-1 * var(--edge-w)) 0 0 var(--edge),
			inset 0 calc(-1 * var(--edge-w)) 0 var(--edge);
		display: grid;
		gap: 16px;
	}
	.mp-t-bot ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 9px;
	}
	.mp-t-bot li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14.5px;
		margin: 0;
	}
	.mp-t-bot li b {
		display: grid;
		place-items: center;
		min-width: 28px;
		height: 24px;
		padding: 0 6px;
		border-radius: 8px;
		background: var(--surface-2);
		font: 700 12px/1 var(--f-mono);
	}
	.mp-t-bot .mp-neo {
		width: 100%;
		height: 48px;
		font-size: 12px;
	}
	.mp-rates {
		margin-top: 34px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.mp-rates.mp-only {
		margin-top: 0;
	}
	.mp-rates > span:first-child {
		margin-right: 6px;
	}
	.mp-rate {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		padding: 10px 14px;
		border-radius: 14px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		font-size: 13.5px;
		color: var(--ink-2);
		transition: box-shadow 0.3s;
	}
	.mp-rate:hover {
		box-shadow: 0 0 0 1px var(--line-strong) inset;
	}
	.mp-rate b {
		font: 600 15px/1 var(--f-body);
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	/* weeks */
	.mp-weeks-wrap {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
		gap: 22px;
	}
	.mp-weeks-wrap.mp-one {
		grid-template-columns: minmax(0, 1fr);
	}
	.mp-panel {
		border-radius: 26px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		padding: 26px;
		display: grid;
		gap: 18px;
		align-content: start;
	}
	.mp-panel h3 {
		margin: 0;
		font: 400 30px/1.05 var(--f-display);
	}
	.mp-panel p {
		margin: 0;
		color: var(--ink-3);
		font-size: 14.5px;
	}
	.mp-panel p a {
		color: var(--ink);
		text-decoration: underline;
	}
	.mp-weeks {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 8px;
	}
	.mp-wk {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 14px 0 12px;
		border-radius: 999px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		font: 700 9.5px/1 var(--f-body);
		letter-spacing: 0.12em;
		color: var(--ink-3);
		text-transform: uppercase;
	}
	.mp-wk b {
		font: 400 26px/1 var(--f-display);
		color: var(--ink);
		letter-spacing: 0;
	}
	.mp-wk i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ok);
	}
	.mp-wk.mp-limited i {
		background: var(--warn);
	}
	.mp-wk.mp-full i {
		background: var(--line-strong);
	}
	.mp-wk.mp-full b {
		color: var(--ink-3);
	}
	.mp-wk.mp-now {
		background: linear-gradient(170deg, var(--g1), var(--g2) 60%, var(--g3));
		box-shadow: 0 10px 26px -10px color-mix(in oklab, var(--g2) 70%, transparent);
		color: #fff;
	}
	.mp-wk.mp-now b {
		color: #fff;
	}
	.mp-wk.mp-now i {
		background: #fff;
	}
	.mp-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.mp-legend span {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.mp-legend i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.mp-barter .mp-slots {
		display: flex;
		gap: 6px;
	}
	.mp-barter .mp-slots i {
		flex: 1;
		height: 8px;
		border-radius: 99px;
		background: var(--line);
	}
	.mp-barter .mp-slots i.mp-on {
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
	}

	/* audience bento */
	.mp-bento {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 18px;
	}
	.mp-cell {
		--mx: 50%;
		--my: 0%;
		grid-column: span var(--sp, 4);
		position: relative;
		overflow: hidden;
		border-radius: 26px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		padding: 26px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		isolation: isolate;
	}
	.mp-cell::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: radial-gradient(380px circle at var(--mx) var(--my), color-mix(in oklab, var(--g2) 14%, transparent), transparent 60%);
		opacity: 0;
		transition: opacity 0.4s;
	}
	.mp-cell:hover::before {
		opacity: 1;
	}
	.mp-cell h3 {
		margin: 0;
		font: 400 28px/1.05 var(--f-display);
	}
	.mp-note {
		margin: 0;
		color: var(--ink-3);
		font-size: 13.5px;
	}
	.mp-bars {
		display: grid;
		gap: 11px;
		margin-top: auto;
	}
	.mp-bar {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr) 46px;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		color: var(--ink-2);
	}
	.mp-bar > span:first-child {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mp-bar .mp-tr {
		height: 10px;
		border-radius: 5px;
		background: var(--line);
		overflow: hidden;
	}
	.mp-bar .mp-fl {
		display: block;
		height: 100%;
		border-radius: 5px;
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
		transform-origin: left;
		transform: scaleX(0);
		transition: transform 1.3s var(--ease);
	}
	.mp-cell:global(.in) .mp-fl {
		transform: scaleX(var(--w));
	}
	.mp-bar b {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.mp-split {
		display: flex;
		height: 16px;
		border-radius: 8px;
		overflow: hidden;
		margin-top: auto;
	}
	.mp-split i {
		display: block;
		height: 100%;
	}
	.mp-split-l {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		font-size: 13px;
		color: var(--ink-2);
	}
	.mp-split-l span {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.mp-split-l i {
		width: 9px;
		height: 9px;
		border-radius: 50%;
	}
	.mp-split-l b {
		color: var(--ink);
	}
	.mp-huge {
		font: 400 clamp(56px, 6vw, 86px) / 0.9 var(--f-display);
		font-variant-numeric: tabular-nums;
	}
	.mp-vs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-top: auto;
	}
	.mp-vs div {
		padding: 14px;
		border-radius: 16px;
		background: var(--surface-2);
		box-shadow: 0 0 0 1px var(--line) inset;
	}
	.mp-vs small {
		display: block;
		font: 600 10px/1.3 var(--f-body);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mp-vs b {
		display: block;
		margin-top: 6px;
		font: 400 30px/1 var(--f-display);
	}
	.mp-vs .mp-hi {
		box-shadow: 0 0 0 1.5px color-mix(in oklab, var(--g3) 50%, transparent) inset;
		background: radial-gradient(120% 70% at 0% 0%, color-mix(in oklab, var(--g1) 20%, transparent), transparent 60%), var(--surface-2);
	}
	.mp-days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
		align-items: end;
		height: 110px;
		margin-top: auto;
	}
	.mp-days div {
		display: grid;
		/* the bar grows in the space above the day's name (its height is a share of that space) */
		grid-template-rows: minmax(0, 1fr) auto;
		align-items: end;
		height: 100%;
		justify-items: center;
		gap: 6px;
		font: 600 10.5px/1 var(--f-body);
		color: var(--ink-3);
	}
	.mp-days i {
		display: block;
		width: 100%;
		border-radius: 8px 8px 4px 4px;
		background: var(--line-strong);
		transform-origin: bottom;
		transform: scaleY(0);
		transition: transform 1.2s var(--ease);
	}
	.mp-cell:global(.in) .mp-days i {
		transform: scaleY(1);
	}
	.mp-days .mp-best i {
		background: linear-gradient(170deg, var(--g1), var(--g2) 60%, var(--g3));
	}
	.mp-days .mp-best {
		color: var(--g3);
	}

	/* how */
	.mp-steps {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
		counter-reset: s;
	}
	.mp-step {
		position: relative;
		padding: 22px;
		border-radius: 22px;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line) inset;
		display: grid;
		gap: 10px;
		align-content: start;
	}
	.mp-step::before {
		counter-increment: s;
		content: '0' counter(s);
		font: 500 12px/1 var(--f-mono);
		color: var(--c);
	}
	.mp-step b {
		font: 400 24px/1.1 var(--f-display);
	}
	.mp-step p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.mp-step::after {
		content: '';
		position: absolute;
		left: 22px;
		right: 22px;
		bottom: 0;
		height: 2px;
		background: var(--c);
		opacity: 0.6;
	}

	/* ask + final */
	.mp-final {
		padding-block: 140px 120px;
		text-align: center;
		overflow: hidden;
		isolation: isolate;
	}
	.mp-final::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 45%;
		width: 1000px;
		height: 1000px;
		margin: -500px 0 0 -500px;
		z-index: -1;
		background: radial-gradient(circle, color-mix(in oklab, var(--g2) 18%, transparent), color-mix(in oklab, var(--g1) 8%, transparent) 40%, transparent 65%);
	}
	.mp-final .mp-wrap {
		display: grid;
		justify-items: center;
		gap: 30px;
	}
	.mp-final .mp-h2 {
		font-size: clamp(52px, 8vw, 124px);
	}
	.mp-final .mp-ctas {
		justify-content: center;
	}
	.mp-ask {
		position: relative;
		width: min(640px, 100%);
		display: flex;
		gap: 0;
		margin: 0;
		background: var(--surface);
		box-shadow: 0 0 0 1px var(--line-strong) inset;
	}
	.mp-ask label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.mp-ask input {
		flex: 1;
		min-width: 0;
		height: 60px;
		margin: 0;
		padding: 0 18px;
		border: 0;
		border-radius: 0;
		box-shadow: none;
		background: transparent;
		color: var(--ink);
		font: 500 17px/1 var(--f-body);
		outline: 0;
	}
	.mp-ask input::placeholder {
		color: color-mix(in oklab, var(--ink-3) 70%, transparent);
	}
	.mp-ask .mp-neo {
		height: 60px;
	}
	.mp-sent {
		min-height: 1.5em;
		margin: 0;
		color: var(--ok);
		font-size: 14.5px;
	}
	.mp-sent.mp-bad {
		color: var(--warn);
	}
	.mp-final .mp-sent {
		margin-top: -14px;
	}
	.mp-small {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px 10px;
		margin: -14px 0 0;
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.mp-small a {
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-color: var(--line-strong);
		text-underline-offset: 3px;
	}
	.mp-small a:hover {
		color: var(--ink);
	}
	footer {
		border-top: 1px solid var(--line);
		background: var(--chrome);
		padding-block: 40px;
		color: var(--ink-3);
		font-size: 13.5px;
	}
	footer .mp-wrap {
		display: flex;
		flex-wrap: wrap;
		gap: 14px 28px;
		align-items: center;
		justify-content: space-between;
	}
	.mp-pw {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.mp-pw svg {
		width: 28px;
		height: 28px;
	}
	.mp-pw b {
		font: 400 22px/1 var(--f-display);
		font-style: italic;
		color: var(--ink);
	}
	.mp-me a {
		color: var(--ink-2);
	}
	@media (min-width: 561px) {
		a.mp-me {
			display: none;
		}
	}

	/* the page's own messages: loading, no page here, couldn't load */
	.mp-msg {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding-block: 80px;
	}
	.mp-msg .mp-panel {
		max-width: 560px;
		margin: 0 auto;
	}
	.mp-msg .mp-panel h3 {
		overflow-wrap: anywhere;
	}
	.mp-load .mp-ring {
		display: block;
		width: 64px;
		height: 64px;
	}

	/* reveal: rises in once; after that the cards' own hover motion takes over */
	[data-r] {
		transition:
			opacity 0.9s var(--ease),
			transform 0.9s var(--ease);
	}
	[data-r]:not(:global(.in)) {
		opacity: 0;
		transform: translateY(30px);
	}
	[data-r='2'] {
		transition-delay: 0.1s;
	}
	[data-r='3'] {
		transition-delay: 0.2s;
	}
	[data-r='4'] {
		transition-delay: 0.3s;
	}

	@media (max-width: 1000px) {
		.mp-hero .mp-wrap,
		.mp-weeks-wrap {
			grid-template-columns: minmax(0, 1fr);
		}
		.mp-reels {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.mp-tickets {
			grid-template-columns: minmax(0, 1fr);
		}
		.mp-ticket.mp-hot {
			transform: none;
		}
		.mp-ticket.mp-hot:hover {
			transform: translateY(-6px);
		}
		.mp-cell {
			grid-column: span 12;
		}
		.mp-steps {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 560px) {
		.mp-hero {
			padding-top: 96px;
		}
		.mp-ring {
			width: 76px;
			height: 76px;
		}
		.mp-ring b {
			font-size: 28px;
		}
		.mp-reels {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.mp-weeks {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.mp-steps {
			grid-template-columns: minmax(0, 1fr);
		}
		.mp-big-n .mp-num {
			font-size: 60px;
		}
		.mp-ask {
			flex-wrap: wrap;
		}
		.mp-ask .mp-neo {
			width: 100%;
		}
		.mp-ctas .mp-neo {
			flex: 1 1 100%;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
		:global(html.mp-on) {
			scroll-behavior: auto;
		}
	}
</style>
