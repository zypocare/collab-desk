import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The admin panel is one static page: Vite builds it into dist/, Cloudflare serves it.
export default defineConfig({
	plugins: [svelte()],
	server: { port: 5180 },
	preview: { port: 5181 }
});
