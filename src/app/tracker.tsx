"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { parseClock } from "@/lib/time";

type Row = { displayName: string; wins: number };
type Game = { id: string; name: string; type: string; metricDirection: string; hasVariants: boolean };

export function Tracker() {
  const [authed, setAuthed] = useState(false);
  const authedRef = useRef(false);
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("");
  const [board, setBoard] = useState<Row[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState("");
  const [variant, setVariant] = useState("easy");
  const [manualValue, setManualValue] = useState("");
  const [solved, setSolved] = useState(true);

  const markAuthed = () => { setAuthed(true); authedRef.current = true; };

  const loadGames = useCallback(async () => {
    const res = await fetch("/api/games");
    if (res.ok) {
      const data = await res.json();
      setGames(data.games);
      if (data.games[0] && !gameId) setGameId(data.games[0].id);
    }
  }, [gameId]);

  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setBoard(data.players);
        markAuthed();
        return;
      }
      if (res.status === 401) return; // not authenticated yet — show gate
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    } catch {
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (authed) loadGames();
  }, [authed, loadGames]);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) { markAuthed(); loadBoard(); loadGames(); }
    else { const data = await res.json().catch(() => ({})); setMessage(data.error ?? "Wrong passphrase"); }
  }

  async function submitEntry(payload: object) {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, pin, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Saved: ${data.parsed?.gameId ?? "entry"} (${data.parsed?.value ?? ""})`);
      loadBoard();
      return true;
    }
    setMessage(data.error ?? "Something went wrong — try again.");
    return false;
  }

  async function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    if (await submitEntry({ rawInput })) setRawInput("");
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const game = games.find((g) => g.id === gameId);
    if (!game) { setMessage("Pick a game"); return; }
    let value: number | null;
    if (game.type === "timed") value = parseClock(manualValue);
    else value = /^\d+$/.test(manualValue.trim()) ? Number(manualValue.trim()) : null;
    if (value === null) { setMessage("Enter a valid value (time as m:ss, or a number)"); return; }
    if (await submitEntry({ gameId, variant: game.hasVariants ? variant : null, value, solved })) setManualValue("");
  }

  if (!authed) {
    return (
      <form onSubmit={submitPassphrase}>
        <h1>Enter group passphrase</h1>
        <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="passphrase" />
        <button type="submit">Enter</button>
        <p>{message}</p>
      </form>
    );
  }

  const selectedGame = games.find((g) => g.id === gameId);

  return (
    <main>
      <h1>Scoring Tracker</h1>
      <section>
        <h2>Who are you?</h2>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
      </section>

      <section>
        <h2>Paste a result</h2>
        <form onSubmit={submitPaste}>
          <textarea value={rawInput} onChange={(e) => setRawInput(e.target.value)} placeholder="Paste your result (e.g. Wordle 1,234 3/6)" />
          <button type="submit">Submit paste</button>
        </form>
      </section>

      <section>
        <h2>Or enter manually</h2>
        <form onSubmit={submitManual}>
          <select value={gameId} onChange={(e) => { setGameId(e.target.value); setVariant("easy"); }}>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {selectedGame?.hasVariants && (
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          )}
          <input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder={selectedGame?.type === "timed" ? "time m:ss" : "guesses / mistakes"}
          />
          <label><input type="checkbox" checked={solved} onChange={(e) => setSolved(e.target.checked)} /> Solved</label>
          <button type="submit">Submit manually</button>
        </form>
      </section>

      <p>{message}</p>

      <h2>Today — Wins</h2>
      <table>
        <thead><tr><th>Player</th><th>Wins</th></tr></thead>
        <tbody>
          {board.map((r) => <tr key={r.displayName}><td>{r.displayName}</td><td>{r.wins}</td></tr>)}
        </tbody>
      </table>
    </main>
  );
}
