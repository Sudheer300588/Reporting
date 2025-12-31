import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Ensure base is set to root
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})