import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const handle = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        await register(form.name, form.email, form.password);
        toast.success('Account created!');
      } else {
        await login(form.email, form.password);
        toast.success('Welcome back!');
      }
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-dark mb-4">
            <BarChart3 size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">VizoDesk</h1>
          <p className="text-slate-500 text-sm mt-1">Creative Business Manager</p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-5">
            {isRegister ? 'Create account' : 'Sign in'}
          </h2>

          <form onSubmit={submit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="label">Full Name</label>
                <input
                  name="name" type="text" required className="input"
                  placeholder="Your Name" value={form.name} onChange={handle}
                />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                name="email" type="email" required className="input"
                placeholder="you@example.com" value={form.email} onChange={handle}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  name="password" type={showPass ? 'text' : 'password'} required
                  className="input pr-10" placeholder="••••••••"
                  value={form.password} onChange={handle} minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full justify-center mt-2" disabled={loading}>
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (isRegister ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsRegister(s => !s)}
              className="text-brand hover:text-brand-light font-medium"
            >
              {isRegister ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
