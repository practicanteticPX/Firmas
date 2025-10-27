import { useState } from 'react'
import Login from './components/login/Login.jsx'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)

  const handleLogin = (token, userData) => {
    // Guardar el token en localStorage
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))

    setIsAuthenticated(true)
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setIsAuthenticated(false)
    setUser(null)
  }

  return (
    <>
      {!isAuthenticated ? (
        <Login onLogin={handleLogin} />
      ) : (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h1>Bienvenido, {user?.name || user?.email}</h1>
          <button onClick={handleLogout}>Cerrar Sesión</button>
        </div>
      )}
    </>
  )
}

export default App
