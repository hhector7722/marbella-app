'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '../Button'

type BaseDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

type ConfirmDialogProps = BaseDialogProps & {
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  loading?: boolean
  tone?: 'primary' | 'danger'
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  loading,
  tone = 'primary',
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="mds-confirm-dialog"
        className={cn(
          'border-mds-border bg-mds-surface text-mds-foreground sm:max-w-md',
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-mds-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-mds-muted">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter className="border-mds-border bg-mds-muted-surface/40">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onCancel?.()
              onOpenChange?.(false)
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DeleteDialogProps = Omit<ConfirmDialogProps, 'tone' | 'confirmLabel'> & {
  confirmLabel?: string
}

function DeleteDialog({
  confirmLabel = 'Eliminar',
  ...props
}: DeleteDialogProps) {
  return (
    <ConfirmDialog {...props} tone="danger" confirmLabel={confirmLabel} />
  )
}

type ActionDialogProps = BaseDialogProps & {
  actions?: React.ReactNode
}

function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  actions,
}: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="mds-action-dialog"
        className={cn(
          'border-mds-border bg-mds-surface text-mds-foreground sm:max-w-md',
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-mds-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-mds-muted">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {actions ? (
          <DialogFooter className="border-mds-border bg-mds-muted-surface/40">
            {actions}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type FormDialogProps = BaseDialogProps & {
  submitLabel?: string
  cancelLabel?: string
  onSubmit?: () => void
  onCancel?: () => void
  loading?: boolean
}

function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  submitLabel = 'Guardar',
  cancelLabel = 'Cancelar',
  onSubmit,
  onCancel,
  loading,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="mds-form-dialog"
        className={cn(
          'border-mds-border bg-mds-surface text-mds-foreground sm:max-w-lg',
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-mds-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-mds-muted">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        <DialogFooter className="border-mds-border bg-mds-muted-surface/40">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onCancel?.()
              onOpenChange?.(false)
            }}
          >
            {cancelLabel}
          </Button>
          <Button type="button" variant="primary" loading={loading} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type SuccessDialogProps = BaseDialogProps & {
  actionLabel?: string
  onAction?: () => void
}

function SuccessDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  actionLabel = 'Entendido',
  onAction,
}: SuccessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="mds-success-dialog"
        className={cn(
          'border-mds-border bg-mds-surface text-mds-foreground sm:max-w-md',
          className
        )}
      >
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-mds-success/10 text-mds-success">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>
          <DialogTitle className="text-mds-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-mds-muted">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter className="border-mds-border bg-mds-muted-surface/40">
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onAction?.()
              onOpenChange?.(false)
            }}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export {
  ConfirmDialog,
  DeleteDialog,
  ActionDialog,
  FormDialog,
  SuccessDialog,
}
export type {
  ConfirmDialogProps,
  DeleteDialogProps,
  ActionDialogProps,
  FormDialogProps,
  SuccessDialogProps,
}
