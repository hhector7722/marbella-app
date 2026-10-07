"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./GrandmaMatcherClient.module.css";

type Participant = string;
type Assignments = Record<string, string | undefined>;

type MatcherState = {
  participants: Participant[];
  assignments: Assignments;
  availableByGiver: Record<string, Participant[]>;
  revision: number;
  canUndo: boolean;
  complete: boolean;
};

type SaveStatus = "loading" | "idle" | "saving" | "saved" | "error";

export default function GrandmaMatcherClient({ token }: { token: string }) {
  const [state, setState] = useState<MatcherState | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [message, setMessage] = useState<string>("");

  const endpoint = useMemo(
    () => "/api/familia/abuela/" + encodeURIComponent(token),
    [token],
  );

  const load = useCallback(async () => {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo abrir");
      }

      setState(data);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo abrir");
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (
      action: "set" | "unset" | "undo",
      giver?: string,
      receiver?: string,
    ) => {
      if (!state || status === "saving") return;

      setStatus("saving");
      setMessage("");

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            giver,
            receiver,
            revision: state.revision,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data?.state) {
            setState(data.state);
          }
          throw new Error(data?.error || "No se pudo guardar");
        }

        setState(data);
        setEditing(null);
        setStatus("saved");
        window.setTimeout(() => setStatus("idle"), 1400);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "No se pudo guardar");
      }
    },
    [endpoint, state, status],
  );

  const assignedCount = state ? Object.keys(state.assignments).length : 0;

  function reasonFor(giver: string, receiver: string) {
    if (!state) return "";
    if (giver === receiver) return "Es la misma persona";

    const alreadyGetsGift = Object.entries(state.assignments).some(
      ([otherGiver, otherReceiver]) =>
        otherGiver !== giver && otherReceiver === receiver,
    );
    if (alreadyGetsGift) return "Ya recibe regalo";

    const available = state.availableByGiver[giver] ?? [];
    if (!available.includes(receiver)) return "No disponible";

    return "";
  }

  if (status === "loading" && !state) {
    return (
      <div className={styles.shell}>
        <main className={styles.loadingCard}>
          <div className={styles.heart}>❤️</div>
          <h1>Amigo invisible 2026</h1>
          <p>Cargando la lista…</p>
        </main>
      </div>
    );
  }

  if (!state) {
    return (
      <div className={styles.shell}>
        <main className={styles.loadingCard}>
          <div className={styles.heart}>❤️</div>
          <h1>No he podido abrir la lista</h1>
          <p>{message || "Comprueba la conexión y vuelve a probar."}</p>
          <button className={styles.primaryButton} onClick={() => void load()}>
            Volver a intentar
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <main className={styles.app}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>AMIGO INVISIBLE 2026</div>
            <h1>Abuela, tú decides ❤️</h1>
            <p className={styles.subtitle}>
              Elige quién hace el regalo a cada persona. Yo me encargo de que no
              se repita nadie.
            </p>
          </div>

          <div className={styles.progressBox} aria-live="polite">
            <strong>
              {assignedCount} de {state.participants.length}
            </strong>
            <span>decididos</span>
          </div>
        </header>

        <section className={styles.help}>
          <span className={styles.helpNumber}>1</span>
          <span>Toca <strong>Elegir</strong>.</span>
          <span className={styles.helpNumber}>2</span>
          <span>Toca el nombre que quieras.</span>
          <span className={styles.helpNumber}>3</span>
          <span>Se guarda solo.</span>
        </section>

        <div className={styles.statusRow}>
          <div
            className={
              status === "error"
                ? styles.statusError
                : status === "saving"
                  ? styles.statusSaving
                  : styles.statusOk
            }
            aria-live="polite"
          >
            {status === "saving"
              ? "Guardando…"
              : status === "saved"
                ? "Guardado ✓"
                : status === "error"
                  ? message || "No se pudo guardar"
                  : "Todo guardado ✓"}
          </div>

          <button
            className={styles.undoButton}
            disabled={!state.canUndo || status === "saving"}
            onClick={() => void mutate("undo")}
          >
            Deshacer último
          </button>
        </div>

        {state.complete && (
          <section className={styles.completeBanner}>
            <span className={styles.completeIcon}>🎄</span>
            <div>
              <strong>¡Ya están todos!</strong>
              <span>Puedes repasarlos y cambiar cualquiera si quieres.</span>
            </div>
          </section>
        )}

        <section className={styles.list} aria-label="Emparejamientos">
          {state.participants.map((giver, index) => {
            const receiver = state.assignments[giver];
            const isEditing = editing === giver;

            return (
              <div className={styles.pairBlock} key={giver}>
                <button
                  className={
                    receiver ? styles.pairRowAssigned : styles.pairRow
                  }
                  onClick={() => setEditing(isEditing ? null : giver)}
                  aria-expanded={isEditing}
                  disabled={status === "saving"}
                >
                  <span className={styles.order}>{index + 1}</span>
                  <span className={styles.giver}>{giver}</span>
                  <span className={styles.arrow}>→</span>
                  <span
                    className={
                      receiver ? styles.receiverChosen : styles.receiverEmpty
                    }
                  >
                    {receiver || "Elegir"}
                  </span>
                  <span className={styles.chevron}>{isEditing ? "−" : "+"}</span>
                </button>

                {isEditing && (
                  <div className={styles.chooser}>
                    <h2>
                      ¿A quién quieres que <strong>{giver}</strong> le haga el
                      regalo?
                    </h2>
                    <p>Toca una persona. Las que están en gris no se pueden elegir.</p>

                    <div className={styles.choiceGrid}>
                      {state.participants.map((candidate) => {
                        const reason = reasonFor(giver, candidate);
                        const available = !reason;
                        const selected = receiver === candidate;

                        return (
                          <button
                            key={candidate}
                            className={
                              selected
                                ? styles.choiceSelected
                                : available
                                  ? styles.choice
                                  : styles.choiceDisabled
                            }
                            disabled={!available || status === "saving"}
                            onClick={() => void mutate("set", giver, candidate)}
                          >
                            <span>{candidate}</span>
                            {selected ? (
                              <small>Elegido ahora ✓</small>
                            ) : reason ? (
                              <small>{reason}</small>
                            ) : (
                              <small>Disponible</small>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {receiver && (
                      <button
                        className={styles.clearButton}
                        disabled={status === "saving"}
                        onClick={() => void mutate("unset", giver)}
                      >
                        Quitar esta elección
                      </button>
                    )}

                    <button
                      className={styles.closeButton}
                      onClick={() => setEditing(null)}
                    >
                      Cerrar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <footer className={styles.footer}>
          <strong>No hace falta guardar.</strong>
          <span>
            Puedes cerrar esta página y volver otro día con el mismo enlace.
          </span>
        </footer>
      </main>
    </div>
  );
}
