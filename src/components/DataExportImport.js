'use client'

import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import {
  prepareExportData,
  downloadJSON,
  readJSONFile,
  importData,
} from '@/lib/importExport'

export default function DataExportImport({ onImportSuccess }) {
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [mergeMode, setMergeMode] = useState(false)

  async function handleExport() {
    const data = prepareExportData()
    if (data) {
      const timestamp = new Date().toISOString().slice(0, 10)
      downloadJSON(data, `luminae-vigila-${timestamp}.json`)
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const data = await readJSONFile(file)
      const result = importData(data, mergeMode)

      if (result.success) {
        onImportSuccess?.(result.message)
        // Reload page to reflect imported data
        window.location.reload()
      } else {
        alert(`Import failed: ${result.message}`)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--surface2)',
      }}
    >
      <button
        onClick={handleExport}
        title="Export events, todos, and settings as JSON"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-2)',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--blue-bg)'
          e.currentTarget.style.color = 'var(--blue)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-2)'
        }}
      >
        <Download size={13} />
        Export
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          title="Import from JSON backup"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-2)',
            cursor: importing ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            transition: 'all 0.15s',
            opacity: importing ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!importing) {
              e.currentTarget.style.background = 'var(--blue-bg)'
              e.currentTarget.style.color = 'var(--blue)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-2)'
          }}
        >
          <Upload size={13} />
          Import
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: 'none' }}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.7rem',
            color: 'var(--text-3)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={mergeMode}
            onChange={(e) => setMergeMode(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Merge
        </label>
      </div>
    </div>
  )
}
