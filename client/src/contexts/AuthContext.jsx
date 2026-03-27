import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { CLIENT_PORTAL_STORAGE_KEY, readCachedPortalBaseUrl } from '../lib/portalLinks';

const AuthContext = createContext(null);

function persistPortalBase(url) {
  const s = String(url ?? '').trim();
  try {
    if (s) localStorage.setItem(CLIENT_PORTAL_STORAGE_KEY, s);
    else localStorage.removeItem(CLIENT_PORTAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientPortalBaseUrl, setClientPortalBaseUrl] = useState('');

  const refreshAppSettings = useCallback(async () => {
    try {
      const s = await api.getSettings();
      const u = s?.client_portal_base_url ? String(s.client_portal_base_url).trim() : '';
      persistPortalBase(u);
      setClientPortalBaseUrl(u || readCachedPortalBaseUrl());
      return s;
    } catch {
      const fallback = readCachedPortalBaseUrl();
      setClientPortalBaseUrl(fallback);
      return { client_portal_base_url: fallback || null };
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('vizo_token');
    if (token) {
      api
        .me()
        .then(async (data) => {
          setUser(data.user);
          await refreshAppSettings();
        })
        .catch(() => {
          localStorage.removeItem('vizo_token');
          setClientPortalBaseUrl(readCachedPortalBaseUrl());
        })
        .finally(() => setLoading(false));
    } else {
      setClientPortalBaseUrl(readCachedPortalBaseUrl());
      setLoading(false);
    }
  }, [refreshAppSettings]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    localStorage.setItem('vizo_token', data.token);
    setUser(data.user);
    await refreshAppSettings();
    return data.user;
  };

  const register = async (name, email, password) => {
    const data = await api.register(name, email, password);
    localStorage.setItem('vizo_token', data.token);
    setUser(data.user);
    await refreshAppSettings();
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('vizo_token');
    setUser(null);
    setClientPortalBaseUrl(readCachedPortalBaseUrl());
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        clientPortalBaseUrl,
        setClientPortalBaseUrl,
        refreshAppSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
