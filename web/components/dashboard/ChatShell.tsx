"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Chat } from "@/components/Chat";
import { ReticleBadge } from "@/components/reticle/ReticleBadge";
import { ReticleButton } from "@/components/reticle/ReticleButton";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { ReticleHatch } from "@/components/reticle/ReticleHatch";
import { cn } from "@/lib/cn";
import type { Message } from "@/lib/types";

type ChatSummary = {
	id: string;
	title: string;
	machineId: string | null;
	model: string | null;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
};

type ChatRecord = ChatSummary & { messages: Message[] };

type ChatsListResponse =
	| { ok: true; chats: ChatSummary[]; machineId: string }
	| {
			ok: false;
			reason:
				| "machine_starting"
				| "machine_asleep"
				| "machine_error"
				| "no_active_machine"
				| "missing_credentials"
				| "exec_failed";
			message: string;
			machineId?: string;
			chats: [];
	  };

type LoadResponse =
	| { ok: true; chat: ChatRecord }
	| {
			ok: false;
			reason: string;
			message: string;
	  };

type Props = {
	activeMachineId: string | null;
	model: string | null;
};

const newId = () =>
	`chat${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const TRANSIENT_REASONS: ReadonlySet<string> = new Set([
	"machine_starting",
	"machine_asleep",
]);

export function ChatShell({ activeMachineId, model }: Props) {
	const [chats, setChats] = useState<ChatSummary[]>([]);
	const [machineState, setMachineState] = useState<{
		ok: boolean;
		reason: string | null;
		message: string | null;
	}>({ ok: false, reason: null, message: "loading..." });
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);
	const titleRef = useRef<string>("untitled chat");
	const createdAtRef = useRef<string>(new Date().toISOString());

	const refreshList = useCallback(async (): Promise<ChatsListResponse | null> => {
		try {
			const response = await fetch("/api/dashboard/chats", {
				cache: "no-store",
			});
			const body = (await response.json()) as ChatsListResponse;
			if (body.ok) {
				setChats(body.chats);
				setMachineState({ ok: true, reason: null, message: null });
			} else {
				setChats([]);
				setMachineState({
					ok: false,
					reason: body.reason,
					message: body.message,
				});
			}
			return body;
		} catch (err) {
			const msg = err instanceof Error ? err.message : "fetch failed";
			setMachineState({ ok: false, reason: "network", message: msg });
			return null;
		}
	}, []);

	useEffect(() => {
		void refreshList();
	}, [refreshList]);

	// Auto-poll while transitioning (machine waking up). Backs off when
	// machine reaches a terminal state (ok or error).
	useEffect(() => {
		if (!machineState.reason) return;
		if (!TRANSIENT_REASONS.has(machineState.reason)) return;
		const id = window.setTimeout(() => {
			void refreshList();
		}, 3000);
		return () => window.clearTimeout(id);
	}, [machineState, refreshList]);

	const loadChat = useCallback(async (chatId: string) => {
		setLoadError(null);
		try {
			const response = await fetch(`/api/dashboard/chats/${chatId}`, {
				cache: "no-store",
			});
			const body = (await response.json()) as LoadResponse;
			if (!body.ok) {
				setLoadError(body.message);
				return;
			}
			setActiveChatId(body.chat.id);
			setMessages(body.chat.messages ?? []);
			titleRef.current = body.chat.title;
			createdAtRef.current = body.chat.createdAt;
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : "load failed");
		}
	}, []);

	const newChat = useCallback(() => {
		setActiveChatId(newId());
		setMessages([]);
		titleRef.current = "untitled chat";
		createdAtRef.current = new Date().toISOString();
	}, []);

	const deleteChat = useCallback(
		async (chatId: string) => {
			if (!window.confirm("Delete this chat history?")) return;
			try {
				const response = await fetch(`/api/dashboard/chats/${chatId}`, {
					method: "DELETE",
				});
				if (!response.ok) {
					const body = (await response.json().catch(() => ({}))) as {
						message?: string;
					};
					setLoadError(body.message ?? `delete failed: HTTP ${response.status}`);
					return;
				}
				if (chatId === activeChatId) {
					setActiveChatId(null);
					setMessages([]);
				}
				await refreshList();
			} catch (err) {
				setLoadError(err instanceof Error ? err.message : "delete failed");
			}
		},
		[activeChatId, refreshList],
	);

	useEffect(() => {
		if (activeChatId !== null) return;
		if (chats.length > 0) {
			void loadChat(chats[0].id);
		} else if (machineState.ok) {
			newChat();
		}
	}, [activeChatId, chats, loadChat, newChat, machineState.ok]);

	const persistTurn = useCallback(
		async (final: Message[]) => {
			if (!activeChatId) return;
			if (!machineState.ok) return;
			const firstUser = final.find((m) => m.role === "user");
			const title = firstUser
				? firstUser.content.trim().replace(/\s+/g, " ").slice(0, 80)
				: "untitled chat";
			titleRef.current = title;
			const record: ChatRecord = {
				id: activeChatId,
				title,
				machineId: activeMachineId,
				model,
				createdAt: createdAtRef.current,
				updatedAt: new Date().toISOString(),
				messageCount: final.length,
				messages: final,
			};
			try {
				const response = await fetch("/api/dashboard/chats", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(record),
				});
				if (response.ok) await refreshList();
			} catch {
				// Surfaced via the chat error UI on the next interaction.
			}
		},
		[activeChatId, activeMachineId, machineState.ok, model, refreshList],
	);

	const isTransient =
		machineState.reason !== null && TRANSIENT_REASONS.has(machineState.reason);

	return (
		<div className="grid gap-px bg-[var(--ret-border)] lg:grid-cols-[260px_1fr]">
			<aside className="bg-[var(--ret-bg)] p-3">
				<div className="flex items-center justify-between gap-2 pb-3">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ret-text-muted)]">
						History
					</span>
					<ReticleButton
						variant="primary"
						size="sm"
						onClick={newChat}
						disabled={!machineState.ok}
					>
						New
					</ReticleButton>
				</div>
				<MachineStateBanner state={machineState} />
				{loadError ? (
					<ReticleFrame className="mb-3 border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 p-3">
						<p className="font-mono text-[10px] text-[var(--ret-red)]">
							{loadError}
						</p>
					</ReticleFrame>
				) : null}
				<ul className="flex flex-col gap-px bg-[var(--ret-border)]">
					{machineState.ok && chats.length === 0 ? (
						<li className="bg-[var(--ret-bg)] p-3 font-mono text-[11px] text-[var(--ret-text-muted)]">
							no past chats
						</li>
					) : null}
					{chats.map((chat) => {
						const active = chat.id === activeChatId;
						return (
							<li
								key={chat.id}
								className={cn(
									"group flex flex-col gap-1 p-2",
									active
										? "bg-[var(--ret-purple-glow)]"
										: "bg-[var(--ret-bg)] hover:bg-[var(--ret-surface)]",
								)}
							>
								<button
									type="button"
									onClick={() => void loadChat(chat.id)}
									className="text-left"
								>
									<p
										className={cn(
											"truncate font-mono text-[12px]",
											active
												? "text-[var(--ret-purple)]"
												: "text-[var(--ret-text)]",
										)}
									>
										{chat.title}
									</p>
									<p className="font-mono text-[10px] text-[var(--ret-text-muted)]">
										{chat.messageCount} msg . {timeAgo(chat.updatedAt)}
									</p>
								</button>
								<div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
									<button
										type="button"
										onClick={() => void deleteChat(chat.id)}
										className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
									>
										delete
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			</aside>

			<section className="bg-[var(--ret-bg)] p-5">
				<div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					<span>chat</span>
					<span>.</span>
					<span className="text-[var(--ret-text-dim)]">
						{titleRef.current}
					</span>
					{activeMachineId ? (
						<ReticleBadge
							variant={
								machineState.ok
									? "default"
									: isTransient
										? "warning"
										: "warning"
							}
							className="text-[10px]"
						>
							{activeMachineId.slice(0, 14)}
							{isTransient ? " · waking" : ""}
						</ReticleBadge>
					) : (
						<ReticleBadge variant="warning" className="text-[10px]">
							no active machine
						</ReticleBadge>
					)}
				</div>
				<ReticleHatch
					className="mb-4 h-1 border-b border-[var(--ret-border)]"
					pitch={6}
				/>
				<Chat
					key={activeChatId ?? "blank"}
					messages={messages}
					onMessagesChange={setMessages}
					onTurnComplete={persistTurn}
					disabled={!activeMachineId || !machineState.ok}
					disabledReason={
						!activeMachineId
							? "No active machine. Pick or provision one in /dashboard/machines."
							: !machineState.ok
								? machineState.message ?? "Storage unavailable."
								: undefined
					}
				/>
			</section>
		</div>
	);
}

function MachineStateBanner({
	state,
}: {
	state: { ok: boolean; reason: string | null; message: string | null };
}) {
	if (state.ok) return null;
	if (state.reason === "machine_starting" || state.reason === "machine_asleep") {
		return (
			<ReticleFrame className="mb-3 border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-3">
				<p className="font-mono text-[10px] text-[var(--ret-amber)]">
					Waking your machine... chats are stored on its disk.
				</p>
				<p className="mt-1 font-mono text-[10px] text-[var(--ret-text-muted)]">
					{state.message ?? "First open after sleep takes ~30 seconds."}
				</p>
			</ReticleFrame>
		);
	}
	if (state.reason === "no_active_machine") {
		return (
			<ReticleFrame className="mb-3 border-[var(--ret-amber)]/40 bg-[var(--ret-amber)]/5 p-3">
				<p className="font-mono text-[10px] text-[var(--ret-amber)]">
					No active machine.
				</p>
				<a
					href="/dashboard/setup"
					className="mt-1 inline-block font-mono text-[10px] text-[var(--ret-purple)] underline"
				>
					{"Provision one ->"}
				</a>
			</ReticleFrame>
		);
	}
	return (
		<ReticleFrame className="mb-3 border-[var(--ret-red)]/40 bg-[var(--ret-red)]/5 p-3">
			<p className="font-mono text-[10px] text-[var(--ret-red)]">
				{state.message ?? "Storage unavailable."}
			</p>
		</ReticleFrame>
	);
}

function timeAgo(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "--";
	const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
