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
  { id: "overview", label: "Overview", accent: "Command center" },
  { id: "accounts", label: "Accounts", accent: "Portfolio" },
  { id: "payments", label: "Payments", accent: "Movement" },
  { id: "beneficiaries", label: "Beneficiaries", accent: "Trusted payees" },
  { id: "schedules", label: "Schedules", accent: "Automation" },
  { id: "statements", label: "Statements", accent: "Passbook" },
  { id: "reports", label: "Reports", accent: "Exports" }
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
    throw new Error(data.message || "Request failed");
  }

  return data;
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

  const isLoggedIn = Boolean(session.token && session.user);
  const isAdmin = session.user?.role === "ADMIN";
  const enrichedNavItems = isAdmin
    ? [ ...navItems, { id: "admin", label: "Admin", accent: "Controls" } ]
    : navItems;

  const totalBalance = Object.values(balances).reduce(
    (sum, balance) => sum + Number(balance || 0),
    0
  );
  const activeScreen = enrichedNavItems.find((item) => item.id === currentScreen) || enrichedNavItems[0];

  useEffect(() => {
    void loadGoogleConfig();
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
        apiRequest("/api/transactions?limit=50", {}, session.token),
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
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setDataLoading(false);
    }
  }

  async function loadStatement(accountId) {
    try {
      const response = await apiRequest(`/api/accounts/statement/${accountId}`, {}, session.token);
      setStatement(response.statement || []);
    } catch (error) {
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

      setStatusMessage(response.message || "Payment completed successfully.");
      setPaymentForm((current) => ({
        ...defaultPaymentForm,
        type: current.type,
        fromAccount: current.fromAccount
      }));
      await bootstrapDashboard();
    } catch (error) {
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
        </section>
      </main>
    );
  }

  function renderOverviewScreen() {
    return (
      <section className="screen-grid">
        <div className="metrics-grid">
          <article className="metric-card accent">
            <span>Total balance</span>
            <strong>{formatCurrency(totalBalance)}</strong>
            <small>Across all active accounts</small>
          </article>
          <article className="metric-card">
            <span>Total accounts</span>
            <strong>{accounts.length}</strong>
            <small>Retail and settlement accounts</small>
          </article>
          <article className="metric-card">
            <span>Flagged alerts</span>
            <strong>{fraudAlerts.length}</strong>
            <small>Transactions needing review</small>
          </article>
          <article className="metric-card">
            <span>Total volume</span>
            <strong>{formatCurrency(reportSummary.totalVolume)}</strong>
            <small>All completed customer activity</small>
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
              <div className="account-card" key={account._id}>
                <div>
                  <span className="eyebrow">Account</span>
                  <h3>{account.nickname}</h3>
                  <p>{account.accountNumber}</p>
                </div>
                <div className="account-card-footer">
                  <span className={`status-chip ${account.status.toLowerCase()}`}>{account.status}</span>
                  <strong>{formatCurrency(balances[account._id])}</strong>
                </div>
                {isAdmin ? (
                  <div className="inline-actions">
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
            </div>

            <div className="table-list">
              {transactions.slice(0, 8).map((transaction) => (
                <div className="table-row" key={transaction._id}>
                  <div>
                    <strong>{transaction.type}</strong>
                    <p>{transaction.note || formatDate(transaction.createdAt)}</p>
                  </div>
                  <div className="row-meta">
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
          <div className="section-heading">
            <div>
              <span className="eyebrow">Statements</span>
              <h2>Passbook and running balance</h2>
            </div>

            <select
              className="screen-select"
              value={statementAccountId}
              onChange={(event) => setStatementAccountId(event.target.value)}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account._id} value={account._id}>
                  {account.nickname} | {account.accountNumber}
                </option>
              ))}
            </select>
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
        <div className="brand-block">
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
              <strong>{item.label}</strong>
              <span>{item.accent}</span>
            </button>
          ))}
        </nav>

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
        <header className="workspace-header">
          <div className="workspace-heading">
            <span className="eyebrow">Digital Operations</span>
            <h2>{activeScreen?.label || "Overview"}</h2>
            <p>{activeScreen?.accent || "Professional banking workspace"}</p>
          </div>

          <div className="header-actions">
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
          </div>
          <div className="ribbon-card">
            <span className="eyebrow">Accounts</span>
            <strong>{accounts.length}</strong>
            <small>Mapped to this identity</small>
          </div>
          <div className="ribbon-card">
            <span className="eyebrow">Alerts</span>
            <strong>{fraudAlerts.length}</strong>
            <small>Risk queue requiring attention</small>
          </div>
        </section>

        {statusMessage ? <div className="workspace-message">{statusMessage}</div> : null}
        {renderCurrentScreen()}
      </main>
    </div>
  );
}
