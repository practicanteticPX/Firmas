import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { // <--- Esta es la sección que necesitas añadir
    host: true, // Permite que Vite escuche en todas las interfaces de red (importante para Docker)
    port: 5173  // Asegura que el puerto sea el 5173
  }
})