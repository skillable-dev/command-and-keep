// The evidence ledger. A single JSON file for the PoC; the shape is what matters.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Level, MissionKind } from "./pack.js";

export type Evaluator = "agent" | "self" | "human";

export interface Score {
  level: Level;
  rationale: string;
}

export interface Attempt {
  id: string;
  mission_id: string;
  capability_id: string;
  capabilities: string[];
  kind: MissionKind;
  started_at: string;
  submitted_at?: string;
  context?: string;
  hints_used: number;
  assisted_by_agent: boolean;
  unaided: boolean;
  evidence?: { type: string; content: string; artifact_ref?: string };
  confidence?: number;
  /** Scores keyed by `${capability}.${dimension}` */
  scores?: Record<string, Score>;
  misconceptions?: string[];
  evaluator: Evaluator;
  human_review_required: boolean;
  human_reviewed: boolean;
  transfer_distance: number;
  feedback_delivered: boolean;
  offer_taken?: boolean;
}

export interface ReviewItem {
  id: string;
  capability_id: string;
  due_on: string; // YYYY-MM-DD
  scheduled_from_attempt: string;
  done_attempt_id?: string;
}

export interface CampaignState {
  pack_id: string;
  started_on: string; // YYYY-MM-DD
  intensity: string;
  paused: boolean;
}

export interface LedgerData {
  version: 1;
  learner: { id: string; name?: string };
  campaign?: CampaignState;
  attempts: Attempt[];
  reviews: ReviewItem[];
  prompts: Record<string, number>; // date -> count (interrupt budget)
}

export function emptyLedger(learnerId = "local"): LedgerData {
  return { version: 1, learner: { id: learnerId }, attempts: [], reviews: [], prompts: {} };
}

export class Ledger {
  data: LedgerData;
  constructor(private path: string | null, initial?: LedgerData) {
    if (initial) this.data = initial;
    else if (path && existsSync(path)) this.data = JSON.parse(readFileSync(path, "utf8")) as LedgerData;
    else this.data = emptyLedger();
  }

  save(): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }

  newId(): string {
    return randomUUID();
  }

  attemptsFor(capability: string): Attempt[] {
    return this.data.attempts.filter((a) => a.capabilities.includes(capability) && a.submitted_at);
  }

  findAttempt(id: string): Attempt | undefined {
    return this.data.attempts.find((a) => a.id === id);
  }

  completed(missionId: string): boolean {
    return this.data.attempts.some((a) => a.mission_id === missionId && a.submitted_at);
  }

  inProgress(): Attempt[] {
    return this.data.attempts.filter((a) => !a.submitted_at);
  }
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
