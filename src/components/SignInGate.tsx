import React, { useState } from "react";
import { postAuth } from "@/lib/api";
import { loadName, saveName, clearName } from "@/lib/rememberMe";
import { Button } from "./Button";
import styles from "./SignInGate.module.css";

export interface SignInGateProps {
  onAuthed: () => void;
}

export function SignInGate({ onAuthed }: SignInGateProps): JSX.Element {
  const [passphrase, setPassphrase] = useState("");
  const [name, setName] = useState(() => loadName() ?? "");
  const [remember, setRemember] = useState(() => loadName() !== null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (remember) {
      if (value.trim()) {
        saveName(value);
      } else {
        clearName();
      }
    }
  }

  function handleRememberChange(checked: boolean) {
    setRemember(checked);
    if (checked) {
      if (name.trim()) saveName(name);
    } else {
      clearName();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await postAuth(passphrase);
    setSubmitting(false);
    if (result.ok) {
      onAuthed();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <p className={styles.kicker}>Bragboard</p>
        <h1 className={styles.headline}>The daily standings, kept honest.</h1>
        <p className={styles.sub}>Enter your group&rsquo;s passphrase to see today&rsquo;s board.</p>

        <label className={styles.label} htmlFor="signin-passphrase">
          Group passphrase
        </label>
        <input
          id="signin-passphrase"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />

        <label className={styles.label} htmlFor="signin-name">
          Your name
        </label>
        <input
          id="signin-name"
          className={styles.input}
          type="text"
          placeholder="Who are you?"
          autoComplete="name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
        />

        <label className={styles.checkboxRow} htmlFor="signin-remember">
          <input
            id="signin-remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => handleRememberChange(e.target.checked)}
          />
          Remember me on this device
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <Button type="submit" variant="primary" className={styles.submit} disabled={submitting}>
          {submitting ? "Checking…" : "Enter"}
        </Button>
      </form>
    </div>
  );
}
