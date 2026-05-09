import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vite config replacing CRA + craco. Keeps support for:
//  - JSX inside .js files (CRA convention used across this codebase)
//  - process.env.REACT_APP_* (kept for backward compatibility — substituted at build)
//  - "@" alias to /src (was in jsconfig.json + craco webpack alias)
//  - build output dir "build" (matches Vercel/legacy expectations)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_')

  return {
    plugins: [
      react({
        // Allow JSX in .js files (CRA-style)
        include: /\.(js|jsx|ts|tsx)$/,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Treat .js files as JSX during dependency pre-bundling and source transform
    esbuild: {
      loader: 'jsx',
      include: [/src\/.*\.jsx?$/],
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: { '.js': 'jsx' },
      },
    },
    build: {
      outDir: 'build',
      sourcemap: false,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      // Allow external preview hosts (Emergent, Vercel preview URLs, etc.)
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    // Inject CRA-style env vars at build time so existing
    // `process.env.REACT_APP_BACKEND_URL` references keep working.
    define: {
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL || ''),
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
  }
})
