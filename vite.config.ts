import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      optimizeDeps: {
        // Exclude these from Vite's dependency pre-bundling.
        // This is necessary because we are loading them from a CDN via an importmap.
        // Vite will let the browser handle the import instead of looking for them
        // in node_modules, thus resolving potential 404 errors.
        exclude: ['react', 'react-dom', 'react-leaflet']
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
    };
});
