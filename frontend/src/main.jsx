import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './postgres.css'
import App from './App.jsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './services/queryClient'
import { ErrorBoundary } from 'react-error-boundary'
import ErrorFallback from './components/ErrorFallback'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)

