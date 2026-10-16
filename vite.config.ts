import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // happy-dom: markdown import uses DOMParser, which plain node doesn't have.
  test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] },
})
