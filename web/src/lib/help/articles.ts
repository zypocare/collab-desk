// The help centre: short, practical articles for creators and brands. Searched in the app (Help), and
// the only thing the AI helper answers from (web/worker/index.ts, kind "helpask"), so keep them true to
// how the app works today. Links are in-app paths: /studio/... for creators, /brand/... for brands.
// In an article for both sides (audience 'all'), /studio/ links become /brand/ on the brand side; give a
// link a `side` when it only makes sense on one side.
//
// Creator paths: on a phone the settings live under the "My page" tab; on a laptop it's "Settings" in the
// side menu. Articles say "My page › …" and mention the laptop name once.

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
	links?: { label: string; href: string; side?: 'creator' | 'brand' }[];
};

export const CATEGORIES: { id: string; label: string; icon: string; audience: Audience }[] = [
	{ id: 'start', label: 'Getting started', icon: 'spark', audience: 'creator' },
	{ id: 'collabs', label: 'Requests & collabs', icon: 'board', audience: 'creator' },
	{ id: 'plan', label: 'Content & calendar', icon: 'cal', audience: 'creator' },
	{ id: 'money', label: 'Invoices & payments', icon: 'wallet', audience: 'creator' },
	{ id: 'grow', label: 'Growth & Instagram', icon: 'chart', audience: 'creator' },
	{ id: 'brand-setup', label: 'Your brand on Miracle', icon: 'home', audience: 'brand' },
	{ id: 'brand-start', label: 'Working with creators', icon: 'users', audience: 'brand' },
	{ id: 'brand-campaigns', label: 'Campaigns & autopilots', icon: 'send', audience: 'brand' },
	{ id: 'brand-money', label: 'Quotes, payments & results', icon: 'rupee', audience: 'brand' },
	{ id: 'account', label: 'Account & sign-in', icon: 'shield', audience: 'all' }
];

export const ARTICLES: Article[] = [
	// ------------------------------------------------------------------ getting started (creators)
	{
		slug: 'set-up-your-page',
		title: 'Set up your page and link',
		summary: 'Your own address (name.miracleapp.live) where brands see your numbers and rates and send requests.',
		category: 'start',
		audience: 'creator',
		keywords: ['page', 'link', 'bio', 'address', 'slug', 'profile', 'media kit', 'link in bio', 'website', 'about', 'setup', 'checklist', 'birthday'],
		body: [
			{ p: 'Every creator on Miracle gets a page at yourname.miracleapp.live. Brands open it to see who you are, your live Instagram numbers, your rates, and to send you a request in a minute. Today shows a setup checklist until the basics are done.' },
			{ steps: ['Open My page › Profile & Instagram (Settings on a laptop) and fill in your name, What you create, city, languages and the WhatsApp number brands can use.', 'Connect Instagram on the same screen, so your followers, views and audience show live.', 'In My page › Get found by brands, write your About you line (or tap Write it with AI).', 'In My page › Rates & packages, set a rate for each kind of content you make. Brands then build their own package on your page.', 'Add your UPI ID or bank account in My page › Invoices & payments, for your invoices.', 'Copy your link (the Your link card on My page, or Brand page on a laptop) and put it in your Instagram bio.'] },
			{ p: 'Brands sign in with a work email before they can send a request, so you only hear from real businesses. To pause new requests, switch off Accepting collaborations in My page › Bookings & barter.' },
			{ tip: 'Add your birthday (day and month) in Profile & Instagram. It never shows on your page; Miracle just wishes you on the day.' }
		],
		links: [{ label: 'Profile & Instagram', href: '/studio/settings?s=profile' }, { label: 'Get found by brands', href: '/studio/settings?s=found' }]
	},
	{
		slug: 'find-your-way',
		title: 'Find your way around the app',
		summary: 'Today, Collabs, Messages, Plan, Money and My page, and where each thing lives.',
		category: 'start',
		audience: 'creator',
		keywords: ['menu', 'tabs', 'where', 'find', 'navigation', 'settings', 'my page', 'laptop', 'phone', 'today', 'desk ai', 'ai assistant', 'ask your desk'],
		body: [
			{ p: 'On a phone, the bar at the bottom has six tabs. On a laptop the same places are in the side menu, with Content, Calendar and Grow listed on their own, and Settings in place of My page.' },
			{ list: ['Today: what needs you now, new collabs from your DMs, money yet to come, and Desk AI. The bell at the top opens your Alerts.', 'Collabs: your board of collabs, plus Brands (everyone you’ve worked with) and Pitches (brands you reach out to).', 'Messages: chats with brands, and Instagram DMs that look like collabs.', 'Plan: Content (what to make this week), Calendar and Grow.', 'Money: Overview, Payments, Invoices and Reports, plus the tax desk.', 'My page: your page, link, QR codes and every setting, grouped as Your page, Bookings & money, How your desk works and Account. Help is here too.'] },
			{ p: 'Desk AI (Your AI assistant on a laptop) sits on Today. It scores open requests, shows collabs spotted in your DMs one at a time, gives your month in review, and answers questions about your own collabs and money under Ask your desk.' }
		],
		links: [{ label: 'Today', href: '/studio' }, { label: 'My page', href: '/studio/settings' }]
	},
	{
		slug: 'connect-instagram',
		title: 'Connect Instagram (and reconnect it)',
		summary: 'Why Miracle asks, what it reads, and what to do if numbers stop updating.',
		category: 'start',
		audience: 'creator',
		keywords: ['instagram', 'connect', 'meta', 'facebook', 'professional account', 'business', 'creator account', 'token', 'expired', 'reconnect', 'not updating', 'followers wrong', 'sync', 'dms', 'posting'],
		body: [
			{ p: 'Connecting Instagram lets Miracle show your real numbers to brands (followers, reach, views, engagement and audience), notice when a collab post goes live, make results reports, and spot brand DMs that look like a collab.' },
			{ list: ['You need an Instagram professional account (Creator or Business). Switch in Instagram › Settings › Account type and tools.', 'Connect in My page › Profile & Instagram (Settings on a laptop). Miracle reads your own posts, insights and audience. It never posts without you.', 'DMs and posting from the app need one more permission: tap Allow DMs and posting on the same screen. Only DMs that look like collabs are kept.', 'Numbers sync every morning at 6. Tap Sync now for a fresh read. Audience details (age, gender, city, country) are read weekly and need 100+ followers.'] },
			{ p: 'Miracle keeps the connection fresh by itself. If it says Last sync failed, Instagram has signed Miracle out (usually after a password change). Tap Reconnect on the same screen.' },
			{ tip: 'The same screen has Automatic go-live and Results reports for brands. See “How Miracle knows your post is live”.' }
		],
		links: [{ label: 'Profile & Instagram', href: '/studio/settings?s=profile' }]
	},
	{
		slug: 'phone-alerts',
		title: 'Get alerts on your phone',
		summary: 'Install the app and turn on notifications, so new requests and payments reach you.',
		category: 'start',
		audience: 'creator',
		keywords: ['notification', 'alerts', 'push', 'not getting', 'app', 'android', 'iphone', 'install', 'bell', 'sound', 'vibrate', 'vibration', 'haptics', 'summary', 'telegram', 'voice'],
		body: [
			{ steps: ['Install Miracle from the Play Store on Android. On iPhone, open Miracle in Safari, tap Share › Add to Home Screen, and open it from there.', 'Sign in and allow notifications, or tap the alerts card on Today.', 'In My page › Inbox, replies & alerts › Phone app & alerts, check Notifications on this device is on, and tap Send a test.'] },
			{ list: ['Vibrate on taps: a light tick when you tap, and a buzz when money or a yes from a brand comes in. Just this phone.', 'Call me: the name alerts greet you by. Say it out loud in the app reads new collabs aloud while the app is open.', 'Summary & calendar: the 9 AM summary email, pending payment reminders at the hours you pick, and fun nudges through the day. Telegram can get a copy too.'] },
			{ p: 'Every important alert is also kept in Alerts for 90 days (the bell on Today, or Alerts in the laptop menu), so nothing is lost if you miss a notification. Delete them one by one or all at once.' },
			{ tip: 'Not getting alerts? Check your phone’s battery saver isn’t blocking Miracle, and that notifications are on for it in your phone’s settings.' }
		],
		links: [{ label: 'Alert settings', href: '/studio/settings?s=alerts' }, { label: 'Your alerts', href: '/studio/alerts' }]
	},
	{
		slug: 'phone-app-share',
		title: 'Send a WhatsApp message to Miracle',
		summary: 'Share a brand’s message from WhatsApp (or any app) and it opens as a new collab, already read.',
		category: 'start',
		audience: 'creator',
		keywords: ['share', 'whatsapp', 'share menu', 'add to miracle', 'android', 'forward', 'message', 'screenshot', 'app'],
		body: [
			{ steps: ['In WhatsApp (or Gmail, Instagram, anywhere), press and hold the brand’s message and tap Share.', 'Pick Add to Miracle.', 'Add a collab opens with the message already read: the brand, what they want, pay and dates. Check it and save.'] },
			{ p: 'This works in the Android app, whether Miracle was open or not. On iPhone, copy the message and paste it into Add a collab instead.' }
		]
	},
	{
		slug: 'team',
		title: 'Add your manager, assistant or accountant',
		summary: 'Let people help run your desk, each with the right access.',
		category: 'start',
		audience: 'creator',
		keywords: ['team', 'manager', 'assistant', 'accountant', 'invite', 'access', 'remove', 'seats', 'teammate', 'owner'],
		body: [
			{ p: 'In My page › Team (Settings on a laptop), add someone by email and choose their role. They sign in at your link with a one-time code, and turn on alerts on their own phone.' },
			{ list: ['Manager: everything except your team and your sign-in email, money included.', 'Assistant: collabs, content and brand messages. No invoices or payments, and they can’t send quotes or change settings.', 'Accountant: invoices, payments and reports. No brand messages.'] },
			{ p: 'The free plan has two seats: you and one teammate. Agency has 15. Only you, the owner, can change a role or remove someone. Each person can also get copies of your emails (the Emails switch next to them).' },
			{ tip: 'Handing your desk over? Change owner is in My page › Sign-in, devices & account.' }
		],
		links: [{ label: 'Team settings', href: '/studio/settings?s=team' }]
	},
	{
		slug: 'autopilots',
		title: 'Auto-pilot: what Miracle can do for you',
		summary: 'Invoices, dates, reminders, counters and comment replies that happen on their own, each with its own switch.',
		category: 'start',
		audience: 'creator',
		keywords: ['autopilot', 'auto-pilot', 'automatic', 'rules', 'reminder', 'invoice', 'counter', 'approve', 'auto', 'comment', 'comment to dm', 'keyword'],
		body: [
			{ p: 'In My page › Auto-pilot (Settings on a laptop), each rule has its own switch. Turn on only what you want; everything else waits for you.' },
			{ list: ['Send invoices for you once a collab is live, and the advance invoice when a quote with an advance is accepted.', 'Fill in dates: go-live on the date the brand asked for, and the draft due a few days before.', 'Send brands their tracking link, so they can follow the collab without DMs.', 'Send quotes for package bookings in a week you have open.', 'Counter low barter offers with a polite reply.', 'Remind brands who go quiet on a quote or draft, once, after the number of days you pick.', 'Ask for missing brief details, and thank the brand with a review link when you wrap.'] },
			{ p: 'Comment-to-DM sits on the same screen: when someone comments a keyword (say PRICE) on your post, they get a DM with your link. Choose Off, Ask me (each reply waits for your tap) or Auto (up to 200 a day). It needs Allow comments on Instagram.' },
			{ tip: 'Looking for the pitch autopilot? It’s on Collabs › Pitches. See “Pitch brands yourself”.' }
		],
		links: [{ label: 'Auto-pilot settings', href: '/studio/settings?s=autopilot' }]
	},
	{
		slug: 'messages',
		title: 'Messages, saved replies and brand emails',
		summary: 'Every brand chat in one place, one-tap replies, away mode, and brand emails from Gmail.',
		category: 'start',
		audience: 'creator',
		keywords: ['messages', 'inbox', 'chat', 'reply', 'saved replies', 'templates', 'away', 'vacation', 'auto reply', 'email', 'gmail', 'collab-desk'],
		body: [
			{ p: 'Messages holds your chats with brands, one per collab. Instagram DMs that look like a collab show there too, and under Possible collabs.' },
			{ list: ['Saved replies: write the answers you send again and again (rates, availability, address) in My page › Inbox, replies & alerts, and use them with one tap in any chat.', 'Away mode (My page › Bookings & barter): pick the day you’re back. New requests and brand messages get a polite automatic reply, once per chat, and your page says when you return.', 'Brand emails: in Inbox, replies & alerts › Brand emails, a small Gmail script copies emails you label collab-desk into Miracle. New ones become requests; replies join that collab’s messages.'] }
		],
		links: [{ label: 'Messages', href: '/studio/inbox' }, { label: 'Inbox, replies & alerts', href: '/studio/settings?s=alerts' }]
	},
	{
		slug: 'share-your-page',
		title: 'Your link, QR codes, bio storefront and media kit',
		summary: 'Ways to share your page, sell digital drops or 1:1 calls with 0% fee UPI, and filter inquiries.',
		category: 'start',
		audience: 'creator',
		keywords: ['share', 'qr', 'media kit', 'pdf', 'storefront', 'upi', 'shop', 'links', 'fan list', 'budget gate', 'bio link', 'sell', 'digital product'],
		body: [
			{ p: 'Your Miracle link (yourname.miracleapp.live) works as your live media kit, rate card, booking form and creator storefront in one place.' },
			{ list: [
				'QR code & Share kit (My page › QR & share): download a dark or light QR card for events, pop-ups and visiting cards, or export a live PDF media kit.',
				'Bio storefront (0% fee UPI): add digital drops, 1:1 calls, templates or affiliate picks to your page links with a price in ₹. Buyers pay directly via your UPI QR and orders land in your storefront list with zero platform commission.',
				'Bio link budget gate: set a minimum budget in Creator OS / Bookings so brands see your floor before submitting a request.',
				'Fan list & custom links: collect follower emails and show your featured links right below your bio.'
			] },
			{ tip: 'Keep your UPI ID updated in My page › Invoices & payments — Miracle only displays it on paid storefront items.' }
		],
		links: [{ label: 'Share & QR', href: '/studio/qr' }, { label: 'Your page', href: '/studio/page' }, { label: 'Creator OS', href: '/studio/suite' }]
	},
	{
		slug: 'agency-roster',
		title: 'Manage several creators (Agency & live pitch decks)',
		summary: 'One roster for every creator you manage, live interactive pitch decks, and your commission ledger.',
		category: 'start',
		audience: 'creator',
		keywords: ['agency', 'manager', 'roster', 'talent', 'commission', 'pitch deck', 'deck', 'shortlist', 'multiple creators'],
		body: [
			{ p: 'Ask each creator to add you as a manager in My page › Team. You can manage one creator free. Managing two or more from one roster is on the Agency plan (₹4,999 a month).' },
			{ list: [
				'One roster view: switch between creators, track every active collab, and log your agency commission split.',
				'Live interactive pitch decks (/deck/...): pick creators from your roster and publish a live shareable deck link instead of a static PDF. Miracle counts brand views and lets brands shortlist creators directly with zero login.',
				'Brand inquiries from a deck land straight in your Roster so you can convert shortlisted creators into collabs in one tap.'
			] },
			{ p: 'Agency also gives your own brand team Brand Pro and 15 seats, and removes the “Sent with Miracle” line.' }
		],
		links: [{ label: 'Agency roster', href: '/studio/roster' }]
	},

	// ------------------------------------------------------------------ requests & collabs
	{
		slug: 'how-requests-arrive',
		title: 'How brand requests reach you',
		summary: 'From your page, Instagram DMs, email and WhatsApp, all in one place.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['request', 'brand', 'inquiry', 'dm', 'email', 'new collab', 'inbox', 'lead', 'collaboration', 'possible collab', 'should i take it', 'score', 'away'],
		body: [
			{ list: ['From your page: the quickest way, with the brief, budget and dates. It lands on Collabs as a new request.', 'Instagram DMs: Miracle flags DMs that look like a collab. They show on Today’s Desk AI card and under Possible collabs. On a phone, a new one opens Add a collab by itself on Today.', 'Email: label brand emails collab-desk in Gmail and they come in as requests (set it up in My page › Inbox, replies & alerts › Brand emails).', 'WhatsApp and anything else: share the message to Miracle, paste it, or read a screenshot in Add a collab.'] },
			{ p: 'Each new request gets a Should you take it? score from Desk AI: money, travel, dress and makeup, time and calendar, brand fit and terms, and what to ask. Tune it in My page › Bookings & barter › Deciding on a collab.' },
			{ tip: 'Away for a while? Turn on Away mode in My page › Bookings & barter, and brands get a polite reply saying when you’re back.' }
		],
		links: [{ label: 'Collabs', href: '/studio/collabs' }, { label: 'Possible collabs', href: '/studio/possible-collabs' }]
	},
	{
		slug: 'add-a-collab',
		title: 'Add a collab from a DM, chat or screenshot',
		summary: 'Paste it, read a screenshot or say it: three short steps and the collab is on your board.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['add', 'new collab', 'manual', 'paste', 'screenshot', 'voice', 'speak', 'dm', 'whatsapp', 'agency', 'import', 'several', 'existing', 'possible collabs', 'not a collab'],
		body: [
			{ steps: ['Tap + (on Today, Collabs or My page). Paste the brand’s message, read a screenshot, or tap Speak and say it.', 'What they’re asking: the AI fills in one line per detail and says Not mentioned where something is missing. Tap a line to change it.', 'The deal: how they pay (paid, barter or both), what you’ll make, your fee (with a hint from your rates) and usage rights. For barter, pick A product (shipped) or An experience.', 'When it goes live: the brand’s date or one a week or two out, with the draft three days before. Mark it Still talking, Agreed or Someday, and optionally send a reply on Instagram.'] },
			{ list: ['Sent by an agency? Add the agency next to the brand. The collab shows “via” the agency, and the brand stays the brand.', 'One message asking for two brands becomes two collabs, added one after another.', 'Possible collabs (from Today or Messages) lists every Instagram chat that looks like a collab: tap Add as collab, or Not a collab to clear it.', 'Have a lot of old collabs? Import (from Collabs or My page) takes several messages at once, separated by --- or two blank lines. Brands aren’t emailed.'] }
		],
		links: [{ label: 'Collabs', href: '/studio/collabs' }, { label: 'Possible collabs', href: '/studio/possible-collabs' }, { label: 'Import collabs', href: '/studio/import' }]
	},
	{
		slug: 'collab-steps',
		title: 'A collab, step by step',
		summary: 'The board, the next-step card, smart contracts, negotiating nudges, and what each stage means.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['stages', 'board', 'new', 'negotiating', 'confirmed', 'creating', 'live', 'wrapped', 'someday', 'smart contract', 'asci', 'alert', 'nudge'],
		body: [
			{ p: 'Every collab moves through six clear stages: New request → Negotiating → Confirmed → Creating → Live → Wrapped. Open any card to see the Next step banner telling you what is due right now.' },
			{ list: [
				'Negotiating alerts: if a deal sits in Negotiating without movement, Miracle nudges you to follow up before the brand goes cold.',
				'1-tap Smart Contract & ASCI checklist: once terms are agreed, both sides sign a click-wrap agreement with India ASCI disclosure checks right inside the collab.',
				'Someday: park a brand that isn’t ready yet without cluttering your active board.'
			] },
			{ tip: 'Tap the stage badge inside any collab to jump stages or cancel a deal that didn’t work out.' }
		],
		links: [{ label: 'Collab board', href: '/studio/collabs' }]
	},
	{
		slug: 'send-a-quote',
		title: 'Send a quote and get it accepted',
		summary: 'Ready-made options from your rates, usage rights and pay terms; the brand accepts online.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['quote', 'price', 'negotiate', 'counter', 'options', 'accept', 'agreement', 'contract', 'rate', 'advance', 'revise', 'check the offer', 'offer'],
		body: [
			{ steps: ['On the collab, tap Send quote on the next-step card to pick a ready quote (Match budget, Rate card or Premium), or Build quote under Quote & agreement to make your own.', 'Set the pieces and fee, usage rights, revisions, exclusivity and how long the quote is valid. Ask for an advance if you like, and choose whether to start before it arrives.', 'Tap Send to brand. It needs the brand’s email; you can also share it on WhatsApp.'] },
			{ p: 'Let the brand choose shows up to three options side by side, the middle one marked most popular. When they accept, Miracle makes a simple agreement both sides can download. If they ask for changes you’ll see their note: tap Revise quote.' },
			{ tip: 'Got an agreement, brief or offer from the brand? While a collab is new or in talks, Check the offer reads it (PDF, photo or text), scores it against your rates and usual terms, flags what to push back on, and writes your reply.' }
		]
	},
	{
		slug: 'drafts',
		title: 'Share drafts for approval (or log WhatsApp & IG DM drafts)',
		summary: 'Upload a draft for frame-accurate comments, or log drafts you sent directly on WhatsApp or Instagram DM.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['draft', 'approval', 'video', 'review', 'revision', 'comments', 'resolve', 'whatsapp', 'instagram dm', 'sent via', 'schedule'],
		body: [
			{ p: 'Open any collab and tap Share draft. You have two ways to track a round:' },
			{ list: [
				'Share via Miracle: upload the video/photo (up to 50 MB) or paste a Drive/WeTransfer link. The brand watches a watermarked preview, leaves timestamped comments on the exact second, and taps Approve or Ask for changes. Either side can mark individual comments resolved or reopen them.',
				'Log a direct WhatsApp or Instagram DM draft: if you already sent the video directly on WhatsApp or Instagram DM, choose Sent on WhatsApp or Sent on Instagram DM. Miracle logs the round with no file upload and without emailing the brand again. Once they reply in chat, tap Mark approved or Changes asked right on the round.'
			] },
			{ p: 'Each round is saved in your history and counted against the revisions included in your quote. Once approved, Schedule on Instagram can post it for you with the brand as collaborator (needs Allow DMs and posting).' },
			{ tip: 'Need a no-login approval link for a brand that isn’t on Miracle? Create a 1-tap approval link from Creator OS.' }
		],
		links: [{ label: 'Collab board', href: '/studio/collabs' }, { label: 'Creator OS', href: '/studio/suite' }]
	},
	{
		slug: 'go-live',
		title: 'How Miracle knows your post is live',
		summary: 'I’ve posted it, automatic go-live, the #ad check and the results report.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['live', 'posted', 'go live', 'detect', 'disclosure', 'ad', 'asci', 'paid partnership', 'report', 'results', 'link post', 'not detected', 'deliverables'],
		body: [
			{ p: 'Posted? Tap I’ve posted it on the collab. Pick the post from your latest ones (or paste its link), go through the posting checklist read from your caption, and the invoice is already filled in: Mark live & send invoice, or invoice later.' },
			{ p: 'With Automatic go-live on (My page › Profile & Instagram), Miracle does it by itself when you post and @mention the brand’s Instagram handle saved on a confirmed collab: the collab moves to Live, the brand is told, and the first line of your caption is checked for #ad (or #collab, #sponsored, #paidpartnership).' },
			{ list: ['Posts you link yourself count as the collab’s pieces: an extra reel or carousel is added to what you made.', 'Results reports for brands: 7 days after the last post, a report with views, reach, saves and any link taps or promo-code sales is made from Instagram’s numbers. Choose I check, then send (tap Send results), Send automatically, or Don’t make reports.'] },
			{ tip: 'Not detected? Check the brand’s Instagram handle under Deal on the collab, or just tap I’ve posted it.' }
		]
	},
	{
		slug: 'usage-rights',
		title: 'Usage rights and partnership ads',
		summary: 'Charge for brands running your content as ads, and offer an extension when it ends.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['usage', 'rights', 'whitelisting', 'partnership ads', 'boost', 'ads', 'extend', 'expire', 'exclusivity', 'ad code', 'perpetual'],
		body: [
			{ p: 'Usage rights let a brand run your content as ads or on their own pages. In a quote choose Organic only, 30, 60 or 90 days of paid ads, or Perpetual. The fee is priced from Extra paid usage in Rates & packages (a % of your fee for each 30 days, 25% to start).' },
			{ p: 'Paid usage counts from the go-live date. Seven days before it ends, Miracle emails the brand to offer an extension at your rate. If they ask, you approve or decline; approving adds the fee to the collab.' },
			{ p: 'Your usage rights (Usage rights on the Collabs board on a laptop, or All your usage rights on a collab’s Ads and exclusivity row) lists every right, the exclusivity you agreed to with clash warnings, and the partnership ad code to share with the brand.' }
		],
		links: [{ label: 'Your usage rights', href: '/studio/rights' }]
	},
	{
		slug: 'pitches',
		title: 'Pitch brands yourself (Instagram-first discovery & Wishlist)',
		summary: 'Discover brands via Instagram collabs and hashtags, sort New vs Wishlist, and contact brands by Email or IG DM.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['pitch', 'pitches', 'outreach', 'wishlist', 'autopilot', 'find brands', 'instagram', 'dm', 'email', 'new', 'hashtags', 'follow-up'],
		body: [
			{ p: 'Collabs › Pitches is your Outreach Studio. Brands are organised into four clear tabs — New, Wishlist, Pitched and Replied — matching the four counters at the top.' },
			{ list: [
				'Instagram-first discovery: Pitch autopilot and Find brands discover active brands first from your tracked peers’ Instagram collab tags, then from daily-rotated niche and city Instagram hashtags (checking IG bios and websites for public emails), and finally Google as a fallback.',
				'New vs Wishlist: every newly discovered brand (whether email-ready or Instagram DM-only) lands in New with a clear Just found / New · Today / days-ago stamp. Tap Wishlist on any card to bookmark it for future reference — Wishlist only holds brands you deliberately save.',
				'Contact directly: tap Approve / Email pitch to send from your own email (with automatic polite follow-ups after 5 and 12 days), tap DM on IG to copy a tailored message and open their Instagram chat, or open their @handle and website right from the card.',
				'Manual Find brands: tap Find brands anytime to pull up to 6 fresh brands immediately (up to 30/day) while rotating hashtags so you don’t see repeats.'
			] },
			{ p: 'With Pitch autopilot switched on, Miracle runs every morning at 8:30 AM. Choose Ask me first to review every email pitch before it sends, or Fully automatic to queue email-ready brands one at a time between 10 AM and 6 PM. A brand is never pitched twice.' },
			{ tip: 'Instagram doesn’t let any app start a cold DM automatically, so DM on IG copies your personalised pitch and opens the brand’s chat ready to paste and send.' }
		],
		links: [{ label: 'Pitches', href: '/studio/pitches' }]
	},
	{
		slug: 'creator-os-suite',
		title: 'Creator OS: 1-tap sign-offs, rate builder & brand ledger',
		summary: 'Send no-login approval links to WhatsApp brands, calculate quotes, track payment memory, and spot viral upsells.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['creator os', 'suite', 'approval link', 'whatsapp', 'contract link', 'quote builder', 'rate builder', 'brand ledger', 'payment memory', 'viral upsell', 'shorts', 'ugc'],
		body: [
			{ p: 'Creator OS (/studio/suite) gives you four daily tools for deals that happen both inside and outside Miracle:' },
			{ list: [
				'1-tap off-platform approval & contract links: send a clean link over WhatsApp or Instagram DM so a brand manager can approve your draft or sign terms with zero login, while Miracle tracks the sign-off status.',
				'Quote & rate builder: enter deliverables, usage rights and exclusivity to get a recommended charge before sending a quote.',
				'Private Brand Payment Memory (creator-only): log how fast a brand pays, red flags or contact notes in your private ledger for future negotiations.',
				'Multi-platform post & viral upsell tracker: track live Reels, YouTube Shorts and raw UGC assets so you know when a post outperforms and it’s time to pitch usage rights or a sequel.'
			] }
		],
		links: [{ label: 'Open Creator OS', href: '/studio/suite' }]
	},
	{
		slug: 'smart-contracts-asci',
		title: '1-tap smart contracts & ASCI disclosure checklist',
		summary: 'Lock deliverables, payment terms and India ASCI disclosure rules in one tap with a click-wrap audit trail.',
		category: 'collabs',
		audience: 'all',
		keywords: ['smart contract', 'asci', 'disclosure', 'ad', 'paid partnership', 'agreement', 'sign', 'compliance', 'india'],
		body: [
			{ p: 'Every confirmed collaboration includes a 1-tap Smart Contract with an India ASCI (Advertising Standards Council of India) disclosure checklist — no PDF printing or manual e-sign chasing.' },
			{ steps: [
				'The brand sets the deliverables, timeline, usage rights and required ASCI disclosure tags (#ad, #collab, #paidpartnership, etc.) and signs in 1 tap.',
				'The creator reviews the terms, checks off the ASCI disclosure rules and countersigns in 1 tap.',
				'Miracle stores the timestamped click-wrap audit trail right on the collaboration so both sides can reference or download it anytime.'
			] }
		],
		links: [{ label: 'Collab board', href: '/studio/collabs', side: 'creator' }, { label: 'Brand requests', href: '/brand/requests', side: 'brand' }]
	},
	{
		slug: 'brands-list',
		title: 'Your brands, ratings and monthly deals',
		summary: 'Everyone you’ve worked with, how fast they pay, your private notes and retainers.',
		category: 'collabs',
		audience: 'creator',
		keywords: ['brands', 'crm', 'contacts', 'rating', 'notes', 'merge', 'retainer', 'monthly deal', 'pays in', 'history', 'block'],
		body: [
			{ p: 'Collabs › Brands lists every brand you’ve worked with. Open one to see its collabs, how many days it takes to pay, products, contacts and your private notes.' },
			{ list: ['Your rating moves that brand’s future requests up or down your list. Other creators never see yours: once three creators have rated the same brand, they see only the average (as “Creators rate 4.5★”).', 'Merge into another brand tidies up the same brand saved under two names.', 'Monthly deals: for a retainer (say, 4 reels a month for 6 months), tap Set up a monthly deal. Each month’s collab is made on its own, and its invoice goes at the start of the month or when the content goes live.'] }
		],
		links: [{ label: 'Brands', href: '/studio/brands' }]
	},

	// ------------------------------------------------------------------ content & calendar
	{
		slug: 'content-calendar',
		title: 'Plan your week: Content and Calendar',
		summary: 'What to make this week, shot lists, and every date across your collabs.',
		category: 'plan',
		audience: 'creator',
		keywords: ['content', 'calendar', 'plan', 'schedule', 'shot list', 'hours', 'week', 'dates', 'shoot', 'ics', 'google calendar', 'due dates'],
		body: [
			{ p: 'Plan › Content shows the pieces to make this week and the hours they’ll take, how full the next weeks are, shoots to plan, what’s ready to post and what’s with the brand. Each collab has a shot list you can tick off.' },
			{ p: 'Plan › Calendar shows shoots, drafts, go-lives, follow-ups, payments, products and your own reels, with the next 7 days on top. Quick buttons mark something Posted, Paid, Done or Got it.' },
			{ tip: 'Want it in Google or Apple Calendar? Copy your private Calendar link from My page › Inbox, replies & alerts.' }
		],
		links: [{ label: 'Content', href: '/studio/content' }, { label: 'Calendar', href: '/studio/calendar' }]
	},
	{
		slug: 'open-weeks',
		title: 'Open weeks, barter rules and pausing requests',
		summary: 'How many collabs you take a week, which barter you accept, and Discover.',
		category: 'plan',
		audience: 'creator',
		keywords: ['availability', 'capacity', 'open weeks', 'busy', 'full', 'pause', 'accepting', 'barter', 'selective', 'paid only', 'discover', 'priority'],
		body: [
			{ p: 'Everything here is in My page › Bookings & barter (Settings on a laptop).' },
			{ list: ['Accepting collaborations: switch off to pause new requests.', 'List me in Discover: lets brands on Miracle find you (and lists you in the creator directory if that’s on).', 'Open weeks: how many collabs you take a week and the time each piece takes. Show on my page lets brands see which weeks are open, limited, full or away.', 'Priority rules: barter Open, Selective or Paid only, a minimum product value, barter collabs a month and preferred categories.', 'Away mode, and Deciding on a collab (what Should you take it? weighs).'] }
		],
		links: [{ label: 'Bookings & barter', href: '/studio/settings?s=bookings' }]
	},

	// ------------------------------------------------------------------ money
	{
		slug: 'gst-invoices',
		title: 'Make an invoice',
		summary: 'An invoice with your UPI QR and the brand’s details, in one tap. GST only if you’re registered.',
		category: 'money',
		audience: 'creator',
		keywords: ['invoice', 'bill', 'upi', 'qr', 'download invoice', 'gst', 'gstin', 'not registered', 'pan', 'wrong gst', 'whatsapp', 'tds', 'advance', 'draft'],
		body: [
			{ steps: ['Open My page › Invoices & payments (Settings on a laptop) and add your name, PAN and your UPI ID or bank account, to print on invoices.', 'On a live collab, tap Send invoice (or Create invoice on the Payment row). Miracle fills in the brand, the agreed fee, the due date, any TDS and a UPI QR for the exact amount.', 'Send it. With the brand’s email it goes by email (add their accounts team under Also email to). Without one it’s made anyway: tap Send on WhatsApp or Copy link.'] },
			{ p: 'Most creators aren’t registered for GST, and that’s fine: your invoices simply go out without it. Registered? Switch on Registered for GST in the same settings and add your GSTIN and rate, and Miracle adds the GST for you. An invoice prefix, LUT for export invoices and international bank details are there too.' },
			{ tip: 'Asked for an advance? The collab offers Send the advance invoice as soon as the quote is accepted. Not ready to send? Save draft.' }
		],
		links: [{ label: 'Invoices & payments', href: '/studio/settings?s=payments' }, { label: 'Your invoices', href: '/studio/invoices' }]
	},
	{
		slug: 'get-paid',
		title: 'Getting paid, and where your money stands',
		summary: 'Brands pay you directly. Miracle reminds them and never takes a cut.',
		category: 'money',
		audience: 'creator',
		keywords: ['payment', 'paid', 'due', 'overdue', 'reminder', 'upi', 'bank', 'commission', 'fee', 'confirmed', 'received', 'record payment', 'invoices', 'money', 'tds certificate'],
		body: [
			{ p: 'Brands pay you straight to your UPI or bank account. Miracle takes no commission on any deal.' },
			{ list: ['Money due only counts once the content is live. Agreed collabs sit under Confirmed, marked Paid after it goes live.', 'Money › Payments: filters for Due, Overdue, Confirmed, Paid and Barter, and TDS certificates to mark Got it.', 'Money › Invoices: every invoice with Unpaid, Late and Paid this year, search, and the right button for each: Paid?, WhatsApp, Next steps when late, Finish it for a draft.', 'With a brand’s email, reminders go by themselves: 2 days before the due date, on the day, then 3, 7 and 14 days late.', 'When the brand says they’ve paid (with the amount and UTR), you get an alert to confirm. Or tap Paid? to record it yourself.'] },
			{ tip: 'Money › Overview has what you’ve earned this financial year, this month against your goal, money yet to come and overdue.' }
		],
		links: [{ label: 'Payments', href: '/studio/payments' }, { label: 'Invoices', href: '/studio/invoices' }]
	},
	{
		slug: 'late-payments',
		title: 'When a brand pays late',
		summary: 'Reminders, a formal demand, then an MSME complaint or legal notice, ready to send.',
		category: 'money',
		audience: 'creator',
		keywords: ['late', 'overdue', 'not paid', 'chase', 'demand', 'msme', 'samadhaan', 'udyam', 'legal notice', 'next steps', 'unpaid'],
		body: [
			{ p: 'Open a late invoice and tap Next steps (on Money › Invoices or Payments) for Getting paid, step by step.' },
			{ steps: ['Two reminders go by themselves.', 'From 10 days late: a formal payment demand, a signed PDF to send by email or WhatsApp.', 'From 45 days late: an MSME complaint (needs your Udyam number in My page › Invoices & payments) or a legal notice, ready to send.'] },
			{ p: 'Steps 3 and 4 always wait for you; nothing formal goes out on its own.' }
		],
		links: [{ label: 'Invoices', href: '/studio/invoices' }]
	},
	{
		slug: 'bank-credits',
		title: 'Match bank credits to invoices',
		summary: 'Your bank’s “credited” emails mark the right invoice paid.',
		category: 'money',
		audience: 'creator',
		keywords: ['bank', 'credit', 'match', 'reconcile', 'automatic', 'gmail', 'paid automatically', 'neft', 'imps', 'upi credit'],
		body: [
			{ p: 'Switch on Match bank credits automatically in My page › Invoices & payments. It uses the same Gmail script as brand emails (My page › Inbox, replies & alerts › Brand emails).' },
			{ p: 'When your bank emails that money came in, Miracle finds the invoice it pays and marks it paid. Credits it can’t place wait under Bank credits on Payments: tap Match to pick the invoice, or Not a collab.' }
		],
		links: [{ label: 'Invoices & payments', href: '/studio/settings?s=payments' }]
	},
	{
		slug: 'barter',
		title: 'Barter: products and experiences',
		summary: 'Collabs paid in products, stays or meals, and how they’re tracked.',
		category: 'money',
		audience: 'creator',
		keywords: ['barter', 'product', 'free product', 'experience', 'stay', 'hotel', 'meal', 'restaurant', 'shipping', 'address', 'got it', 'received', 'gifted'],
		body: [
			{ p: 'When you add a barter collab, pick A product (shipped) or An experience (a stay, a meal, an event). Miracle picks one from the message when it can.' },
			{ list: ['Money › Payments › Barter lists them, things yet to come first. Mark a product Got it when it arrives, or an experience Done.', 'Brands ship to the address in My page › Sign-in, devices & account › Products & shipping. It stays private until a collab is confirmed.', 'Barter you accept is set in My page › Bookings & barter: Open, Selective or Paid only, with a minimum product value.'] },
			{ tip: 'Products over ₹20,000 a year from one brand can mean TDS under 194R. See “TDS and your tax desk”.' }
		],
		links: [{ label: 'Payments', href: '/studio/payments' }]
	},
	{
		slug: 'tax',
		title: 'TDS and your tax desk',
		summary: 'What brands deduct, barter TDS, your 26AS check and a pack for your CA.',
		category: 'money',
		audience: 'creator',
		keywords: ['tds', 'tax', '194j', '194c', '194r', '393', 'barter', 'income tax', '26as', 'ais', 'itr', 'advance tax', 'gst limit', 'ca', 'accountant', 'pan'],
		body: [
			{ p: 'Brands may deduct TDS when they pay you: usually 10% under 194J once they pay you over ₹50,000 in a year, or 1–2% under 194C (over ₹30,000 at once or ₹1 lakh a year). Free products above ₹20,000 a year from one brand fall under 194R, where the brand deducts 10%. From 1 April 2026 these sit in section 393 of the Income-tax Act, 2025, at the same rates. Without your PAN, brands deduct 20%.' },
			{ list: ['Open it from Money › Overview › Tax desk.', 'It adds up your income, the TDS deducted, and your GST limit with barter counted (₹20 lakh, ₹10 lakh in some states).', 'Match with your Form 26AS: tick each entry as it shows up.', 'Barter: each brand’s yearly total, with Remind brand and TDS deducted buttons.', 'Other income (YouTube, affiliate) and a quarter pack to download for your CA.'] },
			{ tip: 'It’s a guide, not tax advice: check with your CA.' }
		],
		links: [{ label: 'Tax desk', href: '/studio/tax' }]
	},
	{
		slug: 'rates-packages',
		title: 'Rates, packages and what to charge',
		summary: 'Set your rates, let brands build a package, and see what creators like you charge.',
		category: 'money',
		audience: 'creator',
		keywords: ['rates', 'rate card', 'price', 'package', 'package builder', 'discount', 'how much', 'charge', 'benchmark', 'pricing', 'suggested'],
		body: [
			{ p: 'In My page › Rates & packages (Settings on a laptop), set a rate for each kind of content, and switch off the ones you don’t make. Suggested from your Instagram gives a starting point; tap Use suggested. Show starting rates decides whether prices show on your page.' },
			{ p: 'Let brands build a package is on to start: brands pick how many of each piece, and the bigger the package, the bigger the discount (2+ pieces 5% off, 4+ 10%, 6+ 15%; you set the steps). Request this package sends you a request at that price. Turn it off to offer fixed packages instead.' },
			{ p: 'Miracle shows what creators of your size and niche charge, anonymously, from at least 5 creators’ accepted quotes in the last 18 months, and what brands said to your own prices.' }
		],
		links: [{ label: 'Rates & packages', href: '/studio/settings?s=rates' }]
	},
	{
		slug: 'pricing-offers',
		title: 'Book again, demand pricing and instant booking',
		summary: 'Offers that bring brands back, prices that follow your demand, and bookings that confirm themselves.',
		category: 'money',
		audience: 'creator',
		keywords: ['book again', 'rebook', 'repeat', 'returning brand', 'discount', 'demand pricing', 'prices follow demand', 'instant booking', 'offers'],
		body: [
			{ p: 'All three are in My page › Pricing & offers.' },
			{ list: ['Book again offer: a week after a collab wraps, the brand gets a thank-you with a one-tap Book again link, and if you like a returning-brand discount (5–20%, valid 14–90 days). Brands without an email get it from your WhatsApp via the Book again card on the collab.', 'Prices follow demand: when your next 4 weeks are at least 75% booked, the package prices on your page go up by the % you pick, and come back down when you have space.', 'Instant booking for packages: a brand booking a package for an open week, at least 3 days ahead with no competitor that week, is confirmed straight away. Both of you get an email.'] }
		],
		links: [{ label: 'Pricing & offers', href: '/studio/settings?s=offers' }]
	},
	{
		slug: 'money-reports',
		title: 'Money reports and files for your accountant',
		summary: 'Earnings by month and by brand, your month in review, and CSVs for your CA.',
		category: 'money',
		audience: 'creator',
		keywords: ['reports', 'earnings', 'income', 'month', 'csv', 'export', 'accountant', 'ca', 'invoice register', 'review', 'goal'],
		body: [
			{ p: 'Money › Reports shows money received, month by month, your deals and earnings by brand (each downloads as a CSV). For your accountant has an invoice register, a monthly summary and a brand summary.' },
			{ p: 'Desk AI on Today links to your last month in review: what you earned, what worked and what to charge next. Set a monthly goal in My page › Invoices & payments to track it on Money.' }
		],
		links: [{ label: 'Reports', href: '/studio/reports' }]
	},

	// ------------------------------------------------------------------ growth
	{
		slug: 'grow-tools',
		title: 'Grow: check-up, Reel studio, benchmarks, pulse & automations',
		summary: 'All your creator growth tools in one place: Peer Benchmarks, Viral Script Studio, Golden Hour Pulse, Trend Radar and Auto-DM.',
		category: 'grow',
		audience: 'creator',
		keywords: ['grow', 'check-up', 'reel check', 'benchmarks', 'viral script', 'studio', 'golden hour', 'pulse', 'trend radar', 'trends', 'automations', 'auto-dm', 'collab reels'],
		body: [
			{ p: 'Plan › Grow (Grow on a laptop) brings together your Instagram growth toolkit, live performance numbers and latest posts.' },
			{ list: [
				'Peer Benchmarks: track creators in your niche automatically to compare Reel views, posting cadence, format mix, Comment-to-DM magnet lift and active brand collabs.',
				'Viral Script & Series Studio: remix your highest-share Reels into repeatable series with 0–2s scroll-stop hooks, shot sheets and DM magnets.',
				'Golden Hour Pulse: monitor first-hour velocity right after you post and follow the Golden Hour playbook.',
				'Trend Radar: spot rising formats in your niche and mine the questions your followers keep asking in comments.',
				'Instagram Automations: set up Comment-to-DM keyword triggers so commenters automatically get your link or offer.',
				'Growth check-up, Reel check & Collab Reels: audit a Reel before posting, review your monthly check-up, and find creators to co-author Reels with.'
			] },
			{ p: 'Miracle never buys followers or likes — every tool is built on real Instagram insights and organic retention signals.' }
		],
		links: [
			{ label: 'Grow hub', href: '/studio/grow' },
			{ label: 'Peer Benchmarks', href: '/studio/grow/benchmarks' },
			{ label: 'Viral Script Studio', href: '/studio/grow/studio' },
			{ label: 'Automations', href: '/studio/grow/automations' }
		]
	},
	{
		slug: 'insights',
		title: 'All your insights, engagement rate formula & Top Reel',
		summary: 'How Miracle calculates your engagement rate identically across every screen, and what brands see on your page.',
		category: 'grow',
		audience: 'creator',
		keywords: ['insights', 'engagement rate', 'formula', 'last 10', '3 days', 'saves', 'shares', 'views', 'reach', 'top reel', 'media kit', 'story'],
		body: [
			{ p: 'Grow › All your insights shows your full Instagram numbers in the same layout brands see on your public insights page, even if you hide certain sections from brands.' },
			{ list: [
				'One consistent Engagement Rate everywhere: Today, My page, Your Insights and Peer Benchmarks all use the exact same industry-standard formula — average (Likes + Comments + Shares + Saves) across your last 10 non-Story posts that are at least 3 days old, divided by your Followers × 100.',
				'Why 3+ days old? Brand-new posts are still gathering reach and saves; waiting 3 days keeps a fresh upload from dragging down your average.',
				'Top Reel highlight: on Today, tapping the Top Reel story ring opens your winning Reel’s cover thumbnail, posted date, linked collab brand tag, caption and a direct Instagram link.'
			] },
			{ tip: 'Your synced engagement rate also stays aligned on brand-facing views so brands never see a mismatched number.' }
		],
		links: [{ label: 'All your insights', href: '/studio/grow/insights' }, { label: 'Peer Benchmarks', href: '/studio/grow/benchmarks' }]
	},
	{
		slug: 'peer-benchmarks',
		title: 'Peer Benchmarks & competitor intelligence',
		summary: 'Track creators in your niche automatically to compare Reel views, cadence, Comment-to-DM lift and brand collabs.',
		category: 'grow',
		audience: 'creator',
		keywords: ['peer', 'benchmarks', 'competitor', 'intelligence', 'reel views', 'cadence', 'ist', 'comment-to-dm', 'collab brands', 'breakout', 'playbook'],
		body: [
			{ p: 'Plan › Grow › Peer Benchmarks turns any public Instagram creator handle into an automated competitor dossier — no manual stats entry required.' },
			{ list: [
				'Side-by-side comparison: compare your Public ER, posts per week and followers against your tracked peers using the same settled 10-post formula.',
				'Deep format & cadence breakdown: see each peer’s average Reel views, format mix, peak IST posting windows and Comment-to-DM magnet lift.',
				'Breakout posts & brand collabs: inspect their highest-multiplier Reels (× their normal average) and the exact brand handles they recently collaborated with — which Pitch autopilot can also mine for new leads.',
				'What to act on: Miracle turns the gap between you and your peers into concrete action cards (like setting up Auto-DM or auditing your next Reel).'
			] },
			{ tip: 'Tap Refresh anytime to pull fresh Instagram numbers for all tracked peers.' }
		],
		links: [{ label: 'Peer Benchmarks', href: '/studio/grow/benchmarks' }, { label: 'Pitches', href: '/studio/pitches' }]
	},
	{
		slug: 'viral-script-studio',
		title: 'Viral Script & Series Studio',
		summary: 'Remix your highest-share Reels into repeatable series with 0–2s scroll-stop hooks, shot sheets and DM magnets.',
		category: 'grow',
		audience: 'creator',
		keywords: ['viral script', 'script studio', 'series', 'hook', 'shot sheet', 'shot list', 'remix', 'reel script', 'pinned comment', 'dm magnet'],
		body: [
			{ p: 'Plan › Grow › Viral Script Studio studies your highest-share Reels and helps you turn winning angles into repeatable content series.' },
			{ steps: [
				'Pick a winning Reel or topic to remix into a series blueprint.',
				'Choose a 0–2 second scroll-stop hook tailored to your niche and audience.',
				'Follow the second-by-second shot sheet while filming, then copy the generated caption, pinned comment and Comment-to-DM magnet.'
			] }
		],
		links: [{ label: 'Viral Script Studio', href: '/studio/grow/studio' }, { label: 'Content plan', href: '/studio/content' }]
	},
	{
		slug: 'golden-hour-pulse',
		title: 'Golden Hour Pulse & Trend Radar',
		summary: 'Track first-hour Reel velocity right after posting, spot rising formats, and mine follower questions from comments.',
		category: 'grow',
		audience: 'creator',
		keywords: ['golden hour', 'pulse', 'velocity', 'first hour', 'trend radar', 'trends', 'rising formats', 'follower questions', 'comments'],
		body: [
			{ p: 'Two focused tools in Plan › Grow help you decide what to shoot next and maximise every post right after it goes live:' },
			{ list: [
				'Golden Hour Pulse: tracks your post’s first-hour velocity (views, likes, comments and shares) against your baseline, gives you a Golden Hour playbook to boost early engagement, and logs past Golden Hours so you see what spikes.',
				'Trend Radar: surfaces rising Reel formats in your niche every week (with optional weekly alerts) and pulls out “What your followers keep asking” from your comments so you never run out of high-intent video ideas.'
			] }
		],
		links: [{ label: 'Golden Hour Pulse', href: '/studio/grow/pulse' }, { label: 'Trend Radar', href: '/studio/grow/trends' }]
	},
	{
		slug: 'instagram-automations',
		title: 'Instagram Automations (Comment-to-DM)',
		summary: 'Automatically DM anyone who comments a keyword on your Reel or post with your link, code or storefront drop.',
		category: 'grow',
		audience: 'creator',
		keywords: ['automations', 'auto-dm', 'comment to dm', 'comment-to-dm', 'keyword', 'trigger', 'dm magnet', 'instagram'],
		body: [
			{ p: 'Plan › Grow › Instagram Automations lets you turn comments into instant DMs — great for product links, affiliate picks, coupon codes or brand collab CTAs.' },
			{ steps: [
				'Make sure Instagram is connected with Allow DMs and posting enabled.',
				'Open Instagram Automations, pick a post (or apply to all posts), set your trigger keyword (like “LINK” or “LOCATION”), and write the DM reply.',
				'Switch the rule on — Miracle replies automatically whenever a follower comments your keyword and tracks how many DMs went out.'
			] },
			{ tip: 'Pairing a clear “Comment LINK for details” CTA with Auto-DM boosts comments during your Golden Hour and drives more clicks.' }
		],
		links: [{ label: 'Instagram Automations', href: '/studio/grow/automations' }]
	},
	{
		slug: 'free-tools',
		title: 'Free CPV calculator & profile review tools',
		summary: 'Estimate Cost Per View (CPV) for creator campaigns or run an instant Instagram profile review — no sign-in needed.',
		category: 'grow',
		audience: 'all',
		keywords: ['tools', 'cpv', 'calculator', 'profile review', 'rate calculator', 'engagement calculator', 'free'],
		body: [
			{ p: 'Miracle includes free public tools you can share with teammates, managers or brands anytime:' },
			{ list: [
				'CPV Calculator (/tools/cpv-calculator): enter expected Reel views and creator fee to see Cost Per View and benchmark whether a quote is fair.',
				'Profile Review (/tools/profile-review): get a quick read on an Instagram profile’s positioning, bio clarity and collab readiness.',
				'Rate & Engagement calculators (miracleapp.live/tools): quick sanity checks for pricing and engagement.'
			] }
		],
		links: [{ label: 'CPV Calculator', href: '/tools/cpv-calculator' }, { label: 'Profile Review', href: '/tools/profile-review' }]
	},
	{
		slug: 'audience-health',
		title: 'Audience health and brand safety',
		summary: 'The score brands see before booking a creator, and how to improve it.',
		category: 'grow',
		audience: 'all',
		keywords: ['audience health', 'score', 'brand safety', 'fake followers', 'bought followers', 'flag', 'flagged', 'wrong', 'verified', 'trust', 'healthy audiences'],
		body: [
			{ p: 'Every day Miracle scores each Instagram-connected creator’s audience from their own numbers, out of 100: real reach (how many followers a post reaches; needs 4 posts older than 3 days), engagement for an account that size, steady growth (no sudden jumps a viral post doesn’t explain; checked from 1,000 followers) and how much of the audience is in India.' },
			{ p: 'Once a week, or sooner after new posts, an AI also reads the last 40 captions for things a brand should know first, such as betting apps, adult content, risky health claims or promotions without #ad. Minor notes (like drinks at a night out) don’t count against anyone; only serious ones mark a creator as worth a look.' },
			{ list: ['Creators: see yours in Grow › Audience health. To lift reach and engagement, post consistently, reply to comments, and make reels people share and save.', 'A flag you think is wrong: edit the caption or archive the post, and it clears at the next check. Or raise a ticket and we’ll look.', 'Brands: the score and brand-safety notes show on Discover, creator pages, applications and requests. Healthy audiences only in Discover keeps creators scoring 65+ with nothing serious.'] }
		],
		links: [{ label: 'See yours in Grow', href: '/studio/grow', side: 'creator' }, { label: 'Explore', href: '/brand/explore', side: 'brand' }]
	},
	{
		slug: 'creator-directory',
		title: 'The creator directory',
		summary: 'Be found by brands on miracleapp.live/creators, by niche and city.',
		category: 'grow',
		audience: 'creator',
		keywords: ['directory', 'listed', 'discover', 'found', 'google', 'search', 'creators page', 'hide', 'verified', 'tick'],
		body: [
			{ p: 'The directory at miracleapp.live/creators lists creators by niche and city, with live Instagram numbers and a verified tick for connected accounts (shown first). Switch it on in My page › Get found by brands; List me in Discover (My page › Bookings & barter) must be on too. It can take a few minutes to show; tap See your listing.' },
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
		keywords: ['ai', 'used up', 'limit', 'not working', 'error', 'free ai', 'quota', 'allowance', 'screenshot', 'voice typing'],
		body: [
			{ p: 'Miracle’s AI (reading requests and screenshots, writing replies, checking offers, the growth tools and this help) runs on two allowances.' },
			{ list: ['Miracle’s shared daily allowance. When it runs out you’ll see “Today’s free AI is used up. It’s back at 5:30 am.” (or the same for reading screenshots, voice typing or search). Paste text instead of a screenshot in the meantime.', 'Your own daily AI, from your plan. When it’s used you’ll see “You’ve used today’s free AI. It’s back tomorrow.” Plan & billing shows the % used today; on Today, Desk AI shows what’s left. Brand Pro has three times the free amount.'] },
			{ p: 'Everything else keeps working without AI.' }
		],
		links: [{ label: 'Plan & billing', href: '/studio/settings?s=plan' }]
	},

	// ------------------------------------------------------------------ brands: setup
	{
		slug: 'brand-get-started',
		title: 'Get started as a brand',
		summary: 'Sign up, verify your brand with Instagram, and find your way around.',
		category: 'brand-setup',
		audience: 'brand',
		keywords: ['sign up', 'signup', 'join', 'start', 'brand account', 'verify', 'verified', 'instagram', 'profile', 'menu', 'where', 'gstin', 'company', 'settings', 'ask', 'ai', 'chat', 'assistant', 'ask your desk'],
		body: [
			{ steps: ['Sign up as a brand with your work email: brand name, category, website, Instagram, your name and role, city, and your GSTIN if you have one.', 'Your team starts with 14 days of Brand Pro, no card needed.', 'In Settings › Company & Instagram, tap Connect Instagram (a Business or Creator account). Creators then see your logo, handle and Verified on Instagram.', 'Add your legal name, GSTIN, address and accounts email in Settings › Billing & GST. They’re printed on the invoices you receive.'] },
			{ p: 'On a phone the bottom bar has Today, Collabs (Requests, Creators, Pools, Discover), Plan (Campaigns, Calendar, Grow, Content, Turnaround, Autopilots), Money (Reports, Payments, Shipping) and Brand: your profile, with Settings behind the gear at the top right. Messages open from the send icon at the top. On a laptop the same places are in the side menu.' },
			{ p: 'Ask your desk: tap the sparkle at the top of Today (Ask your desk in the side menu on a laptop) and ask about your requests, drafts to approve, invoices to pay and go-live dates. The free AI answers from your own data and links you to the request. It never changes anything.' }
		],
		links: [{ label: 'Company & Instagram', href: '/brand/settings?s=company' }]
	},
	{
		slug: 'brand-profile-grow',
		title: 'Your brand profile, Instagram insights and Grow',
		summary: 'Your own Instagram numbers, what creators’ posts brought you, synced engagement metrics, and ideas.',
		category: 'brand-setup',
		audience: 'brand',
		keywords: ['brand profile', 'instagram', 'insights', 'grow', 'sync', 'engagement rate', 'views', 'analytics'],
		body: [
			{ p: 'With Instagram connected, Miracle syncs your brand’s own account every night (or tap Sync now): recent posts and their numbers, the last 30 days against the 30 before, averages per format, and what creator collaborations contributed.' },
			{ p: 'Engagement rates across creator profiles you view in Explore, unlocked dossiers and active requests stay synced to the same settled 10-post formula (Likes + Comments + Shares + Saves on posts 3+ days old ÷ Followers), so you can compare creators apples-to-apples.' },
			{ tip: 'Want to check a creator’s cost-per-view or profile health before reaching out? Use the free CPV Calculator and Profile Review tools.' }
		],
		links: [{ label: 'Brand Grow', href: '/brand/grow' }, { label: 'Brand Insights', href: '/brand/grow/insights' }]
	},
	{
		slug: 'brand-team',
		title: 'Your brand team, approvals and companies',
		summary: 'Invite colleagues, set who approves and who pays, and switch brands or clients.',
		category: 'brand-setup',
		audience: 'brand',
		keywords: ['team', 'colleague', 'invite', 'approver', 'approval', 'limit', 'finance', 'admin', 'member', 'company', 'switch', 'agency', 'multiple brands', 'client', 'clients', 'workspace', 'working for', 'seats'],
		body: [
			{ p: 'In Settings › Team & approvals, an admin taps Invite someone and picks a role: admin (everything, including the team), approver (accepts quotes above the limit), finance (money and invoices) or member (campaigns and requests, within the limit). Inviting a team is on Brand Pro (5 seats) or Agency (15); the free plan has one seat.' },
			{ p: 'Turn on Approvals and set Quotes over ₹…: bigger quotes then wait under Waiting for approval until an approver taps Approve and accept.' },
			{ p: 'Several brands of your own? Settings › Brands you manage › Add another brand, and tap one to switch. Working for clients (an agency, say)? Each client invites you to its own team, and is kept apart from the others. Working for (in the side menu on a laptop, at the top on a phone) shows every client side by side and switches between them. More than one client team needs the Agency plan.' }
		],
		links: [{ label: 'Team & approvals', href: '/brand/settings?s=team' }]
	},
	{
		slug: 'brand-alerts',
		title: 'Brand alerts and emails',
		summary: 'Phone alerts for quotes, drafts, messages and invoices, and quiet hours.',
		category: 'brand-setup',
		audience: 'brand',
		keywords: ['alerts', 'notifications', 'push', 'email', 'phone', 'quiet hours', 'summary', 'not getting'],
		body: [
			{ p: 'In Settings › Emails & alerts, tap Turn on alerts on this phone, then choose what you hear about: quotes, drafts to approve, messages, invoices and payments, posts going live, and open-brief applications (each one, or a 6 pm summary). Quiet hours keep it silent from 10 pm to 8 am.' }
		],
		links: [{ label: 'Emails & alerts', href: '/brand/settings?s=alerts' }]
	},

	// ------------------------------------------------------------------ brands: working with creators
	{
		slug: 'brand-send-request',
		title: 'Send a request to a creator',
		summary: 'From their page or Discover: what you want, budget, dates and brief.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['request', 'book', 'creator', 'brief', 'collab', 'hire', 'send request', 'influencer', 'barter', 'package', 'book now', 'instant'],
		body: [
			{ steps: ['Find the creator in Collabs › Discover (or Find creators), or open their page at name.miracleapp.live.', 'Tap Send a request (Request on a Discover card).', 'Fill in the type of collab (Paid, Paid + product or Barter, and for barter a product or an experience), what you’d like, your budget (leave it blank for a quote), the preferred go-live date, usage rights and the brief.', 'Tap Send request. New here? Enter your work email and the 6-digit code, then Confirm and send.'] },
			{ p: 'On a creator’s page you can also build a package: pick how many of each piece and the bigger it is, the bigger the discount. Request this package sends it at that price. Packages with instant booking show Book now and are confirmed straight away.' },
			{ p: 'Track everything in Collabs › Requests. The creator replies or sends a quote you can accept online; drafts, messages, invoices and results all stay on the request. The free plan sends 3 requests a month.' }
		],
		links: [{ label: 'Explore', href: '/brand/explore' }, { label: 'Your requests', href: '/brand/requests' }]
	},
	{
		slug: 'brand-discover',
		title: 'Find creators: Explore and pools',
		summary: 'Search by niche, audience and price; check audience health; save creators to pools.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['discover', 'explore', 'miracle score', 'ranking', 'compare', 'collections', 'find creators', 'search', 'filter', 'pool', 'pools', 'shortlist', 'invite', 'audience health', 'healthy', 'unlock', 'profile', 'rating'],
		body: [
			{ list: ['Explore (its own tab) lists creators open to brands (and ones who worked with you), ranked by the Miracle Score: posts on time, paid deals on Miracle, how fast they reply, audience health and a complete profile. It is earned, never paid for. Start from a collection (Top rated, Best fit, Always on time, Reels under ₹15K…), filter by niche, language, city, followers, Reel price and Healthy audiences only, or sort by Best fit, Lowest price or Most followers.', 'Tap Compare on up to three creators to see them side by side: followers, engagement, average views, Reel price, cost per 1,000 views, audience health, on-time record, paid deals and reply time.', 'Each card shows their record (verified deals, on time) and their audience health and brand-safety check.', 'A creator’s page shows why they fit, Audience & safety, what you did together, Your rating & notes (only your team sees it), and creators like them.', 'Tap Pool to save a creator. Collabs › Pools holds your lists: start a campaign to a whole pool, and use Invite @handle for creators not on Miracle yet.'] },
			{ p: 'On the free plan you open 10 full creator profiles a day (creators you’ve worked with don’t count). Past that, unlock one creator for good: see “Unlock a creator’s full profile”.' }
		],
		links: [{ label: 'Explore', href: '/brand/explore' }, { label: 'Pools', href: '/brand/creators?tab=pools' }]
	},
	{
		slug: 'brand-unlock',
		title: 'Unlock a creator’s full profile',
		summary: 'Past the free 10 profiles a day, pay once to see one creator in full, for good.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['unlock', '199', 'profile', 'limit', '10 a day', 'locked', 'pay once', 'one creator', 'free plan'],
		body: [
			{ p: 'On the free plan, after 10 full profiles in a day a creator’s page offers Unlock for the one-time price on the button (₹199 at the moment, GST included). It unlocks that creator’s full verified profile for your team, for good, and never counts towards your 10 a day again. You get an invoice and receipt like any plan.' },
			{ list: ['Only your team’s admin can buy.', 'Pay on the web; it isn’t offered in the phone app.', 'Brand Pro opens every profile in full.'] }
		]
	},
	{
		slug: 'brand-drafts',
		title: 'Review and approve drafts',
		summary: 'Watch watermarked drafts, leave and resolve timestamped comments, or track drafts shared on WhatsApp/IG DM.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['draft', 'review', 'approve', 'changes', 'comments', 'resolve', 'watermark', 'whatsapp', 'instagram dm', 'checklist'],
		body: [
			{ p: 'When a creator sends a draft inside Miracle, the request shows Draft for your review (Review the draft on a phone). Watch the video, leave comments on the exact second, check it against your brief checklist, and tap Approve or Ask for changes.' },
			{ list: [
				'Resolve comments: both you and the creator can mark each timestamped comment Resolved (or reopen it) so nothing gets missed between rounds.',
				'WhatsApp & Instagram DM drafts: if a creator shared the video directly on WhatsApp or Instagram DM, they can log that round on the request so your timeline and revision count stay accurate without duplicate emails.',
				'Draft checker autopilot: automatically checks captions against your brief (tags, hashtags, deliverables) and can auto-approve drafts that pass every check.'
			] },
			{ p: 'The in-app preview stays watermarked until the collab is paid. After the post goes live, the creator may send a case study; nothing goes on their public page until you approve it.' }
		],
		links: [{ label: 'Requests', href: '/brand/requests' }, { label: 'Brand Growth OS', href: '/brand/suite' }]
	},
	{
		slug: 'brand-book-again',
		title: 'Book a creator again',
		summary: 'Same pieces, one tap, and a returning-brand discount when the creator offers one.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['book again', 'rebook', 'repeat', 'returning', 'discount', 'welcome back', 'creators', 'again'],
		body: [
			{ p: 'Tap Book again on a live or finished request, or next to the creator in Collabs › Creators. The form is filled in from that collab. Creators can also send you a Book again link by email or WhatsApp.' },
			{ p: 'If the creator offers a returning-brand discount, you’ll see Welcome back and the % off, taken off their quote while the offer lasts.' },
			{ tip: 'The Rebook autopilot offers your best creators (by cost per 1,000 views) the same brief again when a collab ends.' }
		],
		links: [{ label: 'Your creators', href: '/brand/creators' }]
	},
	{
		slug: 'brand-messages-calendar',
		title: 'Messages, calendar and content',
		summary: 'Every creator chat, every date, and every post with its ad rights.',
		category: 'brand-start',
		audience: 'brand',
		keywords: ['messages', 'inbox', 'chat', 'calendar', 'dates', 'go live', 'content', 'posts', 'ad rights', 'usage', 'extend', 'whitelisting', 'partnership ads'],
		body: [
			{ list: ['Messages (Inbox on a laptop, the send icon at the top on a phone): every creator’s chat in one place, searchable, with Open request.', 'Plan › Calendar: shoots, drafts due and go-lives across all your creators, with the next 7 days on top.', 'Plan › Content: every post and raw file, and how long you may use each in ads. Extend usage by 30, 60 or 90 days, or Ask for ad rights.'] }
		],
		links: [{ label: 'Messages', href: '/brand/inbox' }, { label: 'Content', href: '/brand/business/content' }]
	},

	// ------------------------------------------------------------------ brands: campaigns
	{
		slug: 'brand-campaigns',
		title: 'Campaigns and open briefs',
		summary: 'One brief to many creators, quotes side by side, and creators who apply.',
		category: 'brand-campaigns',
		audience: 'brand',
		keywords: ['campaign', 'new campaign', 'brief', 'open brief', 'applications', 'apply', 'many creators', 'budget', 'quotes', 'compare'],
		body: [
			{ steps: ['Tap New campaign (Plan › Campaigns on a phone).', 'What do you want: a name, how you pay, what you want from each creator, and a budget per creator (or ask for a quote).', 'The brief: go-live date, usage rights, language and the brief itself.', 'Who gets it: a pool, or creators suggested for this brief. Tap Send to N creators.'] },
			{ p: 'The campaign page shows the budget used, whose turn it is and who hasn’t replied, with Board, Quotes (compare them side by side), Applications and Brief tabs.' },
			{ p: 'Open brief (Applications tab): let any creator who fits apply with their own rate until a date you pick (up to 60 days), with rules for who can apply. Shortlist the best and close applications. Open briefs are on Brand Pro; the free plan sends 1 campaign a month.' }
		],
		links: [{ label: 'Campaigns', href: '/brand/campaigns' }]
	},
	{
		slug: 'brand-autopilots',
		title: 'Brand autopilots and competitor watch',
		summary: 'Shortlists, follow-ups, draft checks, counters and rebooking, each Off, Ask me or Auto.',
		category: 'brand-campaigns',
		audience: 'brand',
		keywords: ['autopilot', 'automatic', 'shortlist', 'follow-up', 'draft check', 'draft checker', 'negotiate', 'negotiator', 'counter', 'rebook', 'competitor', 'competitor watch', 'waiting for your ok'],
		body: [
			{ p: 'Autopilots (Plan › Autopilots on a phone, Campaigns › Autopilots on a laptop): each one is Off, Ask me (it prepares the step and waits under Waiting for your OK) or Auto (it goes ahead and tells you).' },
			{ list: ['Shortlist: finds creators who fit each campaign (niche, content, engagement, price, past work with you), up to the number you set.', 'Follow-up: a friendly nudge when a creator hasn’t quoted, a draft is late or a post is due, after the quiet days you set and at most once a week.', 'Draft checker: checks each caption against your brief (mentions, hashtags, promo code, link, #ad). On Auto it approves drafts that pass every check.', 'Negotiator: on campaign quotes, accepts ones within budget and asks for a lower price on ones a little above it. On Auto it signs the agreement with the name you give.', 'Rebook: offers your best creators (by cost per 1,000 views) the same brief again when a collab ends.'] },
			{ p: 'Competitor watch: list up to five competitors (name and Instagram). Every Monday, Miracle finds creators who worked with them and invites new ones to the campaign you pick (or just tells you). Check now runs it straight away.' },
			{ tip: 'Autopilots and competitor watch are on Brand Pro, and on during your 14-day trial.' }
		],
		links: [{ label: 'Autopilots', href: '/brand/autopilots' }]
	},
	{
		slug: 'brand-growth-os',
		title: 'Brand Growth OS: sign-off links, ROI mix & bulk payouts',
		summary: 'Share 1-tap approval links, publish your Apply to Collab page, model creator ROI, monitor live posts and export Bulk NEFT + TDS CSVs.',
		category: 'brand-campaigns',
		audience: 'brand',
		keywords: ['brand growth os', 'suite', 'approval link', 'sign-off', 'apply to collab', 'roi', 'budget mix', 'monitor', 'bulk neft', 'tds', 'csv'],
		body: [
			{ p: 'Brand Growth OS (/brand/suite) bundles five high-leverage workflow tools for brand marketing and finance teams:' },
			{ list: [
				'1-tap Approval Links & Sign-off Tracker: generate a shareable link for internal stakeholders or external partners to sign off on a draft or brief without creating an account.',
				'Apply to Collab page (/apply/yourbrand): publish an always-on inbound creator application page you can drop in your brand bio or website footer.',
				'Budget & Creator Mix ROI Planner: model nano, micro and mid-tier creator splits against your campaign budget to forecast reach and expected ROI.',
				'Live Post & Asset Monitor: track published creator posts and deliverables in one watchlist.',
				'Bank-ready Bulk NEFT + TDS CSV: export a single finance-ready payout sheet with creator bank details, TDS deductions and net payable amounts.'
			] }
		],
		links: [{ label: 'Open Brand Growth OS', href: '/brand/suite' }, { label: 'Campaigns', href: '/brand/campaigns' }]
	},
	{
		slug: 'brand-turnaround',
		title: 'Turnaround: who owns each step',
		summary: 'Targets for every handoff, and reminders up the line when one runs late.',
		category: 'brand-campaigns',
		audience: 'brand',
		keywords: ['turnaround', 'tat', 'sla', 'escalation', 'owner', 'backup', 'late', 'targets', 'waiting on', 'how fast'],
		body: [
			{ p: 'Turnaround (Plan › Turnaround on a phone, Campaigns › Turnaround on a laptop) shows what’s waiting on your team, how fast each handoff goes and how each owner is doing.' },
			{ list: ['Handoffs: deciding on a quote, approving a quote, reviewing a draft, replying to a creator and paying an invoice (by its due date), plus the creator’s first quote and revised drafts.', 'Each collab has an owner and a backup. Past due, the owner gets an email and a phone alert; well past due, the backup and admin are told too.', 'Targets: set the time for each handoff, skip Sundays, and turn escalation on or off.'] },
			{ tip: 'Everyone sees the turnaround report. Owners, targets and escalation are on Brand Pro.' }
		],
		links: [{ label: 'Turnaround', href: '/brand/business/turnaround' }]
	},

	// ------------------------------------------------------------------ brands: money
	{
		slug: 'brand-quotes',
		title: 'Accept a quote, smart contracts & ASCI checklist',
		summary: 'Review a quote, configure a 1-tap Smart Contract with India ASCI disclosure rules, and download the agreement.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['quote', 'accept', 'agreement', 'contract', 'smart contract', 'asci', 'disclosure', 'usage rights', 'revisions'],
		body: [
			{ p: 'When a creator sends a quote, open the request (Review the quote on a phone). You’ll see each option’s deliverables and total, usage rights, payment terms, revisions included and validity.' },
			{ steps: [
				'Pick the option you want and accept with your name to confirm the collaboration.',
				'Open the 1-tap Smart Contract inside the collab to set deliverable terms, payment timeline and required India ASCI disclosure tags (#ad, #paidpartnership, etc.), then sign in 1 tap.',
				'The creator confirms the ASCI checklist and countersigns in 1 tap, locking a timestamped click-wrap audit trail both sides can download anytime.'
			] },
			{ tip: 'Need to get sign-off from a stakeholder or creator outside a formal request? Create a shareable 1-tap approval link in Brand Growth OS.' }
		],
		links: [{ label: 'Requests', href: '/brand/requests' }, { label: 'Brand Growth OS', href: '/brand/suite' }]
	},
	{
		slug: 'brand-pay',
		title: 'Paying creators (UPI, bank transfer & Bulk NEFT + TDS CSV)',
		summary: 'Pay creators directly with zero commission, track GST input credit, and export bank-ready Bulk NEFT + TDS CSVs.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['pay', 'payment', 'upi', 'neft', 'bulk neft', 'tds', 'csv', 'gst', 'invoice', 'utr', 'commission'],
		body: [
			{ p: 'The creator sends an invoice on the request (with GST if they’re registered); it also goes to your accounts email. Pay them directly by UPI or bank transfer using the details on the invoice.' },
			{ list: [
				'Single payouts: Money › Payments (Money on a laptop) lists every invoice with what’s still to pay, due and overdue, and the GST you can claim this year. Tap Paid? to record the UTR or reference number.',
				'Bulk payouts (Brand Growth OS): paying several creators at once? Open Brand Growth OS and export a bank-ready Bulk NEFT + TDS CSV with creator bank details, net payable amounts and TDS deductions ready for your finance team.'
			] },
			{ p: 'Miracle never handles the money and takes no commission. Your payment speed shows to creators, so paying on time helps you book the best talent.' },
			{ tip: 'Add your GSTIN in Settings › Billing & GST so creators’ invoices carry it and you can claim input credit.' }
		],
		links: [{ label: 'Payments', href: '/brand/business/money' }, { label: 'Brand Growth OS', href: '/brand/suite' }]
	},
	{
		slug: 'brand-shipping',
		title: 'Shipping products for barter',
		summary: 'Send products to creators and track them; experiences need no shipping.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['shipping', 'ship', 'product', 'barter', 'courier', 'tracking', 'address', 'delivery', 'received', 'experience'],
		body: [
			{ p: 'Money › Shipping lists products to send, with each creator’s address. Tap Shipped? and add the courier and tracking number, or Ship several at once. Missing an address? Ask again asks the creator for it. Each shows On the way, then Received when the creator marks it.' },
			{ p: 'Barter can also be an experience (a stay or a meal). Those need no shipping; the creator marks it done.' }
		],
		links: [{ label: 'Shipping', href: '/brand/business/shipping' }]
	},
	{
		slug: 'brand-reports',
		title: 'Results and sales from creators',
		summary: 'Views and spend across creators, an AI read of your results, and sales from promo codes.',
		category: 'brand-money',
		audience: 'brand',
		keywords: ['report', 'results', 'roi', 'sales', 'promo code', 'views', 'reach', 'performance', 'cost per view', 'export', 'xlsx', 'import orders', 'shopify', 'woocommerce'],
		body: [
			{ p: 'Reports (Money › Reports on a phone) uses Instagram’s own numbers for each collab post, refreshed every day: views, spend month by month and by creator, cost per view, the pipeline from request to paid, campaigns against budget, posts you can use in ads, GST you can claim and TDS. Pick the period, and tap Download .xlsx.' },
			{ list: ['What your results say: an AI read of your numbers, and you can ask it questions.', 'Results report: 7 days after a post goes live, a PDF lands in the request’s Documents.', 'Sales: give each creator a promo code and tracked link on the request (Track clicks & orders), then Import orders with a CSV from Shopify or WooCommerce to see sales by creator. Sales tracking is on Brand Pro.'] }
		],
		links: [{ label: 'Reports', href: '/brand/reports' }]
	},

	// ------------------------------------------------------------------ account
	{
		slug: 'sign-in',
		title: 'Signing in, and codes that don’t arrive',
		summary: 'Email codes, fingerprint sign-in, your devices, and what to check.',
		category: 'account',
		audience: 'all',
		keywords: ['sign in', 'login', 'log in', 'code', 'otp', 'not received', 'email', 'fingerprint', 'passkey', 'face id', 'locked out', 'spam', 'password', 'devices', 'sign out'],
		body: [
			{ p: 'Miracle has no passwords: type your email and we send a 6-digit code. Teammates sign in at the creator’s link the same way.' },
			{ list: ['Check spam and the Promotions tab for the code; it comes from Miracle.', 'Tap Send a new code if it doesn’t come (you can ask again after 45 seconds). Use the newest code.', 'Typed a different email than usual? Each email is a separate account; tap Use another email.', 'Too many tries? Wait a minute before trying again.'] },
			{ p: 'Fingerprint (or face) sign-in: accept the prompt on Today, or turn it on in My page › Sign-in, devices & account › Signing in. The same screen lists your signed-in devices, with Sign out all other devices. You get an email whenever a new device signs in.' },
			{ tip: 'Still locked out? Email support@miracleapp.live from the address you sign in with.' }
		]
	},
	{
		slug: 'delete-account',
		title: 'Download or delete your data',
		summary: 'Take a copy of everything, or close your account.',
		category: 'account',
		audience: 'all',
		keywords: ['delete', 'account', 'close', 'remove', 'data', 'download', 'export', 'privacy', 'gdpr', 'dpdp', 'erase'],
		body: [
			{ p: 'Creators: in My page › Sign-in, devices & account, Download all my data gives you one .zip, and Delete my page closes your account (type your page name to confirm). Brands: Settings › Sign-in & account, with Download all our data.' },
			{ list: ['Only the owner can delete.', 'Running collabs you tick are cancelled and the brands are told. Money owed to you isn’t cancelled, but reminders stop.', 'It closes at once and is erased for good 30 days later. Sign in before then to bring it back.', 'Nobody else can take your page name for 90 days.', 'What the law asks us to keep (such as invoices) is kept.'] },
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
		keywords: ['block', 'report', 'spam', 'abuse', 'harassment', 'scam', 'fake brand', 'unsafe', 'unblock', 'asking to pay'],
		body: [
			{ p: 'Creators: open the collab and use the ⋯ menu: Report or Block the brand. Blocked brands can’t send you requests or messages, and an open request moves to Declined. Brands: use the ⋯ menu on a creator’s page or request; blocked creators drop out of Discover and your pools.' },
			{ p: 'Reports go to the Miracle team, who look at every one. Block them too is ticked in the report for you. Unblock any time in Settings › Blocked (My page › Blocked on a creator’s phone).' },
			{ tip: 'Asked to pay to get a collab, or for your bank login or OTP? That’s a scam. Miracle warns you when a request asks you to pay: report it and don’t pay.' }
		]
	},
	{
		slug: 'plans-billing',
		title: 'Plans, the free trial and billing',
		summary: 'Miracle is free for creators; what Brand Pro and Agency add, the brand trial, and how to pay.',
		category: 'account',
		audience: 'all',
		keywords: ['plan', 'plans', 'pro', 'brand pro', 'free', 'trial', 'price', 'pricing', 'billing', 'subscription', 'renew', 'cancel', 'refund', 'invoice', 'receipt', 'agency', 'upgrade', 'razorpay', 'founding', 'invite', 'unlock'],
		body: [
			{ p: 'Miracle is free for creators, with no time limit: unlimited collabs, offer checks and pitches, every autopilot, reminders that go by themselves, bank-credit matching, the formal demand letter and MSME complaint, your insights page and fan list, and one teammate. Invoices and your page carry a small “Sent with Miracle” line.' },
			{ p: 'Brands on Free open 10 full creator profiles a day, send 3 requests and 1 campaign a month, and have one seat. Past the 10, one creator can be unlocked for good with a one-time payment. Brand Pro (₹1,999 a month) opens every profile, removes the limits, and adds open briefs, brand autopilots, competitor watch, turnaround, sales tracking, a team of 5 and three times the daily AI. Agency (₹4,999 a month) covers every creator you manage and your own brand team, with 15 seats. A yearly plan is about two months free. The plans on sale are always listed in Plan & billing.' },
			{ p: 'New brand teams start with 14 days of Brand Pro, no card needed. When it ends they stay on the free plan unless they pick one, and the autopilots switch off; nothing they made is deleted.' },
			{ steps: ['Open Settings › Plan & billing (My page › Plan & billing on a creator’s phone).', 'Pick a plan, monthly or yearly. Only the creator, her manager or the brand team’s admin can.', 'Pay on the web with UPI, a card or net banking (through Razorpay). Plans can’t be bought in the phone app.', 'You get a receipt and an invoice by email, and the plan is on everywhere, the phone app too.'] },
			{ p: 'Plans renew by themselves. Stop renewing in Plan & billing at any time: the plan stays on until the end of what you paid for. A first payment can be refunded within 7 days: write to support.' },
			{ p: 'Creators: share your invite link from Invite creators in Plan & billing. Brands also see it on your page, invoices and tracking links.' },
			{ tip: 'There’s never a commission on deals, on any plan. Brands pay creators directly.' }
		],
		links: [{ label: 'Plan & billing', href: '/studio/settings?s=plan' }]
	},
	{
		slug: 'contact-support',
		title: 'Contact support',
		summary: 'Raise a ticket and we’ll reply in the app and by email.',
		category: 'account',
		audience: 'all',
		keywords: ['support', 'help', 'contact', 'ticket', 'complaint', 'bug', 'problem', 'talk to someone', 'human', 'call', 'email', 'support email', 'screenshot'],
		body: [
			{ p: 'Open Help (My page › Help & Support on a creator’s phone, Help in the menu otherwise). Type your question and tap Ask for an answer from these articles. If that doesn’t solve it, tap Ask a person instead or Contact support.' },
			{ p: 'Add up to 4 files (screenshots, a short video or a PDF, 10 MB each) and tap Send to Miracle support. The app adds your phone, app version and the last few screens you used; never your messages, rates or bank details.' },
			{ p: 'We usually reply within a working day (urgent problems with payments or sign-in first). You’ll get an alert and an email; reply in the ticket to keep everything together. When it’s fixed, tap It’s sorted: mark as solved.' },
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
