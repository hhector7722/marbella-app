import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  FAMILY_PARTICIPANTS,
  FAMILY_STATE_ID,
  FamilyAssignments,
  FamilyParticipant,
  getAvailableFamilyReceivers,
  isValidFamilyToken,
  normalizeFamilyAssignments,
} from "@/lib/family-secret-santa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoredState = {
  assignments: unknown;
  history: unknown;
  revision: number | string;
};

function noStore<T>(body: T, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error("Falta configuración de Supabase en servidor");
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isParticipant(value: unknown): value is FamilyParticipant {
  return (
    typeof value === "string" &&
    (FAMILY_PARTICIPANTS as readonly string[]).includes(value)
  );
}

function parseHistory(value: unknown): FamilyAssignments[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-30)
    .map((entry) => normalizeFamilyAssignments(entry))
    .filter((entry) => Object.keys(entry).length <= FAMILY_PARTICIPANTS.length);
}

function publicState(
  assignments: FamilyAssignments,
  revision: number,
  canUndo: boolean,
) {
  const availableByGiver = Object.fromEntries(
    FAMILY_PARTICIPANTS.map((giver) => [
      giver,
      getAvailableFamilyReceivers(giver, assignments),
    ]),
  );

  return {
    participants: FAMILY_PARTICIPANTS,
    assignments,
    availableByGiver,
    revision,
    canUndo,
    complete: Object.keys(assignments).length === FAMILY_PARTICIPANTS.length,
  };
}

async function loadStoredState() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("family_secret_santa_state")
    .select("assignments, history, revision")
    .eq("id", FAMILY_STATE_ID)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo cargar el sorteo");
  }

  const row = data as StoredState;
  return {
    supabase,
    assignments: normalizeFamilyAssignments(row.assignments),
    history: parseHistory(row.history),
    revision: Number(row.revision) || 0,
  };
}

async function authorize(params: Promise<{ token: string }>) {
  const { token } = await params;
  return isValidFamilyToken(token);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!(await authorize(params))) {
    return noStore({ error: "Enlace no válido" }, 404);
  }

  try {
    const state = await loadStoredState();
    return noStore(
      publicState(state.assignments, state.revision, state.history.length > 0),
    );
  } catch (error) {
    console.error("family secret santa GET", error);
    return noStore({ error: "No se pudo cargar. Vuelve a intentarlo." }, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!(await authorize(params))) {
    return noStore({ error: "Enlace no válido" }, 404);
  }

  let body: {
    action?: "set" | "unset" | "undo";
    giver?: unknown;
    receiver?: unknown;
    revision?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return noStore({ error: "Petición no válida" }, 400);
  }

  try {
    const state = await loadStoredState();
    const expectedRevision = Number(body.revision);

    if (!Number.isInteger(expectedRevision) || expectedRevision !== state.revision) {
      return noStore(
        {
          error: "La lista ha cambiado. Ya la he actualizado.",
          state: publicState(
            state.assignments,
            state.revision,
            state.history.length > 0,
          ),
        },
        409,
      );
    }

    let nextAssignments: FamilyAssignments = { ...state.assignments };
    let nextHistory = [...state.history];

    if (body.action === "set") {
      if (!isParticipant(body.giver) || !isParticipant(body.receiver)) {
        return noStore({ error: "Elección no válida" }, 400);
      }

      const giver = body.giver;
      const receiver = body.receiver;

      if (state.assignments[giver] === receiver) {
        return noStore(
          publicState(
            state.assignments,
            state.revision,
            state.history.length > 0,
          ),
        );
      }

      const available = getAvailableFamilyReceivers(giver, state.assignments);
      if (!available.includes(receiver)) {
        return noStore(
          {
            error: "Esa combinación ya no está disponible.",
            state: publicState(
              state.assignments,
              state.revision,
              state.history.length > 0,
            ),
          },
          409,
        );
      }

      nextHistory = [...nextHistory.slice(-29), { ...state.assignments }];
      nextAssignments = { ...state.assignments, [giver]: receiver };
    } else if (body.action === "unset") {
      if (!isParticipant(body.giver)) {
        return noStore({ error: "Persona no válida" }, 400);
      }

      if (!state.assignments[body.giver]) {
        return noStore(
          publicState(
            state.assignments,
            state.revision,
            state.history.length > 0,
          ),
        );
      }

      nextHistory = [...nextHistory.slice(-29), { ...state.assignments }];
      nextAssignments = { ...state.assignments };
      delete nextAssignments[body.giver];
    } else if (body.action === "undo") {
      const previous = nextHistory.pop();
      if (!previous) {
        return noStore(
          publicState(
            state.assignments,
            state.revision,
            state.history.length > 0,
          ),
        );
      }

      nextAssignments = normalizeFamilyAssignments(previous);
    } else {
      return noStore({ error: "Acción no válida" }, 400);
    }

    const nextRevision = state.revision + 1;
    const { data, error } = await state.supabase
      .from("family_secret_santa_state")
      .update({
        assignments: nextAssignments,
        history: nextHistory,
        revision: nextRevision,
        updated_at: new Date().toISOString(),
      })
      .eq("id", FAMILY_STATE_ID)
      .eq("revision", state.revision)
      .select("assignments, history, revision")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const latest = await loadStoredState();
      return noStore(
        {
          error: "La lista ha cambiado. Ya la he actualizado.",
          state: publicState(
            latest.assignments,
            latest.revision,
            latest.history.length > 0,
          ),
        },
        409,
      );
    }

    const saved = data as StoredState;
    const savedAssignments = normalizeFamilyAssignments(saved.assignments);
    const savedHistory = parseHistory(saved.history);

    return noStore(
      publicState(
        savedAssignments,
        Number(saved.revision) || nextRevision,
        savedHistory.length > 0,
      ),
    );
  } catch (error) {
    console.error("family secret santa POST", error);
    return noStore({ error: "No se pudo guardar. Vuelve a intentarlo." }, 500);
  }
}
