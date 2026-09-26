import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { boot } from './data/market'

boot() // start feeds before first render so pages never race the mode switch

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
