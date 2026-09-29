"use client";
import { useEffect, useRef, useState } from "react";
import { LanguageSelect, useLanguage } from "@/components/language-provider";
import { supabase } from "@/lib/supabase";
import {
  resendEmailCode,
  verificationPurpose,
  verifyEmailCode,
  type VerificationPurpose,
} from "@/lib/email-verification";
export default function VerifyEmail() {
  const { t } = useLanguage();
  const [purpose, setPurpose] = useState<VerificationPurpose>("signup");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [signupSent, setSignupSent] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    setPurpose(
      verificationPurpose(
        new URLSearchParams(window.location.search).get("type"),
      ),
    );
    const params = new URLSearchParams(window.location.search);
    setSignupSent(
      params.get("type") === "signup" && params.get("sent") === "1",
    );
    try {
      setEmail(sessionStorage.getItem("yvonne-verification-email") || "");
      const sentAt = Number(
        sessionStorage.getItem("yvonne-verification-sent-at") || 0,
      );
      setCooldown(
        Math.max(
          0,
          Math.min(60, Math.ceil((sentAt + 60000 - Date.now()) / 1000)),
        ),
      );
    } catch {}
    // Visiting this page never verifies a token or sends an email.
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setHint("");
    try {
      if (!supabase) throw new Error("Supabase 尚未配置");
      const result = await verifyEmailCode(supabase.auth, purpose, email, code);
      setCode("");
      if (!result.complete) {
        setHint(
          purpose === "email_change"
            ? "此邮箱已确认。请继续提交另一封邮件的验证码，并将邮箱改为接收那封邮件的地址。"
            : "验证请求已处理。请返回登录；若仍提示未验证，请重新获取验证码。",
        );
        return;
      }
      try {
        sessionStorage.removeItem("yvonne-verification-email");
        sessionStorage.removeItem("yvonne-verification-sent-at");
      } catch {}
      window.location.replace(result.recovery ? "/?recovery=1" : "/");
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setError(
        err.code === "otp_expired" || err.code === "access_denied"
          ? "验证码无效或已过期，请核对邮箱并使用最新验证码。"
          : err.message || "验证失败，请稍后重试。",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function resend() {
    if (locked.current || cooldown) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请先填写有效邮箱");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setHint("");
    setCooldown(60);
    try {
      sessionStorage.setItem("yvonne-verification-sent-at", String(Date.now()));
    } catch {}
    try {
      if (!supabase) throw new Error("Supabase 尚未配置");
      await resendEmailCode(
        supabase.auth,
        purpose,
        email,
        window.location.origin,
      );
      setHint(
        "如该邮箱符合本次验证条件，我们已发送邮件。请检查收件箱和垃圾邮件，并使用最新验证码。",
      );
    } catch (e) {
      setError((e as Error).message || "邮件发送失败，请稍后重试。");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="verification-layout">
      <section className="panel verification-card">
        <div className="auth-language">
          <LanguageSelect disabled={busy} />
        </div>
        <p className="eyebrow">YVONNE FITNESS</p>
        {signupSent && (
          <p className="verification-step">
            {t("第 2 步 / 共 2 步 · 验证邮箱")}
          </p>
        )}
        <h1>{t(signupSent ? "请查看邮箱，完成注册" : "输入邮件验证码")}</h1>
        {signupSent ? (
          <>
            <div className="success-box" role="status">
              <strong>{t("注册申请已提交")}</strong>
              <p>
                {t(
                  "验证码已发送，请在下方输入以完成邮箱验证。无需再次创建账号。",
                )}
              </p>
              {email && <strong className="verification-email">{email}</strong>}
            </div>
            <div className="verification-help">
              <strong>{t("没看到邮件？请检查垃圾邮件 / Spam 文件夹。")}</strong>
              <p>
                {t(
                  "邮件可能需要几分钟送达。若在垃圾邮件中找到，请标记为“非垃圾邮件”。需要重新发送时，请使用下方按钮，并输入最新验证码。",
                )}
              </p>
            </div>
          </>
        ) : (
          <p className="muted">
            {t("打开邮件，将验证码填写在这里。仅打开本页不会使用验证码。")}
          </p>
        )}
        <form onSubmit={submit}>
          {!signupSent && (
            <label>
              {t("验证用途")}
              <select
                value={purpose}
                disabled={busy}
                onChange={(e) => {
                  setPurpose(verificationPurpose(e.target.value));
                  setCode("");
                  setError("");
                  setHint("");
                }}
              >
                <option value="signup">{t("注册邮箱验证")}</option>
                <option value="recovery">{t("重置密码")}</option>
                <option value="email_change">{t("更改邮箱")}</option>
              </select>
            </label>
          )}
          <label>
            {t(purpose === "email_change" ? "接收验证码的邮箱" : "邮箱")}
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(e) => {
                setEmail(e.target.value);
                setCode("");
                setHint("");
              }}
            />
          </label>
          {purpose === "email_change" && (
            <p className="muted">
              {t(
                "输入旧邮箱收到的验证码时填写旧邮箱；输入新邮箱收到的验证码时填写新邮箱。若两边都收到邮件，需要分别完成验证。",
              )}
            </p>
          )}
          <label>
            {t("验证码")}
            <input
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9 ]{6,15}"
              maxLength={15}
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="inline-error">
              {t(error)}
            </p>
          )}
          {hint && (
            <p role="status" className="success-box">
              {t(hint)}
            </p>
          )}
          <button className="btn full" disabled={busy}>
            {t(
              busy
                ? "请稍候…"
                : signupSent
                  ? "验证邮箱并进入网站"
                  : "验证并继续",
            )}
          </button>
        </form>
        <div className="auth-links">
          {purpose !== "email_change" && (
            <button
              type="button"
              className="text-btn"
              disabled={busy || cooldown > 0}
              onClick={() => void resend()}
            >
              {cooldown
                ? t("{0} 秒后可重新发送", [cooldown])
                : t("重新发送验证码")}
            </button>
          )}
          {purpose === "email_change" && (
            <a href="/?page=settings">{t("返回设置重新申请邮箱变更")}</a>
          )}
          <a href="/">{t("返回登录")}</a>
        </div>
        <p className="muted">
          {t(
            "没有收到验证码？请确认邮箱填写正确。旧版链接已失效时，请重新发送邮件。",
          )}
        </p>
      </section>
    </main>
  );
}
