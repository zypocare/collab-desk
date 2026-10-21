<script lang="ts">
	import { onMount } from 'svelte';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';

	// Privacy policy (also what Meta asks for before the Instagram app can be published).
	onMount(() => {
		if (!pub.data) loadPublicPage();
	});
	const who = $derived(pub.data?.display_name || 'the creator');
	const app = $derived(pub.data?.app_name || 'Miracle');
</script>

<svelte:head><title>Privacy policy · {app}</title></svelte:head>

<div class="page">
	<div class="wrap doc-wrap">
		<article class="doc legal">
			<header class="doc-h"><div><div class="eb">Last updated 17 October 2026</div><h1>Privacy policy</h1></div></header>
			<p>{app} is the website {who} uses to manage brand collaborations: requests, quotes, agreements, content approvals, invoices and results. This page explains what we collect and why.</p>

			<h2>What we collect</h2>
			<ul>
				<li><b>Brands and their teams:</b> name, work email, phone (if given), company details and billing details you enter, the requests, messages, files and feedback you send.</li>
				<li><b>Instagram data of {who}'s own account:</b> profile, follower numbers, posts and their insights (views, reach, likes, saves), audience breakdowns, and Instagram direct messages sent to the account, through Meta's official Instagram API. Only {who}'s own account is connected.</li>
				<li><b>People who message {who} on Instagram:</b> only conversations that look like a brand collaboration are kept: your Instagram username, name, profile picture and the messages in that conversation, so {who} can reply and plan the collaboration. Other messages are checked automatically when they arrive and are not stored.</li>
				<li><b>Technical data:</b> sign-in sessions, the device's notification subscription (if you allow alerts), and basic logs needed to keep the service secure.</li>
			</ul>

			<h2>How it's used</h2>
			<ul>
				<li>To run collaborations: show requests and their status, send quotes, agreements, invoices, reminders and results reports by email.</li>
				<li>To reply to messages, including Instagram direct messages, and to post approved content to {who}'s own Instagram account when {who} schedules it.</li>
				<li>To show {who}'s audience and results to brands on this website and in the media kit.</li>
			</ul>
			<p>We don't sell personal data and don't use it for advertising. Instagram data is used only for the purposes above, as Meta's Platform Terms allow.</p>

			<h2>Who processes it</h2>
			<p>Data is stored with Supabase (database and files) and the website runs on Cloudflare. Emails are sent from {who}'s own email account. Optional AI features run on Cloudflare's AI service and only receive the text or image being processed at that moment. If that service's free daily amount is used up, Google's Gemini service may be used instead, with email addresses and phone numbers removed first; screenshots and incoming Instagram messages are never sent to it.</p>

			<h2>How long it's kept</h2>
			<p>Collaboration records and invoices are kept as long as needed for the work and for tax records (in India, usually 8 years for invoices). Instagram data is refreshed daily and removed when the account is disconnected or on request.</p>

			<h2>Your choices</h2>
			<p>You can ask for a copy of your data, a correction or deletion at any time. See <a class="lnk" href="/data-deletion">how to delete your data</a>.</p>

			<h2>Contact</h2>
			<p>Use <b>Ask a question</b> on the <a class="lnk" href="/">main page</a>, or reply to any email you received from {app}.</p>
		</article>
	</div>
</div>
