// Is an Instagram DM a possible brand collab? Plain functions (no Deno or network), shared by the DM
// webhook and the filter's test set, so what is scored is exactly what runs.
//
// 1. worthChecking(): a cheap first look that decides which DMs go to the free AI at all. It is wide
//    for anything that sounds like business (any language), and closed to plain fan talk, so the
//    daily AI allowance isn't spent on compliments.
// 2. ruleCheck(): plain-words reading. 'scam' for known tricks (fees, followers, fake features),
//    'likely' only for unmistakable offers, 'maybe' for business interest.
// 3. decide(): the AI reads the whole chat and decides; the rules are a safety net (a clear offer the
//    AI calls "no" is still kept as "maybe") and the answer when the AI can't be reached.

export type Flag = '' | 'likely' | 'maybe';
export type Rule = Flag | 'scam';
export type Ai = { collab: 'likely' | 'maybe' | 'no'; kind?: string } | null;

// Indian scripts (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam):
// the plain-words checks can't read these, so the AI does.
const INDIC = /[ऀ-ൿ]/;

// Business on its own: offers, money, brands, venues, invitations (English, Hinglish, Kannada in Latin letters).
const STRONG = new RegExp(
  [
    String.raw`\b(collab\w*|partner\w*|paid|budget|barter|campaign|promot\w*|sponsor\w*|brands?|rates?|charges?|commercials?|ugc|deliverables?|launch\w*|pr|gift\w*|products?|influencer\w*|marketing|agency|quote|pricing|price|fees?|inr|rs\.?|business|inquiry|enquiry|ambassadors?|affiliate|commission|hamper|kit|complimentary|host(?:ing)?|invite|invitation|rsvp|event|menu|cafe|restaurant|pub|bar|resort|hotel|homestay|stay|store|outlet|showroom|salon|studio|label|startup|d2c|app)\b`,
    String.raw`\b(on the house|work with you|work together|associate with|association|opportunity|media kit|rate card|manager|management|email id|mail id|your email|your mail|contact number|your number|connect on (?:email|mail|whatsapp|call)|(?:have|got) something (?:exciting |special |interesting )?for you|something exciting)\b`,
    // Hinglish / Kannada written in English letters
    String.raw`\b(kitna|kitne|paisa|paise|lagega|lagenge|karogi|karoge|banaogi|banaoge|banana hai|bhejenge|bhej denge|chahiye|hamara|hamare|humara|humare|eshtu|madbeku|madtira|madthira|namma|nimma|beku)\b`,
    String.raw`₹|\b\d+(?:\.\d+)?\s?(?:k|l|lakhs?)\b`
  ].join('|'),
  'i'
);
// Content words count only when the writer speaks as a business ("we", "our", "us") or asks her for
// something: "your reels are aesthetic" is a fan, "we'd love a reel" isn't.
const CONTENT = /\b(reels?|stor(?:y|ies)|posts?|videos?|content|shoot|review|try (?:it|our|one)|send you|feature)\b/i;
const WE = /\b(we|we're|we'd|we've|our|us|team|company)\b/i;
const ASK = /\b(would you|could you|can you|will you|are you open|are you interested|interested\?|do you do|available|availability)\b/i;

/** Should this DM go to the AI at all? */
export function worthChecking(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (INDIC.test(t)) return t.replace(/\s+/g, '').length >= 8;
  if (STRONG.test(t)) return true;
  if (CONTENT.test(t) && (WE.test(t) || ASK.test(t))) return true;
  // A business voice hinting at something to come, or asking how to reach her about work.
  if (WE.test(t) && /\b(planning|plan|something|details|discuss|project|proposal|idea)\b/i.test(t)) return true;
  return /\b(share|send|give|drop) (?:me |us )?(?:your )?(?:whatsapp|number|contact|email|mail)|regarding (?:work|business|a project|something)|discuss (?:something|work|business)\b/i.test(t);
}

// Known tricks: she'd never want these on her desk.
const SCAM = new RegExp(
  [
    String.raw`registration (?:fee|charge|amount)|one[- ]time (?:fee|payment)|joining fee|security deposit`,
    String.raw`(?:you )?(?:just |only )?pay (?:the |for )?(?:shipping|delivery|courier|registration|a fee)`,
    String.raw`buy (?:the|our) product (?:first|and)|refund you (?:after|once|later)|cash ?back after`,
    String.raw`\b\d+\s?k?\s?(?:real |active )?followers? (?:for|at|in)\b|(?:get|gain|buy) (?:\d+\s?k?\s?)?(?:real |active )?followers|followers? for (?:just |only )?(?:₹|rs)`,
    String.raw`promote your (?:page|account|profile)|get featured|to get featured|feature your (?:page|account|profile)|promotion fee|feature fee|paid promotion available|shout ?out for shout ?out|\bs4s\b|follow for follow|\bf4f\b`,
    String.raw`blue tick|verification badge|verify (?:here|your account)|violated|deactivat|suspend`,
    String.raw`crypto|bitcoin|forex|trading|invest(?:ment)? (?:in|plan)|guaranteed (?:returns|profit|income)|earn \d+ (?:daily|per day|weekly)|work from home|part[- ]time job|bank details|otp`,
    String.raw`(?:feature|featuring|promotion) charges?|get (?:your )?(?:reel|post|page|account) featured|use (?:my |our |the )?code \w+ to (?:purchase|buy|order|shop)|claim (?:your|the) |bit\.ly\/|tinyurl\.|vote for me`,
    String.raw`giveaway`
  ].join('|'),
  'i'
);
// Unmistakable offers or rate requests.
const OFFER = new RegExp(
  [
    String.raw`\bpaid (?:collab\w*|partnership|reel|story|stories|post|promotion|campaign|appearance|content|video)`,
    String.raw`\b(?:your|ur|you're|youre) (?:rates?|charges?|commercials?|fees?|pricing|price|quote|rate card)\b|\brate card\b|share (?:your )?(?:rates?|charges?|commercials?|pricing|quote)|how much do you charge|what do you charge`,
    String.raw`\bkitna (?:charge|lagega|loge|logi)|\brate kya\b|\brate eshtu\b|\bcharge (?:kya|kitna)\b`,
    String.raw`\bbarter (?:collab\w*|deal|basis)|\bin (?:a )?barter\b|\bbarter mein\b|in exchange for (?:a |an |1 |one )?(?:honest )?(?:reel|story|post|video|review|content)`,
    String.raw`\b(?:our )?budget (?:is |of )?(?:₹|rs\.?|inr)?\s?\d|\bsponsored (?:post|reel|story|content|video)|\bbrand (?:collab\w*|partnership|ambassador\w*|deal)\b|\bgifting collab\w*|\bugc (?:video|creator|content)`
  ].join('|'),
  'i'
);
// Talking about her (a past collab, her earnings) or selling to her, not offering her work.
const NOT_OFFER = /\b(?:rates?|charges?|fees?) for (?:a |an |the |your )?(?:personal|private|monthly|weekly|home|wedding|(?:yoga |dance |fitness |group )?(?:class\w*|session\w*|batch\w*|workshop\w*)|class\w*|session\w*|batch\w*|workshop\w*|corporate|tuition|coaching|photograph\w*|portfolio)|\bhow (?:do|can|did) (?:i|you) (?:start|get|begin)\b|\b(?:your|ur) (?:collab\w*|partnership|reel|post) with\b|\bhow much do brands pay\b|\bi charge\b|\bwe charge\b|\bour (?:charges|fee|rates) (?:is|are)\b|\bpromote my (?:page|account)\b/i;

/** The plain-words reading of a DM. */
export function ruleCheck(text: string): Rule {
  if (SCAM.test(text)) return 'scam';
  if (NOT_OFFER.test(text)) return '';
  if (OFFER.test(text)) return 'likely';
  if (/\b(do you do collab\w*|open to (?:brand )?(?:collab\w*|deals|sponsorships?|partnerships?)|business (?:inquiry|enquiry)|who manages your|your manager|media kit)\b/i.test(text)) return 'maybe';
  return '';
}

/** The final label, from the rules and the AI's answer (null when the AI couldn't be reached). */
export function decide(rule: Rule, ai: Ai): Flag {
  if (rule === 'scam') return '';
  if (!ai) return rule;
  if (ai.kind === 'scam' || ai.kind === 'spam') return '';
  if (ai.collab === 'no') return rule === 'likely' ? 'maybe' : '';
  return rule === 'likely' ? 'likely' : ai.collab;
}

/** The chat for the AI, oldest first: "Them: …" and "Her: …", the newest message last. */
export function transcript(lines: { fromMe: boolean; text: string }[], latest: string, max = 2400): string {
  const all = lines.filter((l) => l.text.trim());
  if (!all.length || all[all.length - 1].text.trim() !== latest.trim()) all.push({ fromMe: false, text: latest });
  let out = all.map((l) => `${l.fromMe ? 'Her' : 'Them'}: ${l.text.trim().replace(/\s+/g, ' ')}`);
  while (out.join('\n').length > max && out.length > 1) out = out.slice(1);
  return out.join('\n').slice(-max);
}
