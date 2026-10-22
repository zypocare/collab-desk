<script lang="ts">
	// Terms of service: the rules for creators and brands on Miracle. Linked from sign-up, sign-in
	// and the website (which has the same text in site/terms.html).
	const SECTIONS = [
		['what', 'What Miracle is'],
		['account', 'Your account'],
		['deals', 'Deals and money'],
		['content', 'Your content'],
		['instagram', 'Instagram'],
		['not-allowed', 'What’s not allowed'],
		['reports', 'Reports, limits and suspension'],
		['leaving', 'Leaving Miracle'],
		['price', 'Price and changes'],
		['liability', 'Liability'],
		['law', 'Law and disputes'],
		['grievance', 'Grievance officer']
	] as const;
	let on = $state<string>('what');
	function go(e: MouseEvent, id: string) {
		e.preventDefault();
		on = id;
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		history.replaceState(null, '', `#${id}`);
	}
	$effect(() => {
		const els = SECTIONS.map(([id]) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
		const io = new IntersectionObserver((xs) => {
			const top = xs.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
			if (top) on = top.target.id;
		}, { rootMargin: '-15% 0px -70% 0px' });
		els.forEach((el) => io.observe(el));
		return () => io.disconnect();
	});
</script>

<svelte:head><title>Terms of service · Miracle</title></svelte:head>

<div class="page">
	<div class="wrap doc-wrap tos">
		<nav class="tos-nav" aria-label="On this page">
			<span class="tos-eb">On this page</span>
			{#each SECTIONS as [id, label], i (id)}
				<a href="#{id}" class:on={on === id} onclick={(e) => go(e, id)}>{i + 1}. {label}</a>
			{/each}
		</nav>

		<article class="doc legal">
			<header class="doc-h"><div><div class="eb">The rules · updated 22 October 2026</div><h1>Terms of <em>service</em></h1></div></header>
			<p class="tos-lead">The short version: run your collaborations here, be honest with each other, pay each other directly. Miracle never takes a cut.</p>

			<h2 id="what">1. What Miracle is</h2>
			<p>Miracle helps creators run brand collaborations (requests, quotes, drafts, invoices) and helps brands find creators and work with them. Miracle is run by Zyposoft Technologies Private Limited, Bengaluru. We provide the tool; the deal itself is between the creator and the brand.</p>

			<h2 id="account">2. Your account</h2>
			<p>You must be 18 or older, or have a parent or guardian agree to these terms for you. Give your real name and your real brand. Keep your email and phone safe: whoever signs in with them acts as you. Brands can add their team; each person signs in with their own email.</p>

			<h2 id="deals">3. Deals and money</h2>
			<p>Fees, deliverables, dates and usage rights are agreed between the creator and the brand, and the agreement Miracle prepares records what you both accepted. Payments go straight from the brand to the creator by UPI or bank transfer. Miracle doesn’t hold your money and takes no commission. Each of you is responsible for your own GST, TDS and income tax; invoices are made from the details you enter.</p>

			<h2 id="content">4. Your content</h2>
			<p>What you upload stays yours. You let us store it and show it to the people you share it with, and anyone can see a creator’s public page. Usage rights for a post are what the creator and brand agreed in the request, not something Miracle grants.</p>

			<h2 id="instagram">5. Instagram</h2>
			<p>If you connect Instagram, we read your profile, insights and collaboration messages as Meta’s rules allow, and only to run Miracle for you. We never post for you unless you schedule it. You can disconnect at any time in Settings or in Instagram.</p>

			<h2 id="not-allowed">6. What’s not allowed</h2>
			<ul>
				<li>Pretending to be a brand or creator you’re not.</li>
				<li>Asking a creator to pay to get work, or for “registration” or “security” fees.</li>
				<li>Harassment, threats, or sending requests nobody asked for in bulk.</li>
				<li>Promoting anything illegal in India, or posts without the #ad or #collab label the ASCI guidelines ask for.</li>
				<li>Copying creators’ data out of Miracle with bots or scripts.</li>
			</ul>

			<h2 id="reports">7. Reports, limits and suspension</h2>
			<p>Anyone can report a brand or creator, and block them. New accounts have daily limits on new requests and messages until they’ve done a collaboration or connected Instagram. If someone breaks these rules we may limit, pause or close their account. We tell you why, and you can reply to that email to appeal.</p>

			<h2 id="leaving">8. Leaving Miracle</h2>
			<p>Download your data or delete your account at any time in Settings. Your account closes at once and is erased 30 days later; sign in before then to undo it. Invoices are kept only as long as Indian tax law requires.</p>

			<h2 id="price">9. Price and changes</h2>
			<p>Miracle is free today. If we add paid plans, we’ll email you at least 30 days before anything you use costs money. When these terms change in a way that matters, we email you before it takes effect.</p>

			<h2 id="liability">10. Liability</h2>
			<p>We work hard to keep Miracle running and your data safe, but it’s offered as it is. We’re not responsible for what a brand or creator does or doesn’t do in a deal. Our total liability to you is limited to what you paid Miracle in the 12 months before the claim.</p>

			<h2 id="law">11. Law and disputes</h2>
			<p>These terms follow the laws of India. Disputes go to the courts in Bengaluru.</p>

			<section class="tos-officer">
				<h2 id="grievance">12. Grievance officer</h2>
				<p>Under India’s IT Rules, complaints about content or accounts go to our grievance officer. We reply within 24 hours and resolve it within 15 days.</p>
				<dl>
					<div><dt>Name</dt><dd>The Grievance Officer, Zyposoft Technologies</dd></div>
					<div><dt>Email</dt><dd><a class="lnk" href="mailto:contact@miracleapp.live">contact@miracleapp.live</a></dd></div>
					<div><dt>Address</dt><dd>#7, Nisarga Layout, Chikkalsandra, Bangalore 560061</dd></div>
				</dl>
			</section>

			<p class="hint">See also the <a class="lnk" href="/privacy">privacy policy</a> and <a class="lnk" href="/data-deletion">how to delete your data</a>.</p>
		</article>
	</div>
</div>

<style>
	.tos {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 64px;
		align-items: start;
		max-width: 1180px;
	}
	.tos-nav {
		position: sticky;
		top: 24px;
		display: grid;
		gap: 2px;
		padding-top: 8px;
		font-size: 14px;
	}
	.tos-eb {
		padding: 0 12px 12px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tos-nav a {
		padding: 9px 12px;
		border-radius: 10px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.tos-nav a:hover {
		color: var(--ink);
	}
	.tos-nav a.on {
		background: var(--surface-2, var(--surface));
		color: var(--ink);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.tos .doc {
		max-width: 720px;
	}
	.tos .doc h1 em {
		font-style: italic;
	}
	.tos .doc h2 {
		scroll-margin-top: 24px;
	}
	.tos-lead {
		font-size: 17px;
		color: var(--ink-2);
	}
	.tos-officer {
		margin: 28px 0 18px;
		padding: 22px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
	}
	.tos-officer h2 {
		margin-top: 0;
	}
	.tos-officer dl {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		margin: 14px 0 0;
	}
	.tos-officer dt {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tos-officer dd {
		margin: 4px 0 0;
		font-weight: 600;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	@media (max-width: 900px) {
		.tos {
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
		}
		.tos-nav {
			display: none;
		}
		.tos-officer dl {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
