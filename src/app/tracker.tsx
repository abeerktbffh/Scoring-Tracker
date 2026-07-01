"use client";
import { useState, useEffect, useCallback } from "react";

type Row = { displayName: string; wins: number };

export function Tracker() {
  const [authed, setAuthed] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState<Row[]>([]);

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setBoard(data.players);
        setAuthed(true);
      } else if (res.status === 401) {
        // Normal unauthenticated state — the gate is shown; stay silent.
      } else {
        setAuthed((prev) => {
          if (prev) setMessage("Couldn't refresh the leaderboard — try again.");
          return prev;
        });
      }
    } catch {
      setAuthed((prev) => {
        if (prev) setMessage("Couldn't refresh the leaderboard — try again.");
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) {
      setAuthed(true);
      loadBoard();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Wrong passphrase");
    }
  }

  async function submitScore(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, pin, rawInput }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Saved: ${data.parsed?.gameId ?? "entry"} (${data.parsed?.value ?? ""})`);
      setRawInput("");
      loadBoard();
    } else {
      setMessage(data.error ?? "Something went wrong — try again.");
    }
  }

  if (!authed) {
    return (
      <form onSubmit={submitPassphrase}>
        <h1>Enter group passphrase</h1>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="passphrase"
        />
        <button type="submit">Enter</button>
        <p>{message}</p>
      </form>
    );
  }

  return (
    <main>
      <h1>Scoring Tracker</h1>
      <form onSubmit={submitScore}>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder="Paste your result (e.g. Wordle 1,234 3/6)"
        />
        <button type="submit">Submit score</button>
      </form>
      <p>{message}</p>
      <h2>Today — Wins</h2>
      <table>
        <thead>
          <tr><th>Player</th><th>Wins</th></tr>
        </thead>
        <tbody>
          {board.map((r) => (
            <tr key={r.displayName}><td>{r.displayName}</td><td>{r.wins}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
