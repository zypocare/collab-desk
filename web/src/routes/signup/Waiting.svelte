<script lang="ts">
	import type { CreatorRequest } from '#lib/types.ts';
	import { firstName } from '#lib/util.ts';

	// Step 3 for a creator: the request is with the Miracle team (or was declined, with a way to send it again).
	let { request, email, onedit }: { request: CreatorRequest; email: string; onedit: () => void } = $props();
	const declined = $derived(request.status === 'declined');
	const sent = $derived(request.requested_at ? new Date(request.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : 'today');
</script>

<div class="su-plain wt">
	<section class="wt-main">
		{#if declined}
			<span class="su-eb">Not just yet</span>
			<h1 class="su-h1 su-big">Thanks for asking, {firstName(request.name)}.</h1>
			<p class="su-lead">We can't open a Miracle studio for you just now. Miracle is taking a small number of creators while it grows. You can update your profile and send it again, and we'll take another look.</p>
			<div class="su-row"><button class="su-neo su-go" onclick={onedit}>Update and send again</button></div>
		{:else}
			<span class="su-eb su-ok">Request sent</span>
			<h1 class="su-h1 su-big">Thanks, {firstName(request.name)}. Your request <em>is in.</em></h1>
			<p class="su-lead">The Miracle team reviews every creator before they appear to brands. We'll email <b>{email}</b> as soon as it's done. You can close this page.</p>
			<ol class="wt-steps">
				<li class="done"><span>✓</span><b>Sign up</b><small>Sent {sent}</small></li>
				<li class="on"><span>2</span><b>Review by the Miracle team</b><small>In progress. You'll get an email.</small></li>
				<li><span>3</span><b>Pick your link</b><small>yourname.miracleapp.live, right after approval</small></li>
				<li><span>4</span><b>Connect Instagram and add your rates</b><small>Then brands can send you requests</small></li>
			</ol>
			<button class="su-link" style="justify-self:start" onclick={onedit}>Change what I sent</button>
		{/if}
	</section>
	{#if !declined}
		<aside class="su-card wt-side">
			<b class="wt-t">While you wait</b>
			<div class="wt-tip"><span>1</span><p><b>Switch Instagram to a professional account</b> (Creator or Business). It's free: Settings, then Account type and tools. Miracle needs it for live stats.</p></div>
			<div class="wt-tip"><span>2</span><p><b>Note your usual rates</b> for a Reel, a Story and a post. You'll add them on your first day.</p></div>
			<div class="wt-tip"><span>3</span><p><b>Think of your link name.</b> Short and close to your handle works best.</p></div>
			<span class="su-hint wt-q">Questions? contact@miracleapp.live</span>
		</aside>
	{/if}
</div>

<style>
	.wt {
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		width: min(1080px, 100%);
		align-items: start;
		gap: 28px;
	}
	.wt-main {
		display: grid;
		gap: 20px;
	}
	.wt-steps {
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 18px;
	}
	.wt-steps li {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr);
		column-gap: 16px;
		font-size: 16px;
	}
	.wt-steps span {
		grid-row: span 2;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--ink-3);
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
	}
	.wt-steps li.done span {
		background: var(--ok);
		color: var(--bg);
		box-shadow: none;
	}
	.wt-steps li.on span {
		color: var(--g2);
		box-shadow: inset 0 0 0 2px var(--g2);
	}
	.wt-steps small {
		color: var(--ink-3);
		font-size: 14px;
	}
	.wt-side {
		width: auto;
		gap: 16px;
	}
	.wt-t {
		font: italic 400 28px/1.1 var(--f-serif);
	}
	.wt-tip {
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr);
		gap: 12px;
	}
	.wt-tip span {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		background: color-mix(in oklab, var(--g1) 18%, transparent);
		color: var(--g1);
		font-weight: 700;
		font-size: 14px;
	}
	.wt-tip p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.wt-tip b {
		color: var(--ink);
	}
	.wt-q {
		border-top: 1px solid var(--line);
		padding-top: 14px;
		user-select: all;
	}
	@media (max-width: 860px) {
		.wt {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
