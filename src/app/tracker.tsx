"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { parseClock } from "@/lib/time";

type Game = { id: string; name: string; type: string; metricDirection: string; hasVariants: boolean };
type OverallRow = { displayName: string; wins: number; gamesPlayed: number; winRate: number };
type GameRow = {
  displayName: string; wins: number; gamesPlayed: number;
  bestValue: number | null; currentStreak: number; longestStreak: number;
};
type Window = "daily" | "weekly" | "monthly" | "all";
type SortKey = "wins" | "gamesPlayed" | "winRate";

export function Tracker() {
  const [authed, setAuthed] = useState(false);
  const authedRef = useRef(false);
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [message, setMessage] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState("");
  const [variant, setVariant] = useState("easy");
  const [manualValue, setManualValue] = useState("");
  const [solved, setSolved] = useState(true);

  const [window, setWindow] = useState<Window>("daily");
  const [overall, setOverall] = useState<OverallRow[]>([]);
  const [overallLocked, setOverallLocked] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [boardGameId, setBoardGameId] = useState("");
  const [gameBoard, setGameBoard] = useState<GameRow[]>([]);
  const [boardLocked, setBoardLocked] = useState(false);

  const [adminPass, setAdminPass] = useState("");
  const [players, setPlayers] = useState<{ id: string; displayName: string }[]>([]);
  const [ng, setNg] = useState({ id: "", name: "", type: "timed", metricDirection: "lower_better", hasVariants: false, parserId: "" });

  const markAuthed = () => { setAuthed(true); authedRef.current = true; };

  const loadOverall = useCallback(async (w: Window) => {
    try {
      const res = await fetch(`/api/leaderboard?window=${w}&player=${encodeURIComponent(displayName)}`);
      if (res.ok) { const d = await res.json(); setOverall(d.players); setOverallLocked(!!d.locked); markAuthed(); return; }
      if (res.status === 401) return;
      if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again.");
    } catch { if (authedRef.current) setMessage("Couldn't refresh the leaderboard — try again."); }
  }, [displayName]);

  const loadGames = useCallback(async () => {
    const res = await fetch("/api/games");
    if (res.ok) {
      const data = await res.json();
      setGames(data.games);
      if (data.games[0]) { setGameId((g) => g || data.games[0].id); setBoardGameId((g) => g || data.games[0].id); }
    }
  }, []);

  const loadGameBoard = useCallback(async (g: string, w: Window) => {
    if (!g) return;
    const res = await fetch(`/api/games/${g}/board?window=${w}&player=${encodeURIComponent(displayName)}`);
    if (res.ok) { const d = await res.json(); setGameBoard(d.players); setBoardLocked(!!d.locked); }
  }, [displayName]);

  const loadPlayers = useCallback(async () => {
    const res = await fetch("/api/players");
    if (res.ok) setPlayers((await res.json()).players);
  }, []);

  useEffect(() => { loadOverall(window); }, [loadOverall, window]);
  useEffect(() => { if (authed) loadGames(); }, [authed, loadGames]);
  useEffect(() => { if (authed && boardGameId) loadGameBoard(boardGameId, window); }, [authed, boardGameId, window, loadGameBoard]);
  useEffect(() => { if (authed) loadPlayers(); }, [authed, loadPlayers]);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (res.ok) { markAuthed(); loadOverall(window); loadGames(); }
    else { const d = await res.json().catch(() => ({})); setMessage(d.error ?? "Wrong passphrase"); }
  }

  async function submitEntry(payload: object) {
    const res = await fetch("/api/entries", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, pin, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Saved: ${data.parsed?.gameId ?? "entry"} (${data.parsed?.value ?? ""})`);
      loadOverall(window);
      loadGameBoard(boardGameId, window);
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
    const value = game.type === "timed"
      ? parseClock(manualValue)
      : (/^\d+$/.test(manualValue.trim()) ? Number(manualValue.trim()) : null);
    if (value === null) { setMessage("Enter a valid value (time as m:ss, or a number)"); return; }
    if (await submitEntry({ gameId, variant: game.hasVariants ? variant : null, value, solved })) setManualValue("");
  }

  async function addGame(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/games", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPassphrase: adminPass, ...ng }),
    });
    const d = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Added game: ${d.game?.name}` : (d.error ?? "Add game failed"));
    if (res.ok) { setNg({ id: "", name: "", type: "timed", metricDirection: "lower_better", hasVariants: false, parserId: "" }); loadGames(); }
  }

  async function renamePlayer(playerId: string, newName: string) {
    const res = await fetch("/api/admin/players/rename", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPassphrase: adminPass, playerId, newName }),
    });
    const d = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Renamed" : (d.error ?? "Rename failed"));
    if (res.ok) { loadPlayers(); loadOverall(window); }
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
  const sortedOverall = [...overall].sort((a, b) => b[sortKey] - a[sortKey]);
  const th = (label: string, key: SortKey) => (
    <th onClick={() => setSortKey(key)} style={{ cursor: "pointer" }}>
      {label}{sortKey === key ? " ▼" : ""}
    </th>
  );

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
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          )}
          <input value={manualValue} onChange={(e) => setManualValue(e.target.value)}
            placeholder={selectedGame?.type === "timed" ? "time m:ss" : "guesses / mistakes"} />
          <label><input type="checkbox" checked={solved} onChange={(e) => setSolved(e.target.checked)} /> Solved</label>
          <button type="submit">Submit manually</button>
        </form>
      </section>

      <p>{message}</p>

      <section>
        <h2>Leaderboard</h2>
        <label>Window:{" "}
          <select value={window} onChange={(e) => setWindow(e.target.value as Window)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option><option value="all">All-time</option>
          </select>
        </label>
        {overallLocked
          ? <p>Play today&apos;s puzzles to reveal today&apos;s leaderboard.</p>
          : (
            <table>
              <thead><tr><th>Player</th>{th("Wins", "wins")}{th("Played", "gamesPlayed")}{th("Win %", "winRate")}</tr></thead>
              <tbody>
                {sortedOverall.map((r) => (
                  <tr key={r.displayName}>
                    <td>{r.displayName}</td><td>{r.wins}</td><td>{r.gamesPlayed}</td><td>{Math.round(r.winRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section>
        <h2>Per-game board</h2>
        <select value={boardGameId} onChange={(e) => setBoardGameId(e.target.value)}>
          {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {boardLocked
          ? <p>Play today&apos;s game to see today&apos;s board.</p>
          : (
            <table>
              <thead><tr><th>Player</th><th>Wins</th><th>Best</th><th>Current streak</th><th>Longest streak</th></tr></thead>
              <tbody>
                {gameBoard.map((r) => (
                  <tr key={r.displayName}>
                    <td>{r.displayName}</td><td>{r.wins}</td><td>{r.bestValue ?? "—"}</td>
                    <td>{r.currentStreak}</td><td>{r.longestStreak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section>
        <h2>Admin</h2>
        <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="admin passphrase" />
        <h3>Add a game</h3>
        <form onSubmit={addGame}>
          <input value={ng.id} onChange={(e) => setNg({ ...ng, id: e.target.value })} placeholder="id (e.g. strands)" />
          <input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder="Name" />
          <select value={ng.type} onChange={(e) => setNg({ ...ng, type: e.target.value })}>
            <option value="timed">timed</option><option value="outcome">outcome</option>
          </select>
          <select value={ng.metricDirection} onChange={(e) => setNg({ ...ng, metricDirection: e.target.value })}>
            <option value="lower_better">lower is better</option><option value="higher_better">higher is better</option>
          </select>
          <label><input type="checkbox" checked={ng.hasVariants} onChange={(e) => setNg({ ...ng, hasVariants: e.target.checked })} /> has difficulties</label>
          <input value={ng.parserId} onChange={(e) => setNg({ ...ng, parserId: e.target.value })} placeholder="parserId (optional)" />
          <button type="submit">Add game</button>
        </form>
        <h3>Players</h3>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              <RenameRow player={p} onRename={renamePlayer} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function RenameRow({ player, onRename }: { player: { id: string; displayName: string }; onRename: (id: string, name: string) => void }) {
  const [name, setName] = useState(player.displayName);
  useEffect(() => setName(player.displayName), [player.displayName]);
  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={() => onRename(player.id, name)}>Rename</button>
    </>
  );
}
