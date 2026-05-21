'use client';

// Rename a project. Posts renameProjectAction (a form Server Action) with the
// hidden projectId + double-submit CSRF field, exactly mirroring the other
// CSRF-protected forms in this app. The action revalidates /projects, so on
// success the list re-renders with the new name; we close the dialog and toast.

import { useEffect, useRef, useState } from 'react';
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
import { Input } from '@alphawolf/ui/components/ui/input';
import { Label } from '@alphawolf/ui/components/ui/label';
import { renameProjectAction } from '../../lib/actions/project';

type Props = {
  projectId: string;
  currentName: string;
  csrfToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} data-testid="rename-submit">
      {pending ? 'Saving…' : 'Save'}
    </Button>
  );
}

export function RenameDialog({ projectId, currentName, csrfToken, open, onOpenChange }: Props) {
  const [name, setName] = useState(currentName);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset the field to the current name each time the dialog opens.
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          ref={formRef}
          action={async (formData) => {
            const next = String(formData.get('name') ?? '').trim();
            if (!next) {
              toast.error('Enter a project name.');
              return;
            }
            try {
              await renameProjectAction(formData);
              toast.success('Project renamed.');
              onOpenChange(false);
            } catch {
              toast.error('Could not rename the project. Please try again.');
            }
          }}
        >
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="projectId" value={projectId} />
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Give this wrap design a clearer name.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="rename-name">Project name</Label>
            <Input
              id="rename-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              required
              data-testid="rename-input"
            />
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
