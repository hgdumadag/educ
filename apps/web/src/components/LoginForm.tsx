import { FormEvent, useState } from "react";

interface LoginFormProps {
  onLogin: (identifier: string, password: string) => Promise<void>;
  loading: boolean;
}

export function LoginForm({ onLogin, loading }: LoginFormProps) {
  const [identifier, setIdentifier] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(identifier, password);
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h2>Sign In</h2>
      <label>
        Email
        <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
