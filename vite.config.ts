import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:process.env.VITE_APP_BASE ?? '/app/',plugins:[react()],server:{host:'127.0.0.1',port:5174,proxy:{'/api':{target:'http://127.0.0.1:3001',changeOrigin:true,headers:{Origin:'http://127.0.0.1:3001'}}}}});
