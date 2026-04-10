'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Maximize2, Sparkles, X } from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { ChatMarkdown } from '../../chat/ChatMarkdown'
import { useApex } from '../apex-context'

type QuizState = 'idle' | 'wrong' | 'success'

interface AIClassroomProps {
  openChatSignal?: number
}

export function AIClassroom({ openChatSignal = 0 }: AIClassroomProps) {
  const { language, t } = useApex()
  const [quizState, setQuizState] = useState<QuizState>('idle')
  const [journal, setJournal] = useState('')
  const [input, setInput] = useState('')
  const [isSocratesOpen, setIsSocratesOpen] = useState(false)
  const [isSocratesExpanded, setIsSocratesExpanded] = useState(false)
  const [showEntryTip, setShowEntryTip] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('apex-ai-classroom-tip-dismissed') !== '1'
  })
  const socratesInputRef = useRef<HTMLInputElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const requestBody = useMemo(() => ({ language }), [language])

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: requestBody,
    }),
  })
  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isLoading])

  useEffect(() => {
    if (!openChatSignal) return
    const frame = window.requestAnimationFrame(() => {
      setIsSocratesOpen(true)
      setIsSocratesExpanded(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [openChatSignal])

  useEffect(() => {
    if (!(isSocratesOpen && isSocratesExpanded)) return
    const timer = window.setTimeout(() => socratesInputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [isSocratesOpen, isSocratesExpanded])

  const renderSocratesChat = (opts: { expanded?: boolean }) => (
    <div className="flex flex-col overflow-hidden h-full">
      <div
        className={[
          'p-4 border-b border-slate-100',
          opts.expanded ? 'bg-white' : 'bg-blue-50/50',
          'flex items-center justify-between gap-3',
        ].join(' ')}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="text-blue-600 shrink-0" size={20} />
          <span className="font-bold text-slate-800 truncate">Socrates AI</span>
          <span className="hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            Markdown
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!opts.expanded ? (
            <button
              type="button"
              onClick={() => {
                setIsSocratesExpanded(true)
                setIsSocratesOpen(true)
              }}
              className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50"
              title={t('Perbesar chat', 'Expand chat')}
            >
              <Maximize2 size={14} />
              Expand
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSocratesExpanded(false)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label={t('Tutup chat yang diperbesar', 'Close expanded chat')}
              title={t('Tutup', 'Close')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="bg-blue-50 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-700 border border-blue-100">
            {t(
              'Halo! Aku siap bantu belajar. Kamu ingin bahas topik apa hari ini?',
              'Hi! I am ready to help you learn. What topic do you want to discuss today?',
            )}
          </div>
        )}

        {messages.map((m) => {
          const text = m.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('')
          const isUser = m.role === 'user'
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={[
                  'max-w-[95%] p-3 rounded-2xl text-sm border',
                  isUser
                    ? 'bg-blue-600 text-white border-blue-600 rounded-br-sm'
                    : 'bg-white text-slate-800 border-slate-200 rounded-tl-sm',
                ].join(' ')}
              >
                <ChatMarkdown markdown={text} inverted={isUser} />
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-sm text-sm text-slate-500 italic animate-pulse border border-slate-200">
            {t('Socrates sedang memikirkan petunjuk terbaik untukmu...', 'Socrates is thinking of the best hint for you...')}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500">
            {String(error.message ?? t('Gagal terhubung ke AI tutor.', 'Failed to connect to AI tutor.'))}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="p-4 border-t border-slate-100 space-y-2 bg-white"
        onSubmit={(e) => {
          e.preventDefault()
          const text = input.trim()
          if (!text) return
          sendMessage({ text })
          setInput('')
        }}
      >
        <input
          ref={socratesInputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('Tulis pertanyaanmu ke Socrates...', 'Write your question to Socrates...')}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 text-sm hover:bg-blue-700 transition-colors disabled:bg-blue-500 disabled:text-white/90 disabled:cursor-not-allowed"
        >
          {isLoading ? t('Mengirim...', 'Sending...') : t('Kirim ke Socrates', 'Send to Socrates')}
        </button>
      </form>
    </div>
  )

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 animate-in fade-in relative">
      {/* Left: Interactive Material & Quiz */}
      <div className="flex-1 flex flex-col gap-6">
        {showEntryTip && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-start justify-between gap-3">
            <p>
              {t(
                'Tip: jika kamu masuk lewat menu/tab, chat Socrates tidak terbuka otomatis. Gunakan tombol floating Socrates untuk langsung membuka chat.',
                'Tip: when you enter from menu/tab, Socrates chat does not auto-open. Use the floating Socrates button to open chat instantly.',
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setShowEntryTip(false)
                window.localStorage.setItem('apex-ai-classroom-tip-dismissed', '1')
              }}
              className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
              aria-label={t('Tutup tip', 'Dismiss tip')}
              title={t('Tutup tip', 'Dismiss tip')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Mobile: Socrates quick access */}
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => {
              setIsSocratesOpen(true)
              setIsSocratesExpanded(true)
            }}
            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm"
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Sparkles className="text-blue-600" size={18} />
              </span>
              <span className="text-left">
                <span className="block font-bold text-slate-800">{t('Tanya Socrates AI', 'Ask Socrates AI')}</span>
                <span className="block text-xs text-slate-500">{t('Buka chat layar penuh (lebih nyaman)', 'Open full-screen chat (more comfortable)')}</span>
              </span>
            </span>
            <Maximize2 className="text-slate-400" size={18} />
          </button>
        </div>

        {/* Metacognition Journal */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-2">{t('Jurnal Metakognisi (Pre-Test)', 'Metacognition Journal (Pre-Test)')}</h3>
          <p className="text-sm text-slate-600 font-medium mb-4 italic border-l-4 border-blue-500 pl-3">
            {t('Sebelum mulai, apa yang paling ingin kamu ketahui dari materi ini?', 'Before starting, what do you most want to learn from this topic?')}
          </p>
          <textarea 
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" 
            rows={2}
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder={t('Tulis pemikiranmu di sini...', 'Write your thoughts here...')}
          />
          <button className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">
            {t('Simpan', 'Save')}
          </button>
        </div>

        {/* Quiz Section */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 flex-1">
          <h3 className="font-bold text-slate-800 mb-4">{t('Misi Kuis #1', 'Quiz Mission #1')}</h3>
          <p className="font-medium text-slate-700 mb-6">
            {t('Organel manakah yang bertugas sebagai pabrik energi sel?', 'Which organelle acts as the cell energy factory?')}
          </p>
          
          {quizState === 'idle' && (
            <div className="flex gap-4">
              <button 
                onClick={() => setQuizState('wrong')} 
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-bold hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700"
              >
                {t('Nukleus', 'Nucleus')}
              </button>
              <button 
                onClick={() => setQuizState('success')} 
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-bold hover:border-blue-500 hover:bg-blue-50 transition-colors text-slate-700"
              >
                {t('Mitokondria', 'Mitochondria')}
              </button>
            </div>
          )}

          {/* Error State */}
          {quizState === 'wrong' && (
            <div className="bg-orange-50 p-6 rounded-xl border border-orange-200 text-center animate-in zoom-in-95">
              <p className="text-orange-800 font-bold mb-4">
                {t('Belum tepat, tapi kamu sedang belajar! Coba periksa kembali bagian ini...', 'Not quite right, but you are learning! Try checking this part again...')}
              </p>
              <button 
                onClick={() => setQuizState('idle')} 
                className="px-6 py-3 bg-white text-orange-600 border border-orange-200 rounded-xl font-bold inline-flex items-center gap-2 shadow-sm hover:bg-orange-50 transition-colors"
              >
                {t('Coba Strategi Lain', 'Try Another Strategy')}
              </button>
            </div>
          )}

          {/* Success State */}
          {quizState === 'success' && (
            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 text-center animate-in zoom-in-95">
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-emerald-800 font-bold text-lg">
                {t('Luar Biasa! Kerja kerasmu membuahkan hasil. Materi ini sudah kamu kuasai!', 'Excellent! Your hard work paid off. You have mastered this topic!')}
              </p>
              <button 
                onClick={() => setQuizState('idle')} 
                className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
              >
                {t('Lanjut ke Soal Berikutnya', 'Continue to the Next Question')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: Socratic AI (desktop only) */}
      <div className="hidden md:flex w-full md:w-[420px] lg:w-[480px] xl:w-[560px] bg-white rounded-3xl border border-slate-200 overflow-hidden shrink-0">
        {renderSocratesChat({ expanded: false })}
      </div>

      {/* Expanded Socrates (mobile + desktop modal) */}
      {isSocratesOpen && isSocratesExpanded && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => {
              setIsSocratesOpen(false)
              setIsSocratesExpanded(false)
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t('Chat Socrates AI', 'Socrates AI chat')}
            className={[
              'absolute inset-x-0 bottom-0 h-[92vh] bg-white border-t border-slate-200 rounded-t-3xl shadow-xl',
              'md:inset-y-6 md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:h-[86vh] md:max-w-3xl md:rounded-3xl md:border',
            ].join(' ')}
          >
            {renderSocratesChat({ expanded: true })}
          </section>
        </div>
      )}
    </div>
  )
}
