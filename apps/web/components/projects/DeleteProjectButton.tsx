'use client';

// Soft-delete a project behind a confirm dialog. Posts deleteProjectAction (a
// form Server Action) with the hidden projectId + double-submit CSRF field. The
// delete is recoverable for 30 days (PRD §8.2 / soft-delete in the projects
// repo), so the copy reassures rather than warns of permanence.

import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { Button } from '@alphawolf/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@alphawolf/ui/components/ui/dialog';
import { deleteProjectAction } from '../../lib/actions/project';

type Props = {
  projectId: string;
  projectName: string;
  csrfToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending} data-testid="delete-confirm">
      {pending ? 'Deleting…' : 'Delete project'}
    </Button>
  );
}

export function DeleteProjectButton({
  projectId,
  projectName,
  csrfToken,
  open,
  onOpenChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          action={async (formData) => {
            try {
              await deleteProjectAction(formData);
              toast.success('Project deleted. You can recover it for 30 days.');
              onOpenChange(false);
            } catch {
              toast.error('Could not delete the project. Please try again.');
            }
          }}
        >
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="projectId" value={projectId} />
          <DialogHeader>
            <DialogTitle>Delete “{projectName}”?</DialogTitle>
            <DialogDescription>
              This moves the project to your recycle bin. It stays recoverable for 30 days before
              it’s permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <ConfirmButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
