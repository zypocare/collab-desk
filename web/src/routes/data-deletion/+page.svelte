<script lang="ts">
	import { onMount } from 'svelte';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';

	// Data deletion instructions (Meta asks for this page before the Instagram app can be published).
	onMount(() => {
		if (!pub.data) loadPublicPage();
	});
	const who = $derived(pub.data?.display_name || 'the creator');
	const app = $derived(pub.data?.app_name || 'Miracle');
</script>

<svelte:head><title>Delete your data · {app}</title></svelte:head>

<div class="page">
	<div class="wrap doc-wrap">
		<article class="doc legal">
			<header class="doc-h"><div><div class="eb">Your data</div><h1>How to delete your data</h1></div></header>

			<h2>If you messaged {who} on Instagram</h2>
			<p>If your conversation with {who} looked like a brand collaboration, we keep your Instagram username, name, profile picture and the messages in it (other conversations are not stored). To have them deleted, send the message <b>"Delete my data"</b> in the same Instagram conversation, or use <b>Ask a question</b> on the <a class="lnk" href="/">main page</a>. Everything we hold about your Instagram conversation is deleted within 30 days and we confirm when it's done.</p>

			<h2>If you're a brand with an account</h2>
			<p>Sign in and open <b>Settings</b>, then <b>Sign-in &amp; account</b>. Download your data if you want a copy, then choose <b>Delete the company</b>. It closes at once and is erased 30 days later; sign in before then to bring it back. Invoices issued to your company are kept only as long as Indian tax law requires. You can also reply to any email from {app} and ask us to do it.</p>

			<h2>If you're a creator on {app}</h2>
			<p>In your studio, open <b>Settings</b>, then <b>Sign-in &amp; account</b>, and choose <b>Delete my page</b>. Your page goes offline at once and is erased 30 days later. Your page address is held for 90 days so nobody else can take it.</p>

			<h2>Instagram connection</h2>
			<p>You can also remove this app's access from Instagram at any time: Instagram app &gt; Settings &gt; Website permissions (Apps and websites) &gt; remove {app}.</p>

			<p class="hint">See also the <a class="lnk" href="/privacy">privacy policy</a> and the <a class="lnk" href="/terms">terms of service</a>.</p>
		</article>
	</div>
</div>
