\
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // harmless unless you import 'axios'; prevents build errors without the package
      axios: path.resolve(process.cwd(), 'src/shims/axios.js'),
    },
  },
})
