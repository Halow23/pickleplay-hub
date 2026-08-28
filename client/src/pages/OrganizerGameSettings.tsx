import { useAuth } from "@/_core/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, CalendarClock, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

// Format a timestamp for a `datetime-local` input in the browser's local time.
// toISOString() must not be used here: it yields UTC, while the input expects
// local time — mixing the two shifts the value by the UTC offset on every save.
const asLocalInput = (value: Date | string | number | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function OrganizerGameSettings() {
  const { isAuthenticated } = useAuth();
  usePageTitle("Game settings");
  const [, params] = useRoute("/organizer/games/:gameId");
  const gameId = Number(params?.gameId || 0);
  const games = trpc.organizer.games.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();
  const game = games.data?.find(item => item.id === gameId);
  const [capacity, setCapacity] = useState("");
  const [deadline, setDeadline] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  useEffect(() => { if (game) { setCapacity(String(game.capacity)); setDeadline(asLocalInput(game.rsvpDeadlineAt)); } }, [game?.id]);
  const update = trpc.organizer.updateGame.useMutation({ onSuccess: () => { setOperationError(null); toast.success("Game capacity and RSVP deadline saved."); utils.organizer.games.invalidate(); }, onError: error => { setOperationError(error.message); toast.error(error.message); } });
  const cancel = trpc.organizer.cancelGame.useMutation({ onSuccess: () => { setOperationError(null); toast.success("Game cancelled and participants notified."); setCancellationReason(""); utils.organizer.games.invalidate(); }, onError: error => { setOperationError(error.message); toast.error(error.message); } });
  if (!isAuthenticated) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-[#2d6a58]" /><h1 className="mt-4 font-[Fraunces] text-3xl font-semibold">Organizer access</h1><p className="mt-3 text-sm leading-6 text-[#64736c]">Sign in with an organizer or administrator account to manage a game.</p><Button onClick={startLogin} className="mt-6 rounded-full bg-[#19473e]">Sign in</Button></div></main>;
  if (games.isLoading) return <main className="flex min-h-screen items-center justify-center bg-[#f5f3eb] p-8 text-sm text-[#66756c]">Loading your games…</main>;
  if (!game) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><Settings2 className="mx-auto h-8 w-8 text-[#2d6a58]" /><h1 className="mt-4 font-[Fraunces] text-3xl font-semibold">Game unavailable</h1><p className="mt-3 text-sm leading-6 text-[#64736c]">This game is not in your organizer workspace or is no longer available.</p><Link href="/organizer" className="mt-6 inline-flex rounded-full bg-[#19473e] px-4 py-2 text-sm font-bold text-white">Organizer workspace</Link></div></main>;
  const save = () => update.mutate({ gameId: game.id, venueId: game.venueId, groupId: game.groupId, title: game.title, description: game.description, format: game.format, skillBand: game.skillBand, capacity: Number(capacity), visibility: game.visibility, beginnerFriendly: game.beginnerFriendly, attendanceNote: game.attendanceNote, startsAt: new Date(game.startsAt).getTime(), endsAt: new Date(game.endsAt).getTime(), rsvpDeadlineAt: deadline ? new Date(deadline).getTime() : null });
  return <main className="min-h-screen bg-[#f5f3eb] p-6 text-[#173d35] sm:p-10"><div className="mx-auto max-w-3xl"><Link href="/organizer" className="inline-flex items-center gap-2 text-sm font-bold text-[#39705d]"><ArrowLeft className="h-4 w-4" /> Organizer workspace</Link><header className="mt-7 rounded-[30px] border border-[#dfe1d5] bg-[#fffef9] p-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-[#e5efe3] p-3 text-[#2f6f5c]"><Settings2 className="h-7 w-7" /></div><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#55685e]">Game operations</p><h1 className="mt-1 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">{game.title}</h1><p className="mt-2 text-sm text-[#66756c]">{new Date(game.startsAt).toLocaleString()} · {game.venueName}</p></div></div></header>{operationError && <p role="alert" className="mt-5 rounded-2xl border border-[#efc9ba] bg-[#fff0e9] p-4 text-sm leading-6 text-[#98513d]"><strong>Changes were not saved.</strong> {operationError}</p>}<section className="mt-6 rounded-3xl border border-[#dfe1d5] bg-white p-6"><div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[#39705d]" /><h2 className="font-[Fraunces] text-2xl font-semibold">RSVP capacity and deadline</h2></div><p className="mt-2 text-sm leading-6 text-[#66756c]">Capacity cannot be reduced below current confirmed attendance. Without a custom deadline, RSVPs close two hours before start.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="capacity">Capacity</Label><Input id="capacity" type="number" min="1" max="200" value={capacity} onChange={event => setCapacity(event.target.value)} className="mt-2" /></div><div><Label htmlFor="deadline">RSVP deadline</Label><Input id="deadline" type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)} className="mt-2" /></div></div><Button disabled={!capacity || update.isPending || game.status === "cancelled" || game.status === "archived"} onClick={save} className="mt-5 rounded-full bg-[#19473e]">Save RSVP settings</Button></section>{game.status !== "cancelled" && game.status !== "archived" && <section className="mt-6 rounded-3xl border border-[#eed5ca] bg-[#fff8f2] p-6"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-5 w-5 text-[#a95e43]" /><div><h2 className="font-[Fraunces] text-2xl font-semibold">Cancel this game</h2><p className="mt-1 text-sm leading-6 text-[#7a5c4f]">A cancellation reason is required and active participants receive an in-app organizer update if they allow it.</p></div></div><Label htmlFor="cancellation-reason" className="mt-5 block">Cancellation reason</Label><Textarea id="cancellation-reason" value={cancellationReason} onChange={event => setCancellationReason(event.target.value)} maxLength={300} className="mt-2 min-h-24" placeholder="For example, venue closure due to maintenance." /><Button variant="outline" disabled={cancellationReason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate({ gameId: game.id, reason: cancellationReason.trim() })} className="mt-4 rounded-full border-[#c9927d] text-[#924f39]">Cancel game</Button></section>}</div></main>;
}
