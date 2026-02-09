import { FormEvent, useState } from "react";

interface LoginFormProps {
  onLogin: (identifier: string, password: string) => Promise<void>;
  loading: boolean;
}

export function LoginForm({ onLogin, loading }: LoginFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(identifier, password);
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h2>Sign In</h2>
      <p className="muted">Enter the email and password provided by your admin.</p>
      <label>
        Email
        <input
          type="email"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
