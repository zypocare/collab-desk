// Moves an element to the end of <body>, so a dialog opened from inside a card (which may have a
// transform or animation) still covers the whole window instead of being trapped inside the card.
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
