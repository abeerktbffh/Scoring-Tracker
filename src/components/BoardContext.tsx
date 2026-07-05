"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listMyGroups } from "@/lib/api";
import { loadBoardId, saveBoardId } from "@/lib/currentBoard";

export type Board = { id: string; name: string; role: "admin" | "member" };

export interface BoardContextValue {
  boardId: string | null;
  board: Board | null;
  groups: Board[];
  loading: boolean;
  select(id: string | null): void;
  refresh(): Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) {
    throw new Error("useBoard must be used within a BoardProvider");
  }
  return ctx;
}

export function BoardProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [boardId, setBoardId] = useState<string | null>(() => loadBoardId());
  const [groups, setGroups] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    const result = await listMyGroups();
    if (result.ok) {
      const fetched = result.data.groups;
      setGroups(fetched);
      setBoardId((current) => {
        if (current !== null && !fetched.some((g) => g.id === current)) {
          saveBoardId(null);
          return null;
        }
        return current;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const select = useCallback((id: string | null) => {
    saveBoardId(id);
    setBoardId(id);
  }, []);

  const refresh = useCallback(async () => {
    await fetchGroups();
  }, [fetchGroups]);

  const board = groups.find((g) => g.id === boardId) ?? null;

  return (
    <BoardContext.Provider value={{ boardId, board, groups, loading, select, refresh }}>
      {children}
    </BoardContext.Provider>
  );
}
