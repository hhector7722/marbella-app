'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, RotateCcw, Search, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { Button } from '@/components/ui/button';
import { DocumentListRow } from '@/components/ui/DocumentListRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/modal';
import { Notice } from '@/components/ui/Notice';
import {
  createEmploymentIntake,
  createEmploymentIntakeFromProfile,
  deleteEmploymentIntake,
  type IntakeListItem,
} from '@/app/actions/employment-intakes';
import styles from './AltaManagement.module.css';

type ProfileOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  avatar_url: string | null;
  end_date: string | null;
};

type Props = {
  items: IntakeListItem[];
  profiles: ProfileOption[];
};

function shortDate(iso: string): string {
  const date = iso.slice(0, 10).split('-');
  return date.length === 3 ? [date[2], date[1], date[0]].join('/') : iso;
}

export function AltasListClient({ items, profiles }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [creatingProfileId, setCreatingProfileId] = useState<string | null>(null);
  const [rehireOpen, setRehireOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<IntakeListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const visible = items.filter((item) => !deletedIds.includes(item.id));
  const matchedProfiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return profiles.filter((profile) =>
      [profile.first_name, profile.last_name, profile.email]
        .join(' ').toLocaleLowerCase('es').includes(query),
    );
  }, [profiles, search]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const res = await createEmploymentIntake();
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const url = `${window.location.origin}${res.path}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Enlace copiado');
      } catch {
        toast.message('Copia el enlace para enviarlo');
      }
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const onRehire = async (profileId: string) => {
    setCreatingProfileId(profileId);
    try {
      const res = await createEmploymentIntakeFromProfile(profileId);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setRehireOpen(false);
      toast.success('Ficha preparada. Revisa las condiciones antes de generar el PDF.');
      router.push(`/dashboard/altas/${res.id}`);
    } finally {
      setCreatingProfileId(null);
    }
  };

  const onDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await deleteEmploymentIntake(toDelete.id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setDeletedIds((previous) => [...previous, toDelete.id]);
      setToDelete(null);
      toast.success('Expediente eliminado. El usuario y su histórico permanecen intactos.');
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageScreen
      title="Altas laborales"
      subtitle="Documentación para gestoría"
      backHref="/master/dashboard"
      template="list"
      className={styles.screen}
      maxWidthClass="max-w-5xl"
    >
      <div className={styles.workspace}>
        <div className={styles.intro}>
          <div className="min-w-0">
            <p className={styles.kicker}>GESTIÓN DE PERSONAL</p>
            <h2 className={styles.sectionHeading}>Solicitudes y reincorporaciones</h2>
            <p className={styles.description}>
              Prepara el documento de alta para gestoría sin alterar las cuentas de los trabajadores.
            </p>
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="primary" instance="altas-nueva" loading={creating}
              onClick={() => void onCreate()}>
              Nueva alta
            </Button>
            <Button type="button" variant="secondary" instance="altas-reincorporar"
              onClick={() => { setSearch(''); setRehireOpen(true); }}>
              Reincorporar trabajador
            </Button>
          </div>
        </div>

        <div className={styles.listHeader}>
          <div className="flex items-center gap-2">
            <FileText size={17} aria-hidden />
            <h3>Expedientes</h3>
          </div>
          <span>{visible.length}</span>
        </div>
        {visible.length === 0 ? (
          <EmptyState instance="altas-empty" variant="none"
            title="Todavía no hay altas"
            description="Crea un enlace para una nueva incorporación o reutiliza la ficha de un antiguo trabajador." />
        ) : (
          <ul className={styles.documentList}>
            {visible.map((item) => (
              <DocumentListRow
                key={item.id}
                instance={`alta-row-${item.id}`}
                title={item.name}
                subtitle={<span className={styles.rowSubtitle}>
                  <span className={styles.status}>{item.statusLabel}</span>
                  <span>{shortDate(item.createdAt)}</span>
                  {item.email ? <span className={styles.email}>{item.email}</span> : null}
                </span>}
                onOpen={() => router.push(`/dashboard/altas/${item.id}`)}
                trailing={
                  <Button type="button" variant="secondary" instance={`alta-eliminar-${item.id}`}
                    aria-label={`Eliminar expediente de ${item.name}`}
                    icon={<Trash2 size={17} />}
                    onClick={() => setToDelete(item)}
                  />
                }
              />
            ))}
          </ul>
        )}
      </div>

      <Modal open={rehireOpen} onClose={() => !creatingProfileId && setRehireOpen(false)}
        title="Reincorporar trabajador" instance="alta-seleccionar-trabajador" variant="standard">
        <div className={styles.selector}>
          <p className={styles.description}>Selecciona una persona existente. Sus datos se copiarán a un expediente nuevo y editable.</p>
          <div className={styles.searchWrap}>
            <Search size={18} aria-hidden />
            <input aria-label="Buscar trabajador" placeholder="Buscar por nombre o correo" value={search}
              onChange={(event) => setSearch(event.target.value)} autoFocus />
          </div>
          <div className={styles.profileList}>
            {matchedProfiles.length === 0 ? <p className={styles.noMatches}>No se han encontrado trabajadores.</p> : null}
            {matchedProfiles.map((profile) => {
              const fullName = `${profile.first_name} ${profile.last_name}`.trim() || profile.email || 'Sin nombre';
              return (
                <button key={profile.id} type="button" disabled={Boolean(creatingProfileId)}
                  className={styles.profileOption} onClick={() => void onRehire(profile.id)}>
                  <span className={styles.profileIcon}><RotateCcw size={17} /></span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className={styles.profileName}>{fullName}</span>
                    <span className={styles.profileMeta}>
                      {profile.end_date ? `Última baja: ${shortDate(profile.end_date)}` : 'Perfil existente'}
                      {profile.email ? ` · ${profile.email}` : ''}
                    </span>
                  </span>
                  {creatingProfileId === profile.id ? <span className={styles.profileMeta}>Preparando…</span> : <UserPlus size={17} aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(toDelete)} onClose={() => !deleting && setToDelete(null)}
        title="Eliminar expediente" instance="alta-confirmar-eliminar" variant="standard"
        footer={<div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" instance="alta-eliminar-cancelar" disabled={deleting}
            onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button type="button" variant="destructive" instance="alta-eliminar-confirmar" loading={deleting}
            onClick={() => void onDelete()}>Eliminar expediente</Button>
        </div>}>
        <p>Se eliminará el expediente de <strong>{toDelete?.name}</strong> de la lista de altas.</p>
        <Notice instance="alta-delete-safe" variant="warning">
          No se eliminará ni modificará su cuenta, su perfil, sus fichajes, sus nóminas ni su histórico contractual.
        </Notice>
      </Modal>

      <Modal open={Boolean(link)} onClose={() => setLink(null)}
        title="Enlace para el trabajador" instance="alta-link-creado" variant="standard">
        {link ? (
          <div className="flex flex-col gap-4">
            <Notice instance="alta-link-aviso" variant="info">
              Envíale este enlace. Caduca a los 14 días y solo sirve una vez.
            </Notice>
            <p className="break-all text-sm">{link}</p>
            <Button type="button" variant="primary" instance="alta-link-copiar"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                toast.success('Enlace copiado');
              }}>Copiar enlace</Button>
          </div>
        ) : null}
      </Modal>
    </PageScreen>
  );
}
