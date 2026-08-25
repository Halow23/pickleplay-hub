import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  Compass,
  Crown,
  DoorOpen,
  Flag,
  LockKeyhole,
  MapPin,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ActiveView = "explore" | "play" | "groups" | "profile";

const navItems: Array<{ id: ActiveView; label: string; icon: typeof Compass }> = [
  { id: "explore", label: "Explore", icon: Compass },
  { id: "play", label: "Play", icon: CalendarDays },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "profile", label: "Profile", icon: CircleUserRound },
];

const profileDefaults = {
  displayName: "",
  city: "Your local area",
  bio: "",
  skillBand: "Finding my starting point",
  ratingProvenance: "none" as "none" | "self_described" | "linked_provider",
  visibility: "community" as "community" | "private",
  preferredFormats: "Open play, doubles",
};

function getInitials(name?: string | null) {
  return (name || "PicklePlay").split(" ").map(part => part.charAt(0)).join("").slice(0, 2).toUpperCase();
}

function formatGameDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(timestamp));
}

function formatGameTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

function ProfileNotificationControls({ visible, preferences, isLoading, isSaving, error, onChange }: { visible: boolean; preferences?: { inAppEnabled: boolean; gameUpdatesEnabled: boolean; waitlistUpdatesEnabled: boolean }; isLoading: boolean; isSaving: boolean; error?: string; onChange: (change: Partial<{ inAppEnabled: boolean; gameUpdatesEnabled: boolean; waitlistUpdatesEnabled: boolean }>) => void }) {
  if (!visible) return null;
  const rows = preferences ? [{ key: "inAppEnabled", label: "In-app updates", value: preferences.inAppEnabled }, { key: "gameUpdatesEnabled", label: "Organizer updates", value: preferences.gameUpdatesEnabled }, { key: "waitlistUpdatesEnabled", label: "Waitlist changes", value: preferences.waitlistUpdatesEnabled }] as const : [];
  return <aside className="fixed bottom-4 right-4 z-30 w-[min(350px,calc(100vw-2rem))] rounded-[24px] border border-[#dfe1d5] bg-[#fffef9] p-4 shadow-[0_16px_36px_rgba(25,71,62,.2)]" aria-label="Notification preferences"><div className="flex items-center gap-2"><Bell className="h-4 w-4 text-[#39705d]" /><p className="font-[Fraunces] text-lg font-semibold">In-app updates</p></div>{isLoading ? <p className="mt-3 text-sm text-[#68766e]">Loading your choices…</p> : error ? <p role="alert" className="mt-3 rounded-xl bg-[#fff0e9] p-3 text-sm leading-5 text-[#9a5140]">Could not load notification choices. {error}</p> : rows.map(row => <div key={row.key} className="mt-3 flex items-center justify-between gap-3 text-sm"><span>{row.label}</span><button type="button" role="switch" aria-checked={row.value} aria-label={row.label} disabled={isSaving} onClick={() => onChange({ [row.key]: !row.value } as Partial<{ inAppEnabled: boolean; gameUpdatesEnabled: boolean; waitlistUpdatesEnabled: boolean }>)} className={`h-6 w-11 rounded-full p-1 transition ${row.value ? "bg-[#19473e]" : "bg-[#cfd7ce]"} disabled:opacity-60`}><span className={`block h-4 w-4 rounded-full bg-white transition ${row.value ? "translate-x-5" : "translate-x-0"}`} /></button></div>)}{isSaving && <p className="mt-3 text-xs font-bold text-[#39705d]" aria-live="polite">Saving your choices…</p>}<a href="/settings/notifications" className="mt-4 inline-flex text-xs font-bold text-[#39705d] underline underline-offset-4">Open full notification settings</a></aside>;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[14px] bg-[#19473e] shadow-[0_8px_16px_rgba(25,71,62,0.18)]">
        <span className="absolute h-5 w-5 rounded-full border-[3px] border-[#f7d35b]" />
        <span className="absolute h-[2px] w-7 rotate-[-42deg] bg-[#f7d35b]" />
      </div>
      {!compact && <span className="font-[Fraunces] text-[1.3rem] font-semibold tracking-[-0.045em] text-[#173d35]">PicklePlay</span>}
    </div>
  );
}

function CapacityMeter({ confirmed, capacity }: { confirmed: number; capacity: number }) {
  const percentage = Math.min(100, Math.round((confirmed / capacity) * 100));
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-[#64736c]">
        <span>{confirmed} of {capacity} places filled</span>
        <span>{Math.max(capacity - confirmed, 0)} open</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e6e6dc]">
        <div className="h-full rounded-full bg-[#e7a650] transition-all duration-300" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function GameRsvpStatus({ status, startsAt, rsvpDeadlineAt, cancellationReason }: { status: "draft" | "published" | "cancelled" | "archived"; startsAt: number; rsvpDeadlineAt: number | null; cancellationReason: string | null }) {
  if (status === "cancelled") return <p className="mt-3 rounded-xl bg-[#fff0e9] px-3 py-2 text-xs leading-5 text-[#98513d]"><strong>Cancelled.</strong>{cancellationReason ? ` ${cancellationReason}` : " The organizer has cancelled this session."}</p>;
  const deadline = rsvpDeadlineAt ?? startsAt - 2 * 60 * 60 * 1000;
  return <p className={`mt-3 text-xs leading-5 ${Date.now() >= deadline ? "text-[#98513d]" : "text-[#62756a]"}`}><strong>{Date.now() >= deadline ? "RSVP closed" : "RSVP closes"}</strong> {new Date(deadline).toLocaleString()}.</p>;
}

function GameJoinAction({ game, isAuthenticated, isPending, onAction }: { game: { id: number; status: "draft" | "published" | "cancelled" | "archived"; startsAt: number; rsvpDeadlineAt: number | null; userRsvpState: "confirmed" | "waitlisted" | null; canAccess: boolean }; isAuthenticated: boolean; isPending: boolean; onAction: (gameId: number, state: "confirmed" | "waitlisted" | null) => void }) {
  const deadline = game.rsvpDeadlineAt ?? game.startsAt - 2 * 60 * 60 * 1000;
  const joinClosed = game.userRsvpState === null && (game.status === "cancelled" || game.status === "archived" || Date.now() >= deadline);
  const disabled = isPending || !game.canAccess || joinClosed;
  const text = game.userRsvpState === "confirmed" ? <><Check className="h-4 w-4" /> Confirmed · Leave</> : game.userRsvpState === "waitlisted" ? <><CalendarDays className="h-4 w-4" /> Waitlisted · Leave</> : !game.canAccess ? <><LockKeyhole className="h-4 w-4" /> Approval needed</> : joinClosed ? <><CalendarDays className="h-4 w-4" /> RSVP closed</> : <><Plus className="h-4 w-4" /> Join game</>;
  const colors = game.userRsvpState === "confirmed" ? "bg-[#e3f0e4] text-[#2d6c53] hover:bg-[#d4e6d4]" : game.userRsvpState === "waitlisted" ? "bg-[#f8ebcc] text-[#89612d] hover:bg-[#f5dfb2]" : "bg-[#19473e] text-white hover:bg-[#123b33]";
  return <button onClick={() => { if (!isAuthenticated) return onAction(game.id, game.userRsvpState); if (!disabled || game.userRsvpState) onAction(game.id, game.userRsvpState); }} disabled={disabled && !game.userRsvpState} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 ${colors}`}>{text}</button>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[270px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#d8d8ce] bg-[#fbfaf5] px-6 text-center">
      <div className="mb-4 rounded-2xl bg-[#e8efe7] p-3 text-[#2d6a58]"><Search className="h-5 w-5" /></div>
      <h3 className="font-[Fraunces] text-xl font-semibold text-[#173d35]">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-6 text-[#67746c]">{body}</p>
    </div>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    return requestedView === "play" || requestedView === "groups" || requestedView === "profile" ? requestedView : "explore";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [managedGroupId, setManagedGroupId] = useState<number | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState<"all" | "beginner" | "open" | "nearby">("all");
  const [profileForm, setProfileForm] = useState(profileDefaults);
  const [groupForm, setGroupForm] = useState({ name: "", description: "", neighborhood: "", visibility: "public" as "public" | "private" });
  const utils = trpc.useUtils();
  const dashboardQuery = trpc.community.dashboard.useQuery();
  const membersQuery = trpc.community.members.useQuery(undefined, { enabled: isAuthenticated });
  const pendingMembershipsQuery = trpc.organizer.membershipRequests.useQuery({ groupId: managedGroupId || 0 }, { enabled: !!managedGroupId });
  const groupMembersQuery = trpc.community.groupMembers.useQuery({ groupId: managedGroupId || 0 }, { enabled: !!managedGroupId });
  const dashboard = dashboardQuery.data;

  const rsvpMutation = trpc.community.rsvp.useMutation({
    onSuccess: (result) => {
      const text = result.state === "confirmed" ? "You’re confirmed — see you on court." : result.state === "waitlisted" ? "You’re on the waitlist. We’ll let you know if a place opens." : "You’ve left this game.";
      toast.success(text);
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const saveGameMutation = trpc.community.saveGame.useMutation({
    onSuccess: result => { toast.success(result.saved ? "Game saved to your planning list." : "Game removed from your planning list."); utils.community.dashboard.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const groupMutation = trpc.community.requestGroupMembership.useMutation({
    onSuccess: (result) => {
      toast.success(result.state === "pending" ? "Your request is with the group host." : "You’re in — welcome to the group.");
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const createGroupMutation = trpc.community.createGroup.useMutation({
    onSuccess: () => {
      toast.success("Your group is ready. You are its owner.");
      setGroupCreateOpen(false);
      setGroupForm({ name: "", description: "", neighborhood: "", visibility: "public" });
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const reviewMembershipMutation = trpc.organizer.reviewMembership.useMutation({
    onSuccess: () => {
      toast.success("Membership request reviewed.");
      pendingMembershipsQuery.refetch();
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const createInviteMutation = trpc.organizer.createGroupInvite.useMutation({
    onSuccess: result => { setInviteToken(result.token); navigator.clipboard?.writeText(result.token); toast.success("Invite code copied. It expires in 7 days."); },
    onError: error => toast.error(error.message),
  });
  const acceptInviteMutation = trpc.community.acceptGroupInvite.useMutation({
    onSuccess: () => { setInviteToken(""); toast.success("You joined the invited group."); utils.community.dashboard.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const updateGroupMemberRoleMutation = trpc.organizer.updateMemberRole.useMutation({
    onSuccess: () => { toast.success("Group role updated."); groupMembersQuery.refetch(); },
    onError: error => toast.error(error.message),
  });
  const transferOwnershipMutation = trpc.organizer.transferOwnership.useMutation({
    onSuccess: () => { toast.success("Group ownership transferred."); setManagedGroupId(null); utils.community.dashboard.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const reportMutation = trpc.community.report.useMutation({
    onSuccess: () => toast.success("Thanks. Your report has been received for review."),
    onError: error => toast.error(error.message),
  });
  const blockUserMutation = trpc.community.blockUser.useMutation({
    onSuccess: () => {
      toast.success("That host is hidden from your discovery feed.");
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const profileMutation = trpc.community.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Your profile is updated.");
      setProfileOpen(false);
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const readNotificationsMutation = trpc.community.markNotificationsRead.useMutation({
    onSuccess: () => utils.community.dashboard.invalidate(),
  });
  const notificationPreferencesQuery = trpc.community.notificationPreferences.useQuery(undefined, { enabled: isAuthenticated });
  const updateNotificationPreferencesMutation = trpc.community.updateNotificationPreferences.useMutation({
    onSuccess: () => { toast.success("Notification preferences updated."); notificationPreferencesQuery.refetch(); },
    onError: error => toast.error(error.message),
  });
  const bootstrapAdminMutation = trpc.admin.bootstrap.useMutation({
    onSuccess: () => {
      toast.success("Administrator access is active. Refreshing your account permissions.");
      utils.auth.me.invalidate();
      utils.community.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const adminUsersQuery = trpc.admin.users.useQuery(undefined, { enabled: dashboard?.currentRole === "admin" });
  const updateUserRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("User role updated."); adminUsersQuery.refetch(); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (dashboard?.profile) {
      const profile = dashboard.profile;
      setProfileForm({
        displayName: profile.displayName,
        city: profile.city,
        bio: profile.bio || "",
        skillBand: profile.skillBand,
        ratingProvenance: profile.ratingProvenance,
        visibility: profile.visibility,
        preferredFormats: profile.preferredFormats,
      });
    }
  }, [dashboard?.profile]);

  const visibleGames = useMemo(() => {
    const allGames = dashboard?.games || [];
    if (gameFilter === "beginner") return allGames.filter(game => game.beginnerFriendly);
    if (gameFilter === "open") return allGames.filter(game => game.confirmedCount < game.capacity);
    if (gameFilter === "nearby") return allGames.filter(game => game.venueNeighborhood === "Riverside" || game.venueNeighborhood === "Old Town");
    return allGames;
  }, [dashboard?.games, gameFilter]);

  const askForSignIn = () => {
    toast.message("Sign in to join the local community.");
    startLogin();
  };

  const handleGameAction = (gameId: number, currentState: "confirmed" | "waitlisted" | null) => {
    if (!isAuthenticated) return askForSignIn();
    const game = dashboard?.games.find(item => item.id === gameId);
    if (!currentState && game) {
      if (game.status === "cancelled") return toast.message(game.cancellationReason ? `This game was cancelled: ${game.cancellationReason}` : "This game has been cancelled by its organizer.");
      const deadline = game.rsvpDeadlineAt ?? game.startsAt - 2 * 60 * 60 * 1000;
      if (Date.now() >= deadline) return toast.message(`RSVP closed ${new Date(deadline).toLocaleString()}.`);
    }
    rsvpMutation.mutate({ gameId, action: currentState ? "leave" : "join", idempotencyKey: crypto.randomUUID() });
  };

  const exportGameCalendar = (game: { id: number; title: string; description: string; startsAt: number; endsAt: number; venueName: string }) => {
    const toIcs = (value: number) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PicklePlay//EN", "BEGIN:VEVENT", `UID:game-${game.id}@pickleplay`, `DTSTART:${toIcs(game.startsAt)}`, `DTEND:${toIcs(game.endsAt)}`, `SUMMARY:${game.title}`, `LOCATION:${game.venueName}`, `DESCRIPTION:${game.description.replace(/\n/g, "\\n")}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pickleplay-game.ics";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Calendar file downloaded.");
  };

  const handleReport = (subjectType: "game" | "group", subjectId: number) => {
    if (!isAuthenticated) return askForSignIn();
    reportMutation.mutate({ subjectType, subjectId, reason: "Needs review" });
  };

  const handleBlockHost = (hostId: number) => {
    if (!isAuthenticated) return askForSignIn();
    blockUserMutation.mutate({ blockedUserId: hostId, reason: "Player preference" });
  };

  const unreadCount = dashboard?.notifications.filter(notification => !notification.readAt).length ?? 0;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f3eb] text-[#173d35]">
      <ProfileNotificationControls visible={isAuthenticated && activeView === "profile"} preferences={notificationPreferencesQuery.data} isLoading={notificationPreferencesQuery.isLoading} isSaving={updateNotificationPreferencesMutation.isPending} error={notificationPreferencesQuery.error?.message} onChange={change => { const preference = notificationPreferencesQuery.data; if (!preference) return; updateNotificationPreferencesMutation.mutate({ inAppEnabled: preference.inAppEnabled, emailEnabled: false, gameUpdatesEnabled: preference.gameUpdatesEnabled, waitlistUpdatesEnabled: preference.waitlistUpdatesEnabled, ...change }); }} />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[460px] bg-[radial-gradient(circle_at_75%_5%,rgba(250,219,115,0.26),transparent_28%),radial-gradient(circle_at_14%_20%,rgba(150,192,166,0.24),transparent_30%)]" />

      <header className="sticky top-0 z-40 border-b border-[#e0e2d8]/80 bg-[#f5f3eb]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 lg:px-10">
          <button onClick={() => setActiveView("explore")} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d6a58]" aria-label="PicklePlay home">
            <BrandMark />
          </button>
          <nav className="hidden items-center gap-1 rounded-full border border-[#dde0d5] bg-white/65 p-1.5 md:flex" aria-label="Primary navigation">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${active ? "bg-[#19473e] text-white shadow-sm" : "text-[#64736c] hover:bg-[#edf0e8] hover:text-[#173d35]"}`}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <Popover open={notificationsOpen} onOpenChange={open => { setNotificationsOpen(open); if (open && unreadCount) readNotificationsMutation.mutate(); }}>
                <PopoverTrigger asChild>
                  <button className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#dde0d5] bg-white/80 text-[#315b50] transition hover:bg-[#e9f0e7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d6a58]" aria-label="Open notifications">
                    <Bell className="h-[18px] w-[18px]" />
                    {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#d66345] ring-2 ring-white" />}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] rounded-[22px] border-[#dfe2d6] bg-[#fffef9] p-0 shadow-[0_20px_60px_rgba(41,64,54,0.16)]">
                  <div className="flex items-center justify-between border-b border-[#e8e9df] px-5 py-4"><span className="font-[Fraunces] text-lg font-semibold">Your updates</span><span className="rounded-full bg-[#edf4eb] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#39705d]">In-app</span></div>
                  <div className="max-h-[330px] overflow-auto p-2">
                    {dashboard?.notifications.length ? dashboard.notifications.map(notification => (
                      <div key={notification.id} className="rounded-2xl p-3.5 hover:bg-[#f2f5ed]">
                        <div className="flex gap-3"><div className="mt-0.5 rounded-full bg-[#e7efe4] p-2 text-[#39705d]"><Sparkles className="h-3.5 w-3.5" /></div><div><p className="text-sm font-bold">{notification.title}</p><p className="mt-1 text-xs leading-5 text-[#68766e]">{notification.body}</p></div></div>
                      </div>
                    )) : <p className="px-3 py-7 text-center text-sm text-[#6c786f]">No updates yet. Your game changes will appear here.</p>}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <div className="hidden sm:block">
              {loading ? <div className="h-10 w-24 animate-pulse rounded-full bg-[#e4e5dc]" /> : isAuthenticated ? (
                <button onClick={() => setActiveView("profile")} className="flex items-center gap-2 rounded-full border border-[#dde0d5] bg-white/75 py-1 pl-1 pr-3 text-sm font-bold transition hover:bg-white"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e4b54a] text-[11px] text-[#173d35]">{getInitials(user?.name)}</span><span className="max-w-[100px] truncate">{user?.name?.split(" ")[0] || "Profile"}</span></button>
              ) : <Button onClick={askForSignIn} className="rounded-full bg-[#19473e] px-5 font-bold text-white hover:bg-[#123b33]">Join PicklePlay</Button>}
            </div>
            <button onClick={() => setMobileMenuOpen(value => !value)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dde0d5] bg-white/80 md:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
          </div>
        </div>
        {mobileMenuOpen && <div className="border-t border-[#e0e2d8] bg-[#fdfcf7] px-5 py-3 md:hidden"><div className="grid grid-cols-2 gap-2">{navItems.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }} className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-bold ${activeView === item.id ? "bg-[#19473e] text-white" : "bg-[#f0f1e9] text-[#426056]"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></div>}
      </header>

      <main className="relative mx-auto max-w-[1440px] px-5 pb-28 pt-8 lg:px-10 lg:pt-10">
        {activeView === "explore" && (
          <>
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(310px,.75fr)]">
              <div className="relative overflow-hidden rounded-[32px] bg-[#19473e] px-6 py-8 text-white shadow-[0_20px_50px_rgba(25,71,62,0.16)] sm:px-9 sm:py-10">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border-[30px] border-[#8bb17d]/30" /><div className="absolute bottom-[-62px] right-24 h-44 w-44 rounded-full border-[26px] border-[#f4c95d]/80" /><div className="absolute right-[32%] top-0 h-full w-px bg-white/10" />
                <div className="relative max-w-2xl">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-[#f9d86d]"><MapPin className="h-3.5 w-3.5" /> Your local area</div>
                  <h1 className="max-w-xl font-[Fraunces] text-[2.35rem] font-semibold leading-[1.03] tracking-[-.05em] sm:text-5xl">Find a game that feels <em className="font-normal text-[#f9d86d]">just right.</em></h1>
                  <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#d4e2d4]">Local courts, easy RSVP details, and friendly groups — designed to make the next game less of a guess.</p>
                  <div className="mt-8 flex flex-wrap gap-2"><button onClick={() => setActiveView("play")} className="rounded-full bg-[#f6d36a] px-5 py-3 text-sm font-extrabold text-[#173d35] transition hover:-translate-y-0.5 hover:bg-[#ffe083]">See local games</button><button onClick={() => setActiveView("groups")} className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">Find your people</button></div>
                </div>
              </div>
              <aside className="rounded-[32px] border border-[#dfe1d5] bg-[#fffef9] p-6 shadow-[0_14px_32px_rgba(61,80,66,.06)]">
                <div className="flex items-center justify-between"><p className="text-[11px] font-extrabold uppercase tracking-[.13em] text-[#668176]">Start here</p><span className="rounded-full bg-[#eaf2e8] px-2.5 py-1 text-[10px] font-bold text-[#39705d]">Community first</span></div>
                <h2 className="mt-4 font-[Fraunces] text-2xl font-semibold leading-tight tracking-[-.035em]">New to the area or to pickleball?</h2>
                <p className="mt-3 text-sm leading-6 text-[#6b786f]">Choose a beginner-friendly session. Hosts share the plan and make space for first games.</p>
                <div className="mt-5 rounded-2xl bg-[#f1f4ec] p-3.5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#3d7b65]" /><p className="text-xs leading-5 text-[#4c6258]"><strong className="text-[#254e43]">Comfort is part of the game.</strong> Share only what you choose, use group context before joining, and report anything that needs attention.</p></div></div>
              </aside>
            </section>

            <section className="mt-9"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Near you</p><h2 className="mt-1 font-[Fraunces] text-[1.75rem] font-semibold tracking-[-.04em]">Good places to begin</h2></div><button onClick={() => setActiveView("play")} className="flex items-center gap-1 text-sm font-bold text-[#2f6e5c] hover:text-[#173d35]">See all games <ChevronRight className="h-4 w-4" /></button></div>
              <div className="grid gap-4 lg:grid-cols-3">{dashboardQuery.isLoading ? [1, 2, 3].map(item => <div key={item} className="h-[208px] animate-pulse rounded-[25px] bg-[#e8e9df]" />) : dashboard?.venues.slice(0, 3).map((venue, index) => <article key={venue.id} className="group relative overflow-hidden rounded-[25px] border border-[#dde0d5] bg-[#fffef9] p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(52,79,67,.11)]"><div className={`absolute right-0 top-0 h-20 w-20 rounded-bl-[60px] ${index === 0 ? "bg-[#e6bb62]" : index === 1 ? "bg-[#8fb59e]" : "bg-[#d88a66]"} opacity-80`} /><div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f1f4ec] text-[#306b58]"><MapPin className="h-5 w-5" /></div><h3 className="relative mt-5 font-[Fraunces] text-xl font-semibold tracking-[-.03em]">{venue.name}</h3><p className="mt-1 text-sm text-[#68766e]">{venue.neighborhood} · {venue.courtCount} courts</p><div className="mt-5 flex flex-wrap gap-2">{venue.indoor && <span className="rounded-full bg-[#e8f0e7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#39705d]">Indoor</span>}<span className="rounded-full bg-[#f4f1e8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#7a6b52]">{venue.lighting ? "Lit courts" : "Daylight play"}</span></div></article>)}</div>
            </section>

            <section className="mt-10 grid gap-5 lg:grid-cols-[1.42fr_.58fr]">
              <div className="rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">From the community</p><h2 className="mt-1 font-[Fraunces] text-2xl font-semibold tracking-[-.04em]">Hosts set the tone</h2></div><MessagesSquare className="h-5 w-5 text-[#d17954]" /></div><div className="mt-5 space-y-3">{dashboard?.games.slice(0, 2).map(game => <div key={game.id} className="rounded-2xl bg-[#f5f6ef] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4b54a] text-[10px] font-bold">{getInitials(game.organizerName)}</div><div><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-bold">{game.organizerName}</p><span className="text-xs text-[#778278]">in {game.groupName || "Local Play"}</span></div><p className="mt-1.5 text-sm leading-6 text-[#57665d]"><strong className="font-bold text-[#254e43]">{game.postHeadline}</strong> — {game.postBody}</p></div></div></div>)}</div></div>
              <aside className="rounded-[28px] bg-[#e6efe2] p-6"><CircleAlert className="h-5 w-5 text-[#39705d]" /><h3 className="mt-4 font-[Fraunces] text-xl font-semibold tracking-[-.03em]">Play with care.</h3><p className="mt-2 text-sm leading-6 text-[#536b5f]">Read the activity expectations, show up as agreed, and use a report option if a game or group needs review.</p><button onClick={() => toast.message("Community guidelines are built into every game and group. Full policy management is a next-phase moderation tool.")} className="mt-5 text-sm font-bold text-[#2e6b58] underline decoration-[#8cb49a] underline-offset-4">Community guidelines</button></aside>
            </section>
          </>
        )}

        {activeView === "play" && (
          <section><div className="flex flex-col justify-between gap-5 border-b border-[#dfe1d5] pb-6 lg:flex-row lg:items-end"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Play nearby</p><h1 className="mt-1 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">Pick your next court time.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#69776e]">Every game shows the plan before you join: host, time, format, inclusive skill range, capacity, and visibility.</p></div><div className="flex flex-wrap gap-2">{(["all", "beginner", "open", "nearby"] as const).map(filter => <button key={filter} onClick={() => setGameFilter(filter)} className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition ${gameFilter === filter ? "bg-[#19473e] text-white" : "border border-[#d9ddd2] bg-white/70 text-[#577166] hover:bg-white"}`}>{filter === "open" ? "Open spots" : filter === "nearby" ? "Closest" : filter === "beginner" ? "Beginner-friendly" : "All games"}</button>)}</div></div>
            <div className="mt-6 grid gap-5 xl:grid-cols-2">{dashboardQuery.isLoading ? [1, 2, 3, 4].map(item => <div key={item} className="h-[330px] animate-pulse rounded-[28px] bg-[#e5e6dd]" />) : visibleGames.length ? visibleGames.map(game => <article key={game.id} className="relative overflow-hidden rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-5 shadow-[0_10px_22px_rgba(61,80,66,.045)] sm:p-6"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2">{game.beginnerFriendly && <span className="rounded-full bg-[#e8f1df] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.11em] text-[#3d7558]">Beginner-friendly</span>}<span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.11em] ${game.visibility === "private" ? "bg-[#f1ebe6] text-[#8a5e45]" : "bg-[#edf0e8] text-[#617066]"}`}>{game.visibility === "private" ? <LockKeyhole className="h-3 w-3" /> : <UsersRound className="h-3 w-3" />}{game.visibility === "private" ? "Member session" : "Open to community"}</span></div><button onClick={() => handleReport("game", game.id)} className="rounded-full p-2 text-[#839087] transition hover:bg-[#f3eee9] hover:text-[#b65c44]" aria-label={`Report ${game.title}`}><MoreHorizontal className="h-5 w-5" /></button></div>
              <div className="mt-5 grid grid-cols-[54px_1fr] gap-4"><div className="rounded-2xl bg-[#f0f2e9] p-2 text-center"><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[#698176]">{formatGameDate(game.startsAt).split(" ")[0]}</p><p className="mt-0.5 font-[Fraunces] text-xl font-semibold">{new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(new Date(game.startsAt))}</p></div><div><p className="text-xs font-bold text-[#577568]">{formatGameTime(game.startsAt)}–{formatGameTime(game.endsAt)}</p><h2 className="mt-1 font-[Fraunces] text-2xl font-semibold leading-[1.05] tracking-[-.04em] text-[#173d35]">{game.title}</h2><p className="mt-2 text-sm leading-6 text-[#607067]">{game.description}</p><button onClick={() => handleBlockHost(game.organizerId)} className="mt-2 text-xs font-bold text-[#7a6c5a] underline decoration-[#c9bca6] underline-offset-4 hover:text-[#a35843]">Hide this host</button></div></div>
              <div className="mt-5 grid gap-2 border-y border-[#ecece4] py-4 sm:grid-cols-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#54685e]"><MapPin className="h-4 w-4 text-[#d17a55]" /><span>{game.venueName}<br /><span className="font-normal text-[#7b887f]">{game.venueNeighborhood}</span></span></div><div className="flex items-center gap-2 text-xs font-semibold text-[#54685e]"><UsersRound className="h-4 w-4 text-[#d17a55]" /><span>{game.format}<br /><span className="font-normal text-[#7b887f]">{game.skillBand}</span></span></div><div className="flex items-center gap-2 text-xs font-semibold text-[#54685e]"><Crown className="h-4 w-4 text-[#d17a55]" /><span>{game.organizerName}<br /><span className="font-normal text-[#7b887f]">Host</span></span></div></div>
              <CapacityMeter confirmed={game.confirmedCount} capacity={game.capacity} /><GameRsvpStatus status={game.status} startsAt={game.startsAt} rsvpDeadlineAt={game.rsvpDeadlineAt} cancellationReason={game.cancellationReason} />
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-[270px] text-xs leading-5 text-[#6c786f]">{game.attendanceNote}</p><div className="flex flex-wrap gap-2"><button onClick={() => { if (!isAuthenticated) return askForSignIn(); saveGameMutation.mutate({ gameId: game.id, saved: !dashboard?.savedGameIds?.includes(game.id) }); }} className="rounded-full border border-[#d9ddd2] bg-white px-3 py-2 text-xs font-bold text-[#47685d] hover:bg-[#f1f4ec]">{dashboard?.savedGameIds?.includes(game.id) ? "Saved · Remove" : "Save"}</button><button onClick={() => exportGameCalendar(game)} className="rounded-full border border-[#d9ddd2] bg-white px-3 py-2 text-xs font-bold text-[#47685d] hover:bg-[#f1f4ec]">Calendar</button><GameJoinAction game={game} isAuthenticated={isAuthenticated} isPending={rsvpMutation.isPending} onAction={handleGameAction} /></div></div>
            </article>) : <div className="xl:col-span-2"><EmptyState title="Nothing matches that filter" body="Try a different view to see more nearby play." /></div>}</div>
            <div className="mt-7 flex gap-3 rounded-[22px] border border-[#eadfba] bg-[#fff8e5] p-4 text-sm leading-6 text-[#695c40]"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#a67835]" /><p><strong>What RSVP means here:</strong> confirmed places are persisted in the community record; once a game is full, new RSVPs join the waitlist. Leaving a confirmed spot automatically offers it to the earliest waitlisted player. <strong>Guests are not supported</strong>, so every player needs their own PicklePlay RSVP. Unless an organizer sets an earlier time, RSVPs close two hours before start.</p></div>
          </section>
        )}

        {activeView === "groups" && (
          <section><div className="flex flex-col justify-between gap-4 border-b border-[#dfe1d5] pb-6 sm:flex-row sm:items-end"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Local circles</p><h1 className="mt-1 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">A group makes the next game easier.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#69776e]">Follow the local rhythm, understand the host’s norms, and meet people through activity rather than a public contact directory.</p></div><button onClick={() => isAuthenticated ? setGroupCreateOpen(true) : askForSignIn()} className="inline-flex items-center gap-2 self-start rounded-full border border-[#c7d6c8] bg-[#edf4eb] px-4 py-2.5 text-sm font-bold text-[#336b57] hover:bg-[#e1efe0]"><Plus className="h-4 w-4" /> Create a group</button></div>
            <div className="mt-7 grid gap-5 lg:grid-cols-3">{dashboardQuery.isLoading ? [1, 2, 3].map(item => <div key={item} className="h-[290px] animate-pulse rounded-[28px] bg-[#e5e6dd]" />) : dashboard?.groups.map((group, index) => <article key={group.id} className="relative overflow-hidden rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-6 transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(52,79,67,.09)]"><div className={`absolute -right-7 -top-7 h-28 w-28 rounded-full ${index === 0 ? "bg-[#e4b54a]/45" : index === 1 ? "bg-[#8fb59e]/40" : "bg-[#d17954]/30"}`} /><div className="relative flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0f3eb] text-[#3d765f]"><UsersRound className="h-5 w-5" /></div><button onClick={() => handleReport("group", group.id)} className="rounded-full p-2 text-[#839087] hover:bg-[#f4efea] hover:text-[#b65c44]" aria-label={`Report ${group.name}`}><Flag className="h-4 w-4" /></button></div><div className="relative"><div className="mt-6 flex items-center gap-2"><span className="rounded-full bg-[#f2f3ed] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#65766d]">{group.neighborhood}</span>{group.visibility === "private" && <span className="rounded-full bg-[#f6eee8] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] text-[#895b43]">Approval</span>}</div><h2 className="mt-3 font-[Fraunces] text-2xl font-semibold tracking-[-.04em]">{group.name}</h2><p className="mt-3 min-h-[72px] text-sm leading-6 text-[#68756d]">{group.description}</p><div className="mt-5 flex items-center justify-between border-t border-[#ebebe4] pt-4"><span className="text-xs text-[#718078]">Hosted by <strong className="font-bold text-[#416459]">{group.ownerName}</strong></span><button onClick={() => { if (!isAuthenticated) return askForSignIn(); groupMutation.mutate({ groupId: group.id }); }} disabled={groupMutation.isPending || group.isMember} className={`rounded-full px-3.5 py-2 text-xs font-extrabold transition disabled:cursor-not-allowed ${group.isMember ? "bg-[#e2efe3] text-[#39705d]" : group.visibility === "private" ? "bg-[#f2eee9] text-[#846653]" : "bg-[#19473e] text-white hover:bg-[#123b33]"}`}>{group.isMember ? "Joined" : group.visibility === "private" ? "Request access" : "Join group"}</button></div></div></article>)}</div>
            {isAuthenticated && dashboard?.groups.filter(group => group.ownerId === user?.id).map(group => <section key={`manage-${group.id}`} className="mt-8 rounded-[28px] border border-[#dfe1d5] bg-[#f7faf4] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Group owner workspace</p><h2 className="mt-1 font-[Fraunces] text-2xl font-semibold">{group.name} membership</h2></div><Button onClick={() => setManagedGroupId(group.id)} variant="outline" className="rounded-full">Review requests</Button></div>{managedGroupId === group.id && <div className="mt-5 space-y-3">{pendingMembershipsQuery.isLoading ? <p className="text-sm text-[#68756d]">Loading membership requests…</p> : pendingMembershipsQuery.data?.length ? pendingMembershipsQuery.data.map(request => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4"><div><p className="text-sm font-bold">Member request #{request.id}</p><p className="mt-1 text-xs text-[#68756d]">Requested {new Date(request.joinedAt).toLocaleDateString()}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => reviewMembershipMutation.mutate({ membershipId: request.id, decision: "active" })} className="rounded-full bg-[#19473e]">Approve</Button><Button size="sm" variant="outline" onClick={() => reviewMembershipMutation.mutate({ membershipId: request.id, decision: "denied" })} className="rounded-full">Decline</Button></div></div>) : <p className="rounded-2xl bg-white p-4 text-sm text-[#68756d]">No pending requests right now.</p>}</div>}</section>)}
            {isAuthenticated && <section className="mt-8 rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Invitations and roles</p><h2 className="mt-1 font-[Fraunces] text-2xl font-semibold">Coordinate your private groups</h2></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl bg-[#f3f5ee] p-4"><p className="text-sm font-bold">Accept an invitation</p><div className="mt-3 flex gap-2"><Input value={inviteToken} onChange={event => setInviteToken(event.target.value)} placeholder="Paste invite code" /><Button onClick={() => acceptInviteMutation.mutate({ token: inviteToken })} disabled={!inviteToken || acceptInviteMutation.isPending} className="rounded-full bg-[#19473e]">Join</Button></div></div><div className="rounded-2xl bg-[#f3f5ee] p-4"><p className="text-sm font-bold">Create an invitation</p><div className="mt-3 flex flex-wrap gap-2">{dashboard?.groups.filter(group => group.ownerId === user?.id).map(group => <Button key={`invite-${group.id}`} size="sm" variant="outline" onClick={() => createInviteMutation.mutate({ groupId: group.id })} className="rounded-full">Invite to {group.name}</Button>) || <span className="text-sm text-[#68756d]">Create a group to invite members.</span>}</div></div></div>{managedGroupId && groupMembersQuery.data && <div className="mt-4 rounded-2xl border border-[#e3e5dd] p-4"><p className="text-sm font-bold">Active group members</p><div className="mt-3 space-y-2">{groupMembersQuery.data.map(member => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f9f4] p-3"><span className="text-sm font-semibold">{member.displayName || `Member ${member.userId}`}</span>{member.role !== "owner" && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => updateGroupMemberRoleMutation.mutate({ groupId: managedGroupId, memberUserId: member.userId, role: member.role === "moderator" ? "member" : "moderator" })} className="rounded-full">{member.role === "moderator" ? "Make member" : "Make moderator"}</Button><Button size="sm" variant="outline" onClick={() => transferOwnershipMutation.mutate({ groupId: managedGroupId, successorUserId: member.userId })} className="rounded-full">Transfer ownership</Button></div>}</div>)}</div></div>}</section>}
            <section className="mt-8 rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Community members</p><h2 className="mt-1 font-[Fraunces] text-2xl font-semibold">Find familiar faces through play.</h2></div><span className="rounded-full bg-[#edf4eb] px-3 py-1.5 text-xs font-bold text-[#39705d]">Privacy-aware</span></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{!isAuthenticated ? <p className="text-sm text-[#68756d]">Sign in to view community-visible player profiles.</p> : membersQuery.data?.length ? membersQuery.data.map(member => <div key={member.userId} className="rounded-2xl bg-[#f3f5ee] p-4"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e4b54a] text-xs font-bold text-[#173d35]">{getInitials(member.displayName)}</div><p className="mt-3 font-bold">{member.displayName}</p><p className="mt-1 text-xs text-[#65746b]">{member.city} · {member.skillBand}</p><p className="mt-3 text-xs leading-5 text-[#5f6f66]">{member.bio || member.preferredFormats}</p></div>) : <p className="text-sm text-[#68756d]">Community-visible profiles will appear here as members join.</p>}</div></section>
            <div className="mt-8 rounded-[27px] border border-[#dfe1d5] bg-white/75 p-5 sm:flex sm:items-center sm:justify-between sm:p-6"><div className="flex gap-3"><div className="rounded-2xl bg-[#f0f2e9] p-3 text-[#2f6f5c]"><LockKeyhole className="h-5 w-5" /></div><div><h3 className="font-[Fraunces] text-xl font-semibold">Context before contact</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-[#68756d]">Groups show their purpose and visibility before membership. Private groups use owner approval before their member list is visible.</p></div></div><span className="mt-4 text-sm font-bold text-[#346e5a] sm:mt-0">Private membership is reviewed by the host</span></div>
          </section>
        )}

        {activeView === "profile" && (
          <section>{!isAuthenticated ? <div className="mx-auto max-w-2xl rounded-[32px] border border-[#dfe1d5] bg-[#fffef9] p-8 text-center sm:p-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f0e6] text-[#39705d]"><CircleUserRound className="h-7 w-7" /></div><h1 className="mt-6 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">Make pickleball feel more local.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#6a786f]">Create a player profile to RSVP, join public groups, and choose how much of your community context is visible.</p><Button onClick={askForSignIn} className="mt-7 rounded-full bg-[#19473e] px-6 font-bold text-white hover:bg-[#123b33]">Sign in to create your profile</Button></div> : <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><aside className="rounded-[30px] bg-[#19473e] p-7 text-white"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f2cd5f] font-[Fraunces] text-xl font-semibold text-[#173d35]">{getInitials(dashboard?.profile?.displayName || user?.name)}</div><p className="mt-5 text-[11px] font-extrabold uppercase tracking-[.14em] text-[#f6d36a]">Player profile</p><h1 className="mt-2 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">{dashboard?.profile?.displayName || user?.name || "Your profile"}</h1><p className="mt-3 text-sm leading-6 text-[#d4e2d4]">{dashboard?.profile?.bio || "Add a little about how you like to play so groups and hosts can make a warmer welcome."}</p><div className="mt-7 space-y-3 border-t border-white/15 pt-5"><div className="flex items-center justify-between text-sm"><span className="text-[#c6d7c7]">Skill context</span><span className="font-bold">{dashboard?.profile?.skillBand}</span></div><div className="flex items-center justify-between text-sm"><span className="text-[#c6d7c7]">Visibility</span><span className="font-bold capitalize">{dashboard?.profile?.visibility}</span></div><div className="flex items-center justify-between text-sm"><span className="text-[#c6d7c7]">Rating context</span><span className="font-bold">{dashboard?.profile?.ratingProvenance === "linked_provider" ? "Linked provider" : dashboard?.profile?.ratingProvenance === "self_described" ? "Self-described" : "Not shown"}</span></div></div></aside><div className="rounded-[30px] border border-[#dfe1d5] bg-[#fffef9] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#668176]">Your settings</p><h2 className="mt-1 font-[Fraunces] text-3xl font-semibold tracking-[-.05em]">Keep it useful, keep it yours.</h2></div><button onClick={() => setProfileOpen(true)} className="rounded-full bg-[#19473e] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#123b33]">Edit profile</button></div><div className="mt-7 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#f1f4ec] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.11em] text-[#74857a]">Home base</p><p className="mt-2 text-sm font-bold">{dashboard?.profile?.city}</p></div><div className="rounded-2xl bg-[#f1f4ec] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.11em] text-[#74857a]">Formats</p><p className="mt-2 text-sm font-bold">{dashboard?.profile?.preferredFormats}</p></div></div><div className="mt-6 rounded-2xl border border-[#e4e6dc] p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-[#39705d]" /><p className="text-sm leading-6 text-[#597067]"><strong className="text-[#294e43]">Your rating is never inferred here.</strong> PicklePlay only displays the context you provide, such as self-described or linked-provider status. It does not calculate an authoritative rating.</p></div></div><section className="mt-6 rounded-2xl bg-[#f1f4ec] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[.11em] text-[#74857a]">Attendance history</p><div className="mt-3 space-y-2">{dashboard?.attendanceHistory?.length ? dashboard.attendanceHistory.map(item => <div key={`${item.gameId}-${item.recordedAt}`} className="flex items-start justify-between gap-3 rounded-xl bg-white p-3 text-sm"><span>{item.title}{item.correctionNote && <small className="block text-xs text-[#7a6c5a]">{item.correctionNote}</small>}</span><span className="capitalize text-[#587368]">{item.status.replace("_", " ")}</span></div>) : <p className="text-sm text-[#68756d]">Attendance outcomes will appear after an organizer checks in a completed game.</p>}</div></section><button onClick={() => logout()} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#a35843] hover:text-[#803f31]"><DoorOpen className="h-4 w-4" /> Sign out</button></div></div>}</section>
        )}
      </main>

      <nav className="fixed inset-x-4 bottom-4 z-40 flex justify-around rounded-[22px] border border-[#d9ddd2] bg-[#fffef9]/95 p-2 shadow-[0_16px_35px_rgba(35,65,54,.18)] backdrop-blur md:hidden" aria-label="Mobile navigation">{navItems.map(item => { const Icon = item.icon; const active = activeView === item.id; return <button key={item.id} onClick={() => setActiveView(item.id)} className={`flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[10px] font-bold ${active ? "bg-[#19473e] text-white" : "text-[#6c7c72]"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>

      <Dialog open={groupCreateOpen} onOpenChange={setGroupCreateOpen}><DialogContent className="rounded-[28px] border-[#dfe1d5] bg-[#fffef9] sm:max-w-[560px]"><DialogHeader><DialogTitle className="font-[Fraunces] text-3xl font-semibold tracking-[-.05em]">Create a local group</DialogTitle></DialogHeader><p className="-mt-2 text-sm leading-6 text-[#6b786f]">You become the group owner. Private groups require owner approval before new members can see group members or member-only activity.</p><form onSubmit={event => { event.preventDefault(); createGroupMutation.mutate(groupForm); }} className="mt-3 grid gap-4"><div className="grid gap-2"><Label htmlFor="groupName">Group name</Label><Input id="groupName" value={groupForm.name} onChange={event => setGroupForm({ ...groupForm, name: event.target.value })} placeholder="Saturday Riverside Rally" required /></div><div className="grid gap-2"><Label htmlFor="groupDescription">Purpose and expectations</Label><Textarea id="groupDescription" value={groupForm.description} onChange={event => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Who is this for, and what should members expect?" required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="groupNeighborhood">Neighborhood</Label><Input id="groupNeighborhood" value={groupForm.neighborhood} onChange={event => setGroupForm({ ...groupForm, neighborhood: event.target.value })} placeholder="Riverside" required /></div><div className="grid gap-2"><Label>Visibility</Label><Select value={groupForm.visibility} onValueChange={visibility => setGroupForm({ ...groupForm, visibility: visibility as "public" | "private" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public community group</SelectItem><SelectItem value="private">Private, approval required</SelectItem></SelectContent></Select></div></div><div className="mt-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setGroupCreateOpen(false)} className="rounded-full">Cancel</Button><Button type="submit" disabled={createGroupMutation.isPending} className="rounded-full bg-[#19473e] text-white hover:bg-[#123b33]">Create group</Button></div></form></DialogContent></Dialog>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="max-h-[90vh] overflow-y-auto rounded-[28px] border-[#dfe1d5] bg-[#fffef9] sm:max-w-[620px]"><DialogHeader><DialogTitle className="font-[Fraunces] text-3xl font-semibold tracking-[-.05em]">Your player profile</DialogTitle></DialogHeader><p className="-mt-2 text-sm leading-6 text-[#6b786f]">Skill labels are self-described matching context, not a proprietary or authoritative rating.</p><form onSubmit={event => { event.preventDefault(); profileMutation.mutate(profileForm); }} className="mt-3 grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="displayName">Display name</Label><Input id="displayName" value={profileForm.displayName} onChange={event => setProfileForm({ ...profileForm, displayName: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="city">City or service area</Label><Input id="city" value={profileForm.city} onChange={event => setProfileForm({ ...profileForm, city: event.target.value })} /></div></div><div className="grid gap-2"><Label htmlFor="bio">A little about your play</Label><Textarea id="bio" value={profileForm.bio} onChange={event => setProfileForm({ ...profileForm, bio: event.target.value })} placeholder="What kind of games help you feel at home?" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Self-described skill band</Label><Select value={profileForm.skillBand} onValueChange={skillBand => setProfileForm({ ...profileForm, skillBand })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Finding my starting point">Finding my starting point</SelectItem><SelectItem value="New to pickleball · 2.5">New to pickleball · 2.5</SelectItem><SelectItem value="2.5 · 3.5">2.5 · 3.5</SelectItem><SelectItem value="3.0 · 4.0">3.0 · 4.0</SelectItem><SelectItem value="Open to a conversation">Open to a conversation</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Rating provenance</Label><Select value={profileForm.ratingProvenance} onValueChange={ratingProvenance => setProfileForm({ ...profileForm, ratingProvenance: ratingProvenance as typeof profileForm.ratingProvenance })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Don’t show a rating label</SelectItem><SelectItem value="self_described">Self-described context</SelectItem><SelectItem value="linked_provider">Linked provider context</SelectItem></SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Profile visibility</Label><Select value={profileForm.visibility} onValueChange={visibility => setProfileForm({ ...profileForm, visibility: visibility as typeof profileForm.visibility })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="community">Visible in eligible community contexts</SelectItem><SelectItem value="private">Only visible to me</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="formats">Preferred formats</Label><Input id="formats" value={profileForm.preferredFormats} onChange={event => setProfileForm({ ...profileForm, preferredFormats: event.target.value })} /></div></div><div className="mt-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setProfileOpen(false)} className="rounded-full">Cancel</Button><Button type="submit" disabled={profileMutation.isPending} className="rounded-full bg-[#19473e] text-white hover:bg-[#123b33]">Save profile</Button></div></form></DialogContent></Dialog>
    </div>
  );
}
