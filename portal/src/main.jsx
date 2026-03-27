import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import InvoiceView from './InvoiceView.jsx'
import './index.css'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/booking/:token" element={<App />} />
        <Route path="/client/:token" element={<App />} />
        <Route path="/contract/:token" element={<App />} />
        <Route path="/payment/:token" element={<App />} />
        <Route path="/invoice/:token" element={<InvoiceView />} />
        <Route
          path="*"
          element={
            <div className="min-h-screen bg-zinc-950 text-slate-400 flex items-center justify-center p-6 text-center text-sm">
              <p>Invalid or missing link. Use the booking URL your photographer sent you.</p>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
    <Toaster
      position="top-center"
      toastOptions={{
        style: { background: '#16161d', color: '#e2e8f0', border: '1px solid #2a2a38', borderRadius: '12px' },
        success: { iconTheme: { primary: '#c026d3', secondary: '#fff' } }
      }}
    />
  </React.StrictMode>,
)
