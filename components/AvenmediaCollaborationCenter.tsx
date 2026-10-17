'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Archive, ArrowDownToLine, ArrowLeft, Bell, BellOff, Bookmark, Check, CheckCheck, CircleDot, Edit3, FileImage, FileText, Link2, MessageCircle, MoreHorizontal, Paperclip, Pin, Play, Search, Send, Share2, Smile, Trash2, UploadCloud, UsersRound, Video, VolumeX, X } from 'lucide-react';
import { getAuthClient } from '@/lib/avenmedia-auth';
import { shouldNotifyConversation } from '@/lib/avenmedia-policy';
import { conversationAction, deleteConversationMessage, editConversationMessage, findOrCreateConversation, listAvailableUploads, listCollaborationEmployees, listConversationMedia, listConversationMessages, listConversations, listSafeOrders, listConversationPreference, markConversationRead, sendConversationMessage, setConversationMute, setConversationNotifications, shareMedia, toggleMessageBookmark, toggleMessagePin, toggleMessageReaction, uploadChatAttachment, type CollaborationEmployee, type CollaborationMessage, type Conversation, type ConversationPreference, type MessageType, type SafeOrder, type SharedMedia } from '@/lib/avenmedia-collaboration';

type Upload = { id: string; task_id: string | null; client_name: string | null; secure_url: string | null; file_url: string | null; resource_type: string | null; format: string | null; bytes: number | null };
const roleLabels: Record<string, string> = { admin: 'مدير', manager: 'مدير', designer: 'مصمم', photographer: 'مصور', editor: 'مونتاج', social_media: 'سوشل ميديا', accountant: 'محاسب', hr: 'موارد بشرية', indoor: 'تنفيذ الداخل', flex_printing: 'طباعة الفلكس', flex_workshop: 'ورشة الفلكس', laser: 'ليزر', acrylic: 'اكرليك', employee: 'موظف' };
const bytes = (value: number | null) => value ? value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB` : 'ملف';
const attachmentType = (file: File): MessageType => file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('audio/') ? 'voice' : 'file';

export function AvenmediaCollaborationCenter() {
  const [me, setMe] = useState('');
  const [employees, setEmployees] = useState<CollaborationEmployee[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [orders, setOrders] = useState<SafeOrder[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [messages, setMessages] = useState<CollaborationMessage[]>([]);
  const [media, setMedia] = useState<SharedMedia[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [activeRole, setActiveRole] = useState('all');
  const [query, setQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [body, setBody] = useState('');
  const [room, setRoom] = useState<'chat' | 'media'>('chat');
  const [chosenUpload, setChosenUpload] = useState('');
  const [chosenOrder, setChosenOrder] = useState('');
  const [includeDetails, setIncludeDetails] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [preference, setPreference] = useState<ConversationPreference | null>(null);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; loaded: number; total: number; retrying?: boolean } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<CollaborationMessage | null>(null);
  const [editing, setEditing] = useState<CollaborationMessage | null>(null);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [incomingToast, setIncomingToast] = useState<{ id: string; conversationId: string; sender: string; preview: string } | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<Conversation | null>(null);
  const channelRef = useRef<any>(null);
  const incomingToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showIncomingToast = (toast: { id: string; conversationId: string; sender: string; preview: string }) => {
    setIncomingToast(toast);
    if (incomingToastTimer.current) clearTimeout(incomingToastTimer.current);
    incomingToastTimer.current = setTimeout(() => setIncomingToast(null), 3000);
  };
  const dismissIncomingToast = () => {
    if (incomingToastTimer.current) clearTimeout(incomingToastTimer.current);
    incomingToastTimer.current = null;
    setIncomingToast(null);
  };

  const loadSelected = async (conversation: Conversation) => {
    setSelected(conversation); selectedRef.current = conversation; setRoom('chat'); setError('');
    const [msgs, shared, pref] = await Promise.all([listConversationMessages(conversation.id), listConversationMedia(conversation.id), listConversationPreference(conversation.id)]);
    setMessages(msgs.data); setMedia(shared.data); setPreference(pref.data); setError([msgs.error, shared.error, pref.error].filter(Boolean).join(' · '));
    void markConversationRead(conversation.id);
  };
  const refresh = async () => {
    const user = (await getAuthClient().auth.getUser()).data.user;
    if (!user) return;
    setMe(user.id);
    const [people, chats, taskRows, files] = await Promise.all([listCollaborationEmployees(), listConversations(), listSafeOrders(), listAvailableUploads()]);
    setEmployees(people.data.filter(person => person.id !== user.id)); setConversations(chats.data); setOrders(taskRows.data); setUploads(files.data);
    setError([people.error, chats.error, taskRows.error, files.error].filter(Boolean).join(' · '));
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const db = getAuthClient() as any;
    const channel = db.channel(`avenmedia-chat-${selected.id}`, { config: { presence: { key: me } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${selected.id}` }, (payload: any) => {
        void loadSelected(selected);
        if (payload.eventType === 'INSERT' && payload.new?.sender_id !== me && shouldNotifyConversation(preference)) {
          const sender = selected.members?.find(person => person.id === payload.new.sender_id)?.name || 'عضو الفريق';
          showIncomingToast({ id: String(payload.new.id || `${selected.id}-${Date.now()}`), conversationId: selected.id, sender, preview: payload.new.body || payload.new.attachment_name || 'مرفق جديد' });
        }
      })
      .on('presence', { event: 'sync' }, () => { const state = channel.presenceState(); setOnline(Object.keys(state).some(key => key !== me)); })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => { if (payload?.userId !== me) { setTyping(Boolean(payload?.typing)); window.setTimeout(() => setTyping(false), 2400); } })
      .subscribe(async (status: string) => { if (status === 'SUBSCRIBED') await channel.track({ userId: me, online_at: new Date().toISOString() }); });
    channelRef.current = channel;
    return () => { void db.removeChannel(channel); channelRef.current = null; };
  }, [selected?.id, me, preference?.notifications_enabled, preference?.muted_until, preference?.muted_permanently]);
  useEffect(() => {
    if (!me) return;
    const db = getAuthClient() as any;
    const channel = db.channel(`avenmedia-chat-notifications-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, async ({ new: message }: any) => {
        if (!message || message.sender_id === me || message.conversation_id === selectedRef.current?.id) return;
        const conversation = conversations.find(item => item.id === message.conversation_id);
        if (!conversation) return;
        const result = await listConversationPreference(message.conversation_id);
        if (result.error || !shouldNotifyConversation(result.data)) return;
        const sender = conversation.members?.find(person => person.id === message.sender_id)?.name || 'عضو الفريق';
        showIncomingToast({ id: String(message.id || `${message.conversation_id}-${Date.now()}`), conversationId: message.conversation_id, sender, preview: message.body || message.attachment_name || 'مرفق جديد' });
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, [me, conversations]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3000); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => { if (!selected || typeof window === 'undefined') return; const saved = window.localStorage.getItem(`avenmedia-draft:${selected.id}`) || ''; setBody(saved); }, [selected?.id]);
  useEffect(() => { if (selected && typeof window !== 'undefined') window.localStorage.setItem(`avenmedia-draft:${selected.id}`, body); }, [body, selected?.id]);

  const visibleEmployees = useMemo(() => employees.filter(person => (!query || `${person.name} ${person.email} ${person.specialty || ''}`.toLowerCase().includes(query.toLowerCase())) && (activeRole === 'all' || person.role === activeRole)), [employees, query, activeRole]);
  const visibleMessages = useMemo(() => messages.filter(item => !messageQuery || `${item.body} ${item.attachment_name || ''}`.toLowerCase().includes(messageQuery.toLowerCase())), [messages, messageQuery]);
  const roles = useMemo(() => Array.from(new Set(employees.map(person => person.role))), [employees]);
  const selectedOther = selected?.members?.find(person => person.id !== me);
  const setTypingState = (value: boolean) => { if (typingTimer.current) clearTimeout(typingTimer.current); void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: me, typing: value } }); if (value) typingTimer.current = setTimeout(() => void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: me, typing: false } }), 1800); };
  const startChat = async (person: CollaborationEmployee) => { const result = await findOrCreateConversation(person.id); if (result.error || !result.data) { setError(result.error); return; } await refresh(); await loadSelected({ ...result.data, members: [person] }); };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || (!body.trim() && !pendingFile)) return;
    if (editing) { const result = await editConversationMessage(editing.id, body); if (result.error) setError(result.error); else { setMessages(current => current.map(item => item.id === editing.id ? { ...item, ...result.data, edited_at: new Date().toISOString() } as CollaborationMessage : item)); setEditing(null); setBody(''); } return; }
    if (pendingFile) { setUploadProgress({ percent: 0, loaded: 0, total: pendingFile.size }); const result = await uploadChatAttachment({ conversationId: selected.id, file: pendingFile, messageType: attachmentType(pendingFile), body, replyToMessageId: replyTo?.id, onProgress: setUploadProgress }); if (result.error || !result.data) setError(result.error || 'تعذر إرسال المرفق'); else { setMessages(current => [...current, result.data!]); setNotice('تم رفع المرفق وإرساله'); setBody(''); setPendingFile(null); setReplyTo(null); } setUploadProgress(null); return; }
    const result = await sendConversationMessage(selected.id, body, null, { replyToMessageId: replyTo?.id });
    if (result.error || !result.data) setError(result.error); else { setMessages(current => [...current, result.data!]); setBody(''); setReplyTo(null); setNotice('تم إرسال الرسالة'); setTypingState(false); }
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) setPendingFile(file); event.target.value = ''; };
  const startRecording = async () => {
    if (recording) { mediaRecorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('التسجيل الصوتي غير متاح على هذا الجهاز'); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const recorder = new MediaRecorder(stream); chunks.current = []; recorder.ondataavailable = event => chunks.current.push(event.data); recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); const file = new File([new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' })], `voice-${Date.now()}.webm`, { type: recorder.mimeType || 'audio/webm' }); setPendingFile(file); }; mediaRecorder.current = recorder; recorder.start(); setRecording(true); recorder.addEventListener('stop', () => setRecording(false), { once: true }); } catch { setError('تعذر الوصول إلى الميكروفون'); }
  };
  const action = async (kind: 'archive' | 'delete' | 'block') => { if (!selected) return; if (kind !== 'archive' && !window.confirm(kind === 'delete' ? 'حذف المحادثة نهائياً؟' : 'حظر هذا المستخدم؟')) return; const result = await conversationAction(selected.id, kind, selectedOther?.id); if (result.error) setError(result.error); else { setNotice(kind === 'archive' ? 'تمت الأرشفة' : kind === 'delete' ? 'تم الحذف' : 'تم الحظر'); setSelected(null); await refresh(); } };
  const updatePreference = async (next: ConversationPreference | null) => { if (!next) return; setPreference(next); };
  const toggleNotifications = async () => { if (!selected || !preference) return; const result = await setConversationNotifications(selected.id, !preference.notifications_enabled); if (result.error) setError(result.error); else { await updatePreference(result.data); setNotice(result.data?.notifications_enabled ? 'تم تفعيل إشعارات المحادثة' : 'تم إيقاف إشعارات المحادثة'); } };
  const mute = async (duration: 'day' | 'two_days' | 'week' | 'permanent' | 'unmute') => { if (!selected) return; const result = await setConversationMute(selected.id, duration); if (result.error) setError(result.error); else { await updatePreference(result.data); setShowMenu(false); setNotice(duration === 'unmute' ? 'تم إلغاء الكتم' : 'تم كتم المحادثة'); } };
  const messageAction = async (kind: 'reply' | 'edit' | 'delete' | 'bookmark' | 'pin' | 'reaction', item: CollaborationMessage, emoji = '👍') => {
    if (!selected) return;
    if (kind === 'reply') { setReplyTo(item); setOpenActions(null); return; }
    if (kind === 'edit') { setEditing(item); setBody(item.body); setOpenActions(null); return; }
    if (kind === 'delete') { const result = await deleteConversationMessage(item.id); if (result.error) setError(result.error); else setMessages(current => current.filter(message => message.id !== item.id)); }
    if (kind === 'bookmark') { const result = await toggleMessageBookmark(item.id, Boolean(item.bookmarked)); if (!result.error) setMessages(current => current.map(message => message.id === item.id ? { ...message, bookmarked: !item.bookmarked } : message)); }
    if (kind === 'pin') { const result = await toggleMessagePin(selected.id, item.id, Boolean(item.pinned)); if (!result.error) setMessages(current => current.map(message => message.id === item.id ? { ...message, pinned: !item.pinned } : message)); }
    if (kind === 'reaction') { const active = Boolean(item.reactions?.some(reaction => reaction.user_id === me && reaction.emoji === emoji)); const result = await toggleMessageReaction(selected.id, item.id, emoji, active); if (!result.error) { const reactions = item.reactions || []; setMessages(current => current.map(message => message.id === item.id ? { ...message, reactions: active ? reactions.filter(reaction => !(reaction.user_id === me && reaction.emoji === emoji)) : [...reactions, { user_id: me, emoji }] } : message)); } }
    setOpenActions(null);
  };
  const orderFor = (shared: SharedMedia) => shared.order && shared.include_order_details ? shared.order : null;
  const shareNative = async (shared: SharedMedia) => { const url = shared.upload?.secure_url || shared.upload?.file_url; if (!url) return; if (navigator.share) await navigator.share({ title: shared.upload?.client_name || 'Avenmedia', text: orderFor(shared)?.title || 'ملف Avenmedia', url }); else await navigator.clipboard?.writeText(url); setNotice('تم فتح المشاركة أو نسخ الرابط'); };
  const shareAttachment = async (item: CollaborationMessage) => {
    if (!item.attachment_url) return;
    try {
      if (navigator.share) { await navigator.share({ title: item.attachment_name || 'Avenmedia', url: item.attachment_url }); setNotice('تم فتح مشاركة المرفق'); return; }
      if (!navigator.clipboard?.writeText) { setError('المشاركة غير مدعومة على هذا الجهاز'); return; }
      await navigator.clipboard.writeText(item.attachment_url);
      setNotice('تم نسخ رابط المرفق');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setError('تعذرت مشاركة المرفق');
    }
  };
  const share = async (event: FormEvent) => { event.preventDefault(); if (!selected || !chosenUpload) return; const result = await shareMedia({ conversationId: selected.id, uploadId: chosenUpload, taskId: chosenOrder || null, includeOrderDetails: includeDetails }); if (result.error) setError(result.error); else { const upload = uploads.find(item => item.id === chosenUpload); setMedia(current => [...current, { ...result.data!, upload, order: includeDetails ? orders.find(order => order.id === chosenOrder) || null : null }]); setChosenUpload(''); setChosenOrder(''); setNotice('تم إرسال الملف'); } };

  return <main dir="rtl" className="grid min-h-[720px] gap-4 rounded-[28px] bg-[#f7f9ff] p-4 text-[#080d24] md:p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
    {incomingToast && <div role="status" aria-live="polite" className="fixed left-4 top-4 z-[100] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#cbd4f5] bg-white p-3 text-[#080d24] shadow-2xl"><div className="flex items-start gap-2"><button type="button" onClick={() => { const conversation = conversations.find(item => item.id === incomingToast.conversationId); dismissIncomingToast(); if (conversation) void loadSelected(conversation); }} className="min-w-0 flex-1 text-right"><strong className="block text-sm">رسالة جديدة من {incomingToast.sender}</strong><span className="mt-1 block truncate text-xs text-slate-600">{incomingToast.preview}</span><small className="mt-1 block text-[10px] font-bold text-[#3159d8]">انقر لفتح المحادثة</small></button><button type="button" onClick={dismissIncomingToast} aria-label="إغلاق إشعار الرسالة" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-4" /></button></div></div>}
    <aside className={`${selected ? 'hidden lg:block' : 'block'} rounded-3xl bg-[#080d24] p-4 text-white`}>
      <div className="mb-4 flex items-center justify-between"><div><span className="font-mono text-[10px] tracking-[.18em] text-[#b9c3ff]">AVENMEDIA / CHAT</span><h2 className="mt-1 text-xl font-black">الفريق والمحادثات</h2></div><button onClick={() => void (window.Notification ? window.Notification.requestPermission() : Promise.resolve())} title="إشعارات الجهاز" className="rounded-xl border border-white/20 p-2"><Bell className="h-4" /></button></div>
      <div className="mb-3 flex gap-2 overflow-x-auto"><button onClick={() => setActiveRole('all')} className={`rounded-lg px-2 py-1 text-xs font-bold ${activeRole === 'all' ? 'bg-[#3159d8]' : 'bg-white/10'}`}>الكل</button>{roles.map(role => <button key={role} onClick={() => setActiveRole(role)} className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold ${activeRole === role ? 'bg-[#3159d8]' : 'bg-white/10'}`}>{roleLabels[role] || role}</button>)}</div>
      <label className="mb-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2"><Search className="h-4" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بأعضاء الفريق…" className="min-w-0 bg-transparent text-sm outline-none placeholder:text-white/50" /></label>
      <div className="space-y-2">{visibleEmployees.map(person => <button key={person.id} onClick={() => void startChat(person)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-right transition hover:bg-white/10"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#3159d8] font-black">{person.name?.slice(0, 1) || '?'}</span><span className="min-w-0"><b className="block truncate text-sm">{person.name || person.email}</b><small className="block truncate text-white/60">{roleLabels[person.role] || person.role}{person.specialty ? ` · ${person.specialty}` : ''}</small></span></button>)}{!visibleEmployees.length && <p className="py-8 text-center text-xs text-white/60">لا توجد حسابات مطابقة.</p>}</div>
    </aside>
    <section className={`${!selected ? 'hidden lg:block' : 'block'} min-w-0 rounded-3xl border border-[#dce1ff] bg-white p-4 shadow-sm md:p-6`}>
      {!selected && <div className="grid min-h-[620px] place-items-center text-center"><div><UsersRound className="mx-auto h-12 w-12 text-[#3159d8]" /><h3 className="mt-4 text-2xl font-black">اختر عضواً لبدء محادثة مباشرة</h3><p className="mt-2 text-sm text-slate-500">الدليل الآمن يعرض أقل قدر لازم من بيانات الفريق.</p></div></div>}
      {selected && <div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4"><div className="flex items-center gap-3"><button onClick={() => setSelected(null)} className="rounded-xl border p-2" title="رجوع"><ArrowLeft className="h-4" /></button><div><h3 className="text-xl font-black">{selectedOther?.name || selected.title || 'محادثة مباشرة'}</h3><p className="text-xs text-slate-500">{online ? 'متصل الآن' : 'غير متصل'} {typing ? ' · يكتب الآن…' : ''} {selectedOther ? ` · ${roleLabels[selectedOther.role] || selectedOther.role}` : ''}</p></div></div><div className="flex flex-wrap gap-2"><button onClick={() => void toggleNotifications()} className={`rounded-xl border p-2 ${preference?.notifications_enabled ? 'text-[#3159d8]' : 'text-slate-400'}`} title="إشعارات المحادثة">{preference?.notifications_enabled ? <Bell className="h-4" /> : <BellOff className="h-4" />}</button><button onClick={() => setShowRequest(true)} className="inline-flex items-center gap-1 rounded-xl bg-[#3159d8] px-3 py-2 text-xs font-black text-white"><Link2 className="h-4" />إرسال طلب</button><button onClick={() => setRoom('chat')} className={`rounded-xl px-3 py-2 text-xs font-bold ${room === 'chat' ? 'bg-[#080d24] text-white' : 'border'}`}><MessageCircle className="mr-1 inline h-4" />المحادثة</button><button onClick={() => setRoom('media')} className={`rounded-xl px-3 py-2 text-xs font-bold ${room === 'media' ? 'bg-[#080d24] text-white' : 'border'}`}><FileImage className="mr-1 inline h-4" />الرفع</button><button onClick={() => setShowMenu(value => !value)} className="rounded-xl border p-2" title="خيارات المحادثة"><MoreHorizontal className="h-4" /></button></div></header>
        {showMenu && <div className="relative z-10 mt-2 flex flex-wrap gap-2 rounded-2xl border bg-white p-3 text-xs font-bold shadow-lg"><button onClick={() => void mute('day')} className="rounded-lg border px-3 py-2">كتم يوم</button><button onClick={() => void mute('two_days')} className="rounded-lg border px-3 py-2">كتم يومين</button><button onClick={() => void mute('week')} className="rounded-lg border px-3 py-2">كتم أسبوع</button><button onClick={() => void mute('permanent')} className="rounded-lg border px-3 py-2">كتم دائماً</button><button onClick={() => void mute('unmute')} className="rounded-lg border px-3 py-2">إلغاء الكتم</button><button onClick={() => void action('archive')} className="rounded-lg border px-3 py-2"><Archive className="ml-1 inline h-3" />أرشفة</button></div>}
        {(notice || error) && <div className={`my-4 flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || notice}<button onClick={() => { setNotice(''); setError(''); }}><X className="h-4" /></button></div>}
        {showRequest && <div className="my-4 rounded-2xl border bg-[#f7f9ff] p-4"><div className="mb-3 flex items-center justify-between"><b>إرسال طلب إلى {selectedOther?.name || 'الموظف'}</b><button onClick={() => setShowRequest(false)}><X className="h-4" /></button></div><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-xs font-bold">بحث داخل الطلبات<input value={orderQuery} onChange={event => setOrderQuery(event.target.value)} className="h-10 rounded-xl border bg-white px-3" placeholder="اسم العميل أو الطلب" /></label><label className="grid gap-1 text-xs font-bold">ملف من غرفة الرفع<select value={chosenUpload} onChange={event => setChosenUpload(event.target.value)} className="h-10 rounded-xl border bg-white px-3"><option value="">بدون ملف</option>{uploads.map(item => <option key={item.id} value={item.id}>{item.client_name || item.id}</option>)}</select></label></div><div className="mt-3 grid gap-2">{orders.filter(item => !orderQuery || `${item.title} ${item.client_name || ''}`.toLowerCase().includes(orderQuery.toLowerCase())).slice(0, 6).map(item => <button type="button" key={item.id} onClick={() => setChosenOrder(item.id)} className={`rounded-xl border p-3 text-right text-xs ${chosenOrder === item.id ? 'border-[#3159d8] bg-[#e6ebff]' : 'bg-white'}`}><b>{item.title || 'طلب بدون عنوان'}</b><span className="mr-2 text-slate-500">{item.client_name || 'بدون اسم'}</span></button>)}</div><label className="mt-3 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={includeDetails} onChange={event => setIncludeDetails(event.target.checked)} /> إرسال تفاصيل الطلب بدون التكلفة</label><button onClick={() => { setRoom('media'); setShowRequest(false); }} className="mt-3 rounded-xl bg-[#080d24] px-4 py-2.5 text-xs font-black text-white">المتابعة</button></div>}
        {room === 'chat' && <div><div className="mb-2 flex items-center gap-2"><Search className="h-4 text-slate-400" /><input value={messageQuery} onChange={event => setMessageQuery(event.target.value)} placeholder="بحث داخل المحادثة…" className="h-9 min-w-0 flex-1 rounded-xl border px-3 text-sm" /></div><div className="min-h-[430px] space-y-3 overflow-y-auto py-4">{visibleMessages.length === 0 && <div className="grid min-h-[360px] place-items-center text-center text-slate-500"><MessageCircle className="mx-auto mb-2 h-9 w-9" /><p>لا توجد رسائل بعد. ابدأ المحادثة.</p></div>}{visibleMessages.map(item => <article key={item.id} className={`group relative max-w-[90%] rounded-2xl p-3 ${item.sender_id === me ? 'mr-auto bg-[#080d24] text-white' : 'ml-auto bg-[#e6ebff] text-[#080d24]'}`}><div className="mb-1 flex items-center gap-2 text-[10px] opacity-70"><time>{new Date(item.created_at).toLocaleString('ar-IQ')}</time>{item.edited_at && <span>معدلة</span>}{item.read_at && item.sender_id === me && <CheckCheck className="h-3" />}</div>{item.reply_to_message_id && <div className="mb-2 border-r-2 border-[#3159d8] pr-2 text-xs opacity-70">رد على رسالة سابقة</div>}{item.attachment_url && <div className="mb-2 overflow-hidden rounded-xl bg-black/5">{item.message_type === 'image' && <img src={item.attachment_url} alt={item.attachment_name || 'صورة'} className="max-h-64 w-full object-contain" />}{item.message_type === 'video' && <video controls className="max-h-64 w-full" src={item.attachment_url} />} {item.message_type === 'pdf' && <iframe title={item.attachment_name || 'PDF'} src={item.attachment_url} className="h-64 w-full" />}{item.message_type === 'voice' && <audio controls src={item.attachment_url} className="w-full" />}{!['image', 'video', 'pdf', 'voice'].includes(item.message_type) && <a href={item.attachment_url} target="_blank" rel="noreferrer" download className="flex items-center gap-2 p-3 text-sm"><FileText className="h-5" />{item.attachment_name || 'تنزيل الملف'}</a>}</div>}{item.body && <p className="whitespace-pre-wrap text-sm leading-7">{item.body}</p>}{item.attachment_url && <button type="button" onClick={() => void shareAttachment(item)} title="مشاركة المرفق" className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-300/50 px-2 py-1 text-[10px] font-bold"><Share2 className="h-3" />مشاركة المرفق</button>}<div className="mt-2 flex flex-wrap items-center gap-1 text-xs opacity-90">{item.reactions?.map(reaction => <span key={`${reaction.user_id}-${reaction.emoji}`} className="rounded-full bg-white/20 px-2 py-0.5">{reaction.emoji}</span>)}{item.bookmarked && <Bookmark className="h-3" />}{item.pinned && <Pin className="h-3" />}</div><div className="absolute left-2 top-2 hidden gap-1 rounded-lg bg-white p-1 text-[#080d24] shadow group-hover:flex"><button onClick={() => setOpenActions(openActions === item.id ? null : item.id)} title="إجراءات"><MoreHorizontal className="h-4" /></button>{openActions === item.id && <div className="absolute left-0 top-7 z-20 grid min-w-36 gap-1 rounded-xl border bg-white p-2 text-right text-xs shadow-xl"><button onClick={() => void messageAction('reply', item)} className="rounded p-1 hover:bg-slate-100">رد</button>{item.sender_id === me && <><button onClick={() => void messageAction('edit', item)} className="rounded p-1 hover:bg-slate-100">تعديل رسالتي</button><button onClick={() => void messageAction('delete', item)} className="rounded p-1 text-red-700 hover:bg-slate-100">سحب/حذف رسالتي</button></>}<button onClick={() => void messageAction('reaction', item)} className="rounded p-1 hover:bg-slate-100">تفاعل 👍</button><button onClick={() => void messageAction('pin', item)} className="rounded p-1 hover:bg-slate-100">{item.pinned ? 'إلغاء التثبيت' : 'تثبيت'}</button><button onClick={() => void messageAction('bookmark', item)} className="rounded p-1 hover:bg-slate-100">{item.bookmarked ? 'إلغاء الحفظ' : 'حفظ للمفضلة'}</button></div>}</div></article>)}</div>
          <form onSubmit={send} className="border-t pt-3">{replyTo && <div className="mb-2 flex items-center justify-between rounded-xl bg-[#f7f9ff] p-2 text-xs"><span>رد على: {replyTo.body.slice(0, 80) || replyTo.attachment_name}</span><button type="button" onClick={() => setReplyTo(null)}><X className="h-4" /></button></div>}{editing && <div className="mb-2 flex items-center justify-between rounded-xl bg-amber-50 p-2 text-xs"><span>تعديل الرسالة</span><button type="button" onClick={() => { setEditing(null); setBody(''); }}><X className="h-4" /></button></div>}{pendingFile && <div className="mb-2 flex items-center justify-between rounded-xl bg-blue-50 p-2 text-xs"><span className="flex items-center gap-2"><Paperclip className="h-4" />{pendingFile.name} · {bytes(pendingFile.size)}</span><button type="button" onClick={() => setPendingFile(null)}><X className="h-4" /></button></div>}{uploadProgress && <div className="mb-2 rounded-xl bg-slate-100 p-2 text-xs"><div className="mb-1 flex justify-between"><span>{uploadProgress.retrying ? 'إعادة المحاولة…' : 'جاري الرفع…'}</span><b>{uploadProgress.percent}%</b></div><progress max="100" value={uploadProgress.percent} className="h-2 w-full" /></div>}<div className="flex items-end gap-2"><label className="grid h-12 w-12 cursor-pointer place-items-center rounded-xl border" title="إرفاق ملف"><Paperclip className="h-4" /><input type="file" className="hidden" accept="image/*,video/*,application/pdf,audio/*,.zip,.doc,.docx" onChange={chooseFile} /></label><button type="button" onClick={() => void startRecording()} className={`grid h-12 w-12 place-items-center rounded-xl border ${recording ? 'border-red-500 bg-red-50 text-red-600' : ''}`} title="تسجيل صوت">{recording ? <VolumeX className="h-4" /> : <CircleDot className="h-4" />}</button><textarea value={body} onChange={event => { setBody(event.target.value); setTypingState(Boolean(event.target.value)); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(event); } }} placeholder="اكتب رسالة…" rows={1} className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border px-3 py-3 text-sm outline-none focus:border-[#3159d8]" /><button disabled={Boolean(uploadProgress)} className="grid h-12 w-12 place-items-center rounded-xl bg-[#080d24] text-white disabled:opacity-50"><Send className="h-4" /></button></div></form></div>}
        {room === 'media' && <div><form onSubmit={share} className="grid gap-3 rounded-2xl bg-[#f7f9ff] p-4 md:grid-cols-[1.3fr_1fr_auto] md:items-end"><label className="grid gap-1 text-xs font-bold">الوسيط الموجود في غرفة الرفع<select required value={chosenUpload} onChange={event => setChosenUpload(event.target.value)} className="h-11 rounded-xl border bg-white px-3"><option value="">اختر ملفاً</option>{uploads.map(item => <option key={item.id} value={item.id}>{item.client_name || item.id} · {bytes(item.bytes)}</option>)}</select></label><label className="grid gap-1 text-xs font-bold">ربط الطلب<select value={chosenOrder} onChange={event => setChosenOrder(event.target.value)} className="h-11 rounded-xl border bg-white px-3"><option value="">بدون طلب</option>{orders.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="h-11 rounded-xl bg-[#080d24] px-4 text-xs font-black text-white"><UploadCloud className="ml-1 inline h-4" />إرسال</button><label className="flex items-center gap-2 text-xs font-bold md:col-span-3"><input type="checkbox" checked={includeDetails} onChange={event => setIncludeDetails(event.target.checked)} /> تضمين معلومات الطلب بدون التكلفة</label></form><div className="mt-4 space-y-3">{media.map(shared => { const safe = orderFor(shared); const url = shared.upload?.secure_url || shared.upload?.file_url; return <article key={shared.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center gap-3"><FileImage className="h-5 text-[#3159d8]" /><div className="min-w-0 flex-1"><b className="block truncate">{shared.upload?.client_name || 'وسيط'}</b><small className="text-slate-500">{bytes(shared.upload?.bytes || null)} · {shared.upload?.format || ''}</small></div>{url && <><a href={url} target="_blank" rel="noreferrer" download className="rounded-xl border p-2" title="تنزيل"><ArrowDownToLine className="h-4" /></a><button onClick={() => void shareNative(shared)} className="rounded-xl border p-2" title="مشاركة"><Share2 className="h-4" /></button></>}</div>{safe && <details className="mt-3 rounded-xl bg-[#f7f9ff] p-3"><summary className="cursor-pointer text-sm font-black">عرض معلومات الطلب</summary><div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><span>اسم الزبون: <b>{safe.client_name || 'غير محدد'}</b></span><span>الموعد: <b>{safe.due_at ? new Date(safe.due_at).toLocaleString('ar-IQ') : 'غير محدد'}</b></span><span>الحالة: <b>{safe.status}</b></span></div></details>}</article>; })}{!media.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">لا توجد وسائط مشتركة بعد.</div>}</div></div>}
      </div>}
    </section>
    {notice && <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-2xl bg-[#080d24] px-4 py-3 text-sm font-bold text-white shadow-xl"><Check className="h-4 text-emerald-300" />{notice}<button onClick={() => setNotice('')}><X className="h-4" /></button></div>}
  </main>;
}
