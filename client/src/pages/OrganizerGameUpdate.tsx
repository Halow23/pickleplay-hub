import { useAuth } from "@/_core/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, MessageSquare, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

export default function OrganizerGameUpdate() {
  const { isAuthenticated } = useAuth();
  usePageTitle("Game update");
  const [, params] = useRoute("/organizer/games/:gameId/update");
  const gameId = Number(params?.gameId || 0);
  const games = trpc.organizer.games.useQuery(undefined, { enabled: isAuthenticated });
  const game = games.data?.find(item => item.id === gameId);
  const [message, setMessage] = useState("");
  const update = trpc.community.organizerUpdate.useMutation({ onSuccess: result => { setMessage(""); toast.success(`Update sent to ${result.recipientCount} eligible participant${result.recipientCount === 1 ? "" : "s"}.`); }, onError: error => toast.error(error.message) });
  if (!isAuthenticated) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-[#2d6a58]" /><h1 className="mt-4 font-[Fraunces] text-3xl font-semibold">Organizer access</h1><p className="mt-3 text-sm text-[#64736c]">Sign in to send a game update.</p><Button onClick={startLogin} className="mt-6 rounded-full bg-[#19473e]">Sign in</Button></div></main>;
  if (games.isLoading) return <main className="flex min-h-screen items-center justify-center bg-[#f5f3eb] text-sm text-[#66756c]">Loading your games…</main>;
  if (!game) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><h1 className="font-[Fraunces] text-3xl font-semibold">Game unavailable</h1><Link href="/organizer" className="mt-6 inline-flex rounded-full bg-[#19473e] px-4 py-2 text-sm font-bold text-white">Organizer workspace</Link></div></main>;
  return <main className="min-h-screen bg-[#f5f3eb] p-6 text-[#173d35] sm:p-10"><div className="mx-auto max-w-2xl"><Link href={`/organizer/games/${game.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-[#39705d]"><ArrowLeft className="h-4 w-4" /> Game operations</Link><section className="mt-7 rounded-[30px] border border-[#dfe1d5] bg-[#fffef9] p-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-[#e5efe3] p-3 text-[#2f6f5c]"><MessageSquare className="h-7 w-7" /></div><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#55685e]">Participant update</p><h1 className="mt-1 font-[Fraunces] text-3xl font-semibold">Update {game.title}</h1><p className="mt-3 text-sm leading-6 text-[#66756c]">Confirmed and waitlisted participants who allow organizer updates receive this in the PicklePlay notification center. No email is sent.</p></div></div><Textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={500} className="mt-6 min-h-32" placeholder="For example, the north gate will be unlocked from 6:45 PM." /><Button disabled={message.trim().length < 3 || update.isPending} onClick={() => update.mutate({ gameId: game.id, message: message.trim() })} className="mt-4 rounded-full bg-[#19473e]">Send participant update</Button></section></div></main>;
}
