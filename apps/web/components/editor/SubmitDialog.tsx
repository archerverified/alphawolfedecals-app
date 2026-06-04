'use client';

// Submit-for-production modal (Goal 3a PR5). Collects delivery/contact details
// (no payment in the MVP), fires the submit_clicked analytics event, calls the
// RPC-style server action, and routes to the order-confirmed page on success.
//
// Opening the dialog flushes the autosave queue (onOpen) so the version the
// server freezes carries the latest canvas state.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { Input } from '@alphawolf/ui/components/ui/input';
import { Label } from '@alphawolf/ui/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@alphawolf/ui/components/ui/dialog';
import { submitForProductionAction } from '@/lib/actions/order';
import { capture } from '@/lib/analytics';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Props {
  projectId: string;
  /** Prefill the contact email with the signed-in user's address. */
  defaultEmail?: string;
  /** Flush autosave when the dialog opens so the frozen version is current. */
  onOpen?: () => void;
}

export function SubmitDialog({ projectId, defaultEmail = '', onOpen }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  const valid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) onOpen?.();
  };

  const handleSubmit = () => {
    if (!valid || pending) return;
    // Analytics: the customer committed to submitting (best-effort, env-gated).
    capture('submit_clicked', { projectId });
    startTransition(async () => {
      try {
        const res = await submitForProductionAction({
          projectId,
          contactName: name,
          contactEmail: email,
          contactPhone: phone,
          deliveryNotes: notes,
        });
        if (res.ok) {
          setOpen(false);
          router.push(`/projects/${projectId}/order-confirmed?order=${res.orderId}`);
        } else if (res.reason === 'invalid_input') {
          toast.error('Please enter a name and a valid email.');
        } else {
          toast.error('Could not submit — please try again.');
        }
      } catch {
        toast.error('Could not submit — please try again.');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="submit-production" size="sm" className="gap-1.5">
          <Send className="size-4" /> Submit for production
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for production</DialogTitle>
          <DialogDescription>
            We&apos;ll send your design to the production team. No payment is taken now —
            they&apos;ll confirm the details with you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-name">Contact name</Label>
            <Input
              id="order-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-email">Email</Label>
            <Input
              id="order-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-phone">Phone (optional)</Label>
            <Input
              id="order-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              autoComplete="tel"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="order-notes">Delivery notes (optional)</Label>
            <textarea
              id="order-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything the shop should know…"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            data-testid="submit-production-confirm"
            onClick={handleSubmit}
            disabled={!valid || pending}
            className="gap-1.5"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Submitting…
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
