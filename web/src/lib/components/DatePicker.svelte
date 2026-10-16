<script lang="ts">
	import { Calendar, Popover } from 'bits-ui';
	import { parseDate, today, type DateValue } from '@internationalized/date';
	import Icon from './Icon.svelte';

	const TZ = 'Asia/Kolkata';

	let {
		value = $bindable(''),
		id,
		ariaLabel,
		placeholder = 'Pick a date',
		min,
		clearable = true,
		disabled = false,
		size,
		class: cls = '',
		onchange
	}: {
		/** 'YYYY-MM-DD', or '' for no date (same as a native date input). */
		value?: string | null;
		id?: string;
		ariaLabel?: string;
		placeholder?: string;
		min?: string;
		clearable?: boolean;
		disabled?: boolean;
		size?: 'sm';
		class?: string;
		onchange?: (v: string) => void;
	} = $props();

	let open = $state(false);

	const parse = (s: string | null | undefined): DateValue | undefined => {
		if (!s) return undefined;
		try {
			return parseDate(s.slice(0, 10));
		} catch {
			return undefined;
		}
	};
	const picked = $derived(parse(value));
	const minValue = $derived(parse(min));
	const label = $derived(
		picked
			? new Date(picked.year, picked.month - 1, picked.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
			: ''
	);

	function set(v: string) {
		value = v;
		onchange?.(v);
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger {id} aria-label={ariaLabel} {disabled} class="sel date {size ?? ''} {cls}">
		<span class="sel-ic dp-ic"><Icon name="cal" /></span>
		<span class="sel-v" class:sel-none={!picked}>{label || placeholder}</span>
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content class="pop dp-pop" sideOffset={6} collisionPadding={12} align="start">
			<Calendar.Root
				type="single"
				value={picked}
				onValueChange={(d) => d && set(d.toString())}
				{minValue}
				weekdayFormat="short"
				fixedWeeks
				locale="en-IN"
				initialFocus
				class="dpk"
			>
				{#snippet children({ months, weekdays })}
					<Calendar.Header class="dp-h">
						<Calendar.PrevButton class="dp-nav" aria-label="Previous month"><Icon name="chevL" /></Calendar.PrevButton>
						<Calendar.Heading class="dp-title" />
						<Calendar.NextButton class="dp-nav" aria-label="Next month"><Icon name="chevR" /></Calendar.NextButton>
					</Calendar.Header>
					{#each months as month (month.value.toString())}
						<Calendar.Grid class="dp-grid">
							<Calendar.GridHead>
								<Calendar.GridRow class="dp-row">
									{#each weekdays as d (d)}<Calendar.HeadCell class="dp-wd">{d.slice(0, 2)}</Calendar.HeadCell>{/each}
								</Calendar.GridRow>
							</Calendar.GridHead>
							<Calendar.GridBody>
								{#each month.weeks as week, i (i)}
									<Calendar.GridRow class="dp-row">
										{#each week as date (date.toString())}
											<Calendar.Cell {date} month={month.value} class="dp-cell">
												<Calendar.Day class="dp-day" />
											</Calendar.Cell>
										{/each}
									</Calendar.GridRow>
								{/each}
							</Calendar.GridBody>
						</Calendar.Grid>
					{/each}
				{/snippet}
			</Calendar.Root>
			<div class="dp-foot">
				<button type="button" class="lnk" onclick={() => set(today(TZ).toString())}>Today</button>
				{#if clearable && picked}<button type="button" class="lnk muted" onclick={() => set('')}>Clear</button>{/if}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
