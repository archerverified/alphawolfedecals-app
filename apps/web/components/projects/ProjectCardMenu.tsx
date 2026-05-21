'use client';

// The ⋯ overflow menu on each project card. Owns the open state for the two
// dialogs it triggers (Rename / Delete) so the dropdown can close before the
// dialog opens — Radix's DropdownMenu and Dialog don't nest cleanly when a
// DropdownMenuItem is also a DialogTrigger, so we lift the state up here.

import { useState } from 'react';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@alphawolf/ui/components/ui/dropdown-menu';
import { RenameDialog } from './RenameDialog';
import { DeleteProjectButton } from './DeleteProjectButton';

type Props = {
  projectId: string;
  projectName: string;
  csrfToken: string;
};

export function ProjectCardMenu({ projectId, projectName, csrfToken }: Props) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-zinc-500"
            aria-label={`Actions for ${projectName}`}
            data-testid="project-menu-trigger"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil className="h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
            data-testid="project-delete-item"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        projectId={projectId}
        currentName={projectName}
        csrfToken={csrfToken}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeleteProjectButton
        projectId={projectId}
        projectName={projectName}
        csrfToken={csrfToken}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
