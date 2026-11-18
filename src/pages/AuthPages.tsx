import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '../components/BrandMark';
import { useAuth } from '../context/AuthContext';
import { validateRegistrationInput } from '../lib/validation';
import { apiRequest } from '../services/api';

interface AuthPagesProps {
  mode: 'login' | 'register' | 'recover' | 'reset';
  onNavigate: (path: string) => void;
}

export function AuthPages({ mode, onNavigate }: AuthPagesProps) {
  const { login, register } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('token') || '';
    } catch {
      return '';
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
  }, [mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Preencha e-mail/usuário e senha.');
      return;
    }
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      onNavigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationErr = validateRegistrationInput({
      name,
      username,
      email,
      password,
      confirmPassword,
    });
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        confirmPassword,
      });
      onNavigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim()) {
      setError('Informe seu e-mail cadastrado.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/recover', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setSuccessMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar recuperação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!resetToken.trim()) {
      setError('Informe o código de recuperação recebido.');
      return;
    }
    if (password.length < 8 || password !== confirmPassword) {
      setError('A nova senha deve ter no mínimo 8 caracteres e coincidir com a confirmação.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: resetToken.trim(),
          newPassword: password,
          confirmPassword,
        }),
      });
      setSuccessMsg(res.message);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080D] text-[#F1F5F9] flex flex-col justify-between p-6">
      <div className="max-w-[1200px] w-full mx-auto flex items-center justify-between">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para início
        </a>
        <BrandLogo compact />
      </div>

      <div className="max-w-md w-full mx-auto my-10 rounded-2xl border border-white/10 bg-[#11131C] p-8">
        <h1 className="font-display text-2xl font-bold text-white mb-2">
          {mode === 'login' && 'Entrar na sua conta'}
          {mode === 'register' && 'Criar conta MINHA LIVE GAMES'}
          {mode === 'recover' && 'Recuperar acesso'}
          {mode === 'reset' && 'Redefinir senha'}
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          {mode === 'login' && 'Acesse seu painel, biblioteca de jogos e eventos ao vivo.'}
          {mode === 'register' && 'Crie sua conta para acessar jogos publicados, configurar eventos e transmitir ao vivo.'}
          {mode === 'recover' && 'Informe o e-mail vinculado à sua conta para registrar a recuperação.'}
          {mode === 'reset' && 'Informe o código de recuperação e defina uma nova senha segura.'}
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div role="status" className="mb-5 flex items-start gap-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-identifier" className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail ou nome de usuário
              </label>
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="username"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => onNavigate('/recuperar-senha')}
                  className="text-xs text-[#22D3EE] hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {submitting ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nome completo
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <div>
              <label htmlFor="reg-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nome de usuário
              </label>
              <input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex.: streamer_pro"
                autoComplete="username"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Senha (mínimo 8 caracteres)
              </label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <div>
              <label htmlFor="reg-confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirmar senha
              </label>
              <input
                id="reg-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {submitting ? 'Criando conta...' : 'Cadastrar e acessar painel'}
            </button>
          </form>
        )}

        {mode === 'recover' && (
          <form onSubmit={handleRecover} className="space-y-4">
            <div>
              <label htmlFor="rec-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail cadastrado
              </label>
              <input
                id="rec-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {submitting ? 'Enviando...' : 'Solicitar recuperação'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => onNavigate('/redefinir-senha')}
                className="text-xs text-[#22D3EE] hover:underline"
              >
                Já possui o código de recuperação? Redefinir senha
              </button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label htmlFor="reset-token" className="block text-xs font-medium text-slate-300 mb-1.5">
                Código / Token de recuperação
              </label>
              <input
                id="reset-token"
                type="text"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Cole o token recebido"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>
            <div>
              <label htmlFor="reset-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Nova senha (mínimo 8 caracteres)
              </label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>
            <div>
              <label htmlFor="reset-confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirmar nova senha
              </label>
              <input
                id="reset-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full rounded-lg border border-white/10 bg-[#07080D] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] text-white hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {submitting ? 'Atualizando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-white/10 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <>
              Ainda não tem conta?{' '}
              <button type="button" onClick={() => onNavigate('/cadastro')} className="text-[#22D3EE] font-medium hover:underline">
                Criar conta gratuita
              </button>
            </>
          ) : (
            <>
              Já possui uma conta?{' '}
              <button type="button" onClick={() => onNavigate('/login')} className="text-[#22D3EE] font-medium hover:underline">
                Fazer login
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-500 max-w-lg mx-auto">
        Autenticação segura com hash criptográfico scrypt e sessão assinada por HMAC no servidor. Consulte o README para variáveis de persistência na Vercel.
      </p>
    </div>
  );
}
