import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/index.css'
import { initTheme } from './themes'
import { initDisplay } from './ui/display'

initTheme()
initDisplay()

createRoot(document.getElementById('root')!).render(<App />)
