import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 如果你的 GitHub Repository 叫做 "wedding-app"，這裡就填 '/wedding-app/'
  base: '/w3dding-phonograph/', 
})