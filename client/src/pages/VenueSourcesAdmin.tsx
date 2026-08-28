import { useAuth } from "@/_core/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function VenueSourcesAdmin() {
  const { isAuthenticated } = useAuth();
  usePageTitle("Trusted venue sources");
  const utils = trpc.useUtils();
  const dashboard = trpc.community.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const [sourceLabel, setSourceLabel] = useState<Record<number, string>>({});
  const [sourceUrl, setSourceUrl] = useState<Record<number, string>>({});
  const isAdmin = dashboard.data?.currentRole === "admin";
  const addSource = trpc.admin.addVenueSource.useMutation({ onSuccess: () => { toast.success("Venue source recorded and listing marked verified."); utils.community.dashboard.invalidate(); }, onError: error => toast.error(error.message) });
  if (!isAuthenticated) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-[#2d6a58]" /><h1 className="mt-4 font-[Fraunces] text-3xl font-semibold">Venue source access</h1><p className="mt-3 text-sm text-[#64736c]">Sign in with an administrator account to record trusted venue sources.</p><Button onClick={startLogin} className="mt-6 rounded-full bg-[#19473e]">Sign in</Button></div></main>;
  if (!isAdmin) return <main className="min-h-screen bg-[#f5f3eb] p-8"><div className="mx-auto max-w-lg rounded-[28px] bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-8 w-8 text-[#2d6a58]" /><h1 className="mt-4 font-[Fraunces] text-3xl font-semibold">Administrator access required</h1><p className="mt-3 text-sm text-[#64736c]">Only platform administrators can add venue sources or publish verified provenance.</p><Link href="/admin" className="mt-6 inline-flex rounded-full bg-[#19473e] px-4 py-2 text-sm font-bold text-white">Open administrator console</Link></div></main>;
  return <main className="min-h-screen bg-[#f5f3eb] p-6 text-[#173d35] sm:p-10"><div className="mx-auto max-w-4xl"><Link href="/admin" className="inline-flex items-center gap-2 text-sm font-bold text-[#39705d]"><ArrowLeft className="h-4 w-4" /> Administrator console</Link><header className="mt-7 rounded-[30px] border border-[#dfe1d5] bg-[#fffef9] p-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-[#e5efe3] p-3 text-[#2f6f5c]"><BadgeCheck className="h-7 w-7" /></div><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#55685e]">Venue provenance</p><h1 className="mt-1 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">Record a trusted source</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#66756c]">Adding a source publishes the venue as verified. Record only sources that a reviewer can reasonably rely on; a URL is optional when the source is an offline municipal or facility record.</p></div></div></header><section className="mt-6 space-y-4">{dashboard.data?.venues.map(venue => <article key={venue.id} className="rounded-3xl border border-[#dfe1d5] bg-white p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-[Fraunces] text-2xl font-semibold">{venue.name}</h2><span className="text-xs font-bold text-[#597367]">Current state: {venue.verificationState}</span></div>{venue.sources.length > 0 && <p className="mt-2 text-xs text-[#5c6b63]">Recorded: {venue.sources.map(source => source.sourceLabel).join(", ")}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><div><Label htmlFor={`label-${venue.id}`}>Source label</Label><Input id={`label-${venue.id}`} value={sourceLabel[venue.id] || ""} onChange={event => setSourceLabel(current => ({ ...current, [venue.id]: event.target.value }))} maxLength={160} className="mt-2" placeholder="City Parks court directory" /></div><div><Label htmlFor={`url-${venue.id}`}>Source URL <span className="font-normal text-[#748077]">optional</span></Label><Input id={`url-${venue.id}`} value={sourceUrl[venue.id] || ""} onChange={event => setSourceUrl(current => ({ ...current, [venue.id]: event.target.value }))} maxLength={500} className="mt-2" placeholder="https://…" /></div><Button disabled={!sourceLabel[venue.id]?.trim() || addSource.isPending} onClick={() => addSource.mutate({ venueId: venue.id, sourceLabel: sourceLabel[venue.id].trim(), sourceUrl: sourceUrl[venue.id]?.trim() || undefined })} className="self-end rounded-full bg-[#19473e]">Record source</Button></div></article>)}</section></div></main>;
}
