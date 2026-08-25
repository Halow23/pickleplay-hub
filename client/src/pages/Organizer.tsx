import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarPlus, ClipboardCheck, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const defaultStart = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);

export default function Organizer() {
  const { user, loading, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const dashboard = trpc.community.dashboard.useQuery();
  const games = trpc.organizer.games.useQuery(undefined, { enabled: isAuthenticated });
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const roster = trpc.organizer.roster.useQuery({ gameId: selectedGame || 0 }, { enabled: !!selectedGame });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [capacity, setCapacity] = useState("12");
  const createGame = trpc.organizer.createGame.useMutation({
    onSuccess: () => { toast.success("Draft game created. Publish it when the details are ready."); setTitle(""); setDescription(""); utils.organizer.games.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const publish = trpc.organizer.publishGame.useMutation({ onSuccess: () => { toast.success("Game published."); utils.organizer.games.invalidate(); }, onError: error => toast.error(error.message) });
  const archive = trpc.organizer.archiveGame.useMutation({ onSuccess: () => { toast.success("Game archived."); utils.organizer.games.invalidate(); }, onError: error => toast.error(error.message) });
  const recordAttendance = trpc.organizer.attendance.useMutation({
    onSuccess: () => { toast.success("Attendance recorded."); roster.refetch(); },
    onError: error => toast.error(error.message),
  });

  if (loading) return <div className="min-h-screen bg-[#f5f3eb]" />;
  if (!isAuthenticated) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><UsersRound className="mx-auto h-8 w-8 text-[#2d6a58]" /><h1 className="mt-4 font-[Fraunces] text-3xl font-semibold">Organizer workspace</h1><p className="mt-3 text-sm leading-6 text-[#64736c]">Sign in with an organizer or administrator account to create and manage community games.</p><Button onClick={startLogin} className="mt-6 rounded-full bg-[#19473e]">Sign in</Button></div></main>;

  const venue = dashboard.data?.venues[0];
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!venue) return toast.error("No verified venue is available yet.");
    const startsAt = new Date(start).getTime();
    createGame.mutate({ venueId: venue.id, title, description, format: "Open play", skillBand: "Open to a conversation", capacity: Number(capacity), visibility: "public", beginnerFriendly: true, attendanceNote: "Please arrive 10 minutes early so the host can welcome everyone.", startsAt, endsAt: startsAt + 7_200_000, publish: false });
  };

  return <main className="min-h-screen bg-[#f5f3eb] px-5 py-8 text-[#173d35] sm:px-8"><div className="mx-auto max-w-6xl"><Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#39705d]"><ArrowLeft className="h-4 w-4" /> Community home</Link><div className="mt-7 flex flex-col justify-between gap-4 border-b border-[#dfe1d5] pb-6 sm:flex-row sm:items-end"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Organizer tools</p><h1 className="mt-1 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">Plan the next good game.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#69776e]">Create a draft, review its roster, publish when ready, and keep community expectations clear.</p></div><div className="rounded-full bg-[#e6efe2] px-4 py-2 text-xs font-bold text-[#39705d]">{user?.role || "player"} account</div></div><div className="mt-7 grid gap-6 lg:grid-cols-[.75fr_1.25fr]"><form onSubmit={create} className="rounded-[28px] bg-[#fffef9] p-6 shadow-sm"><div className="flex items-center gap-2"><CalendarPlus className="h-5 w-5 text-[#d17954]" /><h2 className="font-[Fraunces] text-2xl font-semibold">New game draft</h2></div><div className="mt-5 grid gap-4"><div className="grid gap-2"><Label htmlFor="title">Game title</Label><Input id="title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Sunset open play" required /></div><div className="grid gap-2"><Label htmlFor="description">What should players expect?</Label><Textarea id="description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Share the vibe, format, and host guidance." required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="start">Starts</Label><Input id="start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="capacity">Capacity</Label><Input id="capacity" type="number" min="1" max="200" value={capacity} onChange={event => setCapacity(event.target.value)} required /></div></div><p className="rounded-xl bg-[#f0f3eb] p-3 text-xs leading-5 text-[#627167]">The initial draft uses the first verified local venue. Event editing supports venue, visibility, capacity, format, and RSVP deadline changes after creation.</p><Button type="submit" disabled={createGame.isPending} className="w-full rounded-full bg-[#19473e]">Create draft</Button></div></form><section className="rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-6"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#39705d]" /><h2 className="font-[Fraunces] text-2xl font-semibold">Your game lifecycle</h2></div><div className="mt-5 space-y-3">{games.isLoading ? <p className="text-sm text-[#69776e]">Loading your games…</p> : games.error ? <p className="rounded-xl bg-[#fff0e9] p-3 text-sm text-[#9a5140]">{games.error.message}</p> : games.data?.length ? games.data.map(game => <div key={game.id} className="rounded-2xl border border-[#e8e9df] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#577568]">{new Date(game.startsAt).toLocaleString()}</p><h3 className="mt-1 font-[Fraunces] text-xl font-semibold">{game.title}</h3><p className="mt-1 text-xs text-[#718078]">{game.venueName} · {game.capacity} places · <span className="capitalize">{game.status}</span></p></div><div className="flex gap-2">{game.status === "draft" && <Button size="sm" onClick={() => publish.mutate({ gameId: game.id })} className="rounded-full bg-[#19473e]">Publish</Button>}<Button size="sm" variant="outline" onClick={() => setSelectedGame(game.id)} className="rounded-full">Roster</Button>{game.status !== "archived" && <Button size="sm" variant="outline" onClick={() => archive.mutate({ gameId: game.id })} className="rounded-full text-[#8b604b]">Archive</Button>}</div></div>{selectedGame === game.id && <div className="mt-4 rounded-xl bg-[#f1f4ec] p-3"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#668176]">Active roster and attendance</p><div className="mt-2 space-y-2">{roster.isLoading ? <p className="text-xs text-[#64736c]">Loading roster…</p> : roster.data?.length ? roster.data.map(entry => <div key={entry.rsvpId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 text-sm"><span>{entry.displayName || entry.name || "Player"}{entry.correctionNote && <small className="block text-xs text-[#7a6c5a]">{entry.correctionNote}</small>}</span><div className="flex items-center gap-2"><span className="capitalize text-[#587368]">{entry.attendanceStatus || entry.state}</span><Button size="sm" onClick={() => recordAttendance.mutate({ rsvpId: entry.rsvpId, status: "attended" })} className="rounded-full bg-[#19473e]">Present</Button><Button size="sm" variant="outline" onClick={() => recordAttendance.mutate({ rsvpId: entry.rsvpId, status: "no_show" })} className="rounded-full">No show</Button></div></div>) : <p className="text-xs text-[#64736c]">No RSVPs yet.</p>}</div></div>}</div>) : <p className="rounded-2xl bg-[#f1f4ec] p-5 text-sm leading-6 text-[#637269]">Once an organizer account creates a draft, its publish, roster, and archive controls appear here.</p>}</div></section></div></div></main>;
}
