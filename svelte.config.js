import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// default options are static by default
			pages: 'dist', // Output directory for HTML pages
			assets: 'dist', // Output directory for static assets
			fallback: 'index.html', // Serve this file for client-side routing
			precompress: false, // Optional: for gzipping/brotiing assets
			strict: true // Optional: strict build
		})
		// Ensure that any server-side logic (like +server.ts files) that is not prerendered
		// is removed if you're building a purely static app.
		// For a basic app with only local storage, this might not be an issue.
		// If you have server-side routes, they will be stripped out by adapter-static.
		// Ensure all data fetching is done client-side (e.g., using fetch in +page.js or onMount).
	}
};

export default config;
