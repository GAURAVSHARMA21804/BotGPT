"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  authForgotPassword,
  authLogin,
  authRegister,
  authResetPassword
} from "@/lib/auth";
import "./auth.css";

type Tab = "in" | "up";

export default function LoginPage() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const [tab, setTab] = useState<Tab>("in");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const [successSub, setSuccessSub] = useState("");

  const [inEmail, setInEmail] = useState("");
  const [inPass, setInPass] = useState("");
  const [inEmailErr, setInEmailErr] = useState(false);
  const [inPassErr, setInPassErr] = useState(false);
  const [inPassVisible, setInPassVisible] = useState(false);
  const [inLoading, setInLoading] = useState(false);

  const [upFname, setUpFname] = useState("");
  const [upLname, setUpLname] = useState("");
  const [upEmail, setUpEmail] = useState("");
  const [upPass, setUpPass] = useState("");
  const [upNameErr, setUpNameErr] = useState(false);
  const [upEmailErr, setUpEmailErr] = useState(false);
  const [upPassErr, setUpPassErr] = useState(false);
  const [upTermsErr, setUpTermsErr] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [upPassVisible, setUpPassVisible] = useState(false);
  const [upLoading, setUpLoading] = useState(false);
  const [strengthScore, setStrengthScore] = useState(0);

  const [fgEmail, setFgEmail] = useState("");
  const [fgLoading, setFgLoading] = useState(false);
  const [fgResetToken, setFgResetToken] = useState<string | null>(null);
  const [fgNewPass, setFgNewPass] = useState("");

  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);

  const toggleTheme = () => setIsDark((d) => !d);

  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    window.setTimeout(() => setToastShow(false), 2600);
  }, []);

  const switchTab = (t: Tab) => {
    setTab(t);
    setForgotOpen(false);
    setSuccessOpen(false);
  };

  const checkStrength = (val: string) => {
    if (val.length === 0) {
      setStrengthScore(0);
      return;
    }
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    setStrengthScore(score);
  };

  const strengthClass = (barIndex: number) => {
    if (strengthScore === 0 || barIndex >= strengthScore) return "sbar";
    const classes = ["weak", "fair", "good", "strong"] as const;
    return `sbar ${classes[strengthScore - 1]}`;
  };

  const strengthLabel = () => {
    if (strengthScore === 0) return "Enter a password";
    const labels = ["Weak", "Fair", "Good", "Strong"];
    return labels[strengthScore - 1];
  };

  const showSuccess = (title: string, sub: string) => {
    setSuccessTitle(title);
    setSuccessSub(sub);
    setSuccessOpen(true);
    setForgotOpen(false);
  };

  const resetAll = () => {
    setSuccessOpen(false);
    setTab("in");
    setInEmail("");
    setInPass("");
  };

  const doLogin = async () => {
    let ok = true;
    if (!validEmail(inEmail)) {
      setInEmailErr(true);
      ok = false;
    } else setInEmailErr(false);
    if (inPass.length < 6) {
      setInPassErr(true);
      ok = false;
    } else setInPassErr(false);
    if (!ok) return;
    setInLoading(true);
    try {
      await authLogin(inEmail.trim(), inPass);
      showSuccess("Welcome back! 👋", "Redirecting to chat…");
      window.setTimeout(() => router.push("/chat"), 900);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Login failed");
    } finally {
      setInLoading(false);
    }
  };

  const doSignup = async () => {
    let ok = true;
    if (!upFname.trim()) {
      setUpNameErr(true);
      ok = false;
    } else setUpNameErr(false);
    if (!validEmail(upEmail)) {
      setUpEmailErr(true);
      ok = false;
    } else setUpEmailErr(false);
    if (upPass.length < 8) {
      setUpPassErr(true);
      ok = false;
    } else setUpPassErr(false);
    if (!termsChecked) {
      setUpTermsErr(true);
      ok = false;
    } else setUpTermsErr(false);
    if (!ok) return;
    setUpLoading(true);
    try {
      await authRegister({
        email: upEmail.trim(),
        password: upPass,
        first_name: upFname.trim() || null,
        last_name: upLname.trim() || null
      });
      showSuccess(
        "Account created! 🎉",
        `Welcome to BotGPT, ${upFname.trim()}. Redirecting to chat…`
      );
      window.setTimeout(() => router.push("/chat"), 900);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setUpLoading(false);
    }
  };

  const doForgot = async () => {
    const email = fgEmail.trim();
    if (!validEmail(email)) {
      showToast("Please enter a valid email address");
      return;
    }
    setFgLoading(true);
    try {
      const data = await authForgotPassword(email);
      if (data.reset_token) {
        setFgResetToken(data.reset_token);
        showToast("Dev mode: enter a new password below.");
      } else {
        showToast(data.message);
        setForgotOpen(false);
        setFgResetToken(null);
        setTab("in");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Request failed");
    } finally {
      setFgLoading(false);
    }
  };

  const doResetPassword = async () => {
    if (!fgResetToken || fgNewPass.length < 8) {
      showToast("Password must be at least 8 characters");
      return;
    }
    setFgLoading(true);
    try {
      const data = await authResetPassword(fgResetToken, fgNewPass);
      showToast(data.message);
      setForgotOpen(false);
      setFgResetToken(null);
      setFgNewPass("");
      setTab("in");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setFgLoading(false);
    }
  };

  const socialLogin = (provider: string) => {
    showToast(`Connecting to ${provider}…`);
    window.setTimeout(() => {
      showSuccess(`Connected via ${provider} ✓`, "Redirecting to your dashboard…");
    }, 1400);
  };

  const tabsVisible = !forgotOpen && !successOpen;

  return (
    <div className="auth-page" data-theme={isDark ? "dark" : "light"}>
      <div className="left">
        <div className="l-logo">
          <div className="lmk">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
            </svg>
          </div>
          <div className="lname-big">
            Bot<span>GPT</span>
          </div>
        </div>

        <div className="l-mid">
          <div className="l-headline">
            Your AI,
            <br />
            your documents,
            <br />
            one interface.
          </div>
          <div className="l-sub">
            Chat intelligently with your documents using RAG-powered AI that understands context and
            retrieves exactly what you need.
          </div>
          <div className="feat-list">
            <div className="feat">
              <div className="feat-dot">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
              </div>
              <div className="feat-text">
                <b>RAG over any document</b> — PDF, Markdown, plain text, DOCX
              </div>
            </div>
            <div className="feat">
              <div className="feat-dot">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                </svg>
              </div>
              <div className="feat-text">
                <b>Full conversation history</b> — resume any chat, anytime
              </div>
            </div>
            <div className="feat">
              <div className="feat-dot">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                </svg>
              </div>
              <div className="feat-text">
                <b>Powered by Llama 3.1</b> — fast, free, production-ready
              </div>
            </div>
          </div>
        </div>

        <div className="l-foot">© 2025 BotGPT · v2.1.0</div>
      </div>

      <div className="right">
        <button
          type="button"
          className="theme-btn"
          onClick={toggleTheme}
          title="Toggle theme"
          aria-label="Toggle light and dark theme"
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        <div className="card panel">
          {tabsVisible ? (
            <div className="tabs" role="tablist">
              <button
                type="button"
                className={`tab ${tab === "in" ? "on" : ""}`}
                onClick={() => switchTab("in")}
                role="tab"
                aria-selected={tab === "in"}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`tab ${tab === "up" ? "on" : ""}`}
                onClick={() => switchTab("up")}
                role="tab"
                aria-selected={tab === "up"}
              >
                Create Account
              </button>
            </div>
          ) : null}

          {!successOpen && !forgotOpen && tab === "in" ? (
            <div id="form-in">
              <div className="fh">
                <div className="ftitle">Welcome back</div>
                <div className="fsub">Sign in to continue your conversations</div>
              </div>

              <div className="divider">
                <div className="dvline" />
                <div className="dvtxt">continue with email</div>
                <div className="dvline" />
              </div>

              <div className="form" style={{ marginTop: 16 }}>
                <div className="fgrp">
                  <label className="flbl" htmlFor="in-email">
                    Email
                  </label>
                  <div className="finput-wrap">
                    <input
                      className={`finput ${inEmailErr ? "err" : ""}`}
                      type="email"
                      id="in-email"
                      placeholder="you@example.com"
                      value={inEmail}
                      onChange={(e) => {
                        setInEmail(e.target.value);
                        setInEmailErr(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && doLogin()}
                    />
                    <div className="fi-icon">
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                      </svg>
                    </div>
                  </div>
                  <div className={`err-msg ${inEmailErr ? "show" : ""}`}>
                    Please enter a valid email address
                  </div>
                </div>

                <div className="fgrp">
                  <div className="forgot-row">
                    <label className="flbl" htmlFor="in-pass">
                      Password
                    </label>
                    <button
                      type="button"
                      className="forgot-link"
                      onClick={() => {
                        setFgResetToken(null);
                        setForgotOpen(true);
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="finput-wrap finput-wrap-trailing">
                    <input
                      className={`finput ${inPassErr ? "err" : ""}`}
                      type={inPassVisible ? "text" : "password"}
                      id="in-pass"
                      placeholder="Enter your password"
                      value={inPass}
                      onChange={(e) => {
                        setInPass(e.target.value);
                        setInPassErr(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && doLogin()}
                    />
                    <div className="fi-icon">
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      className="fi-right"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setInPassVisible((v) => !v)}
                      aria-label={inPassVisible ? "Hide password" : "Show password"}
                    >
                      <svg viewBox="0 0 24 24" style={{ opacity: inPassVisible ? 0.45 : 1 }} aria-hidden>
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                    </button>
                  </div>
                  <div className={`err-msg ${inPassErr ? "show" : ""}`}>
                    Password must be at least 6 characters
                  </div>
                </div>

                <button
                  type="button"
                  className={`submit ${inLoading ? "loading" : ""}`}
                  id="in-btn"
                  onClick={doLogin}
                  disabled={inLoading}
                >
                  <div className="spin" />
                  <span className="btn-label">Sign In →</span>
                </button>
              </div>

              <div className="foot-note" style={{ marginTop: 20 }}>
                Don&apos;t have an account?{" "}
                <button type="button" className="foot-note-link" onClick={() => switchTab("up")}>
                  Create one free
                </button>
              </div>
            </div>
          ) : null}

          {!successOpen && !forgotOpen && tab === "up" ? (
            <div id="form-up">
              <div className="fh">
                <div className="ftitle">Create account</div>
                <div className="fsub">Start chatting with your documents today</div>
              </div>


              <div className="divider">
                <div className="dvline" />
                <div className="dvtxt">fill in details</div>
                <div className="dvline" />
              </div>

              <div className="form" style={{ marginTop: 16 }}>
                <div className="name-row">
                  <div className="fgrp">
                    <label className="flbl" htmlFor="up-fname">
                      First name
                    </label>
                    <div className="finput-wrap">
                      <input
                        className={`finput no-icon ${upNameErr ? "err" : ""}`}
                        type="text"
                        id="up-fname"
                        placeholder="Arjun"
                        value={upFname}
                        onChange={(e) => {
                          setUpFname(e.target.value);
                          setUpNameErr(false);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && doSignup()}
                      />
                    </div>
                  </div>
                  <div className="fgrp">
                    <label className="flbl" htmlFor="up-lname">
                      Last name
                    </label>
                    <div className="finput-wrap">
                      <input
                        className="finput no-icon"
                        type="text"
                        id="up-lname"
                        placeholder="Kumar"
                        value={upLname}
                        onChange={(e) => setUpLname(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className={`err-msg ${upNameErr ? "show" : ""}`}>Please enter your first name</div>

                <div className="fgrp">
                  <label className="flbl" htmlFor="up-email">
                    Email
                  </label>
                  <div className="finput-wrap">
                    <input
                      className={`finput ${upEmailErr ? "err" : ""}`}
                      type="email"
                      id="up-email"
                      placeholder="you@example.com"
                      value={upEmail}
                      onChange={(e) => {
                        setUpEmail(e.target.value);
                        setUpEmailErr(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && doSignup()}
                    />
                    <div className="fi-icon">
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                      </svg>
                    </div>
                  </div>
                  <div className={`err-msg ${upEmailErr ? "show" : ""}`}>
                    Please enter a valid email address
                  </div>
                </div>

                <div className="fgrp">
                  <label className="flbl" htmlFor="up-pass">
                    Password
                  </label>
                  <div className="finput-wrap finput-wrap-trailing">
                    <input
                      className={`finput ${upPassErr ? "err" : ""}`}
                      type={upPassVisible ? "text" : "password"}
                      id="up-pass"
                      placeholder="Create a strong password"
                      value={upPass}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUpPass(v);
                        checkStrength(v);
                        setUpPassErr(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && doSignup()}
                    />
                    <div className="fi-icon">
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                      </svg>
                    </div>
                    <button
                      type="button"
                      className="fi-right"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setUpPassVisible((v) => !v)}
                      aria-label={upPassVisible ? "Hide password" : "Show password"}
                    >
                      <svg viewBox="0 0 24 24" style={{ opacity: upPassVisible ? 0.45 : 1 }} aria-hidden>
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                    </button>
                  </div>
                  <div className={`strength-wrap ${upPass.length > 0 ? "show" : ""}`}>
                    <div className="strength-bars">
                      <div className={strengthClass(0)} id="sb1" />
                      <div className={strengthClass(1)} id="sb2" />
                      <div className={strengthClass(2)} id="sb3" />
                      <div className={strengthClass(3)} id="sb4" />
                    </div>
                    <div className="strength-label">{strengthLabel()}</div>
                  </div>
                  <div className={`err-msg ${upPassErr ? "show" : ""}`}>
                    Password must be at least 8 characters
                  </div>
                </div>

                <div
                  className="check-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setTermsChecked((c) => !c);
                    setUpTermsErr(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setTermsChecked((c) => !c);
                      setUpTermsErr(false);
                    }
                  }}
                >
                  <div className={`checkbox ${termsChecked ? "checked" : ""}`} id="terms-chk">
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </div>
                  <div className="check-text">
                    I agree to the{" "}
                    <a
                      href="#terms"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showToast("Terms of Service");
                      }}
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="#privacy"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showToast("Privacy Policy");
                      }}
                    >
                      Privacy Policy
                    </a>
                  </div>
                </div>
                <div className={`err-msg ${upTermsErr ? "show" : ""}`}>
                  You must agree to the terms to continue
                </div>

                <button
                  type="button"
                  className={`submit ${upLoading ? "loading" : ""}`}
                  id="up-btn"
                  onClick={doSignup}
                  disabled={upLoading}
                >
                  <div className="spin" />
                  <span className="btn-label">Create Account →</span>
                </button>
              </div>

              <div className="foot-note" style={{ marginTop: 20 }}>
                Already have an account?{" "}
                <button type="button" className="foot-note-link" onClick={() => switchTab("in")}>
                  Sign in
                </button>
              </div>
            </div>
          ) : null}

          {forgotOpen && !successOpen ? (
            <div id="form-forgot">
              <div className="fh">
                <div className="ftitle">Reset password</div>
                <div className="fsub">
                  {fgResetToken
                    ? "Enter a new password (dev: token received from previous step)."
                    : "We’ll email a reset link when email is configured. In dev, you’ll set a new password here."}
                </div>
              </div>
              <div className="form">
                {!fgResetToken ? (
                  <>
                    <div className="fgrp">
                      <label className="flbl" htmlFor="fg-email">
                        Email address
                      </label>
                      <div className="finput-wrap">
                        <input
                          className="finput"
                          type="email"
                          id="fg-email"
                          placeholder="you@example.com"
                          value={fgEmail}
                          onChange={(e) => setFgEmail(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && doForgot()}
                        />
                        <div className="fi-icon">
                          <svg viewBox="0 0 24 24" aria-hidden>
                            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`submit ${fgLoading ? "loading" : ""}`}
                      id="fg-btn"
                      onClick={doForgot}
                      disabled={fgLoading}
                    >
                      <div className="spin" />
                      <span className="btn-label">Send Reset Link →</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="fgrp">
                      <label className="flbl" htmlFor="fg-new">
                        New password
                      </label>
                      <div className="finput-wrap">
                        <input
                          className="finput no-icon"
                          type="password"
                          id="fg-new"
                          placeholder="At least 8 characters"
                          value={fgNewPass}
                          onChange={(e) => setFgNewPass(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && doResetPassword()}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`submit ${fgLoading ? "loading" : ""}`}
                      onClick={doResetPassword}
                      disabled={fgLoading}
                    >
                      <div className="spin" />
                      <span className="btn-label">Update password →</span>
                    </button>
                  </>
                )}
                <div className="foot-note">
                  <button
                    type="button"
                    className="foot-note-link"
                    onClick={() => {
                      setForgotOpen(false);
                      setFgResetToken(null);
                    }}
                  >
                    ← Back to sign in
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {successOpen ? (
            <div className="success-screen show" id="success-screen">
              <div className="success-ico">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
              <div className="success-t">{successTitle}</div>
              <div className="success-sub">{successSub}</div>
              <button type="button" className="back-btn" onClick={resetAll}>
                ← Back to sign in
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className={`toast ${toastShow ? "show" : ""}`} id="toastEl">
        {toastMsg}
      </div>
    </div>
  );
}
