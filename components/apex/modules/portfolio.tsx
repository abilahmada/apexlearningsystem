'use client'

import { useState } from 'react'
import { FileText, Upload, CheckCircle2 } from 'lucide-react'
import { useApex } from '../apex-context'

export function Portfolio() {
  const { t } = useApex()
  const [isUploaded, setIsUploaded] = useState(false)

  const handleUpload = () => {
    setIsUploaded(true)
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">{t('Ruang Karya Global', 'Global Portfolio Space')}</h2>
        
        {/* Upload Area */}
        <div 
          onClick={handleUpload}
          className="p-10 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 text-center cursor-pointer hover:bg-slate-100 hover:border-blue-400 transition-all duration-200"
        >
          {!isUploaded ? (
            <>
              <Upload size={48} className="text-blue-500 mx-auto mb-4" />
              <p className="font-bold text-slate-700">{t('Unggah Pitch Deck (PDF)', 'Upload Pitch Deck (PDF)')}</p>
              <p className="text-sm text-slate-500 mt-2">{t('Klik atau drag file ke sini', 'Click or drag file here')}</p>
            </>
          ) : (
            <>
              <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
              <p className="font-bold text-emerald-700">pitch_deck_v1.pdf</p>
              <p className="text-sm text-slate-500 mt-2">{t('File berhasil diunggah', 'File uploaded successfully')}</p>
            </>
          )}
        </div>

        {/* Success Message */}
        {isUploaded && (
          <div className="mt-8 bg-emerald-50 p-6 rounded-xl border border-emerald-200 text-center animate-in fade-in">
            <p className="text-emerald-800 font-bold text-lg">
              {t('Karya Hebatmu Sudah Tersimpan! Mentor sedang meninjaunya.', 'Your great work is saved! Mentor is reviewing it.')}
            </p>
          </div>
        )}

        {/* Portfolio List */}
        <div className="mt-8">
          <h3 className="font-bold text-slate-700 mb-4">{t('Karya Sebelumnya', 'Previous Works')}</h3>
          <div className="space-y-3">
            {[
              { name: t('Proyek Matematika - Geometri', 'Math Project - Geometry'), date: '15 Mar 2024', status: t('Dinilai', 'Graded') },
              { name: t('Essay Bahasa Indonesia', 'Indonesian Essay'), date: '10 Mar 2024', status: t('Dinilai', 'Graded') },
              { name: t('Eksperimen Sains', 'Science Experiment'), date: '5 Mar 2024', status: t('Menunggu', 'Pending') },
            ].map((item, index) => (
              <div 
                key={index}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-700">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.date}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  item.status === t('Dinilai', 'Graded')
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
