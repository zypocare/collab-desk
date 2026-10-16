import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// The app is a single-page app: every page loads data in the browser through Supabase.
			// Cloudflare Pages serves index.html for any path that has no file, so deep links work.
			adapter: adapter({ fallback: 'index.html' }),

			// Check for a new deploy every 2 minutes. Once there is one, moving to another screen
			// reloads the page instead of asking for files the old version had (they no longer exist).
			version: { pollInterval: 120_000 },

			// We register the service worker ourselves as a classic script (lib/pwa.svelte.ts):
			// some phones (older iPhones) refuse a "module" service worker, which stops alerts.
			serviceWorker: { register: false }
		})
	]
});
