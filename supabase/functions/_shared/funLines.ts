// Hand-written fun nudges, for when the day's free AI is used up. Each line goes out at most once
// (the hourly job checks the sent log); when a kind runs out, openers and closers are paired up
// into new ones. Work lines fill in her real facts: {brand}, {n}, {amt}, {pct}, {goal}, {hobby}.
// A line with a city only goes to creators in that city.

export type Line = { title: string; body: string; city?: string };

export const LINES: Record<string, Line[]> = {
  water: [
    { title: 'Hydration check 💧', body: 'Your skin is your best brand deal. Keep it signed with a glass of water.' },
    { title: 'Sip break, superstar 💧', body: 'A glass of water now, and the next hook writes itself. Probably.' },
    { title: 'Water > one more scroll 💧', body: 'The feed will still be there. Your glass of water is waiting right now.' },
    { title: 'Glow-up, the free version 💧', body: 'No filter beats a hydrated face. One full glass, go.' },
    { title: 'Plot twist: drink water 💧', body: 'Every great creator arc has a hydration scene. This is yours.' },
    { title: 'Battery low: refill 💧', body: 'Phone at 20% gets a charger. You get a glass of water. Fair is fair.' },
    { title: 'Bengaluru weather, but inside you 💧', body: 'Bring a little drizzle in. One glass of water, right now.', city: 'Bengaluru' },
    { title: 'Ring light on, water in 💧', body: 'Hydrated creators blink less on camera. Science-ish. Drink up.' },
    { title: 'Tiny task, big win 💧', body: 'Easiest to-do of the day: one glass of water. Tick it off.' },
    { title: 'Your next reel called 💧', body: 'It asked for a creator with fresh energy. A glass of water will do it.' },
    { title: 'Coffee is not water ☕💧', body: 'Filter coffee is love, but it is not hydration. One glass of water, please.' },
    { title: 'Pause the edit 💧', body: 'Thirty seconds, one glass of water, then back to cutting that reel.' },
    { title: 'Algorithm tip 💧', body: 'Unconfirmed, but hydrated creators feel 100% better. Glass of water now.' },
    { title: 'Drink like it is golden hour 💧', body: 'You never miss golden hour. Do not miss water hour either.' },
    { title: 'Hydrate, then dominate 💧', body: 'Big plans need a working brain. Brains run on water. Glass up.' },
    { title: 'Out of office: thirst 💧', body: 'Send thirst on leave. One glass of water does the paperwork.' },
    { title: 'Spa day, compressed 💧', body: 'Cannot do the spa today? A big glass of water is the starter pack.' },
    { title: 'Content idea: water 💧', body: 'Not for the feed. For you. Drink a glass before the next task.' },
    { title: 'Refill the creator 💧', body: 'You refill everyone with good vibes. Your turn: one glass of water.' },
    { title: 'This is your water sign ♒💧', body: 'Whatever your zodiac says, today it says drink a glass of water.' }
  ],
  food: [
    { title: '{meal} o\'clock 🍛', body: 'Even the algorithm cannot boost an empty stomach. Go eat something real.' },
    { title: 'Brand deals can wait 🍽️', body: 'No brand ever paid extra for a hungry creator. {meal} first, empire after.' },
    { title: 'Plate before pitch 🍲', body: 'Pitches land better on a full stomach. Time for {meal}.' },
    { title: 'Food is a deliverable 🥘', body: 'Today\'s non-negotiable deliverable: a proper {meal}. Due now.' },
    { title: 'Edit paused, {meal} on 🍛', body: 'The timeline will not run away. Eat first, export later.' },
    { title: 'Fuel the face of the brand 🍽️', body: 'You are the face of the whole operation. Feed it some {meal}.' },
    { title: 'Hungry creator alert 🚨🍲', body: 'Symptoms: bad captions, short temper. Cure: {meal}, right now.' },
    { title: 'Swiggy is not a vibe today 🥗', body: 'Real {meal}, at a table, with zero phones. Five-star self-care.' },
    { title: 'Your stomach sent a DM 🍛', body: 'It says: please reply with {meal}. Do not leave it on seen.' },
    { title: 'Snack break unlocked 🍪', body: 'Level complete. Reward: {meal}. Claim it now.' },
    { title: 'Masala before metrics 🌶️', body: 'Insights can wait ten minutes. {meal} cannot.' },
    { title: 'Eat like a main character 🍽️', body: 'Main characters do not skip {meal}. Sit down and eat.' },
    { title: 'Breaking news: {meal} 🍲', body: 'Sources confirm the creator has not eaten. Fix this story now.' },
    { title: 'Content can marinate 🍛', body: 'So can your ideas. You, however, need {meal}.' },
    { title: 'Ctrl+S, then {meal} 🍽️', body: 'Save the draft, step away, eat. The draft will be prettier after.' },
    { title: 'Chai needs a plus-one ☕🍪', body: 'Do not let your chai go out alone. Give it a snack for company.' },
    { title: 'Golden hour for food 🌅🍛', body: 'Best light of the day for {meal}. Go catch it.' },
    { title: 'Collab with your kitchen 🍳', body: 'Easiest collab of the week: you and a proper {meal}.' }
  ],
  yoga: [
    { title: 'Downward dog > doom-scrolling 🧘‍♀️', body: 'Mat out. The DMs can wait an hour; your spine cannot.' },
    { title: 'Namaste, not net-scrolling 🧘‍♀️', body: 'Phone face down, mat face up. Yoga time.' },
    { title: 'Stretch goals, literally 🧘‍♀️', body: 'Today\'s stretch goal is a real stretch. Roll out the mat.' },
    { title: 'Your mat misses you 🧘‍♀️', body: 'It sent three DMs and a voice note. Go answer it.' },
    { title: 'Breathe in, log out 🧘‍♀️', body: 'One hour of yoga. The brands, the reels and the inbox are on mute.' },
    { title: 'Warrior pose, warrior creator 🧘‍♀️', body: 'You fight deadlines all day. Now fight them on the mat.' },
    { title: 'Child\'s pose is self-care 🧘‍♀️', body: 'Even CEOs rest their heads. Yoga time, boss.' },
    { title: 'Algorithm off, asana on 🧘‍♀️', body: 'The only reach that matters now is touching your toes.' },
    { title: 'Golden hour, yoga hour 🌇🧘‍♀️', body: 'Best light of the day is for your practice, not for a shoot.' },
    { title: 'Inner peace, zero edits 🧘‍♀️', body: 'No transitions, no hooks. Just breath and a mat. Go.' },
    { title: 'Tree pose, unshakeable you 🌳', body: 'Rooted like Cubbon Park. Yoga time.', city: 'Bengaluru' },
    { title: 'Your spine called a meeting 🧘‍♀️', body: 'Agenda: stretching. Attendance: mandatory. Mat now.' }
  ],
  // The evening slot for a creator whose hobby isn't yoga: {hobby} is what she wrote ("the gym", "a walk").
  hobby: [
    { title: 'Time for {hobby} ⏰', body: 'Laptop closed, phone face down. This hour is yours, not the brands.' },
    { title: 'Out of office: {hobby} 🌿', body: 'Auto-reply on in your head. The DMs will keep for an hour.' },
    { title: 'Scheduled: {hobby} 📅', body: 'The most important meeting today is with yourself. Do not be late.' },
    { title: 'Log off for {hobby} 🔌', body: 'The algorithm will survive an hour without you. Promise.' },
    { title: 'Creator off duty 🌙', body: 'Hooks, edits and invoices are on pause. Time for {hobby}.' },
    { title: 'Recharge mode 🔋', body: 'Phones charge on a cable. You charge with {hobby}. Go now.' },
    { title: 'Your calendar says {hobby} 🗓️', body: 'And today the calendar is the boss. Close the apps and go.' },
    { title: 'Brands can wait an hour ✨', body: 'Every deal in your inbox will still be there after {hobby}. Go.' }
  ],
  // The evening slot when she hasn't named a hobby: a stretch or a short walk.
  stretch: [
    { title: 'Your chair filed a complaint 🪑', body: 'Hours of sitting is enough. Stand up, stretch and walk around for five minutes.' },
    { title: 'Stretch break, superstar 🙆‍♀️', body: 'Shoulders down, arms up, neck rolls. Two minutes, then back to it.' },
    { title: 'Walk it out 🚶‍♀️', body: 'A ten-minute walk beats ten more minutes of scrolling. Shoes on.' },
    { title: 'Screen time, meet sky time ☁️', body: 'Step outside or to a window. Fresh air for five minutes, phone in pocket.' },
    { title: 'Posture check 🧍‍♀️', body: 'Unclench the jaw, drop the shoulders, stand up tall. Now stretch.' },
    { title: 'Move like nobody is filming 💃', body: 'One song, one full dance break. Nobody needs to see it.' },
    { title: 'Desk to deep breath 🌿', body: 'Five slow breaths and one long stretch. The inbox can wait.' },
    { title: 'Your legs want screen time 🦵', body: 'They have been off camera all day. Take them for a short walk.' }
  ],
  night: [
    { title: 'Logging off is a strategy 🌙', body: 'Rested creators make better reels. Phone down, lights low.' },
    { title: 'The algorithm sleeps too 🌙', body: 'Okay, it does not. But you should. Good night.' },
    { title: 'Last scene of the day 🎬🌙', body: 'Cut. That is a wrap. Tomorrow you shoot again.' },
    { title: 'Inbox zero, mind zero 🌙', body: 'Whatever is unread will still be unread at 9 AM. Sleep now.' },
    { title: 'Golden hour starts with sleep 🌙', body: 'Great morning light needs a well-rested face. Lights out.' },
    { title: 'Night mode: you 🌙', body: 'Dim the screen, then dim yourself. Sweet dreams, creator.' },
    { title: 'Drafts can sleep too 🌙', body: 'Save, close, sleep. Tomorrow\'s you will edit faster.' },
    { title: 'Phone on charge, you too 🔋🌙', body: 'Both of you need a full battery for tomorrow.' },
    { title: 'Tomorrow is content 🌙', body: 'Today was enough. Rest so tomorrow can be even better.' },
    { title: 'Sleep is the best filter 🌙', body: 'No app beats eight hours. Good night.' }
  ]
};

// Work: one per kind of fact, filled with her own numbers.
export const WORK: Record<string, Line[]> = {
  reply: [
    { title: '{n} brand(s) on read 👀', body: '{brand} is refreshing their inbox. Put them out of their misery: reply.' },
    { title: 'DMs are getting cold 🧊', body: '{brand} is waiting on you. A two-line reply keeps the deal warm.' },
    { title: 'Reply now, flex later 💬', body: '{n} brand(s) waiting, starting with {brand}. Fast replies get better rates.' }
  ],
  request: [
    { title: 'New money just knocked 🚪', body: '{n} new request(s), newest from {brand}. Take a look before chai.' },
    { title: 'Your inbox has options ✨', body: '{brand} and {n} in total want you. Pick the good ones.' },
    { title: 'Demand is high, queen 👑', body: '{n} request(s) waiting, {brand} first. Say yes, no or quote.' }
  ],
  draft_today: [
    { title: 'Draft day for {brand} 🎬', body: 'Due today. Export the best take and send it, perfection can be v2.' },
    { title: '{brand} is waiting on the cut ✂️', body: 'Draft due today. Trim, caption, send. You have got this.' }
  ],
  shoot_today: [
    { title: 'Lights, camera, {brand} 📸', body: 'Shoot day. Charge the phone, clean the lens, find the light.' },
    { title: 'Shoot day energy ⚡', body: '{brand} today. Outfit, angles, hook. Go make magic.' }
  ],
  live_today: [
    { title: '{brand} goes live today 🚀', body: 'Post, tag, pin the comment. Then watch the numbers climb.' },
    { title: 'Posting day, superstar 🌟', body: '{brand}\'s content goes live today. Hit post at the golden hour.' }
  ],
  draft_tomorrow: [
    { title: 'Tomorrow: {brand} draft 🗓️', body: 'Due tomorrow. Twenty minutes on it today saves a panic later.' },
    { title: 'Future you says thanks 🙏', body: '{brand} draft is due tomorrow. Get a rough cut in today.' }
  ],
  shoot_tomorrow: [
    { title: 'Shoot tomorrow: {brand} 📸', body: 'Plan the outfit and the hook tonight. Morning you will be grateful.' }
  ],
  late_pay: [
    { title: '{amt} is fashionably late 💸', body: '{brand} and friends owe you. One polite nudge from Payments.' },
    { title: 'Money, where art thou? 💰', body: '{amt} is late, biggest from {brand}. Send a reminder now.' }
  ],
  to_invoice: [
    { title: 'Invoices do not send themselves 🧾', body: '{n} finished collab(s), like {brand}, not invoiced yet. Two taps.' },
    { title: 'Bill it, boss 🧾', body: '{brand} is done and dusted. Send the invoice and get paid.' }
  ],
  follow: [
    { title: 'Follow-up o\'clock 📞', body: '{brand} has gone quiet. A friendly nudge today keeps it moving.' }
  ],
  product: [
    { title: 'Package incoming 📦', body: '{brand}\'s product should arrive today. Unboxing reel, anyone?' }
  ],
  goal: [
    { title: '{pct}% of the goal already 📈', body: '{amt} came in this month. {goal} is in sight. Keep going.' },
    { title: 'Money tracker says hi 💰', body: '{amt} this month, {pct}% of your {goal} goal. Big energy.' }
  ],
  clear: [
    { title: 'Calm desk, big ideas ☁️', body: 'Nothing urgent. Perfect time to pitch a dream brand.' },
    { title: 'Free hour unlocked 🔓', body: 'No fires today. Batch a few hooks for next week.' },
    { title: 'Plot your next viral 📝', body: 'A quiet day is a planning day. Jot three reel ideas.' }
  ]
};

// When a kind runs out, new lines are paired from these.
export const PARTS: Record<string, { open: string[]; close: string[] }> = {
  water: {
    open: ['Quick one 💧', 'Water break 💧', 'Pause 💧', 'Refill time 💧', 'Hey creator 💧', 'Tiny reminder 💧'],
    close: ['One full glass of water, right now.', 'Drink a glass before the next task.', 'Sip, breathe, then carry on.', 'Your future self says thanks for this glass.', 'Water first, everything else after.']
  },
  food: {
    open: ['{meal} time 🍽️', 'Stomach check 🍛', 'Break for {meal} 🍲', 'Food first 🥘', 'Hungry? 🍛'],
    close: ['Eat something real before the next task.', 'Step away from the screen and eat.', 'A proper {meal} beats one more scroll.', 'The work will be better after {meal}.', 'Sit down, eat slowly, no phone.']
  },
  yoga: {
    open: ['Mat time 🧘‍♀️', 'Yoga o\'clock 🧘‍♀️', 'Stretch break 🧘‍♀️', 'Breathe 🧘‍♀️'],
    close: ['Roll out the mat and start.', 'Phone on silent, practice on.', 'One hour for you, nothing else.', 'Your body booked this slot.']
  },
  hobby: {
    open: ['Time for {hobby} ⏰', 'Off duty 🌿', 'Your hour ✨', 'Switch off 🔌'],
    close: ['Close the apps and go.', 'The inbox can wait an hour.', 'This hour is yours, nothing else.', 'Phone on silent, go enjoy it.']
  },
  stretch: {
    open: ['Stretch break 🙆‍♀️', 'Move a little 🚶‍♀️', 'Stand up 🧍‍♀️', 'Breathe 🌿'],
    close: ['Stand, stretch and walk for five minutes.', 'Shoulders down, arms up, one deep breath.', 'A short walk now, then back to work.', 'Your back booked this break.']
  },
  night: {
    open: ['Wind down 🌙', 'Day done 🌙', 'Lights low 🌙', 'Good night 🌙'],
    close: ['Phone down and sleep on time.', 'Tomorrow starts with good sleep.', 'Rest now, create tomorrow.', 'Close the apps, close the day.']
  },
  work: {
    open: ['Quick win ⚡', 'Work nudge 💼', 'Boss move 👑', 'Desk check 🗂️', 'Five-minute task ⏱️'],
    close: ['{fact}. Do it now and feel great.', '{fact}. Small step, big payoff.', '{fact}. Knock it out before chai.', '{fact}. Future you is cheering.']
  }
};
