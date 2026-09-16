'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Check, FileUp, LogIn, LogOut, Mail, MessageCircle, Moon, Paperclip, Send, ShieldCheck, Sun, UserRound, Wifi, X } from 'lucide-react';
import { supabase, chatItems, profiles, uploadsForTasks, sendChatMessage, createTransferTask, type ChatItem, type ChatProfile, type UploadItem } from '@/lib/avenmedia-chat';

const roleLabels: Record<string, string> = { admin: 'مدير', manager: 'مدير', designer: 'مصمم', indoor: 'تنفيذ الداخل', flex_printing: 'طباعة الفلكس', flex_workshop: 'ورشة الفلكس', laser: 'ليزر', acrylic: 'اكرليك', viewer: 'عضو' };
const formatBytes = (bytes: number | null) => !bytes ? '' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function AvenmediaChat() {
  const db = supabase();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profilesList, setProfilesList] = useState<ChatProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dark, setDark] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('avenmedia-theme');
    setDark(saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (!db) { setAuthLoading(false); setError('إعدادات Supabase غير متوفرة في هذه النسخة'); return; }
    let mounted = true;
    void db.auth.getUser().then(({ data }) => { if (mounted) { setUser(data.user ? { id: data.user.id, email: data.user.email } : null); setAuthLoading(false); } });
    const { data: listener } = db.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null));
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [db]);

  useEffect(() => { document.documentElement.classList.toggle('dark', dark); window.localStorage.setItem('avenmedia-theme', dark ? 'dark' : 'light'); }, [dark]);

  const loadData = async () => {
    if (!user) return;
    setError('');
    const [people, itemResult] = await Promise.all([profiles(), chatItems()]);
    setProfilesList(people.data.filter(person => person.id !== user.id));
    if (people.error || itemResult.error) setError(people.error || itemResult.error);
    setMessages(itemResult.data);
    const uploadsResult = await uploadsForTasks(itemResult.data.map(item => item.id));
    setUploads(uploadsResult.data);
    if (!selectedId && people.data.find(person => person.id !== user.id)) setSelectedId(people.data.find(person => person.id !== user.id)!.id);
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
  };
  useEffect(() => { void loadData(); }, [user]);
  useEffect(() => {
    if (!db || !user) return;
    const channel = db.channel('avenmedia-chat-live').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => void loadData()).on('postgres_changes', { event: '*', schema: 'public', table: 'client_uploads' }, () => void loadData()).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [db, user, selectedId]);

  const selected = profilesList.find(person => person.id === selectedId);
  const visibleMessages = useMemo(() => messages.filter(item => item.task_type === 'chat' && (!selectedId || item.created_by === user?.id || item.client_name === selectedId) && (item.created_by === user?.id || item.client_name === selectedId)), [messages, selectedId, user?.id]);
  const uploadByTask = (taskId: string) => uploads.find(item => item.task_id === taskId);
  const displayName = (id: string | null) => id === user?.id ? 'أنت' : profilesList.find(person => person.id === id)?.name || selected?.name || 'عضو الفريق';

  const submitText = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !text.trim() || sending) return;
    setSending(true); setError('');
    try { const item = await sendChatMessage(selectedId, text); setMessages(current => [...current, item]); setText(''); setNotice('تم إرسال الرسالة وتخزينها في Supabase'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إرسال الرسالة'); }
    finally { setSending(false); }
  };
  const submitFile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !file || sending) return;
    setSending(true); setError('');
    try { const result = await createTransferTask(selectedId, file, note); setMessages(current => [...current, result.task]); if (result.upload) setUploads(current => [...current, result.upload!]); setFile(null); setNote(''); setNotice('تم رفع الملف بجودته الأصلية وإرساله عبر Cloudinary'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر رفع الملف'); }
    finally { setSending(false); }
  };

  if (authLoading) return <div className="aven-center">جاري التحقق من جلسة Avenmedia…</div>;
  if (!user) return <AuthPanel db={db} dark={dark} setDark={setDark} />;

  return <main className="aven-shell" dir="rtl"><aside className="aven-sidebar"><div className="aven-brand"><div className="aven-logo">A</div><div><strong>Avenmedia</strong><small>مساحة تسليم الملفات</small></div></div><div className="aven-secure"><ShieldCheck size={17}/><span>جلسة Supabase محمية<br/><b>تشفير HTTPS + RLS</b></span></div><p className="aven-label">اختار الطرف الآخر</p><div className="aven-people">{profilesList.length === 0 && <p className="aven-muted">لا يوجد أعضاء آخرون بعد. أنشئ حساباً من Supabase Auth.</p>}{profilesList.map(person => <button key={person.id} onClick={() => setSelectedId(person.id)} className={`aven-person ${selectedId === person.id ? 'selected' : ''}`}><span className="aven-avatar">{person.name?.slice(0, 1) || '؟'}</span><span><b>{person.name || person.email}</b><small>{roleLabels[person.role] || person.role}{person.specialty ? ` · ${person.specialty}` : ''}</small></span><i className="aven-online"/></button>)}</div><div className="aven-sidebar-foot"><button className="aven-ghost" onClick={() => setDark(!dark)}>{dark ? <Sun size={17}/> : <Moon size={17}/>} {dark ? 'الوضع الفاتح' : 'الوضع الداكن'}</button><button className="aven-ghost danger" onClick={() => void db?.auth.signOut()}><LogOut size={17}/> تسجيل الخروج</button></div></aside><section className="aven-chat"><header className="aven-chat-head"><div><p className="aven-kicker"><Wifi size={13}/> Avenmedia / محادثة مباشرة</p><h1>{selected ? `محادثة مع ${selected.name || selected.email}` : 'اختر مصمماً أو منفذاً'}</h1><p>{selected ? `${roleLabels[selected.role] || selected.role} · الإرسال والتنزيل محفوظان في Supabase` : 'حدد حساباً من القائمة للبدء'}</p></div><div className="aven-head-actions"><button className="aven-icon" onClick={() => setDark(value => !value)} title="تغيير الثيم">{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="aven-profile" onClick={() => void db?.auth.signOut()}><span className="aven-avatar small">{user.email?.slice(0, 1).toUpperCase()}</span><span>{user.email}</span><LogOut size={15}/></button></div></header>{notice && <div className="aven-notice"><Check size={16}/> {notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}{error && <div className="aven-error">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}<div className="aven-messages">{visibleMessages.length === 0 && <div className="aven-empty"><MessageCircle size={35}/><b>ابدأ المحادثة</b><span>أرسل رسالة أو ارفع ملفاً للطرف المحدد. الملفات تحفظ على Cloudinary بأعلى جودة.</span></div>}{visibleMessages.map(item => { const asset = uploadByTask(item.id); return <article key={item.id} className={`aven-message ${item.created_by === user.id ? 'mine' : ''}`}><div className="aven-message-meta"><b>{displayName(item.created_by)}</b><time>{new Date(item.created_at).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' })}</time></div><p>{item.description}</p>{asset?.secure_url && <div className="aven-asset"><FileUp size={17}/><div><b>{asset.client_name || 'ملف مرفق'}</b><small>{asset.format?.toUpperCase()} {formatBytes(asset.bytes)}</small></div><a href={asset.secure_url} target="_blank" rel="noreferrer" download><ArrowDownToLine size={17}/></a></div>}</article>; })}<div ref={endRef}/></div><div className="aven-compose"><form onSubmit={submitText} className="aven-text-form"><input value={text} onChange={event => setText(event.target.value)} disabled={!selectedId || sending} placeholder={selectedId ? 'اكتب رسالة للطرف الآخر…' : 'اختر حساباً أولاً'} /><button disabled={!selectedId || !text.trim() || sending} className="aven-send" title="إرسال الرسالة"><Send size={18}/></button></form><form onSubmit={submitFile} className="aven-file-form"><label className="aven-file-pick"><Paperclip size={17}/><span>{file ? file.name : 'إرفاق ملف أصلي'}</span><input type="file" onChange={event => setFile(event.target.files?.[0] || null)} /></label>{file && <input value={note} onChange={event => setNote(event.target.value)} placeholder="ملاحظة للمنفّذ (اختياري)" />}{file && <button disabled={sending} className="aven-upload"><FileUp size={17}/>{sending ? 'جارٍ الرفع…' : 'رفع وإرسال'}</button>}</form></div></section></main>;
}

function AuthPanel({ db, dark, setDark }: { db: ReturnType<typeof supabase>; dark: boolean; setDark: (value: boolean) => void }) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!db) return; setBusy(true); setError(''); setMessage(''); try { const result = mode === 'magic' ? await db.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }) : await db.auth.signInWithPassword({ email, password }); if (result.error) throw result.error; setMessage(mode === 'magic' ? 'تم إرسال رابط الدخول إلى بريدك الإلكتروني' : 'تم تسجيل الدخول'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدخول'); } finally { setBusy(false); } };
  return <main className="aven-auth" dir="rtl"><div className="aven-auth-card"><div className="aven-logo large">A</div><p className="aven-kicker">AVENMEDIA / SECURE WORKSPACE</p><h1>تواصل، ارفع، وسلّم.</h1><p className="aven-auth-copy">مساحة عمل مباشرة بين المصممين والمنفذين، بجلسات Supabase محمية وملفات Cloudinary أصلية.</p><div className="aven-auth-tabs"><button className={mode === 'password' ? 'active' : ''} onClick={() => setMode('password')}><LogIn size={16}/> كلمة المرور</button><button className={mode === 'magic' ? 'active' : ''} onClick={() => setMode('magic')}><Mail size={16}/> Magic Link</button></div><form onSubmit={submit} className="aven-auth-form"><label>البريد الإلكتروني<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></label>{mode === 'password' && <label>كلمة المرور<input type="password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="••••••••" /></label>}<button disabled={busy} className="aven-primary">{busy ? 'جارٍ التحقق…' : mode === 'magic' ? 'إرسال رابط الدخول' : 'تسجيل الدخول'}</button></form>{message && <p className="aven-success">{message}</p>}{error && <p className="aven-error static">{error}</p>}<button className="aven-theme-auth" onClick={() => setDark(!dark)}>{dark ? <Sun size={16}/> : <Moon size={16}/>} تغيير الثيم</button></div></main>;
}
