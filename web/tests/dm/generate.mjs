// Makes tests/dm/cases-gen.json: 180 brand messages from templates (English and Hinglish), with the
// answers worked out here. Fixed seed, so the file is the same every time. Brand names are invented.
// Run: node tests/dm/generate.mjs
import { writeFileSync } from 'node:fs';

let seed = 20261019;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const BRANDS = ['Kesar Craft', 'Tealeaf Co', 'Urban Ghar', 'Mitti Studio', 'Neel Organics', 'Saffron Lane', 'Koyal Beauty', 'Bodhi Wear', 'Pahadi Pantry', 'Vayu Fitness', 'Rangrez Home', 'Chandni Jewels', 'Monsoon Bakes', 'Indigo Trails', 'Lassi Labs'];
const PEOPLE = ['Asha', 'Riya', 'Karan', 'Meera', 'Arjun', 'Sana', 'Vikram', 'Pooja', 'Neha', 'Rahul'];
const NUM = { 1: ['1', 'one', 'a'], 2: ['2', 'two'], 3: ['3', 'three'], 4: ['4', 'four'], 5: ['5', 'five'] };
const HNUM = { 1: ['ek', '1'], 2: ['do', '2'], 3: ['teen', '3'], 4: ['char', '4'], 5: ['paanch', '5'] };
const KIND = { Reel: ['reel', 'reels'], Story: ['story', 'stories'], Carousel: ['carousel', 'carousels'], 'Static post': ['static post', 'static posts'] };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function deliv(hindi) {
	const kinds = Object.keys(KIND).filter(() => rnd() < 0.5);
	if (!kinds.length) kinds.push('Reel');
	const want = {};
	const parts = kinds.map((k) => {
		const n = 1 + Math.floor(rnd() * (k === 'Story' ? 5 : 3));
		want[k] = n;
		const word = hindi ? pick(HNUM[n]) : pick(NUM[n]);
		return `${word} ${KIND[k][n === 1 ? 0 : 1]}`;
	});
	const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ${hindi ? 'aur' : pick(['and', '+'])} ${parts.at(-1)}`;
	return { text: joined, want };
}
function fee(hindi) {
	const k = pick([8, 12, 15, 18, 20, 25, 30, 35, 40, 45, 60, 75, 150, 250]);
	const v = k * 1000;
	if (hindi)
		return k === 150 ? { text: pick(['dedh lakh', '1.5 lakh']), v } : k === 250 ? { text: pick(['dhai lakh', '2.5 lakh']), v } : { text: pick([`${k} hazaar`, `${k}k`, `${v} rupaye`]), v };
	if (k >= 150) return { text: pick([`₹${k / 100} lakh`, `Rs ${k / 100} lakhs`, `${k / 100}L`]), v };
	return { text: pick([`₹${k}k`, `Rs ${v.toLocaleString('en-IN')}`, `${k}k`, `INR ${v}`, `₹${v.toLocaleString('en-IN')}`]), v };
}
function date() {
	const m = Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 27);
	const mm = String(m + 1).padStart(2, '0'), dd = String(d).padStart(2, '0');
	const sfx = d === 1 || d === 21 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th';
	return { text: pick([`${d}${sfx} ${MON[m]}`, `${d} ${MONTH[m]}`, `${MON[m]} ${d}`, `${d}/${m + 1}`]), live: `${mm}-${dd}` };
}

const EN = [
	(b, c, d, f, t) => ({ text: `Hi! I'm ${c} from ${b}. We'd love ${d.text} for our launch, budget ${f.text}, live by ${t.text}.`, brand: b, contact: c }),
	(b, c, d, f, t) => ({ text: `Team ${b} here! Budget is ${f.text} for ${d.text}. Can you go live on ${t.text}?`, brand: b }),
	(b, c, d, f, t) => ({ text: `Hello, this is ${c} from ${b}. We can offer ${f.text} for ${d.text}, posting before ${t.text}.`, brand: b, contact: c }),
	(b, c, d, f, t) => ({ text: `We at ${b} want ${d.text} for our festive sale. Paying ${f.text}. Live by ${t.text}. Thanks!`, brand: b }),
	(b, c, d, f, t) => ({ text: `Hey Niveditha, ${c} here from ${b} 😊 Would you do ${d.text}? Our budget: ${f.text}. Ideally live on ${t.text}.`, brand: b, contact: c })
];
const HI = [
	(b, c, d, f, day) => ({ text: `${b} ki taraf se: ${d.text} chahiye, ${f.text} denge, ${day} tak live karna hai` }),
	(b, c, d, f, day) => ({ text: `Hi didi, hum ${b} se hai. ${d.text} ke liye ${f.text} de sakte hai. ${day} tak post karna hoga.` }),
	(b, c, d, f, day) => ({ text: `Bhai ${f.text} budget hai, ${d.text} chahiye, ${day} tarikh tak ho jayega?` }),
	(b, c, d, f, day) => ({ text: `Namaste! ${b} wale bol rahe hai. ${d.text} karni hai, ${f.text} milenge. ${day} ko launch hai.` })
];

const out = [];
for (let i = 0; i < 180; i++) {
	const hindi = i % 3 === 2;
	const b = pick(BRANDS), c = pick(PEOPLE), d = deliv(hindi), f = fee(hindi);
	if (hindi) {
		const day = 1 + Math.floor(rnd() * 28);
		const m = pick(HI)(b, c, d, f, day);
		out.push({ id: `gen-hi-${i}`, text: m.text, fee: f.v, deliverables: d.want, liveDay: day });
	} else {
		const t = date();
		const m = pick(EN)(b, c, d, f, t);
		out.push({ id: `gen-en-${i}`, text: m.text, brand: m.brand, ...(m.contact ? { contact: m.contact } : {}), fee: f.v, deliverables: d.want, live: t.live });
	}
}
writeFileSync(new URL('./cases-gen.json', import.meta.url), JSON.stringify(out, null, '\t') + '\n');
console.log(`wrote ${out.length} cases`);
