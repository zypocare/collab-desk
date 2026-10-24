// Landing pages for what creators, brands and agencies search for. Deals first: getting found, pitching,
// booking, pricing, then running the collab and getting paid. Each says only what Miracle really does, and
// marks what needs a paid plan: a feature's third value is true (the page's own Pro plan) or a plan side.
// Visuals: `shot` is a real phone screen from site/img; `mock` draws a feature the way the app shows it.

export const LANDING = [
	{
		slug: 'get-brand-deals',
		who: 'creator',
		title: 'Get brand deals on Instagram as a creator in India · Miracle',
		description: 'Land more paid brand collaborations: a page brands book you from, a listing in the creator directory, AI that finds brands and writes the pitch, and an offer check before you say yes.',
		eb: 'For creators',
		h1: ['Get more ', 'brand deals.'],
		lede: 'Most creators wait for brands to DM them. Miracle puts you where brands look, pitches the brands that fit you every day, and turns every enquiry into a booking you can track from first message to money in the bank.',
		shot: ['screen-nivy-page.webp', 'A creator’s Miracle page with her packages and a Send a request button', ['New request', 'Kora Activewear · ₹60,000']],
		fh: 'More deals, *less chasing.*',
		features: [
			['Brands book you directly', 'Your own page (yourname.miracleapp.live) with packages, prices, live Instagram numbers and past work. Brands pick a package and send a request in a minute, no back and forth over DMs.'],
			['Get found by brands', 'Appear in the public creator directory by niche and city, with a verified tick when your Instagram is connected. Brands on Miracle find you in Discover too.'],
			['AI that pitches for you', 'Every morning the pitch autopilot finds up to 10 brands that fit your niche and have a public business email, writes a pitch in your voice, and sends it once you approve (or on its own, if you switch it to auto).', true],
			['Know which offers to take', 'Every request is read for you: how well it fits, whether the budget is fair for your size, and what to ask. Paste a contract and AI flags what to push back on.'],
			['Proof that wins the next deal', 'A week after a post goes live, a results report with Instagram’s own numbers goes to the brand in one tap. Reviews from brands show on your page.', true],
			['Never miss an enquiry', 'Requests from your page, email and Instagram DMs land in one place, with a phone alert. Away for a while? Brands are told when you’re back.']
		],
		steps: ['Hold your page address on the waitlist (yourname.miracleapp.live).', 'Connect Instagram so brands see your real reach and audience.', 'Add two or three packages, like a reel, or a reel with stories.', 'Put the link in your bio, and switch on the pitch autopilot.'],
		faq: [
			['How many followers do I need to get brand deals?', 'There’s no minimum. Brands book nano and micro creators (from a few thousand followers) for their trust and engagement. What matters most is a clear niche, steady reach and a page that makes booking easy.'],
			['Does Miracle take a cut of my deals?', 'No. Brands pay you directly by UPI or bank transfer and Miracle takes no commission, on any plan.'],
			['What’s free and what’s Pro?', 'Your page, the directory listing, requests, offer checks and the collab board are free, with 3 quotes, 3 invoices and 5 pitches a month. Creator Pro (₹299 a month, 14 days free) adds the autopilots, unlimited quotes and invoices, results reports and your team. [See pricing](/pricing).'],
			['Will the AI send pitches without asking me?', 'Only if you choose auto. By default each pitch waits for you to approve it, and a brand is never pitched twice.'],
			['Can I use Miracle if brands already DM me?', 'Yes. Miracle reads brand DMs on connected Instagram accounts, flags the ones that look like a collab, and turns them into requests you can quote on.']
		],
		related: ['pitch-brands', 'link-in-bio-for-creators', 'influencer-rate-card'],
		guides: ['how-to-get-brand-deals-instagram-india', 'how-to-pitch-brands']
	},
	{
		slug: 'pitch-brands',
		who: 'creator',
		title: 'AI that pitches brands for you: find brands to collaborate with · Miracle',
		description: 'Miracle’s pitch autopilot finds brands that fit your niche every day, finds their business email, writes a personal pitch and follows up. You approve, or let it run on its own.',
		eb: 'Pitch autopilot · Creator Pro',
		h1: ['Brands to pitch, ', 'every morning.'],
		lede: 'Finding brands, hunting for the right email and writing a pitch that doesn’t sound copied takes hours a week. Miracle’s pitch autopilot does it while you create, and asks before anything goes out.',
		mock: { eb: 'Pitch autopilot · today', tag: 'Approve', big: '8 brands found', sub: 'Skincare and wellness, near Bengaluru · 3 waiting for you', rows: [['Lumière Skin', 'Skincare · pitch written in your voice', 'Approve', 'wait'], ['Kaju & Co.', 'Snacks · sent 10:12 am', 'Sent', ''], ['Northstar Travel', 'Travel · replied yesterday', 'New request', 'ok'], ['Gobi Maps', 'Apps · no reply yet', 'Follow-up Thu', '']], foot: 'Public business emails only. A brand is never pitched twice.' },
		fh: 'Pitching, *on autopilot.*',
		features: [
			['Finds brands that fit', 'Every morning it searches for brands in your niche (and near your city) that work with creators, up to 10 new ones a day.'],
			['Only real inboxes', 'It checks each brand’s own website for a public business email. Brands without one are left out, so pitches don’t bounce.'],
			['A pitch in your voice', 'Each pitch is written for that brand: why you fit, a content idea, and your link. You can edit any of them.'],
			['Approve or auto', 'In approve mode each pitch waits for your tap. In auto they go out on their own, one at a time between 10 am and 6 pm.'],
			['Follow-ups, once', 'No reply? A polite follow-up goes out later. A brand is never pitched twice.'],
			['Replies become deals', 'When a brand answers, it becomes a request on your desk, with a quote you can send in a minute.']
		],
		steps: ['Set your niche, city and packages.', 'Open Settings › Auto-pilot and switch on brand pitches.', 'Choose approve or auto, and how many brands a day.', 'Check your pitches each morning, or let them run.'],
		faq: [
			['Is the pitch autopilot free?', 'It’s part of Creator Pro (₹299 a month, with 14 days free to try). On the free plan you can still write and send 5 pitches a month yourself.'],
			['Where does the brand email come from?', 'From the brand’s own website: Miracle only uses public business emails it finds there.'],
			['Can I see the pitch before it goes?', 'Yes. In approve mode nothing goes out until you tap send, and you can edit each pitch.'],
			['Will it spam brands?', 'No. It sends a few a day, one at a time, follows up once, and never pitches the same brand twice.']
		],
		related: ['get-brand-deals', 'influencer-media-kit', 'influencer-rate-card'],
		guides: ['how-to-pitch-brands', 'how-to-get-brand-deals-instagram-india']
	},
	{
		slug: 'link-in-bio-for-creators',
		who: 'creator',
		title: 'Link in bio that books brand deals: creator booking page · Miracle',
		description: 'A link in bio built for creators who work with brands: packages and prices, live Instagram stats, open weeks and a request form, plus links and an email list for your followers.',
		eb: 'Your page',
		h1: ['The link in bio that ', 'books deals.'],
		lede: 'A list of links doesn’t get you paid. Your Miracle page shows brands exactly what you offer, what it costs and when you’re free, and lets them book you in a minute. Your followers get your links too.',
		shot: ['screen-nivy-page.webp', 'A creator’s Miracle page: open for collabs, languages and a Send a request button', ['Open for collabs', '2 slots this week']],
		fh: 'A page that *sells you.*',
		features: [
			['Packages brands can book', 'A reel, a reel with stories, a barter collab: each with what’s included and a price (or “ask for a quote”).'],
			['Live numbers, no screenshots', 'Followers, reach, views and audience straight from Instagram, updated every night, with a verified tick.'],
			['Open weeks', 'Brands see how many collab slots you have this week and next, so they book when you’re free.'],
			['Links for followers', 'Your shop, YouTube, latest reel or a product you love, with clicks counted.'],
			['Your own email list', 'Followers can join your list from your page, and you can write to them right from Miracle.', true],
			['Who looked, and from where', 'See visits by source (Instagram, Google, the directory), so you know what brings brands to you.']
		],
		steps: ['Choose your address (yourname.miracleapp.live).', 'Add your packages, a line about you and your links.', 'Connect Instagram for live stats.', 'Paste the link in your Instagram bio.'],
		faq: [
			['Is it a replacement for Linktree?', 'It does what a link list does (links for followers, clicks counted) and adds what brands need: packages, prices, stats and a request form.'],
			['Is the page free?', 'Yes. Your page, packages, links and request form are on the free plan. The email list for followers is part of Creator Pro.'],
			['Can I hide my prices?', 'Yes. Show prices, show “from” prices, or let brands ask for a quote.'],
			['Can I use my own domain?', 'Your page lives at yourname.miracleapp.live, which you can share anywhere.']
		],
		related: ['influencer-media-kit', 'get-brand-deals', 'influencer-rate-card'],
		guides: ['influencer-media-kit-guide']
	},
	{
		slug: 'influencer-media-kit',
		who: 'creator',
		title: 'Live influencer media kit with real Instagram stats · Miracle',
		description: 'A media kit that updates itself: followers, reach, views, engagement and audience straight from Instagram, your best work and your packages. Share one link instead of a PDF.',
		eb: 'Media kit',
		h1: ['A media kit that ', 'updates itself.'],
		lede: 'PDF media kits are out of date the day you send them, and brands know screenshots can be edited. Miracle’s media kit pulls your numbers from Instagram every night and shows them with a verified tick.',
		shot: ['screen-nivy-reels.webp', 'A creator’s brand collabs on her page, with the views Instagram reports', ['Verified by Instagram', 'updated last night']],
		fh: 'Numbers brands *can trust.*',
		features: [
			['Real numbers', 'Followers, average reel views, reach, engagement and saves and shares, from Instagram’s own data.'],
			['Your audience', 'Age, gender and top cities of your followers, so brands see who they’ll reach.'],
			['Best work', 'Your top reels and past collabs, with results brands can trust.'],
			['Audience health', 'A score from your own numbers (real reach, engagement for your size, steady growth, audience in India) that brands see before booking.'],
			['A live insights page', 'One private link with your latest numbers for a brand that asks for “insights”, instead of screenshots.', true],
			['One link', 'Send your page link to any brand; no attachments, always current. A PDF copy is there when a brand insists.']
		],
		steps: ['Connect your Instagram professional account.', 'Pick which numbers and past work to show.', 'Add your packages.', 'Share your link with brands.'],
		faq: [
			['How often do the numbers update?', 'Every night, from Instagram’s official API.'],
			['Can brands see my audience details?', 'Yes, the age, gender and city breakdown Instagram shares (from 100 followers).'],
			['Do I need a professional Instagram account?', 'Yes, a Creator or Business account, which is free to switch to in Instagram settings.']
		],
		related: ['link-in-bio-for-creators', 'influencer-rate-card', 'get-brand-deals'],
		guides: ['influencer-media-kit-guide', 'how-much-to-charge-instagram-reel-india']
	},
	{
		slug: 'influencer-rate-card',
		who: 'creator',
		title: 'Influencer rate card and packages for Indian creators · Miracle',
		description: 'Set your rates and packages, see what creators your size charge from real accepted quotes, and quote brands with options they accept online.',
		eb: 'Rates & quotes',
		h1: ['Charge what ', "you're worth."],
		lede: 'Underpricing is the most common way creators lose money. Miracle shows what creators like you are paid, helps you package your work, and turns your rate card into quotes brands accept in one tap.',
		shot: ['screen-offer.webp', 'Miracle checking a brand’s agreement against the creator’s rate card: ask for 3 changes', ['Offer check', 'ask for 3 changes']],
		fh: 'Price it right, *every time.*',
		features: [
			['A rate for each format', 'Reels, stories, posts, carousels and UGC videos, with usage rights and exclusivity priced on top.'],
			['Packages that sell', 'Bundles brands can book in one tap, like a reel with three stories.'],
			['What others charge', 'The middle range of accepted quotes from creators your size (and niche, where there’s enough data). Never anyone’s name.'],
			['Quotes with options', 'Send up to three options; the brand picks one and accepts online, and it becomes the agreement.'],
			['Offer check', 'AI reads an offer or contract against your rates and usual terms and writes your reply.'],
			['Counters for low offers', 'When a budget is below your rate, Miracle drafts a polite counter with a smaller option, ready for your tap.', true]
		],
		steps: ['Add your rates in Settings › Rates & packages.', 'Build two or three packages.', 'Check the benchmark for your size.', 'Quote brands from any request.'],
		faq: [
			['How much should I charge for a reel?', 'It depends most on your average views, then engagement, niche and usage rights. The [rate calculator](/tools/rate-calculator) and [our guide](/guides/how-much-to-charge-instagram-reel-india) walk through it.'],
			['Should I charge for usage rights?', 'Yes. When a brand runs your content as ads, it’s worth more to them; add 30% or more depending on how long.'],
			['How many quotes can I send for free?', '3 a month on the free plan, and as many as you like on Creator Pro.'],
			['Can I show rates only to brands?', 'Yes: show them on your page, show “from” prices, or keep them for quotes.']
		],
		related: ['get-brand-deals', 'influencer-media-kit', 'brand-collaboration-management'],
		guides: ['how-much-to-charge-instagram-reel-india']
	},
	{
		slug: 'brand-collaboration-management',
		who: 'creator',
		title: 'Brand collaboration management for creators: requests to payment · Miracle',
		description: 'Run every brand collab in one place: requests, quotes, agreements, product shipping, drafts and approvals, go-live checks, results reports and payments. Built for Indian creators and their managers.',
		eb: 'Your desk',
		h1: ['Every collab, ', 'on one ticket.'],
		lede: 'Brand deals live in DMs, emails, WhatsApp and spreadsheets until something slips: a missed date, a draft nobody approved, an invoice nobody paid. Miracle keeps each collab on one ticket from the first message to the money.',
		mock: { eb: 'Kora Activewear · CD-X6Z6C8', tag: 'Live', big: '₹60,000', sub: '2 reels + product · posted 20 Sept', rows: [['Quote accepted', 'Option B · agreement signed', 'Done', 'ok'], ['Draft approved', 'Round 2 · comment at 0:14 fixed', 'Done', 'ok'], ['Gone live', '#ad label checked', 'Done', 'ok'], ['Invoice sent', 'UPI QR · due 5 Oct', 'Reminder Fri', 'wait']], foot: 'Your manager sees the same ticket, with their own alerts.' },
		fh: 'From DM to *paid.*',
		features: [
			['Requests and quotes', 'Every enquiry in one list, read by AI, with a quote the brand accepts online.'],
			['Agreements', 'Accepting a quote creates a simple agreement both sides can download.'],
			['Products and barter', 'Shipping details and tracking for barter and paid-plus-product collabs.'],
			['Drafts and approval', 'Brands comment on the exact second of your draft and approve it, round by round.'],
			['Go-live and results', 'Miracle spots the post and checks it’s labelled as an ad. A week later the results report is ready to send.', true],
			['Calendar and team', 'Shoot and post dates in one calendar, with your manager, assistant or accountant on the same desk.', true]
		],
		steps: ['Bring your current collabs in, or start fresh.', 'Answer new requests with a quote.', 'Share drafts for approval.', 'Send the results and the invoice when it’s live.'],
		faq: [
			['Can my manager use it?', 'Yes, on Creator Pro. Add a manager, assistant or accountant; each signs in with their own email and sees what their role needs. Managers looking after several creators use the [Agency plan](/influencer-agency-software).'],
			['Do brands need an account?', 'They sign in with their work email (a 6-digit code, no password) to follow the request, approve drafts and see invoices.'],
			['Does it work on my phone?', 'Yes. Miracle works in any browser on phone and laptop, and the Android app is coming to the Play Store.']
		],
		related: ['get-paid-by-brands', 'get-brand-deals', 'influencer-agency-software'],
		guides: ['asci-influencer-guidelines', 'barter-vs-paid-collabs']
	},
	{
		slug: 'get-paid-by-brands',
		who: 'creator',
		title: 'Get paid on time by brands: invoices and payment reminders for creators · Miracle',
		description: 'Stop chasing brands for money: Miracle makes the invoice for each collab, reminds the brand before and after the due date, and helps with a formal demand if it’s still unpaid.',
		eb: 'Getting paid',
		h1: ['No more chasing ', 'brands.'],
		lede: 'Late payments are the part of brand deals creators hate most. Miracle sends the invoice, follows up politely on your behalf and tells you the moment the brand says they’ve paid.',
		shot: ['screen-paid.webp', 'Getting paid, step by step: reminders sent, a formal payment demand ready to send', ['₹35,000 came in', 'Glasshouse Eyewear']],
		fh: 'Your money, *on time.*',
		features: [
			['Invoices in a tap', 'Made from the agreed quote, with your UPI QR and payment details, so the brand can pay in a minute.'],
			['Polite reminders', 'Before the due date, on it and after, sent for you, so you don’t have to write awkward messages.', true],
			['Paid? Confirm it', 'The brand reports the payment with its reference; you confirm it arrived. On Pro, Miracle matches it to your bank credit.'],
			['When it’s really late', 'Step-by-step help to send a formal demand, then an MSME complaint or legal notice, ready to send.'],
			['Brands’ track record', 'See how quickly a brand pays other creators before you agree to work with them.'],
			['No cut, ever', 'Brands pay you directly by UPI or bank transfer; Miracle never touches the money.']
		],
		steps: ['Add your UPI or bank details once.', 'Make the invoice when the post is live.', 'Let Miracle remind the brand.', 'Confirm the payment when it arrives.'],
		faq: [
			['Does Miracle collect the payment?', 'No. Brands pay you directly; Miracle only tracks it and reminds them.'],
			['Do I need GST to send an invoice?', 'No. Most creators aren’t registered for GST, and Miracle makes a normal invoice with your UPI QR. If you are registered, switch it on and GST is added for you.'],
			['What if a brand never pays?', 'Miracle helps you escalate step by step, with a formal demand letter and, for MSME-registered creators, an MSME complaint.'],
			['Can I see if a brand pays late before I agree?', 'Yes, when they’ve worked with creators on Miracle, you see how quickly they usually pay.']
		],
		related: ['brand-collaboration-management', 'get-brand-deals', 'influencer-rate-card'],
		guides: ['barter-vs-paid-collabs']
	},
	{
		slug: 'find-influencers-india',
		who: 'brand',
		title: 'Find Instagram influencers in India by niche and city · Miracle',
		description: 'Find and book Indian creators with live Instagram numbers, audience health and brand-safety checks, starting prices and reviews. Send a brief in a minute and pay creators directly, no commission.',
		eb: 'For brands',
		h1: ['Find creators who ', 'deliver.'],
		lede: 'Follower counts don’t tell you who will move your product. Miracle shows each creator’s real reach, audience and record, checks their audience and recent content, and lets you book them in a minute.',
		mock: { eb: 'Discover · Bengaluru · lifestyle', tag: 'Verified', big: '4 shortlisted', sub: '10K–1L followers · audience health 70+ · in budget', rows: [['Niveditha D.', 'Lifestyle · 48.2K · health 86', 'from ₹18,000', 'ok'], ['Arjun Rao', 'Fitness · 31K · health 81', 'from ₹12,000', 'ok'], ['Meera Shah', 'Food · 92K · health 77', 'from ₹30,000', 'ok'], ['Rohan K.', 'Travel · 22K · replies in 2 hours', 'Ask for quote', '']], foot: 'Numbers from Instagram’s official API, updated every night.' },
		trust: ['No commission on any deal', 'Live Instagram numbers', 'Free plan for brands'],
		fh: 'Book with *confidence.*',
		features: [
			['Search by niche and city', 'Browse the [creator directory](/creators) or Discover in the app, filtered by niche, audience, language and price.'],
			['Live numbers', 'Followers, reach, views and audience straight from Instagram, with a verified tick.'],
			['Audience health & brand safety', 'A score from each creator’s own numbers, and an AI read of recent captions for anything you should know first.'],
			['Their record', 'Verified deals, posts on time and how fast they reply, worked out by Miracle.'],
			['Briefs, quotes, drafts', 'Send one brief to many creators, accept quotes online, and approve drafts on the exact second.'],
			['Results and sales', 'Reports with Instagram’s numbers by creator, and sales from your store matched to each creator’s code.', true]
		],
		steps: ['Join with your work email; a 6-digit code, no password.', 'Find creators in Discover or the directory.', 'Send a request or a campaign brief.', 'Approve drafts, pay creators directly, see results.'],
		faq: [
			['Does Miracle charge brands a commission?', 'No. You pay creators directly and Miracle takes no cut.'],
			['What does the free plan include?', 'Discover with audience health, pools, briefs, drafts, approvals and reports, with 3 requests and 1 campaign a month. Brand Pro (₹1,999 a month, 14 days free) removes the limits and adds open briefs, brand autopilots, competitor watch, sales tracking and a team of 5. [See pricing](/pricing).'],
			['How do I know a creator’s followers are real?', 'Each connected creator has an audience health score from Instagram’s own data: reach, engagement for their size, sudden follower jumps and audience location.'],
			['Can an agency manage several brands?', 'Yes. On the [Agency plan](/influencer-agency-software), each client is its own workspace and you switch between them, with no client seeing another’s data.']
		],
		related: ['influencer-marketing-no-commission', 'influencer-agency-software'],
		guides: ['how-to-find-influencers-india'],
		cta: ['Book creators who deliver.', 'Discover creators, send one brief to many, approve drafts and see results. Free to start; you pay creators directly and Miracle takes no commission.']
	},
	{
		slug: 'influencer-marketing-no-commission',
		who: 'brand',
		title: 'Influencer marketing without agency commission · Miracle for brands',
		description: 'Run influencer campaigns in India without paying a 15–30% agency cut: discover creators, send briefs, approve drafts, track results and pay creators directly.',
		eb: 'For brands',
		h1: ['Influencer marketing, ', 'no cut.'],
		lede: 'Agencies and marketplaces often take 15 to 30 percent of every deal. With Miracle, the creator gets what you pay, and you get the tools to run the campaign yourself, with AI doing the follow-ups.',
		mock: { eb: 'Diwali campaign · 12 creators', tag: 'Brand Pro', big: '₹2,40,000', sub: 'Budget · all of it goes to creators', rows: [['To creators', '12 quotes accepted', '₹2,40,000', 'ok'], ['Miracle’s cut', 'On any plan', '₹0', 'ok'], ['Drafts', '9 approved · 3 in review', 'On track', ''], ['Sales from codes', 'Matched from your store', '₹6,82,000', 'hot']], foot: 'You pay each creator directly, against their invoice.' },
		trust: ['0% commission', 'Pay creators directly', 'GST invoices you can claim'],
		fh: 'Run it *yourself.*',
		features: [
			['Discover', 'Creators by niche, city, audience and price, with audience health checks.'],
			['Campaigns and open briefs', 'Send one brief to a pool of creators, or open it and let creators apply with their rate.', 'brand'],
			['Quotes and agreements', 'Accept quotes online; each becomes a simple agreement.'],
			['Brand autopilots', 'Shortlists, follow-ups, draft checks, counter-offers and rebooking, each on approve or auto.', 'brand'],
			['Turnaround and approvals', 'An owner and a clock for every step, with escalation when something is stuck, and your team’s approvers.', 'brand'],
			['Pay and measure', 'Pay creators directly by UPI or bank transfer, then compare results and sales by creator.']
		],
		steps: ['Join as a brand.', 'Build a pool of creators or open a brief.', 'Approve quotes and drafts.', 'Pay creators directly and compare results.'],
		faq: [
			['Is Miracle free for brands?', 'There’s a free plan with no time limit: 3 requests and 1 campaign a month. Brand Pro (₹1,999 a month) removes the limits. There’s never a commission on deals.'],
			['Who handles GST and TDS?', 'Creators registered for GST send GST invoices you can claim; you deduct TDS as your accountant advises. Your plan’s own invoice from Miracle includes GST too.'],
			['Can creators apply to my brief?', 'Yes, on Brand Pro: open the brief, creators apply with their rate, and you shortlist.']
		],
		related: ['find-influencers-india', 'influencer-agency-software'],
		guides: ['how-to-find-influencers-india'],
		cta: ['Keep the whole budget.', 'Every rupee you spend goes to creators. Miracle gives you the tools to run campaigns yourself, from a free plan up.']
	},
	{
		slug: 'influencer-agency-software',
		who: 'agency',
		title: 'Software for influencer agencies and talent managers in India · Miracle',
		description: 'Manage every creator on your roster and every brand client in one place: client workspaces, a commission ledger, pitch decks from your roster, turnaround clocks and 15 seats. No commission on deals.',
		eb: 'For agencies and managers',
		h1: ['Your whole roster, ', 'one desk.'],
		lede: 'Talent managers juggle a dozen creators, each with their own DMs, rates and late payments, and agencies run several brand clients at once. Miracle’s Agency plan puts all of it in one sign-in, with each client kept apart.',
		mock: { eb: 'Roster · 6 creators', tag: 'Agency', big: '₹1,86,400', sub: 'Your commission, last 12 months · ₹42,000 not settled', rows: [['Niveditha D.', 'Lifestyle · 3 live deals', '15%', ''], ['Arjun Rao', 'Fitness · quote waiting', 'Reply today', 'wait'], ['Meera Shah', 'Food · paid ₹80,000', 'Settled', 'ok'], ['Pitch deck', '3 creators picked for Lumière Skin', 'Ready', 'hot']], foot: 'Tracking only: brands pay creators directly.' },
		trust: ['No commission on deals', 'Each client kept apart', '15 seats included'],
		fh: 'Built for people who *run talent.*',
		features: [
			['Every creator, one switch', 'Creators add you as their manager; you see all of them on one roster and switch between their desks in a tap.'],
			['Pro for everyone', 'Every creator you manage and your own brand team get Pro: the autopilots, unlimited quotes and invoices, reminders.'],
			['Commission ledger', 'Your cut on every deal at the rate it was agreed, what’s settled and what isn’t. Tracking only; no money moves through Miracle.'],
			['Pitch decks from your roster', 'Pick creators for a brand and get a deck with their live numbers, rates and best work, ready to send.'],
			['Client workspaces', 'Working inside several brands’ teams? Each is its own workspace, and no client ever sees another’s requests or money.'],
			['Turnaround clocks', 'An owner and a deadline for every reply, quote, draft and payment, with escalation before a client notices.', 'agency']
		],
		steps: ['Join the waitlist as an agency.', 'Ask each creator to add you as their manager.', 'Join your brand clients’ teams, or bring your own.', 'Set your commission and turnaround targets.'],
		faq: [
			['How much is the Agency plan?', '₹4,999 a month, or ₹49,999 a year (founding members pay ₹24,999 a year). It includes Pro for every creator you manage, your own brand team and 15 seats. [See pricing](/pricing).'],
			['Does Miracle take a share of our commission?', 'No. Brands pay creators directly, you settle your commission with your creators as you do today, and Miracle only keeps the ledger.'],
			['Can a creator leave my roster?', 'Yes. A creator can remove a manager in their settings at any time; their own data stays with them.'],
			['Can clients see each other?', 'No. Each client workspace is separate, and switching shows one client at a time.']
		],
		related: ['brand-collaboration-management', 'find-influencers-india', 'influencer-marketing-no-commission'],
		guides: ['how-to-find-influencers-india'],
		cta: ['Run your roster like a business.', 'One sign-in for every creator and client, a commission ledger, pitch decks and turnaround clocks. ₹4,999 a month, no commission on any deal.']
	}
];
