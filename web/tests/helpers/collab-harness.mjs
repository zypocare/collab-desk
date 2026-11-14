// Shared by the phone-browser checks and the Android emulator check. All data and network calls
// are test fixtures; the native check keeps the real Capacitor bridge and Android keyboard.
export async function mountCollabHarness({ mode = 'device' } = {}) {
	if (mode === 'device' && !window.Capacitor?.isNativePlatform?.()) throw new Error('The native test requires the real Capacitor bridge.');
	if (mode === 'native') window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
	else if (mode === 'browser') delete window.Capacitor;
	for (const file of ['app', 'brand', 'studio', 'desk', 'pro', 'mobile-type', 'mobile', 'atelier', 'dash', 'cred', 'today']) await import(`/src/${file}.css`);
	document.body.innerHTML = '<div class="app"><main style="min-height:2600px;padding:16px"><button id="dialog-opener">Add collab</button><div id="home"></div></main></div>';
	const statePath = '/src/lib/studio.svelte.ts';
	const { studio } = await import(statePath);
	studio.settings = { id: 'keyboard-test', handle: 'preview', display_name: 'Asha Sharma', rates: {}, monthly_goal: 100000 };
	studio.extras = true;
	studio.brands = ['Beacon Circle', 'Brown Boy Café', 'Cafe Champakam', 'Copper Finch', 'Flipkart Auto Fest', 'Flipkart Food Fest', 'FLO', 'Hairspeak'].map((name, i) => ({ id: String(i), name }));
	localStorage.setItem('cd-setup-hide-keyboard-test', '1');
	const checksPath = '/src/lib/checkup.svelte.ts';
	const { checkups } = await import(checksPath);
	checkups.loaded = true;
	const uiPath = '/src/lib/ui.svelte.ts';
	const { ui } = await import(uiPath);
	const componentPath = '/src/lib/components/NewCollabDialog.svelte';
	const { default: Dialog } = await import(componentPath);
	const source = await (await fetch(componentPath)).text();
	const runtime = source.match(/from\s+["']([^"']*\/svelte\.js[^"']*)["']/)?.[1];
	if (!runtime) throw new Error('Could not find the component runtime');
	const { mount, unmount } = await import(runtime);
	const homePath = '/src/lib/components/PhoneToday.svelte';
	const { default: Home } = await import(homePath);
	const home = mount(Home, { target: document.querySelector('#home') });
	const phonePath = '/src/lib/phone.svelte.ts';
	const { startPhone, phone } = await import(phonePath);
	const stop = startPhone(async () => {});
	const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	await paint();
	window.scrollTo({ top: 220, behavior: 'instant' });
	await paint();
	await Promise.all(document.querySelector('.m-hero').getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity).map(animation => animation.finished.catch(() => {})));
	document.querySelector('#dialog-opener').focus({ preventScroll: true });
	const phoneState = () => ({ scrolled: phone.scrolled, titled: phone.titled, hide: phone.hide });
	const original = { y: scrollY, moneyTop: document.querySelector('.m-hero').getBoundingClientRect().top, phone: phoneState() };
	let dialog;
	const open = () => { ui.newCollab = true; dialog = mount(Dialog, { target: document.body }); };
	const close = async () => { ui.newCollab = false; if (dialog) { await unmount(dialog); dialog = undefined; } };
	window.collabTest = { isOpen: () => ui.newCollab, original, phone: phoneState, open, close, destroy: async () => { await close(); stop(); await unmount(home); } };
	open();
	await paint();
}
