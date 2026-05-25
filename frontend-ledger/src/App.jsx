import { useEffect, useState } from "react";

const defaultAuthForm = {
  name: "",
  email: "",
  password: ""
};

const defaultTransferForm = {
  fromAccount: "",
  toAccount: "",
  amount: ""
};

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

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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

async function fetchHealthStatus() {
  const response = await fetch("/api/health");
  const data = await response.json().catch(() => ({}));

  if (!response.ok && !data.status) {
    throw new Error("Health check failed");
  }

  return data;
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [authForm, setAuthForm] = useState(defaultAuthForm);
  const [transferForm, setTransferForm] = useState(defaultTransferForm);
  const [authMessage, setAuthMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [sendingTransfer, setSendingTransfer] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [lastTransaction, setLastTransaction] = useState(null);
  const [session, setSession] = useState(getStoredSession);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [backendMessage, setBackendMessage] = useState("");
  const [googleMessage, setGoogleMessage] = useState("");
  const [googleReady, setGoogleReady] = useState(false);

  const isLoggedIn = Boolean(session.token && session.user);
  const totalBalance = Object.values(balances).reduce(
    (sum, balance) => sum + Number(balance || 0),
    0
  );

  useEffect(() => {
    if (isLoggedIn) {
      void loadAccounts(session.token);
    }
  }, [isLoggedIn, session.token]);

  useEffect(() => {
    void checkBackendHealth();
  }, []);

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

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton, { once: true });
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
  }, [isLoggedIn]);

  async function loadAccounts(token) {
    setDashboardLoading(true);
    setStatusMessage("");

    try {
      const accountResponse = await apiRequest("/api/accounts", {}, token);
      const nextAccounts = accountResponse.accounts || [];
      setAccounts(nextAccounts);

      const balanceEntries = await Promise.all(
        nextAccounts.map(async (account) => {
          const balanceResponse = await apiRequest(
            `/api/accounts/balance/${account._id}`,
            {},
            token
          );
          return [account._id, balanceResponse.balance];
        })
      );

      const nextBalances = Object.fromEntries(balanceEntries);
      setBalances(nextBalances);

      if (nextAccounts.length > 0) {
        setTransferForm((current) => ({
          ...current,
          fromAccount:
            current.fromAccount && nextBalances[current.fromAccount] !== undefined
              ? current.fromAccount
              : nextAccounts[0]._id
        }));
      }
    } catch (error) {
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setDashboardLoading(false);
    }
  }

  async function checkBackendHealth() {
    try {
      const response = await fetchHealthStatus();
      setBackendStatus(response.db?.connected ? "online" : "degraded");
      setBackendMessage(response.db?.message || "");
    } catch (error) {
      setBackendStatus("offline");
      setBackendMessage(getFriendlyErrorMessage(error));
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

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (mode === "register" && authForm.password.length < 6) {
      setAuthMessage("Password must be at least 6 characters long.");
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const endpoint =
        mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        mode === "register"
          ? authForm
          : { email: authForm.email, password: authForm.password };
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      persistSession({ token: response.token, user: response.user });
      setAuthForm(defaultAuthForm);
      setAuthMessage(
        mode === "register"
          ? "Account created and session started."
          : "Login successful."
      );
    } catch (error) {
      setAuthMessage(getFriendlyErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleGoogleClick() {
    setGoogleMessage("");

    if (!googleClientId) {
      setGoogleMessage(
        "Google sign-in needs VITE_GOOGLE_CLIENT_ID in the frontend and GOOGLE_CLIENT_ID in the backend."
      );
      return;
    }

    if (!googleReady) {
      setGoogleMessage(
        "Google sign-in is still loading. If it stays like this, restart the frontend after updating the .env file."
      );
    }
  }

  async function handleCreateAccount() {
    setCreatingAccount(true);
    setStatusMessage("");

    try {
      await apiRequest(
        "/api/accounts",
        { method: "POST", body: JSON.stringify({}) },
        session.token
      );
      await loadAccounts(session.token);
      setStatusMessage("A new account was created successfully.");
    } catch (error) {
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleTransferSubmit(event) {
    event.preventDefault();
    setSendingTransfer(true);
    setStatusMessage("");

    try {
      const payload = {
        ...transferForm,
        amount: Number(transferForm.amount),
        idempotencyKey: crypto.randomUUID()
      };

      const response = await apiRequest(
        "/api/transactions",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        session.token
      );

      setLastTransaction(response.transaction);
      setTransferForm((current) => ({
        ...current,
        toAccount: "",
        amount: ""
      }));
      await loadAccounts(session.token);
      setStatusMessage(response.message || "Transfer completed successfully.");
    } catch (error) {
      setStatusMessage(getFriendlyErrorMessage(error));
    } finally {
      setSendingTransfer(false);
    }
  }

  async function handleLogout() {
    try {
      if (session.token) {
        await apiRequest(
          "/api/auth/logout",
          { method: "POST", body: JSON.stringify({}) },
          session.token
        );
      }
    } catch {
      // Ignore logout failures and clear local session anyway.
    } finally {
      persistSession({ token: "", user: null });
      setAccounts([]);
      setBalances({});
      setLastTransaction(null);
      setStatusMessage("");
      setAuthMessage("You have been signed out.");
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      {!isLoggedIn ? (
        <main className="auth-layout">
          <section className="brand-panel">
            <span className="eyebrow">Ledger Bank</span>
            <h1>Professional banking operations, presented with clarity.</h1>
            <p>
              This React frontend sits on top of your ledger backend and gives
              you a polished control surface for onboarding users, opening
              accounts, and sending transfers.
            </p>

            <div className="feature-grid">
              <article>
                <h2>Secure access</h2>
                <p>Login and registration mapped to your live auth endpoints.</p>
              </article>
              <article>
                <h2>Balance visibility</h2>
                <p>Account balances are derived live from the ledger service.</p>
              </article>
              <article>
                <h2>Transfer workflow</h2>
                <p>Initiate real transactions with idempotency protection.</p>
              </article>
            </div>
          </section>

          <section className="auth-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Client Access</span>
                <p className={`service-status ${backendStatus}`}>
                  Backend status: {backendStatus}
                </p>
                {backendMessage ? (
                  <p className="service-detail">{backendMessage}</p>
                ) : null}
              </div>
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

            <form className="auth-form" onSubmit={handleAuthSubmit}>
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
                    placeholder="Aarav Mehta"
                    required
                  />
                </label>
              ) : null}

              <label>
                Email address
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
                  <span className="field-hint">
                    Password must contain at least 6 characters.
                  </span>
                ) : null}
              </label>

              <button className="primary-button" disabled={authLoading} type="submit">
                {authLoading
                  ? "Processing..."
                  : mode === "register"
                    ? "Create Profile"
                    : "Access Dashboard"}
              </button>

              {authMessage ? <p className="inline-message">{authMessage}</p> : null}
            </form>

            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            <div className="google-panel">
              <button
                className="google-fallback-button"
                onClick={handleGoogleClick}
                type="button"
              >
                <span className="google-mark">G</span>
                Continue with Google
              </button>

              {googleClientId ? (
                <div
                  className={`google-live-button ${googleReady ? "ready" : ""}`}
                  id="google-signin-button"
                />
              ) : (
                <p className="auth-hint">
                  Add <code>VITE_GOOGLE_CLIENT_ID</code> in the frontend and{" "}
                  <code>GOOGLE_CLIENT_ID</code> in the backend to enable Google
                  sign-in.
                </p>
              )}

              {googleMessage ? <p className="inline-message">{googleMessage}</p> : null}
            </div>
          </section>
        </main>
      ) : (
        <main className="dashboard-layout">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Operations Console</span>
              <h1>Welcome back, {session.user?.name}</h1>
              <p>
                Manage accounts, review balances, and execute controlled
                transfers from one place.
              </p>
            </div>

            <div className="header-actions">
              <button
                className="ghost-button"
                onClick={() => loadAccounts(session.token)}
                type="button"
              >
                {dashboardLoading ? "Refreshing..." : "Refresh data"}
              </button>
              <button className="ghost-button" onClick={handleLogout} type="button">
                Logout
              </button>
            </div>
          </header>

          <section className="summary-grid">
            <article className="summary-card highlighted">
              <span>Total balance</span>
              <strong>{formatCurrency(totalBalance)}</strong>
              <small>Combined across all active accounts</small>
            </article>
            <article className="summary-card">
              <span>Total accounts</span>
              <strong>{accounts.length}</strong>
              <small>Accounts linked to this user</small>
            </article>
            <article className="summary-card">
              <span>Latest transfer</span>
              <strong>
                {lastTransaction ? formatCurrency(lastTransaction.amount) : "No transfer"}
              </strong>
              <small>
                {lastTransaction ? lastTransaction.status : "No recent transaction yet"}
              </small>
            </article>
          </section>

          <section className="content-grid">
            <article className="card">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Accounts</span>
                  <h2>Your banking accounts</h2>
                </div>
                <button
                  className="primary-button"
                  disabled={creatingAccount}
                  onClick={handleCreateAccount}
                  type="button"
                >
                  {creatingAccount ? "Creating..." : "Open new account"}
                </button>
              </div>

              <div className="accounts-list">
                {accounts.length === 0 ? (
                  <div className="empty-state">
                    <p>No accounts found yet.</p>
                    <span>Create your first account to begin transactions.</span>
                  </div>
                ) : (
                  accounts.map((account) => (
                    <div className="account-row" key={account._id}>
                      <div>
                        <strong>{account.currency} settlement account</strong>
                        <p>{account._id}</p>
                      </div>
                      <div className="account-meta">
                        <span className={`status-pill ${account.status.toLowerCase()}`}>
                          {account.status}
                        </span>
                        <strong>{formatCurrency(balances[account._id])}</strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="card">
              <div className="section-title">
                <div>
                  <span className="eyebrow">Transfers</span>
                  <h2>Move funds securely</h2>
                </div>
              </div>

              <form className="transfer-form" onSubmit={handleTransferSubmit}>
                <label>
                  Debit from
                  <select
                    value={transferForm.fromAccount}
                    onChange={(event) =>
                      setTransferForm((current) => ({
                        ...current,
                        fromAccount: event.target.value
                      }))
                    }
                    required
                  >
                    <option value="">Select an account</option>
                    {accounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.currency} | {account._id.slice(-8)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Credit to account ID
                  <input
                    type="text"
                    value={transferForm.toAccount}
                    onChange={(event) =>
                      setTransferForm((current) => ({
                        ...current,
                        toAccount: event.target.value
                      }))
                    }
                    placeholder="Paste destination account ID"
                    required
                  />
                </label>

                <label>
                  Amount
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={transferForm.amount}
                    onChange={(event) =>
                      setTransferForm((current) => ({
                        ...current,
                        amount: event.target.value
                      }))
                    }
                    placeholder="2500"
                    required
                  />
                </label>

                <button
                  className="primary-button"
                  disabled={sendingTransfer || accounts.length === 0}
                  type="submit"
                >
                  {sendingTransfer ? "Processing transfer..." : "Initiate transfer"}
                </button>
              </form>

              {statusMessage ? <p className="inline-message">{statusMessage}</p> : null}
            </article>
          </section>
        </main>
      )}
    </div>
  );
}
