// Checks whether Zoho accepts the no-reply mailbox's SMTP login. Sends no email.
// Run: node scripts/zoho-login-check.mjs   (it asks for the app password; nothing is shown or saved)
import tls from 'node:tls';
import readline from 'node:readline';

const HOST = 'smtp.zoho.in';
const USER = process.argv[2] || 'no-reply@miracleapp.live';

function askHidden(q) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
		rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a.trim()); });
	});
}

const pass = await askHidden(`Zoho app password for ${USER}: `);
const b64 = (s) => Buffer.from(s).toString('base64');
const steps = [
	(l) => l.startsWith('220') && 'EHLO miracle-check',
	(l) => /^250 /.test(l) && 'AUTH LOGIN',
	(l) => l.startsWith('334') && b64(USER),
	(l) => l.startsWith('334') && b64(pass),
];
let i = 0;
let buf = '';
let done = false;
const s = tls.connect(465, HOST, { servername: HOST });
s.on('data', (d) => {
	if (done) return;
	buf += d;
	let n;
	while ((n = buf.indexOf('\r\n')) >= 0) {
		const line = buf.slice(0, n);
		buf = buf.slice(n + 2);
		if (i === steps.length) {
			console.log(line.startsWith('235') ? 'OK: Zoho accepted the login. Use this same password in Supabase.' : `Zoho refused the login: ${line}`);
			done = true;
			s.end('QUIT\r\n');
			return;
		}
		if (/^[45]\d\d /.test(line)) { console.log(`Zoho said: ${line}`); done = true; s.end(); return; }
		const next = steps[i](line);
		if (next) { s.write(next + '\r\n'); i++; }
	}
});
s.on('error', (e) => console.log('Could not reach Zoho:', e.message));
