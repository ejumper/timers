export interface Env {
    TIMERS: any;
  }
  
  interface Timer {
    id: string;
    label: string;
    durationMs: number;
    state: "idle" | "running" | "paused" | "finished";
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    elapsedMs: number;
  }
  
  interface Board {
    boardId: string;
    timers: Timer[];
  }
  
  export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
  
      // /api/boards/<boardId>/timers
      const match = pathname.match(/^\/api\/boards\/([^/]+)\/timers$/);
      if (!match) {
        return new Response("Not found", { status: 404 });
      }
  
      const boardId = match[1];
  
      if (request.method === "GET") {
        const board = await loadBoard(env, boardId);
        return json(board);
      }
  
      if (request.method === "POST") {
        const body = await request.json();
        const board = await loadBoard(env, boardId);
        const updated = applyCommand(board, body);
        await saveBoard(env, boardId, updated);
        return json(updated);
      }
  
      return new Response("Method not allowed", { status: 405 });
    },
  };
  
  // ---------- helpers ----------
  
  function json(data: unknown): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }
  
  function emptyBoard(boardId: string): Board {
    return { boardId, timers: [] };
  }
  
  async function loadBoard(env: Env, boardId: string): Promise<Board> {
    const raw = await env.TIMERS.get(boardKey(boardId));
    if (!raw) return emptyBoard(boardId);
    try {
      return JSON.parse(raw) as Board;
    } catch {
      return emptyBoard(boardId);
    }
  }
  
  async function saveBoard(env: Env, boardId: string, board: Board): Promise<void> {
    await env.TIMERS.put(boardKey(boardId), JSON.stringify(board));
  }
  
  function boardKey(boardId: string): string {
    return `board:${boardId}`;
  }
  
  // ---------- timer logic (clock-based) ----------
  
  function applyCommand(board: Board, body: any): Board {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const action = body?.action;
  
    if (action === "create") {
      const { label, durationMs } = body.payload ?? {};
      const id = crypto.randomUUID();
      const timer: Timer = {
        id,
        label: label || "Timer",
        durationMs: Number(durationMs) || 0,
        state: "idle",
        createdAt: nowIso,
        updatedAt: nowIso,
        startedAt: null,
        elapsedMs: 0,
      };
      board.timers.push(timer);
      return board;
    }
  
    if (action === "command") {
      const { id, command } = body.payload ?? {};
      const timer = board.timers.find((t) => t.id === id);
      if (!timer) return board;
  
      if (command === "start") {
        if (timer.state === "idle" || timer.state === "paused") {
          timer.startedAt = nowIso;
          timer.state = "running";
        }
      }
  
      if (command === "pause") {
        if (timer.state === "running" && timer.startedAt) {
          const started = Date.parse(timer.startedAt);
          timer.elapsedMs += now - started;
          timer.startedAt = null;
          timer.state = "paused";
        }
      }
  
      if (command === "reset") {
        timer.elapsedMs = 0;
        timer.startedAt = null;
        timer.state = "idle";
      }
  
      // Auto-finish if elapsed >= duration
      const elapsed = effectiveElapsed(timer, now);
      if (elapsed >= timer.durationMs) {
        timer.state = "finished";
        timer.startedAt = null;
        timer.elapsedMs = timer.durationMs;
      }
  
      timer.updatedAt = nowIso;
      return board;
    }
  
    if (action === "delete") {
      const { id } = body.payload ?? {};
      board.timers = board.timers.filter((t) => t.id !== id);
      return board;
    }
  
    // Unknown action; no change
    return board;
  }
  
  function effectiveElapsed(timer: Timer, nowMs: number): number {
    if (timer.state === "running" && timer.startedAt) {
      const started = Date.parse(timer.startedAt);
      return timer.elapsedMs + (nowMs - started);
    }
    return timer.elapsedMs;
  }
  
