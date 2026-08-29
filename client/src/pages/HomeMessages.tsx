import { useAuth } from "@/_core/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MessagesView() {
  const { isAuthenticated, loading, user } = useAuth();
  usePageTitle("Messages");
  const utils = trpc.useUtils();
  const conversations = trpc.community.conversations.useQuery(undefined, { enabled: isAuthenticated });
  const unread = trpc.community.unreadMessageCount.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 30_000 });
  const [activeCounterpart, setActiveCounterpart] = useState<number | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const thread = trpc.community.directThread.useQuery({ counterpartId: activeCounterpart || 0 }, { enabled: !!activeCounterpart });
  const members = trpc.community.members.useQuery(undefined, { enabled: isAuthenticated });

  const send = trpc.community.sendDirectMessage.useMutation({
    onSuccess: () => {
      setMessageBody("");
      utils.community.directThread.invalidate();
      utils.community.conversations.invalidate();
      utils.community.unreadMessageCount.invalidate();
    },
  });

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread.data]);

  if (loading) return <p className="mt-8 rounded-3xl bg-white p-6 text-sm text-[#66756c]">Loading your messages…</p>;
  if (!isAuthenticated) {
    return (
      <div className="mx-auto mt-6 max-w-xl rounded-[32px] border border-[#dfe1d5] bg-[#fffef9] p-8 text-center sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f0e6] text-[#39705d]"><MessageCircle className="h-7 w-7" /></div>
        <h1 className="mt-6 font-[Fraunces] text-3xl font-semibold tracking-[-.05em]">Message your pickleball people.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#6a786f]">Sign in to coordinate with hosts and fellow players before or between games. Contact is always tied to community activity.</p>
      </div>
    );
  }

  const startConversation = (memberId: number) => {
    setActiveCounterpart(memberId);
  };

  const submitMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCounterpart || !messageBody.trim()) return;
    send.mutate({ recipientId: activeCounterpart, body: messageBody });
  };

  const candidates = (members.data ?? []).filter(member => member.userId !== user?.id);
  const existingCounterpartIds = new Set((conversations.data ?? []).map(conversation => conversation.counterpartId));
  const newCandidates = candidates.filter(member => !existingCounterpartIds.has(member.userId));

  return (
    <section>
      <div className="border-b border-[#dfe1d5] pb-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#55685e]">Messages</p>
        <h1 className="mt-1 font-[Fraunces] text-4xl font-semibold tracking-[-.05em]">Talk before you play.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#69776e]">Coordinate game-day details with hosts and players you share games with. Messages stay between the two of you; blocking someone stops their messages instantly.</p>
        {unread.data?.count ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#fdeeda] px-3 py-1 text-xs font-bold text-[#8a5e45]">{unread.data.count} unread</p> : null}
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="rounded-[24px] border border-[#dfe1d5] bg-[#fffef9] p-4">
          <p className="px-1 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#7a867e]">Conversations</p>
          <div className="mt-3 space-y-1">
            {conversations.isLoading ? <p className="p-2 text-sm text-[#66756c]">Loading…</p> : (conversations.data ?? []).length === 0 ? <p className="p-2 text-sm leading-6 text-[#66756c]">No conversations yet. Start one with a community member below.</p> : (conversations.data ?? []).map(conversation => (
              <button key={conversation.counterpartId} onClick={() => setActiveCounterpart(conversation.counterpartId)} className={`w-full rounded-xl p-3 text-left transition ${activeCounterpart === conversation.counterpartId ? "bg-[#19473e] text-white" : "hover:bg-[#f1f4ec]"}`}>
                <span className="flex items-center justify-between gap-2 text-sm font-bold">{conversation.counterpartName}{conversation.unread > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${activeCounterpart === conversation.counterpartId ? "bg-white text-[#19473e]" : "bg-[#e4b54a] text-[#173d35]"}`}>{conversation.unread}</span>}</span>
                <span className={`mt-0.5 block truncate text-xs ${activeCounterpart === conversation.counterpartId ? "text-white/80" : "text-[#74807a]"}`}>{conversation.lastBody}</span>
                <span className={`mt-0.5 block text-[10px] ${activeCounterpart === conversation.counterpartId ? "text-white/60" : "text-[#94a098]"}`}>{new Date(conversation.lastAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {newCandidates.length > 0 && (
            <div className="mt-4 border-t border-[#e8e9df] pt-3">
              <p className="px-1 text-[11px] font-extrabold uppercase tracking-[.12em] text-[#7a867e]">Start a new chat</p>
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {newCandidates.slice(0, 12).map(member => (
                  <button key={member.userId} onClick={() => startConversation(member.userId)} className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#355f52] hover:bg-[#f1f4ec]">
                    {member.displayName}
                    <span className="block text-[11px] font-normal text-[#74807a]">{member.city}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex min-h-[420px] flex-col rounded-[24px] border border-[#dfe1d5] bg-[#fffef9]">
          {!activeCounterpart ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="max-w-sm text-sm leading-6 text-[#66756c]">Pick a conversation on the left, or start one with a community member, to see the thread here.</p>
            </div>
          ) : thread.isLoading ? (
            <p className="p-6 text-sm text-[#66756c]">Loading thread…</p>
          ) : thread.error ? (
            <p className="m-4 rounded-xl bg-[#fff0e9] p-3 text-sm text-[#9a5140]">{thread.error.message}</p>
          ) : thread.data ? (
            <>
              <div className="border-b border-[#e8e9df] p-4"><p className="font-[Fraunces] text-xl font-semibold">{thread.data.counterpartName}</p></div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.data.messages.length === 0 && <p className="text-sm text-[#66756c]">No messages yet — say hello.</p>}
                {thread.data.messages.map(message => (
                  <div key={message.id} className={`flex ${message.senderId === user?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.senderId === user?.id ? "bg-[#19473e] text-white" : "bg-[#f1f4ec] text-[#2c463e]"}`}>
                      {message.body}
                      <span className={`mt-1 block text-[10px] ${message.senderId === user?.id ? "text-white/60" : "text-[#94a098]"}`}>{new Date(message.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>
              <form onSubmit={submitMessage} className="flex gap-2 border-t border-[#e8e9df] p-4">
                <label htmlFor="message-body" className="sr-only">Message</label>
                <Input id="message-body" value={messageBody} onChange={event => setMessageBody(event.target.value)} placeholder="Write a message…" maxLength={2000} />
                <Button type="submit" disabled={send.isPending || !messageBody.trim()} className="rounded-full bg-[#19473e] hover:bg-[#123b33]" aria-label="Send message"><Send className="h-4 w-4" /></Button>
              </form>
              {send.error && <p className="px-4 pb-3 text-xs text-[#9a5140]">{send.error.message}</p>}
            </>
          ) : (
            <p className="p-6 text-sm text-[#66756c]">This conversation is unavailable.</p>
          )}
        </div>
      </div>
    </section>
  );
}
