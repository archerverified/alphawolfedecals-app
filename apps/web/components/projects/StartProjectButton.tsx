'use client';

// "Start a project" CTA for the vehicle detail page. Opens a small dialog to
// name the new project, then posts createProjectAction (a form Server Action)
// with the chosen vehicleId + double-submit CSRF field. On success the action
// redirects to /projects/{id}/editor (the redirect surfaces as a thrown
// NEXT_REDIRECT, which we re-throw so Next can perform the navigation).

import { useState } from 'react';
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
  DialogTrigger,
} from '@alphawolf/ui/components/ui/dialog';
import { Input } from '@alphawolf/ui/components/ui/input';
import { Label } from '@alphawolf/ui/components/ui/label';
import { createProjectAction } from '../../lib/actions/project';

type Props = {
  vehicleId: string;
  defaultName: string;
  csrfToken: string;
};

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} data-testid="start-project-submit">
      {pending ? 'Creating…' : 'Create & open editor'}
    </Button>
  );
}

export function StartProjectButton({ vehicleId, defaultName, csrfToken }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="start-project-cta">Start a project</Button>
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            const name = String(formData.get('name') ?? '').trim();
            if (!name) {
              toast.error('Give your project a name.');
              return;
            }
            try {
              await createProjectAction(formData);
              // createProjectAction redirects on success, so we only reach here
              // on failure.
            } catch (err) {
              if (isRedirectError(err)) throw err;
              toast.error('Could not start the project. Please try again.');
            }
          }}
        >
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <DialogHeader>
            <DialogTitle>Start a new project</DialogTitle>
            <DialogDescription>
              Name your wrap design — you can rename it any time.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="start-project-name">Project name</Label>
            <Input
              id="start-project-name"
              name="name"
              defaultValue={defaultName}
              maxLength={120}
              autoFocus
              required
              data-testid="start-project-name"
            />
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
