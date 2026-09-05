import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/contracts/donation/target/**', '**/contracts/donation/artifacts/**'],
    },
  },
})
