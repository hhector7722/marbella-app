import type { GroqTool } from "./groq-chat.ts";

export const WEEKEND_NOTE_TOOL_NAME = "proponer_nota_general_fin_semana";
export const WEEKEND_NOTE_ACTION = "save_weekend_public_note";
const OWNER_ID = "baacc78a-b7da-438e-8ea4-c9f3ce6f90e6";
const OWNER_EMAIL = "hhector7722@gmail.com";

export type WeekendNoteProposal = {
  action: typeof WEEKEND_NOTE_ACTION;
  status: "pending_confirmation";
  date: string;
  content: string;
  warning: string;
};

export const WEEKEND_NOTE_TOOL: GroqTool = {
  type: "function",
  function: {
    name: WEEKEND_NOTE_TOOL_NAME,
    description: "Prepara para aprobación humana una nota GENERAL del calendario en un sábado o domingo. NO la guarda. Úsala solamente cuando el usuario pida explícitamente escribir una nota general del calendario de fin de semana y haya especificado fecha y texto. Nunca inventes fecha ni contenido.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Fecha de sábado o domingo, formato ISO YYYY-MM-DD, interpretada en Europe/Madrid" },
        content: { type: "string", description: "Texto exacto solicitado para la nota, de 1 a 1500 caracteres" },
      },
      required: ["date", "content"],
      additionalProperties: false,
    },
  },
};

export function canProposeWeekendNote(user: { id: string; email?: string | null }, role: string): boolean {
  return (role === "manager" || role === "admin")
    && user.id === OWNER_ID
    && user.email?.trim().toLowerCase() === OWNER_EMAIL;
}

export function wantsToWriteWeekendNote(question: string): boolean {
  return /(?:^|[\s,¿¡])(?:crea|crear|guarda|guardar|pon|poner|escribe|escribir|anota|apunta|añade|agrega|actualiza|cambia)(?=$|[\s,.:])/i.test(question)
    && /nota|anota|apunta|aviso/i.test(question)
    && /fin de semana|calendario|horario|s[aá]bado|domingo/i.test(question);
}

export function isWeekendDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + "T12:00:00Z");
  return !Number.isNaN(value.getTime())
    && value.toISOString().slice(0, 10) === date
    && (value.getUTCDay() === 0 || value.getUTCDay() === 6);
}

export function prepareWeekendNoteProposal(input: unknown): WeekendNoteProposal | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Faltan fecha y contenido de la nota." };
  }
  const args = input as Record<string, unknown>;
  if (typeof args.date !== "string" || !isWeekendDate(args.date)) {
    return { error: "La fecha debe ser un sábado o domingo real en formato YYYY-MM-DD." };
  }
  if (typeof args.content !== "string" || !args.content.trim() || args.content.trim().length > 1500) {
    return { error: "El contenido debe tener entre 1 y 1500 caracteres." };
  }
  return {
    action: WEEKEND_NOTE_ACTION,
    status: "pending_confirmation",
    date: args.date,
    content: args.content.trim(),
    warning: "Esta nota será visible en el calendario y sustituirá la nota general previa de esa fecha, si existe.",
  };
}

export function isWeekendNoteProposal(value: unknown): value is WeekendNoteProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.action !== WEEKEND_NOTE_ACTION || item.status !== "pending_confirmation") return false;
  const validated = prepareWeekendNoteProposal({ date: item.date, content: item.content });
  return "action" in validated && typeof item.warning === "string";
}
