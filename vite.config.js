import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Replace 'grocery-tracker' with your actual GitHub repo name
  base: '/grocery-tracker/',
  optimizeDeps: {
    exclude: ['tesseract.js']
  }
})
