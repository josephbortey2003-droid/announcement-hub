"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { ArrowRight, Building2, Check, CircleAlert, Eye, EyeOff, GraduationCap, KeyRound, ShieldCheck } from "lucide-react";
import { Brand, ThemeSelect } from "@/components/workspace/chrome";
import { normalizeOrganizationCode } from "@/lib/organizations/code";
import type { OrganizationAccess } from "@/lib/supabase/browser-auth";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { brandFromAccess, viewerFromAccess } from "@/lib/workspace/access";
import { parseSignInIdentifier, type BrandData, type Portal, type ThemeMode, type Viewer } from "@/lib/workspace/model";

const MIN_PASSWORD_LENGTH = 15;

const roleInfo = {
  creator: { icon: Building2, label: "Organization owner", tabLabel: "Creator / Admin", title: "Create or manage a space", signInLabel: "Sign in as owner", help: "Manage people, authority, branding and delivery settings." },
  authority: { icon: ShieldCheck, label: "Authorized leader", tabLabel: "Authority", title: "Publish within your scope", signInLabel: "Sign in as authority", help: "Send announcements only to audiences assigned to you." },
  member: { icon: GraduationCap, label: "Member, staff or student", tabLabel: "Members", title: "Open your organization inbox", signInLabel: "Open your inbox", help: "Read verified announcements from your organization." },
};

const subtitles: Record<Portal, string> = {
  creator: "Sign in to manage your organization’s space.",
  authority: "Sign in to publish within your assigned scope.",
  member: "Sign in to read verified organization updates.",
};

type WelcomeProps = {
  onEnter: (portal: Portal, brand?: BrandData, viewer?: Viewer) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export function Welcome({ onEnter, theme, setTheme }: WelcomeProps) {
  const [role, setRole] = useState<Portal>("creator");
  const [method, setMethod] = useState<"password" | "code">("password");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [organizationCode, setOrganizationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileInstance>(undefined);

  const current = roleInfo[role];
  const Icon = current.icon;
  const backendReady = getPublicSupabaseConfig() !== null;
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const callbackUrl = (next?: string) => `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  // Read recovery and callback errors from the URL after hydration.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      setRecoveryMode(query.get("recovery") === "1");
      const authError = query.get("auth_error");
      if (authError) setFormError(authError === "missing_code" ? "The sign-in link is incomplete. Request a new secure link." : "The sign-in link could not be verified. Request a new link and try again.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const clearMessages = () => { setFormError(""); setFormNotice(""); };
  const resetCaptcha = () => { setCaptchaToken(""); captchaRef.current?.reset(); };
  const requireCaptcha = () => {
    if (turnstileSiteKey && !captchaToken) { setFormError("Complete the security check before continuing."); return false; }
    return true;
  };
  const unavailable = (name: string) => setFormError(`${name} requires a configured identity service and is not active in this local prototype.`);
  const enterAccess = (access: OrganizationAccess) => onEnter(access.portal, brandFromAccess(access), viewerFromAccess(access));

  const validateOwnerSetup = () => {
    if (fullName.trim().length < 2) { setFormError("Enter your full name."); return false; }
    if (organizationName.trim().length < 2) { setFormError("Enter your organization name."); return false; }
    if (normalizeOrganizationCode(organizationCode).length < 4) { setFormError("Use an organization code with at least four letters or numbers."); return false; }
    return true;
  };

  const updateRecoveredPassword = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) return setFormError(`Use a new password with at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirmPassword) return setFormError("The two passwords do not match.");
    setAuthBusy(true);
    try {
      const { getBrowserClient } = await import("@/lib/supabase/browser-auth");
      const { error } = await getBrowserClient().auth.updateUser({ password });
      if (error) throw error;
      setFormNotice("Your password has been updated. You can continue to your organization space.");
      setRecoveryMode(false);
      window.history.replaceState(null, "", window.location.pathname);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The password could not be updated.");
    } finally {
      setAuthBusy(false);
    }
  };

  const continueWithOrganization = async () => {
    clearMessages();
    if (!backendReady) return unavailable(authMode === "signup" ? "Account creation" : method === "password" ? "Password sign-in" : "One-time-code sign-in");
    if (recoveryMode) return updateRecoveredPassword();
    if (authMode === "signup" && !validateOwnerSetup()) return;

    const contact = parseSignInIdentifier(identifier);
    if (authMode === "signup" && !(contact && "email" in contact)) return setFormError("Use a valid email address to create the owner account.");
    if (authMode === "signin" && role !== "creator" && !organizationCode.trim()) return setFormError("Enter the organization code supplied by your administrator.");
    if (!contact) return setFormError("Enter a valid email address, or a phone number such as 024 123 4567.");
    if (method === "password" && password.length < (authMode === "signup" ? MIN_PASSWORD_LENGTH : 1)) {
      return setFormError(authMode === "signup" ? `Create a password with at least ${MIN_PASSWORD_LENGTH} characters.` : "Enter your password, or choose a one-time code.");
    }
    if (!requireCaptcha()) return;

    setAuthBusy(true);
    try {
      const { completePendingOrganization, getBrowserClient, loadOrganizationAccess, savePendingOrganization, saveRequestedOrganizationCode } = await import("@/lib/supabase/browser-auth");
      const client = getBrowserClient();
      const captcha = captchaToken || undefined;

      if (authMode === "signup" && "email" in contact) {
        savePendingOrganization({ fullName: fullName.trim(), name: organizationName.trim(), code: organizationCode });
        const { data, error } = await client.auth.signUp({ email: contact.email, password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: callbackUrl(), captchaToken: captcha } });
        if (error) throw error;
        if (data.session && data.user) {
          const access = await completePendingOrganization(data.user, client);
          if (access) return enterAccess(access);
        }
        setFormNotice("Check your email to verify the owner account. Your organization space will be created after verification.");
        return;
      }

      if (method === "code") {
        if (role !== "creator") saveRequestedOrganizationCode(organizationCode);
        const { error } = "phone" in contact
          ? await client.auth.signInWithOtp({ phone: contact.phone, options: { shouldCreateUser: false, captchaToken: captcha } })
          : await client.auth.signInWithOtp({ email: contact.email, options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(), captchaToken: captcha } });
        if (error) throw error;
        setFormNotice("phone" in contact ? "A sign-in code was requested for that phone number." : "Check your email for the secure sign-in link.");
        return;
      }

      const { error } = "phone" in contact
        ? await client.auth.signInWithPassword({ phone: contact.phone, password, options: { captchaToken: captcha } })
        : await client.auth.signInWithPassword({ email: contact.email, password, options: { captchaToken: captcha } });
      if (error) throw error;
      const access = await loadOrganizationAccess(client, role === "creator" ? undefined : organizationCode);
      if (!access) {
        await client.auth.signOut();
        throw new Error("No active membership was found for that organization.");
      }
      enterAccess(access);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Authentication could not be completed.");
    } finally {
      setAuthBusy(false);
      resetCaptcha();
    }
  };

  const continueWithGoogle = async () => {
    clearMessages();
    if (!backendReady) return unavailable("Google sign-in");
    if (authMode === "signup" && !validateOwnerSetup()) return;
    const { getBrowserClient, savePendingOrganization, saveRequestedOrganizationCode } = await import("@/lib/supabase/browser-auth");
    if (authMode === "signup") savePendingOrganization({ fullName: fullName.trim(), name: organizationName.trim(), code: organizationCode });
    else if (role !== "creator") saveRequestedOrganizationCode(organizationCode);
    setAuthBusy(true);
    const { error } = await getBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
    if (error) { setFormError(error.message); setAuthBusy(false); }
  };

  const recoverPassword = async () => {
    clearMessages();
    if (!backendReady) return unavailable("Password recovery");
    const contact = parseSignInIdentifier(identifier);
    if (!(contact && "email" in contact)) return setFormError("Enter your email address before requesting a password reset.");
    if (!requireCaptcha()) return;
    const { getBrowserClient } = await import("@/lib/supabase/browser-auth");
    setAuthBusy(true);
    const { error } = await getBrowserClient().auth.resetPasswordForEmail(contact.email, { redirectTo: callbackUrl("/?recovery=1"), captchaToken: captchaToken || undefined });
    setAuthBusy(false);
    resetCaptcha();
    if (error) setFormError(error.message);
    else setFormNotice("Check your email for the password reset link.");
  };

  const chooseRole = (next: Portal) => {
    setRole(next);
    if (next !== "creator") setAuthMode("signin");
    clearMessages();
  };

  const primaryLabel = authBusy ? "Please wait…" : recoveryMode ? "Update password" : authMode === "signup" ? "Create owner account" : method === "password" ? current.signInLabel : "Send one-time code";

  return (
    <main className="welcome-shell" data-theme={theme}>
      <a className="skip-link" href="#access-panel">Skip to sign in</a>
      <nav className="welcome-nav">
        <Brand />
        <div className="welcome-controls">
          <span>{backendReady ? "Secure development access" : "Prototype access review"}</span>
          <ThemeSelect theme={theme} setTheme={setTheme} label="Colour mode" />
        </div>
      </nav>

      <section className="welcome-intro">
        <p className="eyebrow">{backendReady ? "Announcement Hub" : "Announcement Hub prototype"}</p>
        <h1>Official messages for your organization.</h1>
        <p>{backendReady ? "Sign in with the connected identity service, or use a preview role to inspect the interface without creating real organization data." : "Choose a role to inspect its workflow. Production sign-in remains disabled until a verified identity service is connected."}</p>
      </section>

      <section className="entry-layout">
        <div className="role-list" role="group" aria-label="Choose your role">
          {(Object.keys(roleInfo) as Portal[]).map((id) => {
            const info = roleInfo[id];
            const RoleIcon = info.icon;
            return (
              <button key={id} type="button" className={`role-row ${role === id ? "active" : ""}`} aria-pressed={role === id} onClick={() => chooseRole(id)}>
                <span className="role-icon"><RoleIcon size={20} /></span>
                <span className="role-tab-label">{info.tabLabel}</span>
                <span className="role-copy"><small>{info.label}</small><strong>{info.title}</strong><em>{info.help}</em></span>
                <ArrowRight size={18} />
              </button>
            );
          })}
        </div>

        <section className="access-panel" id="access-panel">
          {role === "creator" && !recoveryMode && (
            <div className="auth-mode-tabs" role="group" aria-label="Owner access">
              <button type="button" className={authMode === "signin" ? "active" : ""} aria-pressed={authMode === "signin"} onClick={() => { setAuthMode("signin"); clearMessages(); }}>Sign in</button>
              <button type="button" className={authMode === "signup" ? "active" : ""} aria-pressed={authMode === "signup"} onClick={() => { setAuthMode("signup"); setMethod("password"); clearMessages(); }}>Create a space</button>
            </div>
          )}

          <div className="access-heading">
            <span className="access-icon"><Icon size={22} /></span>
            <div>
              <p>{recoveryMode ? "Account recovery" : current.label}</p>
              <h2>{recoveryMode ? "Set a new password" : authMode === "signup" ? "Create your space" : "Welcome back"}</h2>
              <span className="access-subtitle">{recoveryMode ? "Choose a new password for your verified account." : authMode === "signup" ? "Verify the owner account, then configure your organization." : subtitles[role]}</span>
            </div>
          </div>

          {!recoveryMode && (
            <>
              <button type="button" className="oauth-button" disabled={authBusy} onClick={continueWithGoogle}><span>G</span> Continue with Google</button>
              <div className="divider"><span>or use organization access</span></div>
            </>
          )}

          {!recoveryMode && authMode === "signup" && (
            <>
              <label><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
              <label><span>Organization name</span><input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" /></label>
            </>
          )}
          {!recoveryMode && (role !== "creator" || authMode === "signup") && (
            <label><span>Organization code</span><input value={organizationCode} onChange={(event) => setOrganizationCode(normalizeOrganizationCode(event.target.value))} autoComplete="off" /></label>
          )}
          {!recoveryMode && (
            <label>
              <span>{authMode === "signup" ? "Owner email address" : "Email address or phone number"}</span>
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" inputMode={authMode === "signup" ? "email" : "text"} />
            </label>
          )}
          {method === "password" && (
            <label>
              <span>{recoveryMode ? "New password" : "Password"}</span>
              <span className="password-field">
                <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} aria-label={recoveryMode ? "New password" : "Password"} autoComplete={authMode === "signup" || recoveryMode ? "new-password" : "current-password"} />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
          )}
          {recoveryMode && (
            <label><span>Confirm new password</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" /></label>
          )}
          {(authMode === "signup" || recoveryMode) && <p className="field-help">Use at least {MIN_PASSWORD_LENGTH} characters. Announcement Hub never creates passwords from names, phone numbers or organization codes.</p>}
          {!recoveryMode && authMode === "signin" && method === "password" && <div className="access-options single"><button type="button" onClick={recoverPassword}>Forgot password?</button></div>}
          {!recoveryMode && turnstileSiteKey && (
            <div className="captcha-field">
              <Turnstile
                ref={captchaRef}
                siteKey={turnstileSiteKey}
                options={{ theme: "auto", size: "flexible", action: authMode === "signup" ? "owner_signup" : "sign_in" }}
                onSuccess={setCaptchaToken}
                onExpire={() => setCaptchaToken("")}
                onError={() => { setCaptchaToken(""); setFormError("The security check could not be completed. Please try again."); }}
              />
            </div>
          )}
          {formError && <p className="inline-error" role="alert"><CircleAlert size={16} />{formError}</p>}
          {formNotice && <p className="inline-success" role="status"><Check size={16} />{formNotice}</p>}

          <button type="button" className="primary-action" disabled={authBusy} onClick={continueWithOrganization}>{primaryLabel}{!authBusy && <ArrowRight size={17} />}</button>
          {!recoveryMode && authMode === "signin" && (
            <button type="button" className="text-action" onClick={() => { setMethod(method === "password" ? "code" : "password"); clearMessages(); }}>
              <KeyRound size={15} />{method === "password" ? "Use a one-time code" : "Use a password instead"}
            </button>
          )}
          {!recoveryMode && <p className="access-note">{authMode === "signup" ? "Google account creation still requires a verified identity and a unique organization code." : "Google access works only when the verified account has an active organization membership."}</p>}
          <div className="prototype-access">
            <p><strong>{backendReady ? "Secure access available" : "Prototype preview"}</strong> {backendReady ? "uses the configured Supabase project. Preview mode remains separate and contains no real organization data." : "skips authentication and contains no real organization data."}</p>
            <button type="button" className="secondary" onClick={() => onEnter(role)}>Preview {current.label.toLowerCase()} portal</button>
          </div>
        </section>
      </section>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Announcement Hub</span>
        <nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
      </footer>
    </main>
  );
}
