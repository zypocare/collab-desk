// The help centre: short, practical articles for creators and brands. Searched in the app (Help), and
// the only thing the AI helper answers from (web/worker/index.ts, kind "helpask"), so keep them true to
// how the app works today. Links are in-app paths: /studio/... for creators, /brand/... for brands.

export type Block = { p: string } | { steps: string[] } | { list: string[] } | { tip: string };
export type Audience = 'creator' | 'brand' | 'all';
export type Article = {
	slug: string;
	title: string;
	summary: string;
	category: string;
	audience: Audience;
	keywords: string[];
	body: Block[];
	links?: { label: string; href: string }[];
};

export const CATEGORIES: { id: string; label: string; icon: string; audience: Audience }[] = [
	{ id: 'start', label: 'Getting started', icon: 'spark', audience: 'creator' },
	{ id: 'collabs', label: 'Requests & collabs', icon: 'board', audience: 'creator' },
	{ id: 'money', label: 'Invoices & payments', icon: 'wallet', audience: 'creator' },
	{ id: 'grow', label: 'Growth & Instagram', icon: 'chart', audience: 'creator' },
	{ id: 'brand-start', label: 'Working with creators', icon: 'users', audience: 'brand' },
	{ id: 'brand-money', label: 'Quotes & paying', icon: 'rupee', audience: 'brand' },
	{ id: 'account', label: 'Account & sign-in', icon: 'shield', audience: 'all' }
];

export const ARTICLES: Article[] = [
	// ------------------------------------------------------------------ getting started (creators)
	{
		slug: 'set-up-your-page',
		title: 'Set up your page and link',
		summary: 'Your own address (name.miracleapp.live) where brands see your rates and send requests.',
		category: 'start',
		audience: 'creator',
		keywords: ['page', 'link', 'bio', 'address', 'slug', 'profile', 'media kit', 'link in bio', 'website'],
		body: [
			{ p: 'Every creator on Miracle gets a page at yourname.miracleapp.live. Brands open it to see who you are, your live Instagram numbers, your packages and rates, and to send you a request in a minute.' },
			{ steps: ['Open Settings › Profile & Instagram and fill in your name, niche, city and the line about you.', 'Connect Instagram so your followers, views and audience show live (and stay up to date every night).', 'Add packages in Settings › Rates & packages, so brands can book you directly.', 'Copy your link and put it in your Instagram bio.'] },
			{ tip: 'Settings › Get found by brands shows who opened your page and from where, and can write your “about” line with AI.' }
		],
		links: [{ label: 'Open Profile settings', href: '/studio/settings?s=profile' }, { label: 'Get found by brands', href: '/studio/settings?s=found' }]
	},
	{
		slug: 'connect-instagram',
		title: 'Connect Instagram (and reconnect it)',
		summary: 'Why Miracle asks, what it reads, and what to do if numbers stop updating.',
		category: 'start',
		audience: 'creator',
		keywords: ['instagram', 'connect', 'meta', 'facebook', 'professional account', 'business', 'creator account', 'token', 'expired', 'reconnect', 'not updating', 'followers wrong'],
		body: [
			{ p: 'Connecting Instagram lets Miracle show your real numbers to brands (followers, reach, views, engagement and audience), spot when a collab post goes live, and keep brand DMs together in your Inbox.' },
			{ list: ['You need an Instagram professional account (Creator or Business). Switch in Instagram › Settings › Account type and tools.', 'Miracle reads your own posts, insights and audience. It never posts without you, and never reads personal chats that aren’t about collabs.', 'Numbers refresh every night. Audience details (age, city, country) need 100+ followers.'] },
			{ p: 'If numbers stop updating, Instagram may have signed Miracle out (it does this every 60 days, or when you change your password). Open Settings › Profile & Instagram and tap Connect again.' }
		],
		links: [{ label: 'Profile & Instagram', href: '/studio/settings?s=profile' }]
	},
	{
		slug: 'phone-alerts',
		title: 'Get alerts on your phone',
		summary: 'Install the app and allow notifications, so new requests and payments reach you.',
		category: 'start',
		audience: 'creator',
		keywords: ['notification', 'alerts', 'push', 'not getting', 'app', 'android', 'iphone', 'install', 'bell', 'sound'],
		body: [
			{ steps: ['Install the Miracle app (Android from the Play Store; on iPhone, add the site to your Home Screen until the App Store app is out).', 'Sign in and allow notifications when asked.', 'In Settings › Inbox, replies & alerts, choose what you want to hear about, and tap Send a test.'] },
			{ p: 'Every important alert is also kept in Alerts (the bell on Today) for 90 days, so nothing is lost if you miss a notification. You can delete alerts there, one by one or all at once.' },
			{ tip: 'Not getting alerts? Check your phone’s battery saver isn’t blocking Miracle, and that notifications are on for it in your phone’s settings.' }
		],
		links: [{ label: 'Alert settings', href: '/studio/settings?s=alerts' }, { label: 'Your alerts', href: '/studio/alerts' }]
	},
	{
		slug: 'team',
		title: 'Add your manager, assistant or accountant',
		summary: 'Let people help you run your desk, each with the right access.',
		category: 'start',
		audience: 'creator',
		keywords: ['team', 'manager', 'assistant', 'accountant', 'agency', 'invite', 'access', 'remove'],
		body: [
			{ p: 'In Settings › Team, add someone by email and choose their role. They sign in with their own email and work on your desk.' },
			{ list: ['Manager: handles requests, quotes, collabs and messages.', 'Assistant: helps with collabs and content, without the money side.', 'Accountant: invoices, payments and tax.'] },
			{ p: 'You can change a role or remove someone at any time. Each person has their own alerts and their own Alerts list.' }
		],
		links: [{ label: 'Team settings', href: '/studio/settings?s=team' }]
	},

	// ------------------------------------------------------------------ requests & collabs
	{
		slug: 'how-requests-arrive',
		title: 'How brand requests reach you',
		summary: 'From your page, email and Instagram DMs, all in one place.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['request', 'brand', 'inquiry', 'dm', 'email', 'new collab', 'inbox', 'lead', 'collaboration'],
		body: [
			{ p: 'Brands can send a request from your page (the quickest way, with the brief, budget and dates). When Instagram is connected, Miracle also reads brand DMs and flags the ones that look like a collab, so you can turn them into a request.' },
			{ p: 'New requests show on Today and in Collabs. Miracle’s AI reads each one and tells you how well it fits, whether the budget is fair for you, and what to ask.' },
			{ tip: 'Away for a while? Turn on Away mode in Settings › Bookings & barter, and brands are told when you’re back.' }
		],
		links: [{ label: 'Collabs', href: '/studio/collabs' }]
	},
	{
		slug: 'send-a-quote',
		title: 'Send a quote and get it accepted',
		summary: 'Quote with options, usage rights and dates; the brand accepts online.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['quote', 'price', 'negotiate', 'counter', 'options', 'accept', 'agreement', 'contract', 'rate'],
		body: [
			{ steps: ['Open the request in Collabs and tap Build quote.', 'Add what you’ll make, your fee, usage rights and dates. You can offer up to three options (for example a reel, or a reel with stories).', 'Send it. The brand gets an email and accepts online with their name.'] },
			{ p: 'When they accept, Miracle makes a simple agreement both sides can download. If they ask for changes, you’ll see their note and can send a new version.' },
			{ tip: 'Got a contract or offer from the brand? Use Check the offer to have AI read it against your rates and usual terms, and write your reply.' }
		]
	},
	{
		slug: 'drafts',
		title: 'Share drafts for approval',
		summary: 'Send your draft, get comments on the exact second, and post once approved.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['draft', 'approval', 'review', 'feedback', 'changes', 'video', 'upload'],
		body: [
			{ p: 'Upload your draft on the collab. The brand watches it, leaves comments at the exact moment in the video, and approves it or asks for changes. Each round is kept, so nobody loses track.' },
			{ p: 'Before you send it, Draft check can look for missing disclosures (#ad, paid partnership) and anything the brief asked for.' }
		]
	},
	{
		slug: 'go-live',
		title: 'How Miracle knows your post is live',
		summary: 'Automatic go-live detection and the #ad check.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['live', 'posted', 'go live', 'detect', 'disclosure', 'ad', 'asci', 'paid partnership', 'report', 'results'],
		body: [
			{ p: 'With Instagram connected, Miracle notices when the collab post goes up (it looks for the brand’s tag or name), marks the collab as live, and checks the post is labelled as an ad, as ASCI rules ask.' },
			{ p: 'Seven days later it makes a results report (views, reach, likes, saves, shares) you can send to the brand in one tap.' },
			{ tip: 'Posted but not detected? Open the collab and link the post yourself.' }
		]
	},
	{
		slug: 'usage-rights',
		title: 'Usage rights and partnership ads',
		summary: 'Charge for brands using your content as ads, and track when it ends.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['usage', 'rights', 'whitelisting', 'partnership ads', 'boost', 'ads', 'extend', 'expire'],
		body: [
			{ p: 'Usage rights let a brand run your content as ads or on their own pages. Add them to your quote with how long they last. Miracle tracks the end date in Studio › Usage rights and tells you before it ends, so you can offer an extension.' }
		]
	},

	// ------------------------------------------------------------------ money
	{
		slug: 'gst-invoices',
		title: 'Make GST invoices',
		summary: 'Invoices with your GSTIN, SAC code and the brand’s details, in one tap.',
		category: 'money',
		audience: 'creator',
		keywords: ['invoice', 'gst', 'gstin', 'sac', 'tax invoice', 'bill', 'wrong gst', 'not registered', 'pan', 'download invoice'],
		body: [
			{ steps: ['Open Settings › Invoices & payments and add your legal name, PAN, and GSTIN if you’re registered (with your GST rate, usually 18%).', 'Add your UPI ID or bank account, to print on invoices.', 'On a collab, tap Create invoice. Miracle fills in the brand, the agreed fee and GST.'] },
			{ p: 'Not registered for GST? Leave GSTIN empty and invoices go out without GST. Fixing details later? Update Settings, then make the invoice again.' }
		],
		links: [{ label: 'Invoices & payments', href: '/studio/settings?s=payments' }]
	},
	{
		slug: 'get-paid',
		title: 'Getting paid (and chasing late payments)',
		summary: 'Brands pay you directly. Miracle reminds them, never takes a cut.',
		category: 'money',
		audience: 'creator',
		keywords: ['payment', 'paid', 'late', 'overdue', 'reminder', 'upi', 'bank', 'commission', 'fee', 'chase', 'msme', 'legal notice'],
		body: [
			{ p: 'Brands pay you straight to your UPI or bank account. Miracle takes no commission on any deal.' },
			{ list: ['Money shows what’s due, overdue and received.', 'Miracle sends polite reminders before and after the due date.', 'Still unpaid? Payment steps help you send a formal demand, then an MSME complaint or legal notice, ready to send.', 'When the brand says they’ve paid, you get an alert to confirm.'] }
		],
		links: [{ label: 'Money', href: '/studio/payments' }]
	},
	{
		slug: 'tax',
		title: 'TDS and your tax desk',
		summary: 'What brands deduct (194J, 194C, 194R for barter) and what to keep track of.',
		category: 'money',
		audience: 'creator',
		keywords: ['tds', 'tax', '194j', '194c', '194r', 'barter', 'income tax', '26as', 'ais', 'itr', 'advance tax'],
		body: [
			{ p: 'Brands may deduct TDS when they pay you: usually 10% under 194J once they pay you over ₹50,000 in a year, or 1–2% under 194C on contracts. Free products above ₹20,000 a year from one brand can fall under 194R.' },
			{ p: 'The tax desk adds up your income, the TDS deducted and what’s still to show in your Form 26AS / AIS, so filing is easy. It’s a guide, not tax advice: check with your CA.' }
		],
		links: [{ label: 'Tax desk', href: '/studio/tax' }]
	},
	{
		slug: 'rates-packages',
		title: 'Rates, packages and what to charge',
		summary: 'Set your rates, offer packages, and see what creators like you charge.',
		category: 'money',
		audience: 'creator',
		keywords: ['rates', 'rate card', 'price', 'package', 'how much', 'charge', 'benchmark', 'pricing'],
		body: [
			{ p: 'In Settings › Rates & packages, add a rate for each kind of content, and packages brands can book in one tap (for example 1 reel + 3 stories). You choose whether rates show on your page.' },
			{ p: 'Miracle shows what creators of your size (and niche) charge, from real accepted quotes. The free rate calculator on the website gives a starting point too.' }
		],
		links: [{ label: 'Rates & packages', href: '/studio/settings?s=rates' }]
	},

	// ------------------------------------------------------------------ growth
	{
		slug: 'grow-tools',
		title: 'Grow: check-up, reel check and autopilot',
		summary: 'What brings you new followers, and three reel ideas a week.',
		category: 'grow',
		audience: 'creator',
		keywords: ['grow', 'followers', 'reach', 'views', 'checkup', 'check-up', 'reel check', 'ideas', 'autopilot', 'not growing'],
		body: [
			{ list: ['Growth check-up reads your reels and audience and says what’s holding you back.', 'Check a reel looks at a reel before you post it (hook, length, captions).', 'Growth autopilot suggests three reel ideas each week from what worked, on your best days. In Auto they go straight into your Calendar.', 'Boost picks the reel worth putting money behind, with the audience and budget to use.'] },
			{ p: 'Miracle never buys followers or likes.' }
		],
		links: [{ label: 'Grow', href: '/studio/grow' }]
	},
	{
		slug: 'audience-health',
		title: 'Audience health and brand safety',
		summary: 'The score brands see before booking you, and how to improve it.',
		category: 'grow',
		audience: 'all',
		keywords: ['audience health', 'score', 'brand safety', 'fake followers', 'bought followers', 'flag', 'flagged', 'wrong', 'verified', 'trust'],
		body: [
			{ p: 'Every night Miracle scores an Instagram-connected creator’s audience from their own numbers: real reach (how many followers a post reaches), engagement for an account that size, sudden follower jumps no viral post explains, and how much of the audience is in India.' },
			{ p: 'Once a week an AI also reads the last 40 captions for things a brand should know first, such as betting apps, adult content, risky health claims, or promotions without #ad. Minor notes (like drinks at a night out) don’t count against anyone; only serious ones mark a creator as worth a look.' },
			{ list: ['To lift reach and engagement: post consistently, reply to comments, and make reels people share and save.', 'A flag you think is wrong: open the post, edit the caption or archive it, and it clears at the next check. Or raise a ticket and we’ll look.'] }
		],
		links: [{ label: 'See yours in Grow', href: '/studio/grow' }]
	},
	{
		slug: 'creator-directory',
		title: 'The creator directory',
		summary: 'Be found by brands on miracleapp.live/creators, by niche and city.',
		category: 'grow',
		audience: 'creator',
		keywords: ['directory', 'listed', 'discover', 'found', 'google', 'search', 'creators page', 'hide'],
		body: [
			{ p: 'The directory at miracleapp.live/creators lists creators by niche and city, with live Instagram numbers and a verified tick for connected accounts. It’s off until you switch it on in Settings › Get found by brands; switching it on also lists you in Discover for brands on Miracle.' },
			{ p: 'It shows your name, niche, city, about line, starting price and reviews; never your email or phone. Switch it off any time.' }
		],
		links: [{ label: 'Get found by brands', href: '/studio/settings?s=found' }]
	},
	{
		slug: 'ai-allowance',
		title: '“Today’s free AI is used up”',
		summary: 'Why AI sometimes pauses, and when it’s back.',
		category: 'grow',
		audience: 'all',
		keywords: ['ai', 'used up', 'limit', 'not working', 'error', 'free ai', 'quota', 'allowance'],
		body: [
			{ p: 'Miracle’s AI (reading requests, writing replies, checking offers, the growth tools and this help) has a daily free allowance shared across the app. When it runs out you’ll see “Today’s free AI is used up”. It’s back at 5:30 am India time.' },
			{ p: 'Everything else keeps working without AI.' }
		]
	},

	// ------------------------------------------------------------------ brands
	{
		slug: 'brand-send-request',
		title: 'Send a request to a creator',
		summary: 'From their page or Discover: brief, budget, dates, done.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['request', 'book', 'creator', 'brief', 'collab', 'hire', 'send request', 'influencer'],
		body: [
			{ steps: ['Open the creator’s page (name.miracleapp.live) or find them in Find creators › Discover.', 'Tap Send a request: what you want made, your budget (or ask for a quote), dates and the brief.', 'Sign in with your work email (a 6-digit code, no password). Track everything in Requests.'] },
			{ p: 'The creator replies or sends a quote you can accept online. Drafts, messages, invoices and results all stay on the request.' }
		],
		links: [{ label: 'Find creators', href: '/brand/creators?tab=discover' }, { label: 'Your requests', href: '/brand/requests' }]
	},
	{
		slug: 'brand-discover',
		title: 'Find creators: Discover, pools and open briefs',
		summary: 'Search by niche, audience and price; check audience health before you book.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['discover', 'find creators', 'search', 'filter', 'pool', 'shortlist', 'campaign', 'open brief', 'applications', 'audience health'],
		body: [
			{ list: ['Discover lists creators open to brands, sorted by how well they fit your brand, with their audience and reel prices.', 'Each card shows their record (verified deals, on time) and their audience health and brand safety check.', 'Save creators to pools, and send one campaign to many at once.', 'Open a brief and let creators apply with their own rate; shortlist the best.'] }
		],
		links: [{ label: 'Discover', href: '/brand/creators?tab=discover' }, { label: 'Campaigns', href: '/brand/campaigns' }]
	},
	{
		slug: 'brand-quotes',
		title: 'Accept a quote and the agreement',
		summary: 'Pick an option, sign with your name, download the agreement.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['quote', 'accept', 'agreement', 'contract', 'changes', 'option', 'sign', 'button not working'],
		body: [
			{ p: 'When a creator sends a quote, open the request: you’ll see each option with what’s included, usage rights and dates. Pick one, type your name and accept, or ask for changes with a note.' },
			{ p: 'Accepting creates a simple agreement both sides can download from the request. If a button doesn’t respond, refresh the page; if it still doesn’t, raise a ticket with a screenshot.' }
		]
	},
	{
		slug: 'brand-pay',
		title: 'Paying creators',
		summary: 'You pay the creator directly; Miracle takes no commission.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['pay', 'payment', 'invoice', 'gst', 'tds', 'upi', 'bank', 'commission', 'mark paid', 'billing'],
		body: [
			{ p: 'The creator sends an invoice (with GST if they’re registered) on the request. Pay them directly by UPI or bank transfer using the details on it, then open the invoice and tap I’ve paid this invoice (with the UTR) so they can confirm. Deduct TDS as your accountant advises.' },
			{ p: 'Miracle never handles the money and takes no commission. Your payment record (how quickly you pay) shows to creators, so paying on time helps you book the best ones.' }
		]
	},
	{
		slug: 'brand-team',
		title: 'Your brand team and companies',
		summary: 'Invite colleagues, set who approves and who pays, switch companies.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['team', 'colleague', 'invite', 'approver', 'finance', 'admin', 'member', 'company', 'switch', 'agency', 'multiple brands'],
		body: [
			{ p: 'In Settings, invite colleagues with their work email and a role: admin, approver (accepts quotes and drafts), finance (invoices and payments) or member. Agencies can add several companies and switch between them.' }
		],
		links: [{ label: 'Brand settings', href: '/brand/settings' }]
	},
	{
		slug: 'brand-reports',
		title: 'Results and sales from creators',
		summary: 'Reports after posts go live, and sales from promo codes.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['report', 'results', 'roi', 'sales', 'promo code', 'views', 'reach', 'performance', 'cost per view'],
		body: [
			{ p: 'A week after a post goes live, the creator can send a results report with Instagram’s own numbers. Reports shows them across creators, with cost per view. Give each creator a promo code and import your orders to see sales by creator.' }
		],
		links: [{ label: 'Reports', href: '/brand/reports' }]
	},

	// ------------------------------------------------------------------ account
	{
		slug: 'sign-in',
		title: 'Signing in, and codes that don’t arrive',
		summary: 'Email codes, fingerprint sign-in, and what to check.',
		category: 'account',
		audience: 'all',
		keywords: ['sign in', 'login', 'log in', 'code', 'otp', 'not received', 'email', 'fingerprint', 'passkey', 'face id', 'locked out', 'spam'],
		body: [
			{ p: 'Miracle has no passwords: type your email and we send a 6-digit code. On a phone or laptop you use often, you can turn on fingerprint (or face) sign-in.' },
			{ list: ['Check spam and the Promotions tab for the code; it comes from Miracle.', 'Codes expire after a few minutes; ask for a new one.', 'Typed a different email than usual? Each email is a separate account.', 'Too many tries? Wait a few minutes before trying again.'] },
			{ tip: 'Still locked out? Email support@miracleapp.live from the address you sign in with.' }
		]
	},
	{
		slug: 'delete-account',
		title: 'Download or delete your data',
		summary: 'Take a copy of everything, or close your account.',
		category: 'account',
		audience: 'all',
		keywords: ['delete', 'account', 'close', 'remove', 'data', 'download', 'export', 'privacy', 'gdpr', 'dpdp'],
		body: [
			{ p: 'Creators: Settings › Sign-in, devices & account lets you download all your data or delete your account. Brands can do the same in Settings › Account. Deleting removes your data from Miracle, except what the law asks us to keep (such as invoices).' },
			{ p: 'See the privacy policy for what Miracle keeps and why.' }
		],
		links: [{ label: 'Privacy policy', href: '/privacy' }]
	},
	{
		slug: 'block-report',
		title: 'Block or report someone',
		summary: 'Stop a brand (or creator) contacting you, and tell us about abuse.',
		category: 'account',
		audience: 'all',
		keywords: ['block', 'report', 'spam', 'abuse', 'harassment', 'scam', 'fake brand', 'unsafe'],
		body: [
			{ p: 'Open the request or profile and use the ⋯ menu to block or report. Blocked brands can’t send you requests; you can unblock them in Settings › Blocked. Reports go to the Miracle team, who look at every one.' },
			{ tip: 'Asked to pay to get a collab, or for your bank login or OTP? That’s a scam. Report it and don’t pay.' }
		]
	},
	{
		slug: 'contact-support',
		title: 'Contact support',
		summary: 'Raise a ticket and we’ll reply in the app and by email.',
		category: 'account',
		audience: 'all',
		keywords: ['support', 'help', 'contact', 'ticket', 'complaint', 'bug', 'problem', 'talk to someone', 'human', 'call', 'email', 'support email'],
		body: [
			{ p: 'If the articles and Ask Miracle don’t solve it, raise a ticket from Help › Contact support. Add a screenshot if you can: the app adds your phone and app version for us.' },
			{ p: 'We usually reply within a working day (urgent problems with payments or sign-in first). You’ll get an alert and an email; reply in the ticket to keep everything together. You can mark it solved yourself.' },
			{ tip: 'Can’t sign in to raise a ticket? Email support@miracleapp.live from the address you use on Miracle.' }
		]
	}
];

/** Articles for this side of the app. */
export const forSide = (side: 'creator' | 'brand') => ARTICLES.filter((a) => a.audience === 'all' || a.audience === side);

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'i', 'my', 'me', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'it', 'how', 'do', 'does', 'can', 'what', 'why', 'not', 'with', 'this', 'that', 'be', 'at', 'from', 'when', 'where', 'get', 'you', 'your']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹#\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
const text = (a: Article) => a.body.map((b) => ('p' in b ? b.p : 'tip' in b ? b.tip : 'steps' in b ? b.steps.join(' ') : b.list.join(' '))).join(' ');

/** The best articles for a question: title and keyword matches first, then the text. */
export function search(q: string, side: 'creator' | 'brand', n = 5) {
	const qs = words(q);
	if (!qs.length) return [];
	const phrase = q.toLowerCase().trim();
	return forSide(side)
		.map((a) => {
			const t = a.title.toLowerCase(), k = a.keywords.join(' '), b = (a.summary + ' ' + text(a)).toLowerCase();
			let s = 0;
			for (const w of qs) {
				const stem = w.length > 4 ? w.slice(0, -1) : w;
				if (t.includes(stem)) s += 4;
				if (k.includes(stem)) s += 3;
				if (b.includes(stem)) s += 1;
			}
			if (a.keywords.some((x) => phrase.includes(x))) s += 4;
			return { a, s };
		})
		.filter((x) => x.s >= 3)
		.sort((x, y) => y.s - x.s)
		.slice(0, n)
		.map((x) => x.a);
}

/** An article as plain text, for the AI. */
export const asText = (a: Article) => `${a.title}\n${a.summary}\n${text(a)}`;
