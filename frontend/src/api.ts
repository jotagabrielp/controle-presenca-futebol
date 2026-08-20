import { BACKEND_URL } from "./theme";

export type PlayerType = "mensalista" | "convidado";

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
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
  count_convidados: number;
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
  createPlayer: (name: string, type: PlayerType) =>
    req<Player>("/players", { method: "POST", body: JSON.stringify({ name, type }) }),
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
};
