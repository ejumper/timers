export interface Env {
  TIMERS: KVNamespace;
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
    const match = url.pathname.match(/^\/api\/boards\/([^/]+)\/timers$/);
    if (!match) {
      return withCors(new Response("Not found", { status: 404 }), request);
    }

    const boardId = match[1];

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request);
    }

    if (request.method === "GET") {
      const board = await loadBoard(env, boardId);
      return json(board, request);
    }

    if (request.method === "POST") {
      const body = await request.json();
      const board = await loadBoard(env, boardId);
      const updated = applyCommand(board, body);
      await saveBoard(env, boardId, updated);
      return json(updated, request);
    }

    return withCors(new Response("Method not allowed", { status: 405 }), request);
  },
};

// ----- helpers -----

function json(data: unknown, request: Request): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    }),
    request
  );
}

function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin") || "*";
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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

// ----- timer logic -----

function applyCommand(board: Board, body: any): Board {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const action = body?.action;

  if (action === "create") {
    const { label, durationMs } = body.payload ?? {};
    const timer: Timer = {
      id: crypto.randomUUID(),
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
      if (timer.state === "idle
