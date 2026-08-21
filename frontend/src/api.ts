import { BACKEND_URL } from "./theme";

export type PlayerType = "mensalista" | "convidado";

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  monthly_fee: number | null;
  churrasco_fee: number | null;
  guest_fee: number | null;
  created_at: string;
}

export interface Week {
  id: string;
  week_start: string;
  label: string;
}

export interface Attendance {
  id?: string;
  week_id: string;
  player_id: string;
  attending: boolean;
  churrasco: boolean;
  paid: boolean;
}

export interface Summary {
  total_mensalistas: number;
  total_convidados: number;
  total_churrasco: number;
  total_arrecadado: number;
  total_pago: number;
  total_pendente: number;
  count_mensalistas: number;
  count_mensalistas_pendentes: number;
  count_convidados: number;
  count_convidados_pendentes: number;
  count_churrasco: number;
  count_pagos: number;
  count_confirmados: number;
}

export interface CurrentWeek {
  week: Week;
  attendance: Attendance[];
  summary: Summary;
}

export interface PixSettings {
  pix_key: string;
  holder_name: string;
  bank: string;
}

export interface TeamSettings {
  team_name: string;
  team_emoji: string;
}

export interface MonthlyItem {
  player: Player;
  paid: boolean;
  paid_at: string | null;
  blocked: boolean;
  monthly_fee: number;
}

export interface MonthlyStatus {
  month: string;
  deadline: string;
  past_deadline: boolean;
  price: number;
  items: MonthlyItem[];
  count_pagos: number;
  count_pendentes: number;
  total_pago: number;
  total_previsto: number;
}

export type ExpenseCategory = "campo" | "churrasco" | "outros";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  month: string;
  created_at: string;
}

export interface ExpensesSummary {
  month: string;
  by_category: { campo: number; churrasco: number; outros: number };
  total: number;
  count: number;
}

const url = (p: string) => `${BACKEND_URL}/api${p}`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  listPlayers: () => req<Player[]>("/players"),
  createPlayer: (
    name: string,
    type: PlayerType,
    extras?: { monthly_fee?: number | null; churrasco_fee?: number | null; guest_fee?: number | null },
  ) =>
    req<Player>("/players", {
      method: "POST",
      body: JSON.stringify({ name, type, ...(extras || {}) }),
    }),
  updatePlayer: (
    id: string,
    patch: {
      name?: string;
      type?: PlayerType;
      monthly_fee?: number | null;
      churrasco_fee?: number | null;
      guest_fee?: number | null;
      clear_monthly_fee?: boolean;
      clear_churrasco_fee?: boolean;
      clear_guest_fee?: boolean;
    },
  ) => req<Player>(`/players/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deletePlayer: (id: string) => req<any>(`/players/${id}`, { method: "DELETE" }),

  getCurrentWeek: () => req<CurrentWeek>("/weeks/current"),
  listWeeks: () => req<{ week: Week; summary: Summary }[]>("/weeks"),
  newWeek: () => req<Week>("/weeks/new", { method: "POST" }),

  upsertAttendance: (payload: {
    week_id: string;
    player_id: string;
    attending?: boolean;
    churrasco?: boolean;
    paid?: boolean;
  }) => req<Attendance>("/attendance", { method: "PUT", body: JSON.stringify(payload) }),

  playerHistory: (id: string) =>
    req<{
      player: Player;
      history: { week: Week; attending: boolean; churrasco: boolean; paid: boolean }[];
      total_present: number;
      total_churrasco: number;
      total_paid: number;
    }>(`/players/${id}/history`),

  getPix: () => req<PixSettings>("/settings/pix"),
  updatePix: (s: PixSettings) =>
    req<PixSettings>("/settings/pix", { method: "PUT", body: JSON.stringify(s) }),

  getTeam: () => req<TeamSettings>("/settings/team"),
  updateTeam: (s: TeamSettings) =>
    req<TeamSettings>("/settings/team", { method: "PUT", body: JSON.stringify(s) }),

  getMonthlyCurrent: () => req<MonthlyStatus>("/monthly/current"),
  upsertMonthly: (player_id: string, month: string, paid: boolean) =>
    req<any>("/monthly", { method: "PUT", body: JSON.stringify({ player_id, month, paid }) }),

  listExpenses: (month?: string) =>
    req<Expense[]>(`/expenses${month ? `?month=${month}` : ""}`),
  createExpense: (e: { category: ExpenseCategory; description: string; amount: number; date?: string }) =>
    req<Expense>("/expenses", { method: "POST", body: JSON.stringify(e) }),
  deleteExpense: (id: string) => req<any>(`/expenses/${id}`, { method: "DELETE" }),
  expensesSummary: (month?: string) =>
    req<ExpensesSummary>(`/expenses/summary${month ? `?month=${month}` : ""}`),
};
