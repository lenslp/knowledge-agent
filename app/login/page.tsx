"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase-browser";
import { Sparkles, Loader2 } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const supabase = getSupabaseBrowserClient();

    // 监听 OAuth 回调后的 session 变化
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
            if (session) window.location.href = "/";
        });
        return () => subscription.unsubscribe();
    }, [supabase]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        if (isSignUp) {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) {
                setError(error.message);
            } else {
                setMessage("注册成功！请前往邮箱点击验证链接后再登录。");
            }
        } else {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setError(error.message);
            }
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-[#1e1e19] flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <Sparkles className="w-6 h-6 text-[#d48c66]" />
                        <h1 className="text-xl font-serif text-[#e7e7e4]">Knowledge Agent</h1>
                    </div>
                    <p className="text-sm text-gray-500">{isSignUp ? "创建账号" : "登录继续"}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="邮箱"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-3 rounded-xl bg-[#2f2e27] border border-white/10 text-[#e7e7e4] placeholder:text-gray-500 focus:outline-none focus:border-white/30 text-sm"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full px-4 py-3 rounded-xl bg-[#2f2e27] border border-white/10 text-[#e7e7e4] placeholder:text-gray-500 focus:outline-none focus:border-white/30 text-sm"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                            {error}
                        </p>
                    )}
                    {message && (
                        <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                            {message}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-[#534032] hover:bg-[#6c5442] text-[#d48c66] font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isSignUp ? "注册" : "登录"}
                    </button>
                </form>

                {/* 分割线 */}
                <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-gray-500">或</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Google 登录 */}
                <button
                    type="button"
                    disabled={loading}
                    onClick={async () => {
                        setLoading(true);
                        const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
                        await supabase.auth.signInWithOAuth({
                            provider: "google",
                            options: { redirectTo: `${redirectUrl}/`, queryParams: { prompt: "select_account" } },
                        });
                        setLoading(false);
                    }}
                    className="w-full py-3 rounded-xl bg-[#2f2e27] hover:bg-[#3a3930] border border-white/10 text-[#e7e7e4] font-medium text-sm transition-colors flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    使用 Google 登录
                </button>

                <p className="text-center text-sm text-gray-500 mt-5">
                    {isSignUp ? "已有账号？" : "没有账号？"}
                    <button
                        type="button"
                        onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
                        className="text-[#d48c66] hover:underline ml-1"
                    >
                        {isSignUp ? "去登录" : "注册"}
                    </button>
                </p>
            </div>
        </div>
    );
}
