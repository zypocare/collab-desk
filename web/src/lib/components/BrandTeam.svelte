<script lang="ts">
	import { onMount } from 'svelte';
	import { call, team, loadTeam, ROLE_LABEL, ROLE_NOTE, type Team, type TeamRole } from '#lib/business.svelte.ts';
	import { ask } from '#lib/confirm.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { emailOk, errMessage, firstName, initials, inr } from '#lib/util.ts';
	import Select from '#lib/components/Select.svelte';

	// Team & approvals (a section of Settings): who in the company works on Miracle, what each may do, and quotes waiting for a yes.
	onMount(() => loadTeam().catch((e) => toast(errMessage(e), 'alert')));
	const t = $derived(team.data);
	const admin = $derived(t?.role === 'admin');
	const decider = $derived(t?.role === 'admin' || t?.role === 'approver');
	const ROLES = (['admin', 'approver', 'finance', 'member'] as TeamRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
	async function run(fn: string, args: Record<string, unknown>, done?: string) {
		try {
			team.data = await call<Team>(fn, args);
			if (done) toast(done, 'check');
			return true;
		} catch (e) {
			toast(errMessage(e), 'alert');
			return false;
		}
	}

	let inviting = $state(false);
	let email = $state('');
	let name = $state('');
	let role = $state<TeamRole>('member');
	async function invite(e: SubmitEvent) {
		e.preventDefault();
		if (!emailOk(email)) return toast('Type a full email address', 'alert');
		if (await run('team_invite', { p_email: email.trim(), p_name: name.trim(), p_role: role }, `Invited ${email.trim()}`)) {
			email = name = '';
			role = 'member';
			inviting = false;
		}
	}
	async function remove(m: Team['members'][number]) {
		if (!(await ask({ title: `Remove ${m.name || m.email}?`, body: 'They lose access to your companies on Miracle. Their past messages stay.', ok: 'Remove', danger: true }))) return;
		run('team_remove', { p_email: m.email }, 'Removed');
	}

	let limit = $state('');
	$effect(() => {
		if (t && limit === '') limit = String(t.approval_limit);
	});
	const saveLimit = () => t && Number(limit) !== t.approval_limit && run('team_settings', { p_on: t.approval_on, p_limit: Number(limit) || 0 }, 'Limit saved');
	async function decide(a: Team['approvals'][number], yes: boolean) {
		if (yes && !(await ask({ title: `Accept ${firstName(a.creator)}'s quote for ${inr(a.total)}?`, body: 'It is accepted in your name, and the creator is told.', ok: 'Approve and accept' }))) return;
		run('approval_decide', { p_id: a.id, p_approve: yes }, yes ? 'Approved and accepted' : 'Declined; whoever asked can talk to the creator');
	}
	const at = (a: Team['approvals'][number]) => (a.slug === pageSlug ? `/brand/r/${a.code}` : addressFor(a.slug, `/brand/r/${a.code}`));
</script>


{#if !t}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="tm">
		<section class="tm-card">
			<div class="tm-hd">
				<span class="tm-k">Your team</span>
				{#if admin}<button class="tm-neo tm-grad" onclick={() => (inviting = !inviting)} aria-expanded={inviting}>Invite someone</button>{/if}
			</div>
			{#if inviting}
				<form class="tm-inv" onsubmit={invite}>
					<input class="tm-in" type="email" placeholder="Work email" aria-label="Email" bind:value={email} required />
					<input class="tm-in" placeholder="Name (optional)" aria-label="Name" bind:value={name} />
					<Select size="sm" ariaLabel="Role" bind:value={role} options={ROLES} />
					<button class="tm-neo tm-light">Send invite</button>
					<small>They get an email with a sign-in link, and see your companies once they sign in.</small>
				</form>
			{/if}
			<div class="tm-row">
				<span class="tm-av a1">{initials(t.owner.name || t.owner.email)}</span>
				<span class="tm-who"><b>{t.owner.name || t.owner.email}</b><small>{t.owner.email}{t.owner.you ? ' · you' : ''}</small></span>
				<span class="tm-role">Admin</span>
			</div>
			{#each t.members as m, i (m.email)}
				<div class="tm-row">
					{#if m.joined}<span class="tm-av a{(i % 3) + 2}">{initials(m.name || m.email)}</span>{:else}<span class="tm-av tm-at">@</span>{/if}
					<span class="tm-who"><b>{m.joined ? m.name || m.email : m.email}</b><small class:tm-wait={!m.joined}>{m.joined ? `${m.email}${m.you ? ' · you' : ''}` : "Invited · hasn't signed in yet"}</small></span>
					{#if admin && !m.you}
						<span class="tm-sel"><Select size="sm" ariaLabel="Role for {m.email}" value={m.role} options={ROLES} onchange={(r: TeamRole) => run('team_set_role', { p_email: m.email, p_role: r }, `${m.name || m.email} is now ${ROLE_LABEL[r]}`)} /></span>
						<button class="tm-x" aria-label="Remove {m.email}" onclick={() => remove(m)}>×</button>
					{:else}
						<span class="tm-role" class:mine={m.you}>{ROLE_LABEL[m.role]}</span>
					{/if}
				</div>
			{/each}
			{#if !t.members.length && admin}<p class="tm-empty">Invite the people who work with creators: marketing, accounts, an agency.</p>{/if}
			<div class="tm-notes">
				{#each ROLES as r (r.value)}<span><b>{r.label}:</b> {ROLE_NOTE[r.value]}</span>{/each}
			</div>
		</section>

		<div class="tm-side">
			<section class="tm-card">
				<div class="tm-hd">
					<b class="tm-t">Approvals</b>
					<button
						class="tm-sw"
						role="switch"
						aria-checked={t.approval_on}
						aria-label="Approvals"
						disabled={!admin}
						onclick={() => run('team_settings', { p_on: !t.approval_on, p_limit: Number(limit) || t.approval_limit }, t.approval_on ? 'Approvals off' : 'Approvals on')}
					><i></i></button>
				</div>
				<p class="tm-p">
					Quotes over
					{#if admin}<span class="tm-lim">₹<input inputmode="numeric" aria-label="Limit" bind:value={limit} onblur={saveLimit} onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} /></span>{:else}<b>{inr(t.approval_limit)}</b>{/if}
					need an Admin or Approver to accept{t.approval_on ? '' : ' (off for now)'}. Members can still review and ask for changes.
				</p>
			</section>
			{#if t.approvals.length}
				<section class="tm-card tm-hot">
					<span class="tm-k hot">Waiting for approval · {t.approvals.length}</span>
					{#each t.approvals as a (a.id)}
						<div class="tm-ap">
							<b>{firstName(a.creator)}'s quote: {inr(a.total)}</b>
							<small>{[a.campaign, a.by ? `asked by ${a.by}` : ''].filter(Boolean).join(' · ')}</small>
							<div class="tm-ab">
								{#if decider}
									<button class="tm-neo tm-grad" onclick={() => decide(a, true)}>Approve and accept</button>
									<button class="tm-neo tm-ghost" onclick={() => decide(a, false)}>Decline</button>
								{/if}
								<a class="tm-neo tm-ghost" href={at(a)}>Open</a>
							</div>
						</div>
					{/each}
				</section>
			{/if}
		</div>
	</div>
{/if}

<style>
	.tm {
		display: grid;
		/* Inside Settings the panel is narrow: the team, then approvals below it. */
		grid-template-columns: minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}
	.tm-side {
		display: grid;
		gap: 14px;
	}
	.tm-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.tm-hot {
		background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g3) 14%, transparent), transparent 60%), var(--surface);
	}
	.tm-hd {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.tm-k {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.tm-k.hot {
		color: var(--g3);
	}
	.tm-t {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 24px;
	}
	.tm-neo {
		height: 40px;
		display: inline-grid;
		place-items: center;
		padding: 0 14px;
		border: 0;
		cursor: pointer;
		text-decoration: none;
		font: 700 11.5px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.tm-grad {
		background: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3));
		color: var(--on-grad);
		box-shadow: 3px 3px 0 color-mix(in oklab, var(--g1) 70%, black);
	}
	.tm-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--g2);
	}
	.tm-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.tm-inv {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		padding: 14px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ink) 4%, transparent);
	}
	.tm-inv small {
		flex-basis: 100%;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.tm-in {
		flex: 1 1 180px;
		min-width: 0;
		padding: 10px 12px;
		border: 0;
		border-radius: 10px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 400 14px/1.4 var(--f-body);
	}
	.tm-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.tm-av {
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 700;
		color: #fff;
	}
	.a1 {
		background: linear-gradient(135deg, var(--g1), var(--g2));
	}
	.a2 {
		background: linear-gradient(135deg, #4ccfc2, #7ea2ff);
	}
	.a3 {
		background: linear-gradient(135deg, var(--g3), var(--g2));
	}
	.a4 {
		background: linear-gradient(135deg, var(--g1), #7ea2ff);
	}
	.tm-at {
		color: var(--ink-3);
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
	}
	.tm-who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.tm-who b {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tm-who small {
		font-size: 12.5px;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tm-who small.tm-wait {
		color: var(--g3);
	}
	.tm-role {
		font-size: 12.5px;
		font-weight: 700;
		padding: 6px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		color: var(--g2);
	}
	.tm-sel {
		flex: none;
		width: 132px;
	}
	.tm-x {
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--ink-3);
		font-size: 20px;
		cursor: pointer;
	}
	.tm-x:hover {
		color: var(--bad);
	}
	.tm-empty {
		margin: 0;
		padding: 10px 0;
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.tm-notes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		padding-top: 6px;
		font-size: 12.5px;
		color: var(--ink-3);
		line-height: 1.45;
	}
	.tm-notes b {
		color: var(--ink);
	}
	.tm-sw {
		position: relative;
		flex: none;
		width: 44px;
		height: 26px;
		border: 0;
		border-radius: 99px;
		background: var(--line-strong);
		cursor: pointer;
		transition: background 0.2s;
	}
	.tm-sw[aria-checked='true'] {
		background: var(--ok);
	}
	.tm-sw:disabled {
		cursor: default;
		opacity: 0.7;
	}
	.tm-sw i {
		position: absolute;
		left: 3px;
		top: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.2s;
	}
	.tm-sw[aria-checked='true'] i {
		transform: translateX(18px);
	}
	.tm-p {
		margin: 0;
		font-size: 14px;
		color: var(--ink-2);
		line-height: 1.6;
	}
	.tm-p b {
		color: var(--ink);
	}
	.tm-lim {
		display: inline-flex;
		align-items: center;
		padding: 0 8px;
		border-radius: 8px;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font-weight: 700;
	}
	.tm-lim input {
		width: 7ch;
		padding: 3px 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
	}
	.tm-ap {
		display: grid;
		gap: 4px;
		padding-top: 6px;
	}
	.tm-ap + .tm-ap {
		margin-top: 6px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}
	.tm-ap b {
		font-size: 16px;
		font-weight: 600;
	}
	.tm-ap small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.tm-ab {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 8px;
	}
	@media (max-width: 860px) {
		.tm {
			grid-template-columns: minmax(0, 1fr);
		}
		.tm-side {
			order: -1;
		}
		.tm-notes {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
