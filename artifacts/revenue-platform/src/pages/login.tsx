import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowLeft, RefreshCw, MailCheck } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

// ─── Validation schemas ───────────────────────────────────────────────────────

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(60),
  lastName: z.string().max(60).optional(),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  // Honeypot — must stay empty; bots fill every field.
  hp: z.string().max(0).optional(),
});

type SignInFields = z.infer<typeof signInSchema>;
type RegisterFields = z.infer<typeof registerSchema>;

// ─── Google "G" SVG (brand-compliant) ────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="w-[18px] h-[18px] shrink-0"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// ─── Floating-label input ─────────────────────────────────────────────────────

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  rightElement?: React.ReactNode;
}

function FloatingInput({ label, error, rightElement, className, ...props }: FloatingInputProps) {
  return (
    <div className="relative">
      <input
        {...props}
        placeholder=" "
        className={[
          "peer w-full pt-6 pb-2 px-3.5 rounded-xl border text-sm outline-none transition-all",
          "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F] placeholder:text-transparent",
          "focus:bg-white focus:border-[#1D1D1F] focus:ring-2 focus:ring-[#1D1D1F]/10",
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-500/10"
            : "",
          rightElement ? "pr-10" : "",
          className ?? "",
        ].join(" ")}
      />
      <label
        className={[
          "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm transition-all",
          "text-[#86868B]",
          "peer-focus:top-3.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-medium peer-focus:text-[#1D1D1F]",
          "peer-[:not(:placeholder-shown)]:top-3.5 peer-[:not(:placeholder-shown)]:translate-y-0",
          "peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:text-[#1D1D1F]",
        ].join(" ")}
      >
        {label}
      </label>
      {rightElement && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {rightElement}
        </div>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-red-500 pl-1">{error}</p>
      )}
    </div>
  );
}

// ─── Password field with show/hide toggle ─────────────────────────────────────

interface PasswordInputProps {
  label?: string;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<RegisterFields>>["register"]> | ReturnType<ReturnType<typeof useForm<SignInFields>>["register"]>;
}

function PasswordField({
  label = "Password",
  error,
  registration,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <FloatingInput
      {...registration}
      type={show ? "text" : "password"}
      label={label}
      error={error}
      autoComplete="current-password"
      rightElement={
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="text-[#86868B] hover:text-[#1D1D1F] transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      }
    />
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-[#D2D2D7]" />
      <span className="text-xs text-[#86868B] font-medium">{label}</span>
      <div className="flex-1 h-px bg-[#D2D2D7]" />
    </div>
  );
}

// ─── Google button ────────────────────────────────────────────────────────────

function GoogleButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={[
        "w-full flex items-center justify-center gap-3 h-11 rounded-xl",
        "bg-white border border-[#D2D2D7] text-[#1D1D1F] text-sm font-medium",
        "hover:bg-[#F5F5F7] active:scale-[0.98] transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
      ].join(" ")}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <GoogleIcon />
      )}
      Continue with Google
    </button>
  );
}

// ─── Primary CTA button ───────────────────────────────────────────────────────

function PrimaryButton({
  children,
  loading,
  disabled,
  type = "submit",
  onClick,
}: {
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type={type}
      disabled={loading || disabled}
      onClick={onClick}
      className={[
        "w-full h-11 rounded-xl bg-[#1D1D1F] text-white text-sm font-semibold",
        "flex items-center justify-center gap-2",
        "hover:bg-black/85 active:scale-[0.98] transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
      ].join(" ")}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600"
    >
      {message}
    </motion.div>
  );
}

// ─── Sign In form ─────────────────────────────────────────────────────────────

function SignInForm({
  onGoogleLogin,
  onSuccess,
  googleLoading,
}: {
  onGoogleLogin: () => void;
  onSuccess: () => void;
  googleLoading: boolean;
}) {
  const { loginWithEmail } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFields>({ resolver: zodResolver(signInSchema) });

  const onSubmit = async (values: SignInFields) => {
    setLoading(true);
    setError(null);
    try {
      await loginWithEmail(values.email, values.password);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <GoogleButton onClick={onGoogleLogin} loading={googleLoading} />
      <Divider />
      <FloatingInput
        {...register("email")}
        type="email"
        label="Email address"
        autoComplete="email"
        error={errors.email?.message}
      />
      <PasswordField
        registration={register("password")}
        error={errors.password?.message}
      />
      <ErrorBanner message={error} />
      <PrimaryButton loading={loading}>Sign In</PrimaryButton>
    </form>
  );
}

// ─── Create Account form ──────────────────────────────────────────────────────

function RegisterForm({
  onGoogleLogin,
  onVerificationNeeded,
  googleLoading,
}: {
  onGoogleLogin: () => void;
  onVerificationNeeded: (email: string) => void;
  googleLoading: boolean;
}) {
  const { register: registerUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFields>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterFields) => {
    setLoading(true);
    setError(null);
    try {
      const result = await registerUser({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      if (result.requiresVerification) {
        onVerificationNeeded(values.email);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <GoogleButton onClick={onGoogleLogin} loading={googleLoading} />
      <Divider />
      <div className="grid grid-cols-2 gap-3">
        <FloatingInput
          {...register("firstName")}
          type="text"
          label="First name"
          autoComplete="given-name"
          error={errors.firstName?.message}
        />
        <FloatingInput
          {...register("lastName")}
          type="text"
          label="Last name"
          autoComplete="family-name"
          error={errors.lastName?.message}
        />
      </div>
      <FloatingInput
        {...register("email")}
        type="email"
        label="Email address"
        autoComplete="email"
        error={errors.email?.message}
      />
      <PasswordField
        label="Password (min. 8 characters)"
        registration={register("password")}
        error={errors.password?.message}
      />

      {/* Honeypot — hidden from real users, invisible to screen readers */}
      <input
        {...register("hp")}
        type="text"
        name="hp"
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        style={{ display: "none" }}
      />

      <ErrorBanner message={error} />
      <PrimaryButton loading={loading}>Create Account</PrimaryButton>
      <p className="text-center text-[11px] text-[#86868B] leading-relaxed">
        By creating an account you agree to our{" "}
        <a href="#" className="underline underline-offset-2 hover:text-[#1D1D1F]">
          Terms
        </a>{" "}
        and{" "}
        <a href="#" className="underline underline-offset-2 hover:text-[#1D1D1F]">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}

// ─── OTP Verification screen ──────────────────────────────────────────────────

function OtpVerificationScreen({
  email,
  onBack,
  onSuccess,
}: {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const { verifyOtp, resendOtp } = useAuth();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(60);

  // Countdown before "Resend" is available.
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email, otp);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendSuccess(false);
    setError(null);
    try {
      await resendOtp(email);
      setResendSuccess(true);
      setCountdown(60);
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  // Auto-submit when all 6 digits are entered.
  const prevOtpRef = useRef("");
  useEffect(() => {
    if (otp.length === 6 && prevOtpRef.current !== otp) {
      prevOtpRef.current = otp;
      void handleVerify();
    } else {
      prevOtpRef.current = otp;
    }
    // handleVerify reads `otp` from state via closure; listing it here would
    // cause an extra re-run after it resets otp on error, so we intentionally
    // only re-run when `otp` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const maskedEmail =
    email.replace(/(.{2}).+(@.+)/, "$1***$2");

  return (
    <motion.div
      key="otp"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#F5F5F7] border border-[#D2D2D7] flex items-center justify-center">
          <MailCheck className="w-6 h-6 text-[#1D1D1F]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[#1D1D1F] tracking-tight">
            Check your email
          </h2>
          <p className="text-sm text-[#86868B] mt-1 leading-relaxed">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-[#1D1D1F]">{maskedEmail}</span>
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={otp}
          onChange={setOtp}
          disabled={loading}
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className={[
                  "w-11 h-13 rounded-xl border text-lg font-semibold",
                  "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]",
                  "data-[active=true]:border-[#1D1D1F] data-[active=true]:ring-2 data-[active=true]:ring-[#1D1D1F]/10",
                  "first:rounded-xl last:rounded-xl first:border-l last:border-r",
                  "transition-all",
                ].join(" ")}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <ErrorBanner message={error} />

      {resendSuccess && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-emerald-600 font-medium"
        >
          A new code was sent to your email.
        </motion.p>
      )}

      <PrimaryButton
        loading={loading}
        disabled={otp.length < 6}
        type="button"
        onClick={() => { void handleVerify(); }}
      >
        Verify Email
      </PrimaryButton>

      <div className="flex items-center justify-center gap-1 text-sm">
        <span className="text-[#86868B]">Didn't receive it?</span>
        {countdown > 0 ? (
          <span className="text-[#86868B] font-medium">
            Resend in {countdown}s
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-[#1D1D1F] font-semibold hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            {resending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Resend code
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 text-sm text-[#86868B] hover:text-[#1D1D1F] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </button>
    </motion.div>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────

type Step = "auth" | "verify";
type Tab = "signin" | "register";

export default function LoginPage() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("auth");
  const [activeTab, setActiveTab] = useState<Tab>("signin");
  const [pendingEmail, setPendingEmail] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    login(); // Redirects away — no need to reset loading state.
  };

  const handleVerificationNeeded = (email: string) => {
    setPendingEmail(email);
    setStep("verify");
  };

  const handleVerifySuccess = () => {
    // Session cookie is now set. Navigate to the app root so ProtectedRoute
    // re-fetches the user from the API with the fresh cookie.
    window.location.replace("/");
  };

  const handleBackFromVerify = () => {
    setStep("auth");
    setPendingEmail("");
  };

  return (
    // Explicit light surface — auth page always uses the soft-UI light palette.
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F9F9FB] px-4">
      <div className="w-full max-w-[420px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white rounded-2xl border border-[#D2D2D7] shadow-[0_4px_32px_rgba(0,0,0,0.06)] overflow-hidden"
        >
          {/* ── Card header ── */}
          <div className="px-8 pt-8 pb-6 border-b border-[#F5F5F7]">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-8 h-8 rounded-xl bg-[#1D1D1F] flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-semibold text-[#1D1D1F] text-[15px] tracking-tight">
                Advan AI
              </span>
            </div>

            <AnimatePresence mode="wait">
              {step === "auth" ? (
                <motion.div
                  key="auth-header"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">
                    {activeTab === "signin" ? "Welcome back" : "Create account"}
                  </h1>
                  <p className="text-sm text-[#86868B] mt-1">
                    {activeTab === "signin"
                      ? "Sign in to your Advan AI dashboard"
                      : "Get started with AI-powered revenue growth"}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="verify-header"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h1 className="text-2xl font-bold text-[#1D1D1F] tracking-tight">
                    Verify your email
                  </h1>
                  <p className="text-sm text-[#86868B] mt-1">
                    One last step to activate your account
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Card body ── */}
          <div className="px-8 py-6">
            <AnimatePresence mode="wait">
              {step === "verify" ? (
                <OtpVerificationScreen
                  key="otp"
                  email={pendingEmail}
                  onBack={handleBackFromVerify}
                  onSuccess={handleVerifySuccess}
                />
              ) : (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  {/* ── Tab switcher ── */}
                  <div className="flex rounded-xl bg-[#F5F5F7] p-1 gap-1">
                    {(["signin", "register"] as Tab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={[
                          "flex-1 h-8 rounded-lg text-sm font-medium transition-all",
                          activeTab === tab
                            ? "bg-white text-[#1D1D1F] shadow-sm"
                            : "text-[#86868B] hover:text-[#1D1D1F]",
                        ].join(" ")}
                      >
                        {tab === "signin" ? "Sign In" : "Create Account"}
                      </button>
                    ))}
                  </div>

                  {/* ── Forms ── */}
                  <AnimatePresence mode="wait">
                    {activeTab === "signin" ? (
                      <motion.div
                        key="signin"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SignInForm
                          onGoogleLogin={handleGoogleLogin}
                          onSuccess={handleVerifySuccess}
                          googleLoading={googleLoading}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="register"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <RegisterForm
                          onGoogleLogin={handleGoogleLogin}
                          onVerificationNeeded={handleVerificationNeeded}
                          googleLoading={googleLoading}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Footer note ── */}
        <p className="text-center text-[11px] text-[#86868B] mt-5">
          Protected by enterprise-grade security · SOC 2 compliant
        </p>
      </div>
    </div>
  );
}
