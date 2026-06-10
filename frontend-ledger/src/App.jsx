import { useEffect, useState } from "react";

const defaultAuthForm = {
  name: "",
  email: "",
  password: ""
};

const defaultPaymentForm = {
  type: "TRANSFER",
  fromAccount: "",
  toAccount: "",
  amount: "",
  note: ""
};

const defaultBeneficiaryForm = {
  accountId: "",
  nickname: "",
  bankName: "Ledger Bank"
};

const defaultScheduleForm = {
  fromAccount: "",
  toAccount: "",
  amount: "",
  note: "",
  frequency: "ONCE",
  nextRunAt: ""
};

const navItems = [
  { id: "overview", label: "Overview", accent: "Command center", code: "01" },
  { id: "accounts", label: "Accounts", accent: "Portfolio", code: "02" },
  { id: "payments", label: "Payments", accent: "Movement", code: "03" },
  { id: "beneficiaries", label: "Beneficiaries", accent: "Trusted payees", code: "04" },
  { id: "schedules", label: "Schedules", accent: "Automation", code: "05" },
  { id: "statements", label: "Statements", accent: "Passbook", code: "06" },
  { id: "reports", label: "Reports", accent: "Exports", code: "07" }
];

function getStoredSession() {
  const token = localStorage.getItem("ledger_token");
  const rawUser = localStorage.getItem("ledger_user");

  if (!token || !rawUser) {
    return { token: "", user: null };
  }

  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    return { token: "", user: null };
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

function formatDate(value) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getFriendlyErrorMessage(error) {
  if (error instanceof TypeError) {
    return "The backend service is not reachable. Start the backend on http://localhost:3000 and try again.";
  }

  return error.message || "Request failed";
}

async function apiRequest(path, options = {}, token = "") {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

function HudClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTime(now.toTimeString().split(" ")[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hud-clock-container">
      <span className="hud-clock-label">SYS TIME</span>
      <span className="hud-clock-time">{time || "00:00:00"}</span>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [currentScreen, setCurrentScreen] = useState("overview");
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm);
  const [beneficiaryForm, setBeneficiaryForm] = useState(defaultBeneficiaryForm);
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm);
  const [authMessage, setAuthMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [googleMessage, setGoogleMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [session, setSession] = useState(getStoredSession);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [screenTransitionKey, setScreenTransitionKey] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [statementAccountId, setStatementAccountId] = useState("");
  const [statement, setStatement] = useState([]);
  const [reportSummary, setReportSummary] = useState({
    totalVolume: 0,
    flagged: 0,
    byType: {}
  });
  const [fraudAlerts, setFraudAlerts] = useState([]);
  const [adminOverview, setAdminOverview] = useState(null);

  const [resetToken, setResetToken] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpTransactionId, setOtpTransactionId] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);



  const isLoggedIn = Boolean(session.token && session.user);
  const isAdmin = session.user?.role === "ADMIN";
  const enrichedNavItems = isAdmin
    ? [ ...navItems, { id: "admin", label: "Admin", accent: "Controls", code: "08" } ]
    : navItems;

  const totalBalance = Object.values(balances).reduce(
    (sum, balance) => sum + Number(balance || 0),
    0
  );
  const activeScreen = enrichedNavItems.find((item) => item.id === currentScreen) || enrichedNavItems[0];

  useEffect(() => {
    setScreenTransitionKey((current) => current + 1);
  }, [currentScreen]);

  useEffect(() => {
    void loadGoogleConfig();
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("resetToken") || urlParams.get("token");
    if (token) {
      setResetToken(token);
      setMode("reset-password");
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      void bootstrapDashboard();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !statementAccountId) {
      return;
    }

    void loadStatement(statementAccountId);
  }, [isLoggedIn, statementAccountId]);

  useEffect(() => {
    if (isLoggedIn || !googleClientId) {
      return undefined;
    }

    let cancelled = false;

    function renderGoogleButton() {
      if (cancelled || !window.google?.accounts?.id) {
        return;
      }

      const buttonContainer = document.getElementById("google-signin-button");

      if (!buttonContainer) {
        return;
      }

      buttonContainer.innerHTML = "";
      setGoogleReady(true);

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setGoogleMessage("");
          setAuthMessage("");

          try {
            const authResponse = await apiRequest("/api/auth/google", {
              method: "POST",
              body: JSON.stringify({ credential: response.credential })
            });

            persistSession({
              token: authResponse.token,
              user: authResponse.user
            });
          } catch (error) {
            setGoogleMessage(getFriendlyErrorMessage(error));
          }
        }
      });

      window.google.accounts.id.renderButton(buttonContainer, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320
      });
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [googleClientId, isLoggedIn]);

  async function loadGoogleConfig() {
    try {
      const response = await apiRequest("/api/auth/google/config");
      setGoogleClientId(response.enabled ? response.clientId : "");
    } catch (error) {
      setGoogleMessage(getFriendlyErrorMessage(error));
    }
  }

  function persistSession(nextSession) {
    setSession(nextSession);

    if (nextSession.token && nextSession.user) {
      localStorage.setItem("ledger_token", nextSession.token);
      localStorage.setItem("ledger_user", JSON.stringify(nextSession.user));
    } else {
      localStorage.removeItem("ledger_token");
      localStorage.removeItem("ledger_user");
    }
  }

  function handleUnauthorizedSession(error) {
    if (error?.status !== 401) {
      return false;
    }

    persistSession({ token: "", user: null });
    setAccounts([]);
    setBalances({});
    setTransactions([]);
    setBeneficiaries([]);
    setSchedules([]);
    setStatement([]);
    setFraudAlerts([]);
    setAdminOverview(null);
    setCurrentScreen("overview");
    setStatusMessage("");
    setAuthMessage("Your session expired. Please sign in again.");
    return true;
  }

  async function bootstrapDashboard() {
    setDataLoading(true);
    setStatusMessage("");

    try {
      const [
        accountResponse,
        transactionResponse,
        beneficiaryResponse,
        scheduleResponse,
        summaryResponse,
        fraudResponse
      ] = await Promise.all([
        apiRequest("/api/accounts", {}, session.token),
        apiRequest(`/api/transactions?limit=50${filterStartDate ? `&startDate=${filterStartDate}` : ""}${filterEndDate ? `&endDate=${filterEndDate}` : ""}${filterMinAmount ? `&minAmount=${filterMinAmount}` : ""}${filterMaxAmount ? `&maxAmount=${filterMaxAmount}` : ""}`, {}, session.token),
        apiRequest("/api/beneficiaries", {}, session.token),
        apiRequest("/api/schedules", {}, session.token),
        apiRequest("/api/reports/summary", {}, session.token),
        apiRequest("/api/transactions/alerts/fraud", {}, session.token)
      ]);

      const nextAccounts = accountResponse.accounts || [];
      const balanceEntries = await Promise.all(
        nextAccounts.map(async (account) => {
          const balanceResponse = await apiRequest(
            `/api/accounts/balance/${account._id}`,
            {},
            session.token
          );
          return [account._id, balanceResponse.balance];
        })
      );

      const nextBalances = Object.fromEntries(balanceEntries);
      setAccounts(nextAccounts);
      setBalances(nextBalances);
      setTransactions(transactionResponse.transactions || []);
      setBeneficiaries(beneficiaryResponse.beneficiaries || []);
      setSchedules(scheduleResponse.schedules || []);
      setReportSummary(summaryResponse.summary || {
        totalVolume: 0,
        flagged: 0,
        byType: {}
      });
      setFraudAlerts(fraudResponse.alerts || []);

      if (nextAccounts.length > 0) {
        setStatementAccountId((current) => current || nextAccounts[0]._id);
        setPaymentForm((current) => ({
          ...current,
          fromAccount: current.fromAccount || nextAccounts[0]._id
        }));
        setScheduleForm((current) => ({
          ...current,
          fromAccount: current.fromAccount || nextAccounts[0]._id
        }));
      }

      if (isAdmin) {
        const adminResponse = await apiRequest("/api/admin/overview", {}, session.token);
        setAdminOverview(adminResponse);
      }
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setDataLoading(false);
    }
  }

  async function loadTransactions(customFilters = null) {
    setDataLoading(true);
    try {
      const sf = customFilters || {
        startDate: filterStartDate,
        endDate: filterEndDate,
        minAmount: filterMinAmount,
        maxAmount: filterMaxAmount
      };
      const query = new URLSearchParams();
      query.append("limit", "50");
      if (sf.startDate) query.append("startDate", sf.startDate);
      if (sf.endDate) query.append("endDate", sf.endDate);
      if (sf.minAmount) query.append("minAmount", sf.minAmount);
      if (sf.maxAmount) query.append("maxAmount", sf.maxAmount);

      const response = await apiRequest(`/api/transactions?${query.toString()}`, {}, session.token);
      setTransactions(response.transactions || []);
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setDataLoading(false);
    }
  }

  async function handleForgotPasswordSubmit(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    try {
      const response = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail })
      });
      setAuthMessage(response.message || "Reset link sent to your email.");
      setForgotEmail("");
    } catch (error) {
      setAuthMessage(getFriendlyErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleResetPasswordSubmit(event) {
    event.preventDefault();
    if (resetPassword.length < 6) {
      setAuthMessage("Password must be at least 6 characters long.");
      return;
    }
    setAuthLoading(true);
    setAuthMessage("");
    try {
      const response = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password: resetPassword })
      });
      setAuthMessage(response.message || "Password reset successful. You can now login.");
      setResetPassword("");
      setResetToken("");
      window.history.replaceState({}, document.title, window.location.pathname);
      setMode("login");
    } catch (error) {
      setAuthMessage(getFriendlyErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyTransferOtp(event) {
    event.preventDefault();
    if (otpCode.length !== 6) {
      setOtpError("OTP code must be 6 digits.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");

    try {
      const response = await apiRequest("/api/transactions/verify-otp", {
        method: "POST",
        body: JSON.stringify({ transactionId: otpTransactionId, otp: otpCode })
      }, session.token);

      setStatusMessage(response.message || "Transfer completed successfully.");
      setOtpOpen(false);
      setOtpCode("");
      setOtpTransactionId("");
      setPaymentForm((current) => ({
        ...defaultPaymentForm,
        type: current.type,
        fromAccount: current.fromAccount
      }));
      await bootstrapDashboard();
    } catch (error) {
      setOtpError(getFriendlyErrorMessage(error));
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleExportPdfStatement() {
    if (!statementAccountId) {
      setStatusMessage("Please select an account first.");
      return;
    }
    setActionLoading(true);
    try {
      const response = await fetch(`/api/reports/statement/pdf/${statementAccountId}`, {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error("PDF statement export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `statement-${statementAccountId}.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function loadStatement(accountId) {
    try {
      const response = await apiRequest(`/api/accounts/statement/${accountId}`, {}, session.token);
      setStatement(response.statement || []);
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    if (mode === "register" && authForm.password.length < 6) {
      setAuthMessage("Password must be at least 6 characters long.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = mode === "register"
        ? authForm
        : { email: authForm.email, password: authForm.password };

      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      persistSession({ token: response.token, user: response.user });
      setAuthForm(defaultAuthForm);
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setAuthMessage(getFriendlyErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({})
      }, session.token);
    } catch {
      // Ignore logout failures.
    } finally {
      persistSession({ token: "", user: null });
      setAccounts([]);
      setBalances({});
      setTransactions([]);
      setBeneficiaries([]);
      setSchedules([]);
      setStatement([]);
      setAdminOverview(null);
      setCurrentScreen("overview");
      setStatusMessage("");
      setAuthMessage("");
    }
  }

  async function handleCreateAccount() {
    setActionLoading(true);

    try {
      await apiRequest("/api/accounts", {
        method: "POST",
        body: JSON.stringify({})
      }, session.token);

      setStatusMessage("New account created successfully.");
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault();
    setActionLoading(true);

    try {
      const idempotencyKey = crypto.randomUUID();
      let endpoint = "/api/transactions";
      let payload = {
        idempotencyKey,
        amount: Number(paymentForm.amount),
        note: paymentForm.note
      };

      if (paymentForm.type === "TRANSFER") {
        payload = {
          ...payload,
          fromAccount: paymentForm.fromAccount,
          toAccount: paymentForm.toAccount
        };
      }

      if (paymentForm.type === "DEPOSIT") {
        endpoint = "/api/transactions/deposit";
        payload = {
          ...payload,
          toAccount: paymentForm.toAccount || paymentForm.fromAccount
        };
      }

      if (paymentForm.type === "WITHDRAWAL") {
        endpoint = "/api/transactions/withdrawal";
        payload = {
          ...payload,
          fromAccount: paymentForm.fromAccount
        };
      }

      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      }, session.token);

      if (response.status === "PENDING_OTP") {
        setOtpTransactionId(response.transaction._id);
        setOtpOpen(true);
        setOtpError("");
        setStatusMessage(response.message || "OTP verification required.");
        return;
      }

      setStatusMessage(response.message || "Payment completed successfully.");
      setPaymentForm((current) => ({
        ...defaultPaymentForm,
        type: current.type,
        fromAccount: current.fromAccount
      }));
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddBeneficiary(event) {
    event.preventDefault();
    setActionLoading(true);

    try {
      await apiRequest("/api/beneficiaries", {
        method: "POST",
        body: JSON.stringify(beneficiaryForm)
      }, session.token);

      setBeneficiaryForm(defaultBeneficiaryForm);
      setStatusMessage("Beneficiary saved successfully.");
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteBeneficiary(beneficiaryId) {
    setActionLoading(true);

    try {
      await apiRequest(`/api/beneficiaries/${beneficiaryId}`, {
        method: "DELETE"
      }, session.token);

      setStatusMessage("Beneficiary removed successfully.");
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleScheduleSubmit(event) {
    event.preventDefault();
    setActionLoading(true);

    try {
      await apiRequest("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          ...scheduleForm,
          amount: Number(scheduleForm.amount)
        })
      }, session.token);

      setScheduleForm((current) => ({
        ...defaultScheduleForm,
        fromAccount: current.fromAccount
      }));
      setStatusMessage("Scheduled payment created successfully.");
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateScheduleStatus(scheduleId, nextStatus) {
    setActionLoading(true);

    try {
      await apiRequest(`/api/schedules/${scheduleId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      }, session.token);

      setStatusMessage("Schedule updated successfully.");
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleProcessSchedules() {
    setActionLoading(true);

    try {
      const response = await apiRequest("/api/schedules/process-due", {
        method: "POST",
        body: JSON.stringify({})
      }, session.token);

      setStatusMessage(`${response.processedCount} scheduled payment(s) processed.`);
      await bootstrapDashboard();
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAccountStatusUpdate(accountId, nextStatus) {
    setActionLoading(true);

    try {
      await apiRequest(`/api/admin/accounts/${accountId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      }, session.token);

      setStatusMessage(`Account moved to ${nextStatus}.`);
      await bootstrapDashboard();
    } catch (error) {
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExportReport() {
    try {
      const response = await fetch("/api/reports/transactions.csv", {
        headers: {
          Authorization: `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error("Report export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "transactions-report.csv";
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (handleUnauthorizedSession(error)) {
        return;
      }
      setStatusMessage(getFriendlyErrorMessage(error));
    }
  }

  function applyBeneficiaryToPayment(beneficiary) {
    setCurrentScreen("payments");
    setPaymentForm((current) => ({
      ...current,
      type: "TRANSFER",
      toAccount: beneficiary.account?._id || ""
    }));
  }

  function renderAuth() {
    return (
      <main className="auth-shell">
        <div className="auth-noise auth-noise-left" />
        <div className="auth-noise auth-noise-right" />
        <section className="auth-hero">
          <div className="hero-badge-row">
            <div className="hero-logo">
              <span className="hero-logo-core">LB</span>
            </div>
            <span className="eyebrow">Ledger Bank Suite</span>
            <span className="floating-pill">Full Stack Banking Console</span>
          </div>
          <h1>Digital banking with cinematic polish and ledger-grade control.</h1>
          <p>
            A full-stack banking workspace for retail users, operators, and admins.
            Manage balances, beneficiaries, recurring payments, flagged activity,
            and reports from one secure platform.
          </p>

          <div className="hero-banner">
            <div>
              <span>Command architecture</span>
              <strong>Operations, risk, and customer flows in one unified surface.</strong>
            </div>
            <div className="hero-banner-stack">
              <span>Transfer engine</span>
              <span>Admin oversight</span>
              <span>Scheduled rails</span>
            </div>
          </div>

          <div className="hero-ticker">
            <span>Retail banking</span>
            <span>Ledger integrity</span>
            <span>Fraud visibility</span>
            <span>Role-based controls</span>
          </div>

          <div className="hero-points">
            <article>
              <strong>Controlled transfers</strong>
              <span>Ledger-backed debits and credits with fraud flags.</span>
            </article>
            <article>
              <strong>Beneficiary rails</strong>
              <span>Saved recipients, statements, schedules, and recurring flows.</span>
            </article>
            <article>
              <strong>Admin oversight</strong>
              <span>Role-based operations, account controls, and reporting.</span>
            </article>
          </div>
        </section>

        <section className="auth-card">
          {mode === "forgot-password" ? (
            <>
              <div className="panel-header">
                <span className="eyebrow">Security Recovery</span>
                <div className="mode-switch">
                  <button className="active" type="button">Recovery</button>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleForgotPasswordSubmit}>
                <label>
                  Email Address
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="client@ledgerbank.com"
                    required
                  />
                </label>
                <button className="primary-button" disabled={authLoading} type="submit">
                  {authLoading ? "Sending Link..." : "Send Reset Link"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => { setMode("login"); setAuthMessage(""); }}
                  type="button"
                  style={{ marginTop: "8px" }}
                >
                  Back to Login
                </button>
                {authMessage ? <p className="inline-message">{authMessage}</p> : null}
              </form>
            </>
          ) : mode === "reset-password" ? (
            <>
              <div className="panel-header">
                <span className="eyebrow">Security Reset</span>
                <div className="mode-switch">
                  <button className="active" type="button">Reset</button>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleResetPasswordSubmit}>
                <label>
                  New Password
                  <input
                    type="password"
                    minLength="6"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="Enter new secure password"
                    required
                  />
                  <span className="field-hint">Must contain at least 6 characters.</span>
                </label>
                <button className="primary-button" disabled={authLoading} type="submit">
                  {authLoading ? "Updating..." : "Update Password"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => { setMode("login"); setAuthMessage(""); }}
                  type="button"
                  style={{ marginTop: "8px" }}
                >
                  Cancel & Login
                </button>
                {authMessage ? <p className="inline-message">{authMessage}</p> : null}
              </form>
            </>
          ) : (
            <>
              <div className="panel-header">
                <span className="eyebrow">Client Access</span>
                <div className="mode-switch">
                  <button
                    className={mode === "login" ? "active" : ""}
                    onClick={() => setMode("login")}
                    type="button"
                  >
                    Login
                  </button>
                  <button
                    className={mode === "register" ? "active" : ""}
                    onClick={() => setMode("register")}
                    type="button"
                  >
                    Register
                  </button>
                </div>
              </div>

              <form className="stack-form" onSubmit={handleAuthSubmit}>
                {mode === "register" ? (
                  <label>
                    Full name
                    <input
                      type="text"
                      value={authForm.name}
                      onChange={(event) =>
                        setAuthForm((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                      placeholder="Krish Rathore"
                      required
                    />
                  </label>
                ) : null}

                <label>
                  Email
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        email: event.target.value
                      }))
                    }
                    placeholder="client@ledgerbank.com"
                    required
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    minLength="6"
                    value={authForm.password}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        password: event.target.value
                      }))
                    }
                    placeholder="Enter secure password"
                    required
                  />
                  {mode === "register" ? (
                    <span className="field-hint">Password must contain at least 6 characters.</span>
                  ) : null}
                  {mode === "login" ? (
                    <div style={{ textAlign: "right", marginTop: "4px" }}>
                      <button
                        className="ghost-button small"
                        onClick={() => { setMode("forgot-password"); setAuthMessage(""); }}
                        type="button"
                        style={{ border: "none", background: "none", padding: 0, textDecoration: "underline", cursor: "pointer", fontSize: "0.85rem", color: "var(--text-3)" }}
                      >
                        Forgot Password?
                      </button>
                    </div>
                  ) : null}
                </label>

                <button className="primary-button" disabled={authLoading} type="submit">
                  {authLoading ? "Processing..." : mode === "register" ? "Create Profile" : "Access Platform"}
                </button>

                {authMessage ? <p className="inline-message">{authMessage}</p> : null}
              </form>

              <div className="auth-divider">
                <span>or continue with</span>
              </div>

              <div className="google-panel">
                <button
                  className="google-fallback-button"
                  onClick={() => {
                    if (!googleClientId) {
                      setGoogleMessage("Google sign-in is not configured on the server yet.");
                      return;
                    }

                    if (!googleReady) {
                      setGoogleMessage("Google sign-in is still loading. Give it a moment and try again.");
                    }
                  }}
                  type="button"
                >
                  <span className="google-mark">G</span>
                  Continue with Google
                </button>

                {googleClientId ? (
                  <div className={`google-live-button ${googleReady ? "ready" : ""}`} id="google-signin-button" />
                ) : null}

                {googleMessage ? <p className="inline-message">{googleMessage}</p> : null}
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  function renderOverviewScreen() {
    return (
      <section className="screen-grid">
        <section className="spotlight-panel">
          <div className="spotlight-copy">
            <span className="eyebrow">Operations Pulse</span>
            <h2>Financial command center built for movement, control, and trust.</h2>
            <p>
              Track balances, monitor suspicious behavior, orchestrate customer payments,
              and keep every ledger movement visible from one premium workspace.
            </p>
            <div className="spotlight-actions">
              <button className="primary-button" onClick={() => setCurrentScreen("payments")} type="button">
                Launch payment desk
              </button>
              <button className="ghost-button" onClick={() => setCurrentScreen("reports")} type="button">
                Open reporting suite
              </button>
            </div>
          </div>
          <div className="spotlight-grid">
            <article>
              <span>Velocity</span>
              <strong>{transactions.length}</strong>
              <small>Tracked movements in dashboard memory</small>
            </article>
            <article>
              <span>Assurance</span>
              <strong>{fraudAlerts.length === 0 ? "Stable" : "Review"}</strong>
              <small>Risk watch status across customer activity</small>
            </article>
            <article>
              <span>Automation</span>
              <strong>{schedules.length}</strong>
              <small>Scheduled payment jobs waiting in queue</small>
            </article>
            <article>
              <span>Network</span>
              <strong>{beneficiaries.length}</strong>
              <small>Trusted external payees in your railbook</small>
            </article>
          </div>
        </section>

        <div className="metrics-grid">
          <article className="metric-card accent" style={{ position: "relative" }}>
            <span>Total balance</span>
            <strong style={{ position: "relative", zIndex: 2 }}>{formatCurrency(totalBalance)}</strong>
            <small>Across all active accounts</small>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "48px", overflow: "hidden", pointerEvents: "none" }}>
              <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="glowGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,35 Q15,10 30,28 T60,8 T90,24 L100,20 L100,40 L0,40 Z"
                  fill="url(#glowGold)"
                />
                <path
                  d="M0,35 Q15,10 30,28 T60,8 T90,24 L100,20"
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1.5"
                  className="sparkline-glow-gold"
                />
                <circle cx="100" cy="20" r="2" fill="var(--gold)" className="sparkline-pulse-dot" />
              </svg>
            </div>
          </article>
          <article className="metric-card" style={{ position: "relative" }}>
            <span>Total accounts</span>
            <strong>{accounts.length}</strong>
            <small>Retail and settlement accounts</small>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "36px", overflow: "hidden", pointerEvents: "none", opacity: 0.7 }}>
              <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <path
                  d="M0,32 L20,32 L40,16 L60,16 L80,8 L100,8"
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </article>
          <article className="metric-card" style={{ position: "relative" }}>
            <span>Flagged alerts</span>
            <strong style={{ color: fraudAlerts.length > 0 ? "var(--rose)" : "inherit" }}>{fraudAlerts.length}</strong>
            <small>Transactions needing review</small>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "36px", overflow: "hidden", pointerEvents: "none", opacity: 0.6 }}>
              <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <path
                  d="M0,38 L30,38 L50,15 L70,30 L100,5"
                  fill="none"
                  stroke="var(--rose)"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </article>
          <article className="metric-card" style={{ position: "relative" }}>
            <span>Total volume</span>
            <strong>{formatCurrency(reportSummary.totalVolume)}</strong>
            <small>All completed customer activity</small>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "42px", overflow: "hidden", pointerEvents: "none" }}>
              <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="glowPurple" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,30 Q20,8 40,25 T80,12 L100,18 L100,40 L0,40 Z"
                  fill="url(#glowPurple)"
                />
                <path
                  d="M0,30 Q20,8 40,25 T80,12 L100,18"
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth="1.5"
                  className="sparkline-glow"
                />
                <circle cx="100" cy="18" r="2" fill="var(--blue)" className="sparkline-pulse-dot" />
              </svg>
            </div>
          </article>
        </div>

        <div className="split-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Recent Activity</span>
                <h2>Latest transactions</h2>
              </div>
            </div>
            <div className="table-list">
              {transactions.slice(0, 6).map((transaction) => (
                <div className="table-row" key={transaction._id}>
                  <div>
                    <strong>{transaction.type}</strong>
                    <p>{transaction.note || "No payment note"}</p>
                  </div>
                  <div className="row-meta">
                    <span className={`status-chip ${transaction.status.toLowerCase()}`}>
                      {transaction.status}
                    </span>
                    <strong>{formatCurrency(transaction.amount)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Fraud Monitor</span>
                <h2>Flagged movements</h2>
              </div>
            </div>
            <div className="table-list">
              {fraudAlerts.length === 0 ? (
                <div className="empty-state compact">
                  <p>No alerts right now.</p>
                  <span>Your recent transfers look clean.</span>
                </div>
              ) : (
                fraudAlerts.slice(0, 5).map((alert) => (
                  <div className="table-row" key={alert._id}>
                    <div>
                      <strong>{alert.flagReason}</strong>
                      <p>{formatDate(alert.createdAt)}</p>
                    </div>
                    <div className="row-meta">
                      <span className="status-chip flagged">Flagged</span>
                      <strong>{formatCurrency(alert.amount)}</strong>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderAccountsScreen() {
    return (
      <section className="screen-grid">
        <article className="panel-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Accounts</span>
              <h2>Portfolio accounts</h2>
            </div>
            <button className="primary-button" disabled={actionLoading} onClick={handleCreateAccount} type="button">
              Open new account
            </button>
          </div>

          <div className="account-grid">
            {accounts.map((account) => (
              <div className="cyber-card-wrapper" key={account._id}>
                <div className="cyber-card">
                  <div className="cyber-card-contactless">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  
                  <div className="cyber-card-row">
                    <div className="cyber-card-chip">
                      <div className="cyber-card-chip-line-x"></div>
                      <div className="cyber-card-chip-line-y"></div>
                    </div>
                    <span className={`status-chip ${account.status.toLowerCase()}`}>
                      {account.status}
                    </span>
                  </div>

                  <div className="cyber-card-info">
                    <div className="cyber-card-number">
                      {account.accountNumber ? account.accountNumber.match(/.{1,4}/g)?.join(" ") : "•••• •••• •••• ••••"}
                    </div>
                    
                    <div className="cyber-card-row">
                      <div>
                        <div className="cyber-card-label">Cardholder</div>
                        <div className="cyber-card-val">{account.nickname}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="cyber-card-label">Balance</div>
                        <div className="cyber-card-val" style={{ color: "var(--gold)", textShadow: "0 0 10px rgba(251, 191, 36, 0.25)" }}>
                          {formatCurrency(balances[account._id])}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {isAdmin ? (
                  <div className="inline-actions" style={{ justifyContent: "center" }}>
                    <button
                      className="ghost-button small"
                      onClick={() => handleAccountStatusUpdate(account._id, "FROZEN")}
                      type="button"
                    >
                      Freeze
                    </button>
                    <button
                      className="ghost-button small"
                      onClick={() => handleAccountStatusUpdate(account._id, "ACTIVE")}
                      type="button"
                    >
                      Activate
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </article>
      </section>
    );
  }

  function renderPaymentsScreen() {
    return (
      <section className="screen-grid">
        <div className="payment-mode-bar">
          {["TRANSFER", "DEPOSIT", "WITHDRAWAL"].map((type) => (
            <button
              className={paymentForm.type === type ? "active" : ""}
              key={type}
              onClick={() =>
                setPaymentForm((current) => ({
                  ...current,
                  type
                }))
              }
              type="button"
            >
              {type}
            </button>
          ))}
        </div>

        <div className="split-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Payments</span>
                <h2>Initiate secure movement</h2>
              </div>
            </div>

            <form className="stack-form" onSubmit={handlePaymentSubmit}>
              <label>
                Source account
                <select
                  value={paymentForm.fromAccount}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      fromAccount: event.target.value
                    }))
                  }
                  required={paymentForm.type !== "DEPOSIT"}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.nickname} | {account.accountNumber}
                    </option>
                  ))}
                </select>
              </label>

              {paymentForm.type !== "WITHDRAWAL" ? (
                <label>
                  Destination account
                  <input
                    type="text"
                    value={paymentForm.toAccount}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        toAccount: event.target.value
                      }))
                    }
                    placeholder="Paste destination account ID"
                    required
                  />
                </label>
              ) : null}

              <label>
                Amount
                <input
                  min="1"
                  step="0.01"
                  type="number"
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      amount: event.target.value
                    }))
                  }
                  placeholder="2500"
                  required
                />
              </label>

              <label>
                Payment note
                <input
                  type="text"
                  value={paymentForm.note}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      note: event.target.value
                    }))
                  }
                  placeholder="Rent, wallet load, withdrawal slip"
                />
              </label>

              <button className="primary-button" disabled={actionLoading} type="submit">
                {actionLoading ? "Processing..." : `Submit ${paymentForm.type.toLowerCase()}`}
              </button>
            </form>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">History</span>
                <h2>Recent payment trail</h2>
              </div>
              <button
                className="ghost-button small"
                onClick={() => setFiltersVisible(!filtersVisible)}
                type="button"
              >
                {filtersVisible ? "Hide Filters" : "Show Filters"}
              </button>
            </div>

            {filtersVisible && (
              <div className="filters-panel" style={{
                marginBottom: "20px",
                padding: "20px",
                background: "rgba(18, 14, 29, 0.5)",
                border: "1px solid rgba(139, 92, 246, 0.15)",
                borderRadius: "14px",
                boxShadow: "inset 0 0 20px rgba(139, 92, 246, 0.05)"
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <label style={{ display: "grid", gap: "8px", color: "var(--text-2)", fontWeight: "600", fontSize: "0.85rem" }}>
                    Start Date
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(139, 92, 246, 0.12)",
                        background: "rgba(18, 14, 29, 0.6)",
                        color: "#fff",
                        outline: "none"
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "8px", color: "var(--text-2)", fontWeight: "600", fontSize: "0.85rem" }}>
                    End Date
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(139, 92, 246, 0.12)",
                        background: "rgba(18, 14, 29, 0.6)",
                        color: "#fff",
                        outline: "none"
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "8px", color: "var(--text-2)", fontWeight: "600", fontSize: "0.85rem" }}>
                    Min Amount (₹)
                    <input
                      type="number"
                      placeholder="Min"
                      value={filterMinAmount}
                      onChange={(e) => setFilterMinAmount(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(139, 92, 246, 0.12)",
                        background: "rgba(18, 14, 29, 0.6)",
                        color: "#fff",
                        outline: "none"
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "8px", color: "var(--text-2)", fontWeight: "600", fontSize: "0.85rem" }}>
                    Max Amount (₹)
                    <input
                      type="number"
                      placeholder="Max"
                      value={filterMaxAmount}
                      onChange={(e) => setFilterMaxAmount(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(139, 92, 246, 0.12)",
                        background: "rgba(18, 14, 29, 0.6)",
                        color: "#fff",
                        outline: "none"
                      }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                  <button
                    className="primary-button small"
                    onClick={() => loadTransactions()}
                    type="button"
                    style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  >
                    Apply Filters
                  </button>
                  <button
                    className="ghost-button small"
                    onClick={() => {
                      setFilterStartDate("");
                      setFilterEndDate("");
                      setFilterMinAmount("");
                      setFilterMaxAmount("");
                      loadTransactions({ startDate: "", endDate: "", minAmount: "", maxAmount: "" });
                    }}
                    type="button"
                    style={{ padding: "8px 16px", fontSize: "0.85rem" }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}

            <div className="table-list">
              {transactions.slice(0, 50).map((transaction) => (
                <div className="table-row" key={transaction._id}>
                  <div>
                    <strong>{transaction.type}</strong>
                    <p>{transaction.note || formatDate(transaction.createdAt)}</p>
                  </div>
                  <div className="row-meta">
                    <span className={`status-chip ${transaction.status.toLowerCase()}`}>
                      {transaction.status}
                    </span>
                    {transaction.flagged ? <span className="status-chip flagged">Review</span> : null}
                    <strong>{formatCurrency(transaction.amount)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderBeneficiariesScreen() {
    return (
      <section className="screen-grid">
        <div className="split-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Beneficiaries</span>
                <h2>Save trusted payees</h2>
              </div>
            </div>

            <form className="stack-form" onSubmit={handleAddBeneficiary}>
              <label>
                Destination account ID
                <input
                  type="text"
                  value={beneficiaryForm.accountId}
                  onChange={(event) =>
                    setBeneficiaryForm((current) => ({
                      ...current,
                      accountId: event.target.value
                    }))
                  }
                  placeholder="Paste beneficiary account ID"
                  required
                />
              </label>

              <label>
                Display name
                <input
                  type="text"
                  value={beneficiaryForm.nickname}
                  onChange={(event) =>
                    setBeneficiaryForm((current) => ({
                      ...current,
                      nickname: event.target.value
                    }))
                  }
                  placeholder="Krish savings"
                  required
                />
              </label>

              <label>
                Bank
                <input
                  type="text"
                  value={beneficiaryForm.bankName}
                  onChange={(event) =>
                    setBeneficiaryForm((current) => ({
                      ...current,
                      bankName: event.target.value
                    }))
                  }
                />
              </label>

              <button className="primary-button" disabled={actionLoading} type="submit">
                Save beneficiary
              </button>
            </form>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Saved List</span>
                <h2>Trusted recipients</h2>
              </div>
            </div>

            <div className="table-list">
              {beneficiaries.length === 0 ? (
                <div className="empty-state compact">
                  <p>No beneficiaries saved yet.</p>
                  <span>Save payees to reduce manual transfer entry.</span>
                </div>
              ) : (
                beneficiaries.map((beneficiary) => (
                  <div className="table-row" key={beneficiary._id}>
                    <div>
                      <strong>{beneficiary.nickname}</strong>
                      <p>{beneficiary.account?.accountNumber || beneficiary.account?._id}</p>
                    </div>
                    <div className="row-meta">
                      <button
                        className="ghost-button small"
                        onClick={() => applyBeneficiaryToPayment(beneficiary)}
                        type="button"
                      >
                        Pay
                      </button>
                      <button
                        className="ghost-button small"
                        onClick={() => handleDeleteBeneficiary(beneficiary._id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderSchedulesScreen() {
    return (
      <section className="screen-grid">
        <div className="split-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Schedules</span>
                <h2>Future and recurring transfers</h2>
              </div>
            </div>

            <form className="stack-form" onSubmit={handleScheduleSubmit}>
              <label>
                Source account
                <select
                  value={scheduleForm.fromAccount}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      fromAccount: event.target.value
                    }))
                  }
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.nickname} | {account.accountNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Destination account ID
                <input
                  type="text"
                  value={scheduleForm.toAccount}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      toAccount: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label>
                Amount
                <input
                  min="1"
                  step="0.01"
                  type="number"
                  value={scheduleForm.amount}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      amount: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label>
                Frequency
                <select
                  value={scheduleForm.frequency}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      frequency: event.target.value
                    }))
                  }
                >
                  <option value="ONCE">One-time</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </label>

              <label>
                Next run date
                <input
                  type="datetime-local"
                  value={scheduleForm.nextRunAt}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      nextRunAt: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label>
                Note
                <input
                  type="text"
                  value={scheduleForm.note}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      note: event.target.value
                    }))
                  }
                />
              </label>

              <button className="primary-button" disabled={actionLoading} type="submit">
                Create schedule
              </button>
            </form>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Runbook</span>
                <h2>Upcoming payment jobs</h2>
              </div>
              <button className="ghost-button" onClick={handleProcessSchedules} type="button">
                Process due now
              </button>
            </div>

            <div className="table-list">
              {schedules.length === 0 ? (
                <div className="empty-state compact">
                  <p>No payment schedules yet.</p>
                  <span>Add future transfers or recurring payment rails here.</span>
                </div>
              ) : (
                schedules.map((schedule) => (
                  <div className="table-row" key={schedule._id}>
                    <div>
                      <strong>{schedule.frequency}</strong>
                      <p>{formatDate(schedule.nextRunAt)}</p>
                    </div>
                    <div className="row-meta">
                      <span className={`status-chip ${schedule.status.toLowerCase()}`}>{schedule.status}</span>
                      <button
                        className="ghost-button small"
                        onClick={() =>
                          handleUpdateScheduleStatus(
                            schedule._id,
                            schedule.status === "PAUSED" ? "ACTIVE" : "PAUSED"
                          )
                        }
                        type="button"
                      >
                        {schedule.status === "PAUSED" ? "Resume" : "Pause"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderStatementsScreen() {
    return (
      <section className="screen-grid">
        <article className="panel-card">
          <div className="section-heading" style={{ flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span className="eyebrow">Statements</span>
              <h2>Passbook and running balance</h2>
            </div>

            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <select
                className="screen-select"
                value={statementAccountId}
                onChange={(event) => setStatementAccountId(event.target.value)}
                style={{ width: "auto" }}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.nickname} | {account.accountNumber}
                  </option>
                ))}
              </select>
              {statementAccountId && (
                <button
                  className="primary-button small"
                  onClick={handleExportPdfStatement}
                  disabled={actionLoading}
                  type="button"
                  style={{ padding: "10px 16px", fontSize: "0.9rem" }}
                >
                  {actionLoading ? "Exporting..." : "Download PDF"}
                </button>
              )}
            </div>
          </div>

          <div className="statement-list">
            {statement.map((entry) => (
              <div className="statement-row" key={entry._id}>
                <div>
                  <strong>{entry.type}</strong>
                  <p>{entry.transaction?.note || formatDate(entry.transaction?.createdAt)}</p>
                </div>
                <div className="row-meta statement-meta">
                  <strong>{formatCurrency(entry.amount)}</strong>
                  <span>Running: {formatCurrency(entry.runningBalance)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    );
  }

  function renderReportsScreen() {
    const totalTypes = [
      { label: "Transfers", value: reportSummary.byType.TRANSFER || 0, tone: "transfer" },
      { label: "Deposits", value: reportSummary.byType.DEPOSIT || 0, tone: "deposit" },
      { label: "Withdrawals", value: reportSummary.byType.WITHDRAWAL || 0, tone: "withdrawal" }
    ];
    const maxVolume = Math.max(...totalTypes.map((item) => item.value), 1);

    return (
      <section className="screen-grid">
        <div className="metrics-grid">
          <article className="metric-card">
            <span>Transfers</span>
            <strong>{formatCurrency(reportSummary.byType.TRANSFER || 0)}</strong>
            <small>Total transfer flow</small>
          </article>
          <article className="metric-card">
            <span>Deposits</span>
            <strong>{formatCurrency(reportSummary.byType.DEPOSIT || 0)}</strong>
            <small>Funds moved into accounts</small>
          </article>
          <article className="metric-card">
            <span>Withdrawals</span>
            <strong>{formatCurrency(reportSummary.byType.WITHDRAWAL || 0)}</strong>
            <small>Funds moved out of accounts</small>
          </article>
          <article className="metric-card">
            <span>Flagged count</span>
            <strong>{reportSummary.flagged}</strong>
            <small>Risk events tracked</small>
          </article>
        </div>

        <div className="split-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Flow Mix</span>
                <h2>Movement composition</h2>
              </div>
            </div>

            <div className="volume-bars">
              {totalTypes.map((item) => (
                <div className="volume-row" key={item.label}>
                  <div className="volume-copy">
                    <strong>{item.label}</strong>
                    <span>{formatCurrency(item.value)}</span>
                  </div>
                  <div className="volume-track">
                    <div
                      className={`volume-fill ${item.tone}`}
                      style={{ width: `${Math.max((item.value / maxVolume) * 100, 8)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Exports</span>
                <h2>Compliance-ready report output</h2>
              </div>
              <button className="primary-button" onClick={handleExportReport} type="button">
                Export transactions CSV
              </button>
            </div>

            <div className="note-panel">
              <strong>Included in export</strong>
              <p>Type, status, amount, from and to account numbers, flag reasons, notes, and timestamps.</p>
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderAdminScreen() {
    if (!adminOverview) {
      return (
        <section className="screen-grid">
          <article className="panel-card">
            <div className="empty-state compact">
              <p>Admin data is loading.</p>
              <span>Refresh the platform once your admin account is configured.</span>
            </div>
          </article>
        </section>
      );
    }

    return (
      <section className="screen-grid">
        <div className="metrics-grid">
          <article className="metric-card">
            <span>Total users</span>
            <strong>{adminOverview.metrics.totalUsers}</strong>
            <small>Platform customer count</small>
          </article>
          <article className="metric-card">
            <span>Total accounts</span>
            <strong>{adminOverview.metrics.totalAccounts}</strong>
            <small>Accounts across the product</small>
          </article>
          <article className="metric-card">
            <span>Total transactions</span>
            <strong>{adminOverview.metrics.totalTransactions}</strong>
            <small>All payment events</small>
          </article>
          <article className="metric-card">
            <span>Flagged</span>
            <strong>{adminOverview.metrics.flaggedTransactions}</strong>
            <small>Alerts requiring operator review</small>
          </article>
        </div>

        <div className="split-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Users</span>
                <h2>Recent customer onboarding</h2>
              </div>
            </div>
            <div className="table-list">
              {adminOverview.recentUsers.map((user) => (
                <div className="table-row" key={user._id}>
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.email}</p>
                  </div>
                  <div className="row-meta">
                    <span className="status-chip active">{user.role}</span>
                    <strong>{formatDate(user.createdAt)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Controls</span>
                <h2>Account status controls</h2>
              </div>
            </div>
            <div className="table-list">
              {adminOverview.accounts.map((account) => (
                <div className="table-row" key={account._id}>
                  <div>
                    <strong>{account.user?.name}</strong>
                    <p>{account.accountNumber}</p>
                  </div>
                  <div className="row-meta">
                    <span className={`status-chip ${account.status.toLowerCase()}`}>{account.status}</span>
                    <button
                      className="ghost-button small"
                      onClick={() =>
                        handleAccountStatusUpdate(
                          account._id,
                          account.status === "ACTIVE" ? "FROZEN" : "ACTIVE"
                        )
                      }
                      type="button"
                    >
                      {account.status === "ACTIVE" ? "Freeze" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function renderCurrentScreen() {
    switch (currentScreen) {
      case "accounts":
        return renderAccountsScreen();
      case "payments":
        return renderPaymentsScreen();
      case "beneficiaries":
        return renderBeneficiariesScreen();
      case "schedules":
        return renderSchedulesScreen();
      case "statements":
        return renderStatementsScreen();
      case "reports":
        return renderReportsScreen();
      case "admin":
        return renderAdminScreen();
      case "overview":
      default:
        return renderOverviewScreen();
    }
  }

  if (!isLoggedIn) {
    return <div className="app-shell">{renderAuth()}</div>;
  }

  return (
    <div className="bank-shell">
      <div className="shell-glow shell-glow-left" />
      <div className="shell-glow shell-glow-right" />
      <aside className="sidebar">
        <div className="sidebar-beam sidebar-beam-top" />
        <div className="sidebar-beam sidebar-beam-bottom" />
        <div className="brand-block">
          <div className="brand-logo">
            <div className="brand-logo-ring" />
            <div className="brand-logo-core">LB</div>
          </div>
          <span className="eyebrow">Ledger Bank</span>
          <h1>Banking Suite</h1>
          <p>Accounts, payments, statements, controls.</p>
          <div className="brand-meter">
            <span />
            <span />
            <span />
          </div>
        </div>

        <nav className="sidebar-nav">
          {enrichedNavItems.map((item) => (
            <button
              className={currentScreen === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              type="button"
            >
              <span className="nav-code">{item.code}</span>
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <span>{item.accent}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="ledger-ticker-wrap">
          <div className="ledger-ticker-content">
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Rails: Secure (AES-256)
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Ping: 14ms
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Verification: 100%
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Node: Synced
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Rails: Secure (AES-256)
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Ping: 14ms
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Verification: 100%
            </span>
            <span>
              <span className="ledger-ticker-status-dot"></span>
              Node: Synced
            </span>
          </div>
        </div>

        <div className="sidebar-footer">
          <div>
            <strong>{session.user?.name}</strong>
            <p>{session.user?.role}</p>
          </div>
          <button className="ghost-button" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </aside>

      <main className="workspace">
        <div className="workspace-gridline workspace-gridline-x" />
        <div className="workspace-gridline workspace-gridline-y" />
        <div className="workspace-orb workspace-orb-a" />
        <div className="workspace-orb workspace-orb-b" />
        <div className="workspace-orb workspace-orb-c" />

        <header className="workspace-header">
          <div className="workspace-heading">
            <span className="eyebrow">Digital Operations</span>
            <h2>{activeScreen?.label || "Overview"}</h2>
            <p>{activeScreen?.accent || "Professional banking workspace"}</p>
          </div>

          <div className="header-actions">
            <HudClock />
            <div className="live-indicator">
              <span className="live-dot" />
              <span>Ledger synced</span>
            </div>
            <button className="ghost-button" onClick={() => bootstrapDashboard()} type="button">
              {dataLoading ? "Refreshing..." : "Refresh data"}
            </button>
          </div>
        </header>

        <section className="workspace-ribbon">
          <div className="ribbon-card">
            <span className="eyebrow">Live Balance</span>
            <strong>{formatCurrency(totalBalance)}</strong>
            <small>Across all active accounts</small>
            <div className="ribbon-spark" />
          </div>
          <div className="ribbon-card">
            <span className="eyebrow">Accounts</span>
            <strong>{accounts.length}</strong>
            <small>Mapped to this identity</small>
            <div className="ribbon-spark" />
          </div>
          <div className="ribbon-card">
            <span className="eyebrow">Alerts</span>
            <strong>{fraudAlerts.length}</strong>
            <small>Risk queue requiring attention</small>
            <div className="ribbon-spark" />
          </div>
        </section>

        {statusMessage ? <div className="workspace-message">{statusMessage}</div> : null}
        <div className="screen-stage" key={screenTransitionKey}>
          {renderCurrentScreen()}
        </div>
      </main>

      {otpOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <span className="eyebrow">Security Verification</span>
            <h2>Enter Transfer OTP</h2>
            <p>A 6-digit confirmation code was sent to your registered email to approve this transfer.</p>

            <form onSubmit={handleVerifyTransferOtp}>
              <input
                type="text"
                maxLength="6"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="otp-input-field"
                required
                autoFocus
              />
              {otpError ? <p className="error-text" style={{ color: "var(--rose)", marginTop: "12px", fontSize: "0.9rem" }}>{otpError}</p> : null}

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={otpLoading}
                  style={{ flex: 1 }}
                >
                  {otpLoading ? "Verifying..." : "Verify Code"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setOtpOpen(false);
                    setOtpCode("");
                    setOtpTransactionId("");
                    setOtpError("");
                  }}
                  style={{ padding: "10px 16px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
