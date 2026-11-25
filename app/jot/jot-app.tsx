"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { DEFAULT_JOT_PREFERENCES, loadJotPreferences, loadJotState, saveJotPreferences, saveJotState, STORAGE_KEY } from "./jot-storage";
import { EMPTY_JOT_STATE, JOT_COLORS, JOT_PALETTE, type JotNote, type JotState } from "./jot-types";
import { completeNote, reopenNote, reorderPending } from "./jot-order";
import { TapeNote } from "./tape-note";
import styles from "./jot.module.css";

const dateFormat = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
type RemovedNote = { note: JotNote; index: number; previous?: string; next?: string };

export function JotApp() {
  const router = useRouter();
  const [state, setState] = useState<JotState>(EMPTY_JOT_STATE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RemovedNote | null>(null);
  const [notice, setNotice] = useState(false);
  const [hint, setHint] = useState(false);
  const [message, setMessage] = useState("");
  const scroller = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const prefs = useRef(DEFAULT_JOT_PREFERENCES);
  const lastTap = useRef(0);
  const contact = useRef<{ id: number; x: number; y: number } | null>(null);

  const load = useCallback(() => {
    try { setState(loadJotState()); setReady(true); setError(""); }
    catch { setReady(false); setError("本地数据读取失败，已保留原始记录。"); }
  }, []);

  useEffect(() => {
    function sync(event: StorageEvent) { if (event.key === STORAGE_KEY || event.key === null) load(); }
    const timer = window.setTimeout(() => {
      load();
      try {
        prefs.current = loadJotPreferences();
        if (!prefs.current.deviceNoticeSeen) {
          setNotice(true);
          prefs.current = { ...prefs.current, deviceNoticeSeen: true };
          saveJotPreferences(prefs.current);
        }
      } catch { /* Hints are optional when browser storage is unavailable. */ }
    }, 0);
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); };
  }, [load]);

  // Read the latest saved list before each change. Notes and their history share one write.
  const commit = useCallback((change: (current: JotState) => JotState) => {
    if (!ready) return false;
    let current: JotState;
    try { current = loadJotState(); }
    catch { setReady(false); setError("本地数据读取失败，已保留原始记录。"); return false; }
    const next = change(current);
    try {
      if (next !== current) saveJotState(next);
      setState(next); setError(""); return true;
    } catch { setError("本次更改未能保存，请重试。"); return false; }
  }, [ready]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(false), 4600);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 4200);
    return () => clearTimeout(timer);
  }, [removed]);

  useEffect(() => {
    if (!newId) return;
    const timer = setTimeout(() => setNewId(null), 350);
    return () => clearTimeout(timer);
  }, [newId]);

  function focusNote(id?: string) {
    requestAnimationFrame(() => {
      // A newer action may already have opened an editor or the history dialog.
      if (dialog.current?.open || scroller.current?.querySelector("input")) return;
      const slot = id && scroller.current?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"] [data-note-focus-target]`);
      (slot || scroller.current)?.focus();
    });
  }

  const create = useCallback(() => {
    const now = Date.now();
    const id = "jot-" + (globalThis.crypto?.randomUUID?.() ?? now + "-" + Math.random().toString(36).slice(2));
    if (!commit(current => ({
      ...current,
      notes: [...current.notes, { id, text: "", color: JOT_COLORS[current.nextColorIndex % JOT_COLORS.length],
        isCompleted: false, completedAt: null, createdAt: now, updatedAt: now }],
      nextColorIndex: current.nextColorIndex + 1,
    }))) return;
    setEditing(id); setNewId(id); setMessage("已新建便签");
    if (!prefs.current.gestureHintSeen) {
      setHint(true);
      prefs.current = { ...prefs.current, gestureHintSeen: true };
      try { saveJotPreferences(prefs.current); } catch { /* The note is already saved. */ }
    }
  }, [commit]);

  useEffect(() => {
    function keyboard(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || dialog.current?.open
        || target.closest("input, textarea, [contenteditable=true]")) return;
      if (event.key.toLowerCase() === "n" && !event.repeat) { event.preventDefault(); create(); }
      else if (event.key === "Escape") { event.preventDefault(); router.push("/"); }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [router, create]);

  const pending = useMemo(() => state.notes.filter(note => !note.isCompleted), [state.notes]);
  const history = useMemo(() => [...state.history].reverse().sort((a, b) => b.completedAt - a.completedAt), [state.history]);

  function complete(id: string) {
    const index = pending.findIndex(note => note.id === id);
    if (!commit(current => completeNote(current, id, Date.now()))) return;
    setMessage("已存入完成记录"); setHint(false);
    focusNote((pending[index + 1] ?? pending[index - 1])?.id);
  }

  function remove(id: string) {
    let entry: RemovedNote | undefined;
    if (!commit(current => {
      const index = current.notes.findIndex(note => note.id === id && !note.isCompleted);
      if (index < 0) return current;
      entry = { note: current.notes[index], index, previous: current.notes[index - 1]?.id, next: current.notes[index + 1]?.id };
      return { ...current, notes: current.notes.filter(note => note.id !== id) };
    }) || !entry) return;
    setRemoved(entry); setHint(false); setMessage("已删除便签");
    const index = pending.findIndex(note => note.id === id);
    focusNote((pending[index + 1] ?? pending[index - 1])?.id);
  }

  function undo() {
    if (!removed || !commit(current => {
      if (current.notes.some(note => note.id === removed.note.id)) return current;
      const notes = [...current.notes];
      const next = notes.findIndex(note => note.id === removed.next);
      const previous = notes.findIndex(note => note.id === removed.previous);
      notes.splice(next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(removed.index, notes.length), 0, removed.note);
      return { ...current, notes };
    })) return;
    setRemoved(null); setMessage("已恢复便签"); focusNote(removed.note.id);
  }

  function canvasDown(event: PointerEvent<HTMLElement>) {
    if (!ready || !event.isPrimary || event.button !== 0 || (event.target as Element).closest("[data-jot-note], [data-jot-chrome]")) return;
    // The compatibility mouse press after the second tap would blur the new editor.
    if (Date.now() - lastTap.current <= 280) event.preventDefault();
    contact.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function canvasMove(event: PointerEvent<HTMLElement>) {
    const point = contact.current;
    if (point?.id === event.pointerId && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 12) {
      contact.current = null; lastTap.current = 0;
    }
  }

  function canvasUp(event: PointerEvent<HTMLElement>) {
    if (contact.current?.id !== event.pointerId) return;
    contact.current = null;
    const now = Date.now();
    if (now - lastTap.current <= 280) { lastTap.current = 0; create(); }
    else lastTap.current = now;
  }

  function openHistory() {
    lastTap.current = 0; setHint(false);
    dialog.current?.showModal();
  }

  return <main ref={scroller} className={styles.jotPage} lang="zh-CN" aria-label="Jot 本地便签" aria-describedby="jot-help" tabIndex={-1}
    onPointerDown={canvasDown} onPointerMove={canvasMove} onPointerUp={canvasUp}
    onPointerCancel={() => { contact.current = null; lastTap.current = 0; }}
    onScroll={() => { contact.current = null; lastTap.current = 0; }}>
    <p id="jot-help" className={styles.visuallyHidden}>按 N 新建便签。聚焦便签后按回车编辑、空格完成、Delete 删除，按 Alt 和上下方向键排序。</p>
    <p className={styles.visuallyHidden} role="status">{message}</p>
    <header className={styles.header} data-jot-chrome>
      <Link href="/" className={styles.iconButton} aria-label="返回 OnceEgg 首页" title="返回 OnceEgg">
        <svg aria-hidden="true" viewBox="0 0 24 30"><path d="M12 1.7C8.2 1.7 3.6 8.8 3.6 16c0 7.1 3.6 11.9 8.4 11.9s8.4-4.8 8.4-11.9C20.4 8.8 15.8 1.7 12 1.7Z" /><path d="m10.1 9.7 2.2 2.4-1.5 2.2 2.8 2.1" /></svg>
      </Link>
      <h1>OnceJot</h1>
      <button type="button" className={styles.iconButton} aria-label="完成记录" title="完成记录" aria-haspopup="dialog" onClick={openHistory}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 10a9 9 0 1 1 1.7 7.5M3 4v6h6M12 7v5l3 2" /></svg>
      </button>
    </header>
    <div className={styles.notes}>
      {pending.map(note => <TapeNote key={note.id} note={note} editing={editing === note.id} fresh={newId === note.id}
        onEdit={() => { if (ready) { setEditing(note.id); setHint(false); } }}
        onFinish={returnFocus => {
          setEditing(null);
          if (returnFocus) focusNote(note.id);
        }}
        onChange={text => commit(current => ({ ...current, notes: current.notes.map(item => item.id === note.id && !item.isCompleted
          ? { ...item, text, updatedAt: Date.now() } : item) }))}
        onComplete={() => complete(note.id)} onRemove={() => remove(note.id)}
        onReorder={(target, ids) => {
          if (commit(current => {
            if (ids) {
              const latest = current.notes.filter(item => !item.isCompleted);
              if (latest.length !== ids.length || latest.some((item, index) => item.id !== ids[index])) return current;
            }
            return reorderPending(current, note.id, target);
          })) setMessage("已调整便签顺序");
        }}
        onInteract={() => { lastTap.current = 0; setHint(false); }} />)}
      {!pending.length && <div className={styles.emptyState}>{ready ? "双击空白处，写下便签" : error ? "" : "正在铺纸…"}</div>}
    </div>
    {removed ? <div className={styles.toast} data-jot-chrome>已删除便签 <button onClick={undo}>撤销</button></div>
      : hint ? <p className={styles.hint}><span className={styles.mouseHint}>拖动排序</span><span className={styles.touchHint}>长按拖动排序</span> · 双击完成 · 左滑删除</p>
      : notice ? <p className={styles.hint}>只留在这台设备里。</p> : null}
    {error && <div className={styles.error} role="alert" data-jot-chrome>{error} {!ready && <button onClick={load}>重试</button>}</div>}
    <dialog ref={dialog} className={styles.history} aria-labelledby="jot-history-title" data-jot-chrome
      onClick={event => { if (event.target === event.currentTarget) {
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.current?.close();
      } }}>
      <header className={styles.historyHeader}><h2 id="jot-history-title">完成记录</h2>
        <button className={styles.iconButton} onClick={() => dialog.current?.close()} aria-label="关闭完成记录"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </header>
      {error && <p role="alert" className={styles.historyError}>{error} {!ready && <button onClick={load}>重试</button>}</p>}
      {history.length ? <ol className={styles.records}>{history.map(record => <li key={record.noteId}>
        <span className={styles.swatch} aria-hidden="true" style={{ backgroundColor: JOT_PALETTE[record.color].surface }} />
        <div><p>{record.text || "空白便签"}</p><time>{dateFormat.format(record.completedAt)}</time></div>
        <button aria-label={`恢复待办：${record.text || "空白便签"}`} onClick={() => {
          if (commit(current => reopenNote(current, record.noteId))) {
            dialog.current?.close(); setMessage("已恢复待办"); focusNote(record.noteId);
          }
        }}>恢复待办</button>
      </li>)}</ol> : <p className={styles.historyEmpty}>{ready ? "还没有完成记录" : error ? "暂时无法读取记录" : "正在读取…"}</p>}
    </dialog>
  </main>;
}
