import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// Options tailored for `tauri dev` / `tauri build`.
export default defineConfig({
    plugins: [tailwindcss(), svelte()],
    // Keep Rust compiler errors visible in the terminal.
    clearScreen: false,
    server: {
        // tauri.conf.json `devUrl` points at this exact port.
        port: 1420,
        strictPort: true,
        watch: { ignored: ['**/src-tauri/**'] },
    },
    build: {
        // Every webview Tauri targets supports ES2022.
        target: 'es2022',
    },
    test: {
        include: ['src/**/*.test.ts'],
    },
});
