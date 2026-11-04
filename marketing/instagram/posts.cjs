// The words for Miracle's first nine Instagram posts. Every product claim matches the help centre
// (site/help/*.html); keep it that way when editing. Themes alternate so the grid reads as a checkerboard
// once all nine are up (posted p1 first, p9 last).
const POSTS = [
	{
		id: 'p1', slug: 'price-a-reel', kind: 'carousel', theme: 'dark', cover: 'pack', eyebrow: 'Pricing · Save this',
		slides: [
			{ t: 'cover', title: 'What should you charge for <em>one Reel?</em>', sub: 'Stop guessing a number in the DMs. Price it in five parts.' },
			{ t: 'step', n: '1', title: 'Start from your <em>views</em>, not your followers.', body: 'Brands pay for the people who actually see it. Look at the average views on your last 10–15 Reels. That, not your follower count, is what your base rate rests on.' },
			{ t: 'step', n: '2', title: 'Running it as an ad? <em>That’s extra.</em>', body: 'If the brand boosts your Reel or posts it on their page, they’re using your face to sell. Charge a % of your fee for every 30 days of paid use. <b>Organic only</b> is the default.' },
			{ t: 'step', n: '3', title: 'Exclusivity <em>costs</em> extra.', body: '“No other skincare brand for 60 days” means saying no to other work. Name the category, keep it short, and charge for the weeks you’re blocked.' },
			{ t: 'step', n: '4', title: 'Rush and changes go <em>in writing.</em>', body: 'Need it in 3 days? Add a rush fee. Include 1–2 rounds of changes in the price, and say that more rounds are extra. Put both in the quote, not in a chat.' },
			{ t: 'step', n: '5', title: 'Discount the <em>bundle</em>, never the base.', body: 'Reel + 2 Stories is a package. Give a small discount for more pieces, for example 5% off 2+, 10% off 4+, 15% off 6+, and keep your single-Reel rate where it is.' },
			{ t: 'cta', title: 'Set it once. <em>Quote</em> in one tap.', body: 'Miracle suggests a starting rate from your Instagram numbers, shows what creators like you charge, and lets brands build their own package on your page.', screen: 'pack', button: 'Get Miracle free' }
		],
		caption: `What should you charge for one Reel? 💸

Most creators guess a number in the DMs and regret it later. Price it in five parts instead:

1. Your base: from your average views, not followers
2. Paid ads use: a % extra for every 30 days
3. Exclusivity: charge for the weeks you're blocked
4. Rush fees and changes: in writing
5. Bundles: discount the package, never your base rate

Save this for your next brand DM 📌

Want Miracle to suggest your rate from your Instagram numbers? It's free, with 0% commission. Link in bio.`,
		tags: '#influencermarketingindia #contentcreatorindia #brandcollab #creatoreconomy #ugccreatorindia'
	},
	{
		id: 'p2', slug: 'dm-reply', kind: 'carousel', theme: 'light', cover: 'desk', eyebrow: 'Brand DMs · Copy this',
		slides: [
			{ t: 'cover', title: 'A brand just sent <em>“Hi, collab?”</em>', sub: 'Here’s the reply that gets you a brief and a budget, not a free product.' },
			{
				t: 'template', title: 'Send <em>this</em> first.', label: 'Your reply',
				text: `Hi [name]! Thanks for reaching out, I’d love to hear more 😊

Could you share:
• the product, and what you’d like me to make
• your budget and dates
• whether you’d run it as an ad

My rates and past work: yourname.miracleapp.live`,
				note: 'Ask before you quote. The brief decides the price.'
			},
			{ t: 'step', eb: 'Why it works', title: 'You get the <em>three things</em> that set your price.', body: 'What they want, when, and whether it runs as an ad. Without them, any number you say is a guess, and the brand will hold you to it.' },
			{
				t: 'template', eb: 'If they say…', title: '“We only do <em>barter.</em>”', label: 'Your reply',
				text: `Thanks! I take on a few barter collabs a month when the product really fits my audience.

For this one I’d need it to be paid. My rates are on my page, and I’m happy to find something that fits your budget.`
			},
			{
				t: 'template', eb: 'If they say…', title: '“What’s your <em>rate?</em>”', label: 'Your reply',
				text: `Depends on what you need! Reels start at ₹[your rate].

Share the brief and dates and I’ll send a quote with a couple of options.`
			},
			{ t: 'cta', title: 'Never lose a brand <em>in your DMs</em> again.', body: 'Miracle flags the DMs that look like a collab, reads what the brand is asking (content, paid or barter, budget, dates) and puts it on your board.', screen: 'dm', button: 'Get Miracle free' }
		],
		caption: `A brand just DM'd you "Hi, collab?" 👀

Don't send a rate yet. Ask for:
→ what they want you to make
→ budget and dates
→ whether it runs as an ad

Then quote. Copy-paste replies inside, including what to say to "we only do barter" and "what's your rate?"

Send this to a creator friend who always replies "sure, DM me" 😅

Miracle reads brand DMs for you and puts the collab on your board. Free, 0% commission. Link in bio.`,
		tags: '#brandcollab #influencertips #contentcreatorindia #instagramtipsindia #creatoreconomy'
	},
	{
		id: 'p3', slug: 'contract-red-flags', kind: 'carousel', theme: 'dark', cover: 'offer', eyebrow: 'Contracts · Before you sign',
		slides: [
			{ t: 'cover', title: '6 red flags in a <em>brand contract</em>', sub: 'Read these before you sign anything. Each one costs creators real money.' },
			{ t: 'step', n: '1', title: '“In perpetuity, <em>in all media.</em>”', body: 'That’s forever, as ads, anywhere, for one Reel’s fee. Ask for organic only, or paid use for 30, 60 or 90 days at an extra fee.' },
			{ t: 'step', n: '2', title: '“No competitor for <em>6 months.</em>”', body: 'Who counts as a competitor? Name the exact category, shorten the time, and charge for the work you’ll have to turn down.' },
			{ t: 'step', n: '3', title: '“Payment within <em>90 days</em> of posting.”', body: 'Long payment terms mean you’re lending the brand money. Ask for 15–30 days, or an advance before you shoot.' },
			{ t: 'step', n: '4', title: '“Changes until <em>the brand is happy.</em>”', body: 'That’s unlimited work. Write it down: 2 rounds of changes included, more at a fee.' },
			{ t: 'step', n: '5', title: '“All rights, <em>including raw footage.</em>”', body: 'You’re licensing a post, not selling your face. Raw files and full ownership cost extra, or stay with you.' },
			{ t: 'step', n: '6', title: 'No word on <em>cancelling.</em>', body: 'If they cancel after you’ve shot, who pays? Add a cancellation fee, for example half the fee once the shoot is done.' },
			{ t: 'cta', eb: 'Got a contract or brief?', title: 'Let Miracle <em>read it</em> first.', body: 'Check the offer reads it (PDF, photo or text), scores it against your rates and usual terms, flags what to push back on, and writes your reply.', screen: 'offer', button: 'Get Miracle free', fine: 'General guidance, not legal advice.' }
		],
		caption: `6 red flags in a brand contract 🚩

1. "In perpetuity, in all media"
2. "No competitor for 6 months"
3. "Payment within 90 days"
4. "Changes until the brand is happy"
5. "All rights, including raw footage"
6. Nothing about cancelling

Every one of these is negotiable. Swipe for what to ask for instead.

Save this for your next contract 📌 (General guidance, not legal advice.)

Miracle's "Check the offer" reads a contract or brief, flags what to push back on and writes your reply. Free for creators. Link in bio.`,
		tags: '#influencercontract #brandcollab #contentcreatorindia #creatoreconomy #influencermarketingindia'
	},
	{
		id: 'r4', slug: 'dm-to-paid', kind: 'reel', theme: 'light',
		cover: { eb: 'Watch this', title: 'From a brand DM to <em>paid.</em>', sub: 'In one app. Free for creators.', screen: 'desk' },
		scenes: [
			{ k: 'hook', dur: 2.2, eb: 'Watch this', title: 'From a brand DM to <em>paid.</em>', sub: 'In one app. Free for creators.', screen: 'desk' },
			{ k: 'screen', dur: 3, eb: '1 · A brand DMs you', title: 'Miracle <em>spots it.</em>', sub: 'DMs that look like a collab, flagged for you.', screen: 'desk' },
			{ k: 'screen', dur: 3, eb: '2 · It reads the message', title: 'Budget, dates, <em>the ask.</em>', sub: 'All on your board in one tap.', screen: 'dm' },
			{ k: 'screen', dur: 3, eb: '3 · Send a quote', title: 'They accept <em>online.</em>', sub: 'With an agreement you both can download.', screen: 'offer' },
			{ k: 'screen', dur: 3, eb: '4 · Invoice with a UPI QR', title: 'Reminders go <em>by themselves.</em>', sub: 'Before it’s due, on the day, and after.', screen: 'paid' },
			{ k: 'screen', dur: 3, eb: '5 · Money in', title: 'Paid. <em>0% commission.</em>', sub: 'Brands pay you directly.', screen: 'money' },
			{ k: 'end', dur: 2.8, title: 'Your deals, <em>sorted.</em>', sub: 'Free for creators · Android & iPhone', button: 'Link in bio' }
		],
		caption: `From "Hi, collab?" to money in your bank, without the spreadsheet 📲

1. A brand DMs you → Miracle flags it
2. It reads the budget, dates and the ask
3. You send a quote → they accept online
4. Invoice with a UPI QR → reminders go by themselves
5. Paid. 0% commission.

Free for creators. Android on Google Play, iPhone via Add to Home Screen. Link in bio.`,
		tags: '#creatortools #brandcollab #contentcreatorindia #influencermarketingindia #creatoreconomy',
		audio: 'Add a trending, upbeat track in Instagram (keep it under the text, no voice needed).'
	},
	{
		id: 'p5', slug: 'brand-paying-late', kind: 'carousel', theme: 'dark', cover: 'paid', eyebrow: 'Getting paid',
		slides: [
			{ t: 'cover', title: 'A brand hasn’t <em>paid you.</em>', sub: 'What to send, and when. Save this before you need it.', long: false },
			{ t: 'step', eb: 'Before it’s late', title: 'No invoice, <em>no due date.</em>', body: 'Send a proper invoice the day the post goes live, with the amount, the due date and your UPI or bank details. A screenshot of your rate in a chat is not an invoice.' },
			{ t: 'template', eb: '1–7 days late', title: 'A <em>friendly</em> nudge.', label: 'Send this', text: `Hi [name], a gentle reminder that invoice [#] for ₹[amount] was due on [date].

Could you share when it’ll be paid? Payment details are on the invoice. Thanks!` },
			{ t: 'step', n: '10+', eb: 'Still nothing', title: 'Send a <em>formal</em> payment demand.', body: 'In writing, by email, not just a DM: the invoice, the amount, the due date, and a final date to pay by. Brands’ accounts teams act on paper.' },
			{ t: 'step', n: '45+', eb: 'Long overdue', title: 'Know your <em>MSME</em> rights.', body: 'Registered as an MSME (Udyam)? Buyers should pay you within 45 days, and you can file a delayed-payment complaint on <b>MSME Samadhaan</b>. A legal notice is the other route.' },
			{ t: 'step', eb: 'Every time', title: 'Keep the <em>paper trail.</em>', body: 'The agreed quote, the live post link, the invoice and every reminder you sent. If it ever goes further, that’s your whole case.' },
			{ t: 'cta', title: 'Let Miracle <em>chase</em> for you.', body: 'Reminders go by themselves: 2 days before, on the day, then 3, 7 and 14 days late. From 10 days late, a formal demand. From 45, an MSME complaint or legal notice, ready to send. Nothing formal goes out without you.', screen: 'paid', button: 'Get Miracle free', fine: 'General guidance, not legal advice.' }
		],
		caption: `A brand hasn't paid you. Now what? 😮‍💨

Day 0: send a real invoice with a due date
1–7 days late: a friendly nudge (copy-paste inside)
10+ days: a formal payment demand, by email
45+ days: if you're MSME (Udyam) registered, you can file on MSME Samadhaan, or send a legal notice

And keep the paper trail: quote, post link, invoice, reminders.

Send this to the creator friend who's still waiting on last month's collab 👀 (General guidance, not legal advice.)

Miracle sends the reminders for you and has the formal steps ready when you need them. Free, 0% commission. Link in bio.`,
		tags: '#creatoreconomy #contentcreatorindia #influencermarketingindia #msme #brandcollab'
	},
	{
		id: 'p6', slug: 'barter-or-paid', kind: 'carousel', theme: 'light', eyebrow: 'Barter · Decide fast',
		slides: [
			{ t: 'cover', title: 'Barter or paid? Ask these <em>4 questions.</em>', sub: 'A free product is not always free.', long: true },
			{ t: 'step', n: '1', title: 'Would you <em>buy it</em> anyway?', body: 'If you’d never use it, it isn’t payment. It’s an item you’ll have to fake enthusiasm for on camera.' },
			{ t: 'step', n: '2', title: 'What’s it worth next to <em>your rate?</em>', body: 'A ₹2,000 serum for a Reel you’d charge ₹15,000 for means you’re giving the brand roughly 87% off. Say that number out loud before you agree.' },
			{ t: 'step', n: '3', title: 'Is it a brand you want <em>on your grid?</em>', body: 'Barter can make sense: a dream brand, a first step into a new niche, or an experience you’d happily pay for. Decide on purpose, not by default.' },
			{ t: 'step', n: '4', title: 'Did you know barter <em>can be taxed?</em>', body: 'Products worth over ₹20,000 in a year from one brand can come with TDS. Keep a note of what you receive and what it’s worth.' },
			{ t: 'cta', title: 'Set your <em>barter rule</em> once.', body: 'Open, Selective or Paid only, with a minimum product value. Miracle tracks every product and experience still to come, and what you’ve received.', screen: 'money', button: 'Get Miracle free', fine: 'General guidance, not tax advice.' }
		],
		caption: `Barter or paid? Ask these 4 questions before you say yes 🎁

1. Would you buy it anyway?
2. What's it worth next to your rate?
3. Is it a brand you want on your grid?
4. Did you know barter can be taxed?

A ₹2,000 product for a ₹15,000 Reel is roughly 87% off. Sometimes that's worth it. Decide on purpose.

What's the best barter you ever said yes to? 👇

Set your barter rule once in Miracle: Open, Selective or Paid only. Free, 0% commission. Link in bio.`,
		tags: '#bartercollab #brandcollab #contentcreatorindia #influencertips #creatoreconomy'
	},
	{
		id: 'r7', slug: 'before-after', kind: 'reel', theme: 'dark',
		cover: { eb: 'Creators, be honest', title: 'Your brand deals <em>right now</em> 👇', sub: 'vs with Miracle', screen: 'today' },
		scenes: [
			{ k: 'hook', dur: 2, eb: 'Creators, be honest', title: 'Your brand deals <em>right now</em> 👇', screen: 'today' },
			{
				k: 'mess', dur: 4.6, title: 'Notes app. Screenshots. <em>Hope.</em>',
				notes: [
					{ c: 'y', x: 0, y: 0, r: -4, small: 'Notes', text: 'rate for reel?? 5k? 10k?? 😭' },
					{ c: 'g', x: 330, y: 190, r: 3, small: 'Instagram · 214 unread', text: 'Hi dear, collab? 🙏' },
					{ c: 'w', x: 20, y: 400, r: -2, small: 'WhatsApp · Day 47', text: 'Hi sir, any update on the payment? 🙂' },
					{ c: 'r', x: 340, y: 610, r: 4, small: 'Invoice_final_FINAL2.pdf', text: 'Wait, which brand was this?' }
				]
			},
			{ k: 'hook', dur: 1.4, eb: '', title: 'Now <em>with Miracle.</em>' },
			{ k: 'screen', dur: 2.6, eb: 'Every brand DM', title: 'Caught and <em>on your board.</em>', screen: 'desk' },
			{ k: 'screen', dur: 2.6, eb: 'Your rates', title: 'Set once. <em>Packages</em> on your page.', screen: 'pack' },
			{ k: 'screen', dur: 2.6, eb: 'Every invoice', title: 'Reminders go <em>by themselves.</em>', screen: 'paid' },
			{ k: 'screen', dur: 2.6, eb: 'Your money', title: 'All of it, <em>in one place.</em>', screen: 'money' },
			{ k: 'end', dur: 2.6, title: 'Free. <em>0% commission.</em>', sub: 'For Indian creators · Android & iPhone', button: 'Link in bio' }
		],
		caption: `Be honest, which one is you? 😅

Before: rates in the Notes app, 214 unread DMs, "any update on the payment?" on day 47, and Invoice_final_FINAL2.pdf

After: every brand DM on one board, rates set once, invoices that chase themselves, and all your money in one place.

Tag a creator who needs this 👇

Miracle is free for creators, 0% commission. Link in bio.`,
		tags: '#creatorlife #contentcreatorindia #brandcollab #influencerindia #creatoreconomy',
		audio: 'Use a trending "before / after" audio in Instagram; the switch lands at about 6.6 s.'
	},
	{
		id: 'r8', slug: 'your-page', kind: 'reel', theme: 'light',
		cover: { eb: 'For creators', title: 'Your own page that <em>brands book</em> you from.', sub: 'yourname.miracleapp.live · free', screen: 'nivy-page' },
		scenes: [
			{ k: 'link', dur: 3.2, eb: 'Free for every creator', title: 'Your own <em>link.</em>', slug: 'yourname', sub: 'Put it in your bio. Brands open it.' },
			{ k: 'screen', dur: 3, eb: 'Who you are', title: 'Live Instagram <em>numbers.</em>', sub: 'Updated from your account, not a stale screenshot.', screen: 'nivy-page' },
			{ k: 'screen', dur: 3, eb: 'Your best work', title: 'Reels that <em>got watched.</em>', sub: 'Your past collabs, with real views.', screen: 'nivy-reels' },
			{ k: 'screen', dur: 3, eb: 'Your rates', title: 'Brands build <em>their own package.</em>', sub: 'Bigger package, bigger discount. You set the steps.', screen: 'pack' },
			{ k: 'screen', dur: 3, eb: 'Then', title: 'The request lands <em>on your board.</em>', sub: 'With the brief, budget and dates.', screen: 'collabs' },
			{ k: 'end', dur: 2.8, title: 'Claim <em>your link.</em>', sub: 'Free for creators · 0% commission', button: 'Link in bio' }
		],
		caption: `Your media kit, rate card and booking form, in one link 🔗

yourname.miracleapp.live shows brands:
✨ who you are, with live Instagram numbers
✨ your best Reels, with real views
✨ your rates, and a package builder
✨ a request button that lands the brief, budget and dates on your board

Free for creators, 0% commission. Claim yours from the link in bio.`,
		tags: '#mediakit #linkinbio #contentcreatorindia #influencermarketingindia #brandcollab',
		audio: 'A calm, trending track; the link types itself in the first 3 seconds.'
	},
	{
		id: 'p9', slug: 'free-whats-the-catch', kind: 'carousel', theme: 'dark', cover: 'today', eyebrow: 'About Miracle',
		slides: [
			{ t: 'cover', title: 'Free for creators. <em>0% commission.</em>', sub: 'So what’s the catch? Fair question. Here’s the honest answer.', long: true },
			{ t: 'step', n: '1', title: 'We never <em>touch</em> your money.', body: 'Brands pay you directly, to your UPI or bank account. There’s nothing passing through us to take a cut of.' },
			{ t: 'step', n: '2', title: 'Every feature, <em>free</em> for creators.', body: 'Your page, quotes and agreements, invoices with a UPI QR, payment reminders, contract checks, insights and the content calendar.' },
			{ t: 'step', n: '3', title: 'So who <em>pays?</em>', body: 'Brands and agencies, for the tools to find creators, run campaigns and manage many creators at once. Creators don’t pay.' },
			{ t: 'step', n: '4', title: 'What you <em>get</em> today.', body: '<b>yourname.miracleapp.live</b>: a page brands book you from, with your live Instagram numbers and your rates, plus a desk that runs every deal from DM to paid.' },
			{ t: 'cta', eb: 'For Indian creators', title: 'Claim <em>your link.</em>', body: 'Android: Google Play. iPhone: open miracleapp.live in Safari, then Share › Add to Home Screen.', screen: 'nivy-page', button: 'Link in bio' }
		],
		caption: `Free for creators. 0% commission. So what's the catch? 🤔

→ We never touch your money. Brands pay you directly.
→ Every feature is free for creators.
→ Brands and agencies pay for tools to find and manage creators.

What you get: your own page at yourname.miracleapp.live, and a desk that runs every deal from DM to paid.

Questions? Ask in the comments, we reply to every one 💬

Android: Google Play. iPhone: Safari › Share › Add to Home Screen. Link in bio.`,
		tags: '#creatoreconomy #contentcreatorindia #influencermarketingindia #creatortools'
	}
];
module.exports = { POSTS };
