<script lang="ts" generics="T extends string | number">
	import { Select } from 'bits-ui';
	import Icon from './Icon.svelte';

	type Option = { value: T; label: string; hint?: string; disabled?: boolean };

	let {
		value = $bindable(),
		options,
		placeholder = 'Choose',
		id,
		ariaLabel,
		disabled = false,
		action = false,
		size,
		class: cls = '',
		style,
		onchange
	}: {
		value?: T;
		options: Option[];
		placeholder?: string;
		id?: string;
		ariaLabel?: string;
		disabled?: boolean;
		/** A menu of actions ("Add a line…"): shows the placeholder again after each pick. */
		action?: boolean;
		size?: 'sm';
		class?: string;
		style?: string;
		onchange?: (v: T) => void;
	} = $props();

	let open = $state(false);
	const key = $derived(action || value === undefined || value === null ? '' : String(value));
	const current = $derived(options.find((o) => String(o.value) === key));
	const items = $derived(options.map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled })));

	// What the menu shows as picked. Follows `value`, and goes back to empty for action menus.
	let inner = $state('');
	$effect.pre(() => {
		inner = key;
	});

	function pick(k: string) {
		const o = options.find((x) => String(x.value) === k);
		if (!o) return;
		if (action) queueMicrotask(() => (inner = ''));
		else value = o.value;
		onchange?.(o.value);
	}
</script>

<Select.Root type="single" bind:value={inner} onValueChange={pick} {items} {disabled} bind:open>
	<Select.Trigger {id} aria-label={ariaLabel} class="sel {size ?? ''} {cls}" {style}>
		<span class="sel-v" class:sel-none={!current}>{current?.label ?? placeholder}</span>
		<span class="sel-ic" class:up={open}><Icon name="chevR" /></span>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content class="pop sel-pop" sideOffset={6} collisionPadding={12}>
			<Select.ScrollUpButton class="sel-scroll"><Icon name="chevR" /></Select.ScrollUpButton>
			<Select.Viewport class="sel-vp">
				{#each options as o (String(o.value))}
					<Select.Item value={String(o.value)} label={o.label} disabled={o.disabled} class="sel-it">
						{#snippet children({ selected })}
							<span class="sel-l">{o.label}{#if o.hint}<small>{o.hint}</small>{/if}</span>
							{#if selected && !action}<span class="sel-ck"><Icon name="check" /></span>{/if}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
			<Select.ScrollDownButton class="sel-scroll down"><Icon name="chevR" /></Select.ScrollDownButton>
		</Select.Content>
	</Select.Portal>
</Select.Root>
