'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import styles from './Analysis.module.css'

interface Analysis {
  id: string
  document_id: string
  bank_name: string
  account_type: string
  period_start: string
  period_end: string
  portfolio_value: number
  initial_value?: number
  benchmark_comparison: string
  costs_breakdown?: any
  holdings?: any[]
  transactions?: any[]
  dividends?: any[]
  net_return?: number
}

interface Metrics {
  patrimonio_iniziale: number
  patrimonio_finale: number
  patrimonio_delta: number
  saldo_liq_iniziale: number
  saldo_liq_finale: number
  saldo_liq_delta: number
  portafoglio_iniziale: number
  portafoglio_finale: number
  portafoglio_delta: number
  capital_gain: number
  proventi_titoli: number
  interessi_attivi: number
  totale_guadagni: number
  rendimento_lordo_pct: number
  commissioni_transazione: number
  commissioni_liquidita: number
  totale_commissioni: number
  commissioni_pct: number
  totale_tasse: number
  tasse_pct: number
  rendimento_netto_pct: number
  asset_class: { azionaria: number; obbligazionaria: number; altro: number }
  holdings: any[]
  has_dossier: boolean
  has_liquidity: boolean
}

interface TimelineSlot {
  key: string
  label: string
  year: number
  displayStart: string
  displayEnd: string
  isMonthly: boolean
  dossierIds: string[]
  liquidityIds: string[]
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildTimeline(dossiers: Analysis[], liquidityDocs: Analysis[]): TimelineSlot[] {
  const all = [...dossiers, ...liquidityDocs]
  if (all.length === 0) return []

  const allDates = all.flatMap(a => {
    const s = new Date(a.period_start), e = new Date(a.period_end)
    return [s, e].filter(d => !isNaN(d.getTime()))
  })
  if (allDates.length === 0) return []

  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())))
  // Extend timeline to at least the current date
  const now = new Date()
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime()), now.getTime()))

  // Identify quarters that contain monthly docs
  const monthlyQs = new Set<string>()
  all.forEach(a => {
    const s = new Date(a.period_start), e = new Date(a.period_end)
    const days = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
    if (days < 45 && !isNaN(days)) {
      monthlyQs.add(`${e.getFullYear()}-Q${Math.ceil((e.getMonth() + 1) / 3)}`)
    }
  })

  function docEndInMonth(a: Analysis, y: number, m: number) {
    const e = new Date(a.period_end)
    return e.getFullYear() === y && e.getMonth() === m
  }
  function docEndInQuarter(a: Analysis, y: number, q: number) {
    const e = new Date(a.period_end)
    return e.getFullYear() === y && Math.ceil((e.getMonth() + 1) / 3) === q
  }
  function isQuarterlyDoc(a: Analysis) {
    const s = new Date(a.period_start), e = new Date(a.period_end)
    const days = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
    return days >= 45
  }

  const mNames = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']
  const result: TimelineSlot[] = []
  // Show full years: from Q1 of earliest year to Q4 of latest year
  const sy = minDate.getFullYear(), ey = maxDate.getFullYear()

  for (let y = sy; y <= ey; y++) {
    for (let q = 1; q <= 4; q++) {
      const qm = (q - 1) * 3
      if (monthlyQs.has(`${y}-Q${q}`)) {
        for (let m = qm; m < qm + 3; m++) {
          result.push({
            key: `${y}-M${m}`,
            label: mNames[m],
            year: y,
            displayStart: isoDate(new Date(y, m, 0)),
            displayEnd: isoDate(new Date(y, m + 1, 0)),
            isMonthly: true,
            dossierIds: dossiers.filter(a => docEndInMonth(a, y, m) || (isQuarterlyDoc(a) && docEndInQuarter(a, y, q))).map(a => a.id),
            liquidityIds: liquidityDocs.filter(a => docEndInMonth(a, y, m) || (isQuarterlyDoc(a) && docEndInQuarter(a, y, q))).map(a => a.id),
          })
        }
      } else {
        result.push({
          key: `${y}-Q${q}`,
          label: `Q${q}`,
          year: y,
          displayStart: isoDate(new Date(y, qm, 0)),
          displayEnd: isoDate(new Date(y, qm + 3, 0)),
          isMonthly: false,
          dossierIds: dossiers.filter(a => docEndInQuarter(a, y, q)).map(a => a.id),
          liquidityIds: liquidityDocs.filter(a => docEndInQuarter(a, y, q)).map(a => a.id),
        })
      }
    }
  }

  return result
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatPct(value: number): string {
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/D'
  const d = new Date(dateStr)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getPeriodType(start: string, end: string): string {
  const days = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  if (days < 45) return 'Mensile'
  if (days < 120) return 'Trimestrale'
  if (days < 200) return 'Semestrale'
  return 'Annuale'
}

function normalizeAcc(acc: string): string {
  if (!acc) return ''
  const segments = acc.split(/[\/\-]/).map(s => s.replace(/^0+/, '') || '0').filter(s => s.length > 0)
  if (segments.length === 0) return ''
  return segments.slice(-2).join('').toUpperCase()
}

function getBankKey(name: string): string {
  if (!name) return ''
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function calculateMetrics(dossierDocs: Analysis[], liquidityDocs: Analysis[]): Metrics {
  const hasDossier = dossierDocs.length > 0
  const hasLiquidity = liquidityDocs.length > 0

  // Saldi
  const portafoglio_iniziale = dossierDocs.reduce((s, a) => s + (a.initial_value || 0), 0)
  const portafoglio_finale = dossierDocs.reduce((s, a) => s + (a.portfolio_value || 0), 0)

  const saldo_liq_iniziale = liquidityDocs.reduce((s, a) => s + (a.initial_value || 0), 0)
  const saldo_liq_finale = liquidityDocs.reduce((s, a) => s + (a.portfolio_value || 0), 0)

  const patrimonio_iniziale = portafoglio_iniziale + saldo_liq_iniziale
  const patrimonio_finale = portafoglio_finale + saldo_liq_finale

  // Guadagni
  const capital_gain = portafoglio_finale - portafoglio_iniziale
  const proventi_titoli = dossierDocs.reduce((s, a) =>
    s + (a.dividends || []).reduce((ds: number, d: any) => ds + (d.netAmount || 0), 0), 0)
  const interessi_attivi = liquidityDocs.reduce((s, a) =>
    s + (a.costs_breakdown?.scalar_data?.interessi_attivi_lordi || 0), 0)
  const totale_guadagni = capital_gain + proventi_titoli + interessi_attivi

  // Commissioni
  const commissioni_transazione = dossierDocs.reduce((s, a) => {
    const secMov = a.costs_breakdown?.securityMovements || []
    return s + secMov.reduce((ms: number, m: any) => ms + (Math.abs(m.fees) || 0), 0)
  }, 0)
  const commissioni_liquidita = liquidityDocs.reduce((s, a) => {
    const tc = a.costs_breakdown?.total_commissions
    return s + (typeof tc === 'object' ? Math.abs(tc?.value || 0) : Math.abs(tc || 0))
  }, 0)
  const totale_commissioni = commissioni_transazione + commissioni_liquidita

  // Tasse
  const totale_tasse = dossierDocs.reduce((s, a) => {
    const secMov = a.costs_breakdown?.securityMovements || []
    return s + secMov.reduce((ms: number, m: any) => ms + (Math.abs(m.taxes) || 0), 0)
  }, 0)

  // Percentuali
  const base = patrimonio_iniziale || 1
  const rendimento_lordo_pct = (totale_guadagni / base) * 100
  const commissioni_pct = (totale_commissioni / base) * 100
  const tasse_pct = (totale_tasse / base) * 100
  const rendimento_netto_pct = ((totale_guadagni - totale_commissioni - totale_tasse) / base) * 100

  // Asset class from holdings
  const allHoldings = dossierDocs.flatMap(a => (a.holdings || []).map((h: any) => ({
    ...h,
    allocazione_pct: 0,
    comm_transazione_pct: 0
  })))
  const totalPortfolio = allHoldings.reduce((s: number, h: any) => s + (h.marketValue || h.value || 0), 0)

  // Calculate per-holding metrics
  const securityMovementsAll = dossierDocs.flatMap(a => a.costs_breakdown?.securityMovements || [])
  allHoldings.forEach((h: any) => {
    const mv = h.marketValue || h.value || 0
    h.allocazione_pct = totalPortfolio > 0 ? (mv / totalPortfolio) * 100 : 0
    const holdingFees = securityMovementsAll
      .filter((m: any) => m.isin === h.isin)
      .reduce((s: number, m: any) => s + (Math.abs(m.fees) || 0), 0)
    h.comm_transazione_pct = mv > 0 ? (holdingFees / mv) * 100 : 0
  })

  let azionaria = 0, obbligazionaria = 0, altro = 0
  allHoldings.forEach((h: any) => {
    const mv = h.marketValue || h.value || 0
    const type = (h.assetType || '').toLowerCase()
    if (type === 'azione' || type === 'etf') azionaria += mv
    else if (type === 'obbligazione') obbligazionaria += mv
    else if (type === 'fondo') altro += mv
    else altro += mv
  })
  const assetTotal = azionaria + obbligazionaria + altro || 1

  return {
    patrimonio_iniziale, patrimonio_finale, patrimonio_delta: patrimonio_finale - patrimonio_iniziale,
    saldo_liq_iniziale, saldo_liq_finale, saldo_liq_delta: saldo_liq_finale - saldo_liq_iniziale,
    portafoglio_iniziale, portafoglio_finale, portafoglio_delta: portafoglio_finale - portafoglio_iniziale,
    capital_gain, proventi_titoli, interessi_attivi, totale_guadagni, rendimento_lordo_pct,
    commissioni_transazione, commissioni_liquidita, totale_commissioni, commissioni_pct,
    totale_tasse, tasse_pct, rendimento_netto_pct,
    asset_class: {
      azionaria: (azionaria / assetTotal) * 100,
      obbligazionaria: (obbligazionaria / assetTotal) * 100,
      altro: (altro / assetTotal) * 100
    },
    holdings: allHoldings,
    has_dossier: hasDossier,
    has_liquidity: hasLiquidity
  }
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className={styles.loadingContainer}><div className={styles.spinner} /><p>Caricamento...</p></div>}>
      <AnalysisContent />
    </Suspense>
  )
}

function AnalysisContent() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [bankName, setBankName] = useState('')
  const [holder, setHolder] = useState('')
  const [allDossiers, setAllDossiers] = useState<Analysis[]>([])
  const [allLiquidity, setAllLiquidity] = useState<Analysis[]>([])
  const [slots, setSlots] = useState<TimelineSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [generating, setGenerating] = useState(false)

  // Fetch all data on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUser(user)

      // 1. Fetch the clicked analysis
      const { data: initial } = await supabase.from('analyses').select('*').eq('id', id).single()
      if (!initial) { router.push('/dashboard'); return }

      const bName = initial.bank_name || ''
      const hName = initial.costs_breakdown?.holder || ''
      setBankName(bName)
      setHolder(hName)

      // 2. Fetch ALL analyses for this user (not deleted)
      const { data: allAnalyses } = await supabase
        .from('analyses')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)

      if (!allAnalyses) { setLoading(false); return }

      // 3. Find analyses of same bank group via Union-Find on settlement accounts
      // (same approach as dashboard - links dossier.settlementAccount ↔ liquidity.accountNumber)
      const connectedAccounts = new Set<string>()
      const initialNormAcc = normalizeAcc(initial.benchmark_comparison || '')
      const initialSettlement = normalizeAcc(initial.costs_breakdown?.settlementAccount || '')
      if (initialNormAcc) connectedAccounts.add(initialNormAcc)
      if (initialSettlement) connectedAccounts.add(initialSettlement)

      // Iteratively expand: find docs connected via shared account numbers
      let changed = true
      while (changed) {
        changed = false
        for (const a of allAnalyses) {
          const acc = normalizeAcc(a.benchmark_comparison || '')
          const settlement = normalizeAcc(a.costs_breakdown?.settlementAccount || '')
          const isConnected = (acc && connectedAccounts.has(acc)) || (settlement && connectedAccounts.has(settlement))
          if (isConnected) {
            if (acc && !connectedAccounts.has(acc)) { connectedAccounts.add(acc); changed = true }
            if (settlement && !connectedAccounts.has(settlement)) { connectedAccounts.add(settlement); changed = true }
          }
        }
      }

      // Filter: all docs connected via account network
      const related = allAnalyses.filter(a => {
        const acc = normalizeAcc(a.benchmark_comparison || '')
        const settlement = normalizeAcc(a.costs_breakdown?.settlementAccount || '')
        return (acc && connectedAccounts.has(acc)) || (settlement && connectedAccounts.has(settlement))
      })

      const dossiers = related.filter(a => a.account_type === 'DOSSIER')
      const liquidity = related.filter(a => a.account_type === 'LIQUIDITY')

      setAllDossiers(dossiers)
      setAllLiquidity(liquidity)

      // 4. Build full timeline with gap-filling
      const timelineSlots = buildTimeline(dossiers, liquidity)
      setSlots(timelineSlots)

      // Default: select the slot containing the clicked analysis
      const clickedSlot = timelineSlots.find(s =>
        s.dossierIds.includes(id) || s.liquidityIds.includes(id)
      )
      setSelectedSlot(clickedSlot?.key || (timelineSlots.length > 0 ? timelineSlots[timelineSlots.length - 1].key : ''))

      setLoading(false)
    }
    load()
  }, [id])

  // Recalculate metrics when slot changes
  useEffect(() => {
    if (!selectedSlot) return
    const slot = slots.find(s => s.key === selectedSlot)
    if (!slot) return
    const periodDossiers = allDossiers.filter(a => slot.dossierIds.includes(a.id))
    const periodLiquidity = allLiquidity.filter(a => slot.liquidityIds.includes(a.id))
    setMetrics(calculateMetrics(periodDossiers, periodLiquidity))
  }, [selectedSlot, slots, allDossiers, allLiquidity])

  // PDF Report Generation
  async function generateReport() {
    if (!metrics) return
    setGenerating(true)

    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF('p', 'mm', 'a4')
      const W = 210, H = 297, M = 15, CW = W - 2 * M
      const footerH = 12
      const maxY = H - M - footerH
      let y = 0

      // Color tuples
      const cGreen: [number, number, number] = [16, 185, 129]
      const cRed: [number, number, number] = [239, 68, 68]
      const cDark: [number, number, number] = [15, 23, 42]
      const cGray: [number, number, number] = [100, 116, 139]
      const cLightGray: [number, number, number] = [148, 163, 184]
      const cLightBg: [number, number, number] = [248, 249, 250]
      const cBorder: [number, number, number] = [226, 232, 240]

      function checkPage(needed: number) {
        if (y + needed > maxY) { doc.addPage(); y = M; return true }
        return false
      }

      function sectionTitle(title: string) {
        checkPage(20)
        doc.setTextColor(...cDark)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(title, M, y)
        y += 1.5
        doc.setDrawColor(...cGreen)
        doc.setLineWidth(0.6)
        doc.line(M, y, M + 50, y)
        y += 6
      }

      function labelVal(label: string, value: string, x: number, color: [number, number, number] = cDark, fontSize = 10) {
        doc.setTextColor(...cGray)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text(label, x, y)
        doc.setTextColor(...color)
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', 'bold')
        doc.text(value, x, y + 5)
      }

      // ========== HEADER ==========
      doc.setFillColor(...cGreen)
      doc.rect(0, 0, W, 42, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      doc.text('imieiinvestimenti', M, 16)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Report di Analisi Finanziaria', M, 23)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(bankName, M, 33)
      if (holder) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(`Intestatario: ${holder}`, M, 39)
      }
      const slotInfo = slots.find(s => s.key === selectedSlot)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(`Periodo: ${slotInfo ? `${formatDate(slotInfo.displayStart)} \u2192 ${formatDate(slotInfo.displayEnd)}` : ''}`, W - M, 33, { align: 'right' })
      doc.setFontSize(7)
      doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, W - M, 39, { align: 'right' })

      y = 52

      // ========== RENDIMENTI ==========
      sectionTitle('Rendimenti')
      const halfW = CW / 2
      const gColor: [number, number, number] = metrics.totale_guadagni >= 0 ? cGreen : cRed

      // Row 1: Guadagni + Rendimento lordo
      labelVal('TOTALE GUADAGNI \u20AC', `${metrics.totale_guadagni >= 0 ? '+' : ''}${formatCurrency(metrics.totale_guadagni)} \u20AC`, M, gColor)
      labelVal('RENDIMENTO (LORDO)', `${metrics.rendimento_lordo_pct >= 0 ? '+' : ''}${formatPct(metrics.rendimento_lordo_pct)} %`, M + halfW, gColor, 14)
      y += 12

      // Row 2: Commissioni
      labelVal('TOTALE COMMISSIONI \u20AC', `-${formatCurrency(metrics.totale_commissioni)} \u20AC`, M, cRed)
      labelVal('TOTALE COMMISSIONI %', `-${formatPct(metrics.commissioni_pct)} %`, M + halfW, cRed, 14)
      y += 12

      // Row 3: Tasse
      labelVal('TASSE \u20AC', `-${formatCurrency(metrics.totale_tasse)} \u20AC`, M, cRed)
      labelVal('TASSE %', `-${formatPct(metrics.tasse_pct)} %`, M + halfW, cRed, 14)
      y += 12

      // Row 4: Rendimento netto (highlighted)
      const netColor: [number, number, number] = metrics.rendimento_netto_pct >= 0 ? cGreen : cRed
      doc.setFillColor(...cLightBg)
      doc.roundedRect(M, y - 3, CW, 14, 3, 3, 'F')
      labelVal('RENDIMENTO (NETTO)', `${metrics.rendimento_netto_pct >= 0 ? '+' : ''}${formatPct(metrics.rendimento_netto_pct)} %`, M + 3, netColor, 16)
      y += 18

      // ========== SALDI ==========
      sectionTitle('Saldi')
      const colW = CW / 3

      // Column headers
      doc.setTextColor(...cGray)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('INIZIALE', M + colW * 0 + colW / 2, y, { align: 'center' })
      doc.text('FINALE', M + colW * 1 + colW / 2, y, { align: 'center' })
      doc.text('DELTA', M + colW * 2 + colW / 2, y, { align: 'center' })
      y += 5

      function saldiRow(label: string, iniziale: number, finale: number, delta: number) {
        checkPage(16)
        doc.setTextColor(...cDark)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(label, M, y)
        y += 5
        doc.setFontSize(9)
        doc.setTextColor(...cDark)
        doc.text(`${formatCurrency(iniziale)} \u20AC`, M + colW * 0 + colW / 2, y, { align: 'center' })
        doc.text(`${formatCurrency(finale)} \u20AC`, M + colW * 1 + colW / 2, y, { align: 'center' })
        const dColor: [number, number, number] = delta >= 0 ? cGreen : cRed
        doc.setTextColor(...dColor)
        doc.text(`${delta >= 0 ? '+' : ''}${formatCurrency(delta)} \u20AC`, M + colW * 2 + colW / 2, y, { align: 'center' })
        y += 4
        doc.setDrawColor(...cBorder)
        doc.setLineWidth(0.2)
        doc.line(M, y, M + CW, y)
        y += 4
      }

      saldiRow('Patrimonio', metrics.patrimonio_iniziale, metrics.patrimonio_finale, metrics.patrimonio_delta)
      saldiRow('Saldo liquidit\u00e0', metrics.saldo_liq_iniziale, metrics.saldo_liq_finale, metrics.saldo_liq_delta)
      saldiRow('Portafoglio titoli', metrics.portafoglio_iniziale, metrics.portafoglio_finale, metrics.portafoglio_delta)

      // ========== GUADAGNI + TASSE (side by side) ==========
      checkPage(55)
      const leftX = M
      const rightX = M + halfW + 5
      const boxW = halfW - 5

      // Titles
      doc.setTextColor(...cDark)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Guadagni', leftX, y)
      doc.text('Tasse maturate', rightX, y)
      y += 1.5
      doc.setDrawColor(...cGreen)
      doc.setLineWidth(0.6)
      doc.line(leftX, y, leftX + 40, y)
      doc.line(rightX, y, rightX + 40, y)
      y += 6

      // Total boxes
      const savedY1 = y
      doc.setFillColor(240, 253, 244)
      doc.roundedRect(leftX, y - 3, boxW, 12, 2, 2, 'F')
      doc.setTextColor(...cGray)
      doc.setFontSize(7)
      doc.text('TOTALE \u20AC', leftX + 3, y)
      doc.setTextColor(...(metrics.totale_guadagni >= 0 ? cGreen : cRed))
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`${metrics.totale_guadagni >= 0 ? '+' : ''}${formatCurrency(metrics.totale_guadagni)} \u20AC`, leftX + boxW - 3, y + 5, { align: 'right' })

      y = savedY1
      doc.setFillColor(254, 242, 242)
      doc.roundedRect(rightX, y - 3, boxW, 12, 2, 2, 'F')
      doc.setTextColor(...cGray)
      doc.setFontSize(7)
      doc.text('TOTALE \u20AC', rightX + 3, y)
      doc.setTextColor(...cRed)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`-${formatCurrency(metrics.totale_tasse)} \u20AC`, rightX + boxW - 3, y + 5, { align: 'right' })
      y += 14

      // Detail rows side by side
      function dRow(label: string, value: string, x: number, w: number, color: [number, number, number] = cDark) {
        doc.setTextColor(...cGray)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(label, x, y)
        doc.setTextColor(...color)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(value, x + w, y, { align: 'right' })
      }

      function mRow(label: string, x: number, w: number) {
        doc.setTextColor(...cGray)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(label, x, y)
        doc.setTextColor(...cRed)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text('N/D', x + w, y, { align: 'right' })
      }

      // Guadagni detail (left) + Tasse detail (right)
      const savedY2 = y
      dRow('Capital Gain', `${metrics.capital_gain >= 0 ? '+' : ''}${formatCurrency(metrics.capital_gain)} \u20AC`, leftX, boxW, metrics.capital_gain >= 0 ? cGreen : cRed)
      y = savedY2
      dRow('Capital Gain', `-${formatCurrency(metrics.totale_tasse)} \u20AC`, rightX, boxW, cRed)
      y += 6

      const savedY3 = y
      dRow('Proventi titoli', `${formatCurrency(metrics.proventi_titoli)} \u20AC`, leftX, boxW, metrics.proventi_titoli >= 0 ? cGreen : cRed)
      y = savedY3
      mRow('Cedole incassate (nette)', rightX, boxW)
      y += 6

      const savedY4 = y
      dRow('Interessi attivi', `${formatCurrency(metrics.interessi_attivi)} \u20AC`, leftX, boxW, metrics.interessi_attivi >= 0 ? cGreen : cRed)
      y = savedY4
      mRow('Interessi attivi (netti)', rightX, boxW)
      y += 12

      // ========== COMMISSIONI ==========
      sectionTitle('Commissioni')

      // Total bar
      doc.setFillColor(254, 242, 242)
      doc.roundedRect(M, y - 3, CW, 12, 2, 2, 'F')
      doc.setTextColor(...cGray)
      doc.setFontSize(7)
      doc.text('TOTALE', M + 3, y)
      doc.setTextColor(...cRed)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`-${formatCurrency(metrics.totale_commissioni)} \u20AC`, M + halfW - 5, y + 5, { align: 'right' })
      doc.setTextColor(...cGray)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text('% SUL PATRIMONIO', M + halfW + 5, y)
      doc.setTextColor(...cRed)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`-${formatPct(metrics.commissioni_pct)} %`, M + CW - 3, y + 5, { align: 'right' })
      y += 15

      // Commission rows
      function commRow(label: string, euro: string, pct: string, isMissing = false) {
        checkPage(8)
        doc.setTextColor(...cDark)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(label, M, y)
        if (isMissing) {
          doc.setTextColor(...cRed)
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.text('N/D', M + CW * 0.65, y, { align: 'right' })
          doc.text('N/D', M + CW, y, { align: 'right' })
        } else {
          doc.setTextColor(...cRed)
          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.text(euro, M + CW * 0.65, y, { align: 'right' })
          doc.text(pct, M + CW, y, { align: 'right' })
        }
        y += 7
      }

      commRow('TER - Commissioni di gestione medie annue', '', '', true)
      commRow('Commissioni di transazione',
        `-${formatCurrency(metrics.commissioni_transazione)} \u20AC`,
        `-${formatPct(metrics.patrimonio_iniziale > 0 ? (metrics.commissioni_transazione / metrics.patrimonio_iniziale) * 100 : 0)} %`)
      commRow('Altre commissioni',
        `-${formatCurrency(metrics.commissioni_liquidita)} \u20AC`,
        `-${formatPct(metrics.patrimonio_iniziale > 0 ? (metrics.commissioni_liquidita / metrics.patrimonio_iniziale) * 100 : 0)} %`)
      y += 4

      // ========== ASSET CLASS ==========
      sectionTitle('Asset Class')
      const acW = CW / 3
      const hasAssetTypes = metrics.holdings.length > 0 && metrics.holdings.some((h: any) => h.assetType)

      function assetBox(label: string, value: string, x: number) {
        doc.setFillColor(...cLightBg)
        doc.roundedRect(x, y, acW - 5, 18, 3, 3, 'F')
        doc.setTextColor(...cGray)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text(label, x + (acW - 5) / 2, y + 5, { align: 'center' })
        doc.setTextColor(...(hasAssetTypes ? cDark : cRed))
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(value, x + (acW - 5) / 2, y + 14, { align: 'center' })
      }

      assetBox('QUOTA AZIONARIA', hasAssetTypes ? `${formatPct(metrics.asset_class.azionaria)} %` : 'N/D', M)
      assetBox('QUOTA OBBLIGAZIONARIA', hasAssetTypes ? `${formatPct(metrics.asset_class.obbligazionaria)} %` : 'N/D', M + acW)
      assetBox('ALTRO', hasAssetTypes ? `${formatPct(metrics.asset_class.altro)} %` : 'N/D', M + acW * 2)
      y += 24

      // ========== TITOLI TABLE ==========
      if (metrics.holdings.length > 0) {
        sectionTitle(`${metrics.holdings.length} Titoli`)

        const cols = [
          { label: 'ISIN / TITOLO', w: 55 },
          { label: 'TIPO', w: 20 },
          { label: 'VALORE', w: 30 },
          { label: '% ALLOC.', w: 22 },
          { label: 'COMM. TRANS.', w: 25 },
        ]

        // Table header
        let xPos = M
        doc.setFillColor(241, 245, 249)
        doc.rect(M, y - 3, CW, 7, 'F')
        doc.setTextColor(...cGray)
        doc.setFontSize(6)
        doc.setFont('helvetica', 'bold')
        cols.forEach(col => {
          doc.text(col.label, xPos + 1, y + 1)
          xPos += col.w
        })
        y += 7

        // Table rows
        metrics.holdings.forEach((h: any, idx: number) => {
          checkPage(10)

          if (idx % 2 === 0) {
            doc.setFillColor(252, 252, 253)
            doc.rect(M, y - 3, CW, 8, 'F')
          }

          xPos = M
          // ISIN + Name
          doc.setTextColor(...cLightGray)
          doc.setFontSize(5.5)
          doc.setFont('helvetica', 'normal')
          doc.text(h.isin || 'N/D', xPos + 1, y - 0.5)
          doc.setTextColor(...cDark)
          doc.setFontSize(6.5)
          doc.setFont('helvetica', 'bold')
          doc.text((h.name || 'N/D').substring(0, 32), xPos + 1, y + 3)
          xPos += cols[0].w

          // Tipo
          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          doc.text(h.assetType || 'N/D', xPos + 1, y + 1)
          xPos += cols[1].w

          // Valore
          doc.setFont('helvetica', 'bold')
          doc.text(`${formatCurrency(h.marketValue || h.value || 0)} \u20AC`, xPos + cols[2].w - 1, y + 1, { align: 'right' })
          xPos += cols[2].w

          // % Allocazione
          doc.text(`${formatPct(h.allocazione_pct)}%`, xPos + cols[3].w - 1, y + 1, { align: 'right' })
          xPos += cols[3].w

          // Comm. transazione
          doc.text(h.comm_transazione_pct > 0 ? `${formatPct(h.comm_transazione_pct)}%` : '-', xPos + cols[4].w - 1, y + 1, { align: 'right' })

          y += 8
        })
      }

      // ========== FOOTER on all pages ==========
      const numPages = doc.getNumberOfPages()
      for (let i = 1; i <= numPages; i++) {
        doc.setPage(i)
        const fy = H - 10
        doc.setDrawColor(...cBorder)
        doc.setLineWidth(0.3)
        doc.line(M, fy - 3, M + CW, fy - 3)
        doc.setTextColor(...cGray)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text('imieiinvestimenti - Report generato automaticamente', M, fy)
        doc.text(`Pagina ${i} di ${numPages}`, M + CW, fy, { align: 'right' })
      }

      // Save
      const fileName = `Report_${bankName.replace(/[^a-zA-Z0-9]/g, '_')}_${slotInfo ? formatDate(slotInfo.displayEnd).replace(/\//g, '-') : 'report'}.pdf`
      doc.save(fileName)
    } catch (err) {
      console.error('Errore generazione report:', err)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.analysisWrapper}>
        <div className={styles.loadingContainer}><div className={styles.spinner} /><p>Caricamento analisi...</p></div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className={styles.analysisWrapper}>
        <div className={styles.loadingContainer}><p>Nessun dato disponibile.</p></div>
      </div>
    )
  }

  const missingData = <span className={styles.missingData}>?</span>
  const valClass = (v: number) => v >= 0 ? styles.valPositive : styles.valNegative
  const valSign = (v: number) => v >= 0 ? '+' : ''

  return (
    <div className={styles.analysisWrapper}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <button onClick={() => router.push(`/dashboard?cliente=${encodeURIComponent(holder)}`)} className={styles.backBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <h1 className={styles.bankTitle}>{bankName} <span className={styles.addBankHint}>+aggiungi banca</span></h1>
          </div>

          <div className={styles.headerActions}>
            <button className={styles.actionBtn}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg> Scarica PDF originale</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={generateReport} disabled={generating}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> {generating ? 'Generando...' : 'Scarica Report'}</button>
          </div>
        </div>

        {/* Dual Timeline - single scrollable container */}
        {(() => {
          const years = [...new Set(slots.map(s => s.year))]
          const byYear = years.map(yr => ({ year: yr, items: slots.filter(s => s.year === yr) }))
          return (
            <div className={styles.dualTimeline}>
              {/* Fixed labels column */}
              <div className={styles.timelineLabels}>
                <span className={styles.yearLabelSpacer}>&nbsp;</span>
                <div className={styles.timelineLabelRow}>
                  <span className={styles.trackBadgeDos}>Dossier Titoli</span>
                </div>
                <div className={styles.timelineLabelRow}>
                  <span className={styles.trackBadgeLiq}>Liquidit&agrave;</span>
                </div>
              </div>

              {/* Single scrollable area */}
              <div className={styles.timelineScroller}>
                {byYear.map(({ year, items }) => (
                  <div key={year} className={styles.yearGroup}>
                    <span className={styles.yearLabel}>{year}</span>
                    <div className={styles.yearCards}>
                      {items.map(s => {
                        const active = s.key === selectedSlot
                        const loaded = s.dossierIds.length > 0
                        return (
                          <button key={s.key} className={`${styles.tCard} ${active ? styles.tCardActive : ''} ${loaded ? styles.tCardLoaded : styles.tCardEmpty}`} onClick={() => setSelectedSlot(s.key)}>
                            <span className={styles.tCardType}>{s.isMonthly ? 'Mensile' : 'Trimestrale'}</span>
                            <div className={styles.tCardDates}>
                              <span>{formatDate(s.displayStart)}</span>
                              <span className={styles.tCardArrow}>&darr;</span>
                              <span>{formatDate(s.displayEnd)}</span>
                            </div>
                            <div className={styles.tCardStatus}>
                              {loaded ? (
                                <span className={styles.tCardCheck}>{s.dossierIds.length > 1 ? `${s.dossierIds.length} doc` : 'Caricato'}</span>
                              ) : (
                                <span className={styles.tCardMiss}>Non caricato</span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <div className={styles.yearCards}>
                      {items.map(s => {
                        const active = s.key === selectedSlot
                        const loaded = s.liquidityIds.length > 0
                        return (
                          <button key={s.key} className={`${styles.tCard} ${active ? styles.tCardActive : ''} ${loaded ? styles.tCardLoaded : styles.tCardEmpty}`} onClick={() => setSelectedSlot(s.key)}>
                            <span className={styles.tCardType}>{s.isMonthly ? 'Mensile' : 'Trimestrale'}</span>
                            <div className={styles.tCardDates}>
                              <span>{formatDate(s.displayStart)}</span>
                              <span className={styles.tCardArrow}>&darr;</span>
                              <span>{formatDate(s.displayEnd)}</span>
                            </div>
                            <div className={styles.tCardStatus}>
                              {loaded ? (
                                <span className={styles.tCardCheck}>{s.liquidityIds.length > 1 ? `${s.liquidityIds.length} doc` : 'Caricato'}</span>
                              ) : (
                                <span className={styles.tCardMiss}>Non caricato</span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </header>

      {/* ALERT MANCANTE */}
      {(!metrics.has_dossier || !metrics.has_liquidity) && (
        <div className={styles.alertBanner}>
          {!metrics.has_dossier && 'Per un\'analisi completa, inserisci il Dossier Titoli'}
          {!metrics.has_liquidity && 'Per un\'analisi completa, inserisci l\'Estratto Conto Liquidit\u00e0'}
        </div>
      )}

      <main className={styles.mainGrid}>

        {/* RENDIMENTI */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Rendimenti</h2>
          <div className={styles.rendimentiLayout}>
            <div className={styles.rendimentiMetrics}>
              {/* Totale Guadagni */}
              <div className={styles.metricRow}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Totale Guadagni &euro;:</span>
                  <span className={`${styles.metricValue} ${valClass(metrics.totale_guadagni)}`}>
                    {valSign(metrics.totale_guadagni)}{formatCurrency(metrics.totale_guadagni)} &euro;
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Rendimento (lordo):</span>
                  <span className={`${styles.metricValueLg} ${valClass(metrics.rendimento_lordo_pct)}`}>
                    {valSign(metrics.rendimento_lordo_pct)}{formatPct(metrics.rendimento_lordo_pct)} %
                  </span>
                  <span className={styles.metricBadge} style={{ color: metrics.rendimento_lordo_pct >= 2 ? '#10b981' : metrics.rendimento_lordo_pct >= 0 ? '#f59e0b' : '#ef4444' }}>
                    {metrics.rendimento_lordo_pct >= 2 ? 'Buono' : metrics.rendimento_lordo_pct >= 0 ? 'Neutro' : 'Male'}
                  </span>
                </div>
              </div>

              {/* Totale Commissioni */}
              <div className={styles.metricRow}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Totale Commissioni &euro;:</span>
                  <span className={`${styles.metricValue} ${styles.valNegative}`}>
                    -{formatCurrency(metrics.totale_commissioni)} &euro;
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Totale Commissioni:</span>
                  <span className={`${styles.metricValueLg} ${styles.valNegative}`}>
                    -{formatPct(metrics.commissioni_pct)} %
                  </span>
                  <span className={styles.metricBadge} style={{ color: '#ef4444' }}>Male</span>
                </div>
              </div>

              {/* Tasse */}
              <div className={styles.metricRow}>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Tasse &euro;:</span>
                  <span className={`${styles.metricValue} ${styles.valNegative}`}>
                    -{formatCurrency(metrics.totale_tasse)} &euro;
                  </span>
                </div>
                <div className={styles.metricCard}>
                  <span className={styles.metricLabel}>Tasse%:</span>
                  <span className={`${styles.metricValueLg} ${styles.valNegative}`}>
                    -{formatPct(metrics.tasse_pct)} %
                  </span>
                  <span className={styles.metricBadge} style={{ color: '#ef4444' }}>Male</span>
                </div>
              </div>

              {/* Rendimento netto */}
              <div className={styles.metricRowFull}>
                <span className={styles.metricLabel}>Rendimento (netto):</span>
                <span className={`${styles.metricValueXl} ${valClass(metrics.rendimento_netto_pct)}`}>
                  {valSign(metrics.rendimento_netto_pct)}{formatPct(metrics.rendimento_netto_pct)} %
                </span>
                <span className={styles.metricBadge} style={{ color: metrics.rendimento_netto_pct >= 2 ? '#10b981' : metrics.rendimento_netto_pct >= 0 ? '#f59e0b' : '#ef4444' }}>
                  {metrics.rendimento_netto_pct >= 2 ? 'Buono' : metrics.rendimento_netto_pct >= 0 ? 'Neutro' : 'Male'}
                </span>
              </div>
            </div>

            {/* Benchmark box */}
            <div className={styles.benchmarkBox}>
              <h3 className={styles.benchmarkTitle}>Paragone con il mercato</h3>
              <div className={styles.benchmarkRow}>
                <span className={styles.benchmarkLabel}>Benchmark:</span>
                <span className={styles.benchmarkValue}>{missingData}</span>
              </div>
              <p className={styles.benchmarkNote}>Il benchmark viene calcolato in base alla tua asset allocation, ovvero % di azioni e % di obbligazioni.</p>
              <div className={styles.benchmarkRow}>
                <span className={styles.benchmarkLabel}>Sottoperformance:</span>
                <span className={styles.benchmarkValue}>{missingData}</span>
              </div>
              <p className={styles.benchmarkNote}>La sottoperformance indica la differenza tra il tuo rendimento lordo e il benchmark.</p>
            </div>
          </div>
        </section>

        {/* SALDI */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Saldi</h2>
          <div className={styles.saldiGrid}>
            <SaldiRow label="Patrimonio iniziale:" value={metrics.patrimonio_iniziale} />
            <SaldiRow label="Patrimonio finale:" value={metrics.patrimonio_finale} />
            <SaldiRow label="Delta:" value={metrics.patrimonio_delta} isDelta />

            <SaldiRow label="Saldo iniziale (liquidit\u00e0):" value={metrics.saldo_liq_iniziale} prefix="+" />
            <SaldiRow label="Saldo finale (liquidit\u00e0):" value={metrics.saldo_liq_finale} prefix="+" />
            <SaldiRow label="Delta:" value={metrics.saldo_liq_delta} isDelta />

            <SaldiRow label="Portafoglio iniziale:" value={metrics.portafoglio_iniziale} prefix="+" />
            <SaldiRow label="Portafoglio finale:" value={metrics.portafoglio_finale} prefix="+" />
            <SaldiRow label="Delta:" value={metrics.portafoglio_delta} isDelta />
          </div>
        </section>

        {/* GUADAGNI + TASSE */}
        <div className={styles.twoColSection}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Guadagni</h2>
            <div className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <span className={styles.detailLabel}>Totale &euro;:</span>
                <span className={`${styles.detailValueBig} ${valClass(metrics.totale_guadagni)}`}>
                  {valSign(metrics.totale_guadagni)}{formatCurrency(metrics.totale_guadagni)} &euro;
                </span>
              </div>
              <div className={styles.detailRow}>
                <span>Capital Gain</span>
                <span className={valClass(metrics.capital_gain)}>{valSign(metrics.capital_gain)}{formatCurrency(metrics.capital_gain)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Proventi titoli (cedole, dividendi):</span>
                <span className={valClass(metrics.proventi_titoli)}>{valSign(metrics.proventi_titoli)}{formatCurrency(metrics.proventi_titoli)} &euro;</span>
              </div>
              <div className={styles.detailRow}>
                <span>Interessi attivi (netti):</span>
                <span className={valClass(metrics.interessi_attivi)}>{valSign(metrics.interessi_attivi)}{formatCurrency(metrics.interessi_attivi)} &euro;</span>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tasse maturate:</h2>
            <div className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <span className={styles.detailLabel}>Totale &euro;:</span>
                <span className={`${styles.detailValueBig} ${styles.valNegative}`}>
                  -{formatCurrency(metrics.totale_tasse)} &euro;
                </span>
              </div>
              <div className={styles.detailRow}>
                <span>Capital Gain</span>
                <span className={styles.valNegative}>-{formatCurrency(metrics.totale_tasse)}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Cedole incassate (nette) &euro;:</span>
                <span>{missingData}</span>
              </div>
              <div className={styles.detailRow}>
                <span>Interessi attivi (netti):</span>
                <span>{missingData}</span>
              </div>
            </div>
          </section>
        </div>

        {/* COMMISSIONI */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Commissioni</h2>
          <div className={styles.commissioniLayout}>
            <div className={styles.commissioniHeader}>
              <div>
                <span className={styles.detailLabel}>Totale &euro;:</span>
                <span className={`${styles.commissioniTotal} ${styles.valNegative}`}>
                  -{formatCurrency(metrics.totale_commissioni)} &euro;
                </span>
              </div>
              <div>
                <span className={styles.detailLabel}>% sul guadagno:</span>
                <span className={`${styles.commissioniTotal} ${styles.valNegative}`}>
                  -{formatPct(metrics.commissioni_pct)} %
                </span>
              </div>
            </div>
            <div className={styles.commissioniRows}>
              <div className={styles.commissioniRow}>
                <div>
                  <span className={styles.commissioniRowLabel}>TER - Commissioni di gestione medie annue (%):</span>
                  <span className={styles.commissioniRowNote}>Pagate ogni giorno, incorporate nel prezzo dei titoli</span>
                </div>
                <span className={styles.commissioniRowValue}>{missingData}</span>
                <span className={styles.commissioniRowPct}>{missingData}</span>
              </div>
              <div className={styles.commissioniRow}>
                <div><span className={styles.commissioniRowLabel}>Commissioni di transazione (&euro;):</span></div>
                <span className={`${styles.commissioniRowValue} ${styles.valNegative}`}>-{formatCurrency(metrics.commissioni_transazione)} &euro;</span>
                <span className={`${styles.commissioniRowPct} ${styles.valNegative}`}>-{formatPct(metrics.patrimonio_iniziale > 0 ? (metrics.commissioni_transazione / metrics.patrimonio_iniziale) * 100 : 0)} %</span>
              </div>
              <div className={styles.commissioniRow}>
                <div><span className={styles.commissioniRowLabel}>Altre commissioni (&euro;):</span></div>
                <span className={`${styles.commissioniRowValue} ${styles.valNegative}`}>-{formatCurrency(metrics.commissioni_liquidita)} &euro;</span>
                <span className={`${styles.commissioniRowPct} ${styles.valNegative}`}>-{formatPct(metrics.patrimonio_iniziale > 0 ? (metrics.commissioni_liquidita / metrics.patrimonio_iniziale) * 100 : 0)} %</span>
              </div>
            </div>
          </div>
        </section>

        {/* ASSET CLASS */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Asset Class</h2>
          <div className={styles.assetClassGrid}>
            <div className={styles.assetClassBox}>
              <span className={styles.assetClassLabel}>Quota azionaria</span>
              <span className={styles.assetClassValue}>
                {metrics.holdings.length > 0 && metrics.holdings.some((h: any) => h.assetType) ? `${formatPct(metrics.asset_class.azionaria)} %` : missingData}
              </span>
            </div>
            <div className={styles.assetClassBox}>
              <span className={styles.assetClassLabel}>Quota obbligazionaria</span>
              <span className={styles.assetClassValue}>
                {metrics.holdings.length > 0 && metrics.holdings.some((h: any) => h.assetType) ? `${formatPct(metrics.asset_class.obbligazionaria)} %` : missingData}
              </span>
            </div>
            <div className={styles.assetClassBox}>
              <span className={styles.assetClassLabel}>Altro (non qualificabile)</span>
              <span className={styles.assetClassValue}>
                {metrics.holdings.length > 0 && metrics.holdings.some((h: any) => h.assetType) ? `${formatPct(metrics.asset_class.altro)} %` : missingData}
              </span>
            </div>
          </div>
        </section>

        {/* TABELLA TITOLI */}
        {metrics.holdings.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <h2 className={styles.sectionTitle}>{metrics.holdings.length} Titoli</h2>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.titoliTable}>
                <thead>
                  <tr>
                    <th>ISIN<br/>Titolo</th>
                    <th>Tipologia</th>
                    <th>Valore</th>
                    <th>Rendimento</th>
                    <th>% allocazione</th>
                    <th>Commissioni<br/>di gestione %</th>
                    <th>Commissioni<br/>transazione %</th>
                    <th>Commissioni<br/>Performance %</th>
                    <th>Commissioni<br/>ingresso %</th>
                    <th>Strumento<br/>migliorativo</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.holdings.map((h: any, idx: number) => (
                    <tr key={idx}>
                      <td>
                        <div className={styles.securityIsin}>{h.isin || 'N/D'}</div>
                        <div className={styles.securityName}>{h.name || 'N/D'}</div>
                      </td>
                      <td>
                        {h.assetType ? (
                          <span className={styles.assetBadge}>{h.assetType}</span>
                        ) : missingData}
                      </td>
                      <td className={styles.textRight}>{formatCurrency(h.marketValue || h.value || 0)}</td>
                      <td className={styles.textRight}>{missingData}</td>
                      <td className={styles.textRight}>{formatPct(h.allocazione_pct)}%</td>
                      <td className={styles.textRight}>{missingData}</td>
                      <td className={styles.textRight}>
                        {h.comm_transazione_pct > 0 ? `${formatPct(h.comm_transazione_pct)}%` : '-'}
                      </td>
                      <td className={styles.textRight}>{missingData}</td>
                      <td className={styles.textRight}>{missingData}</td>
                      <td>
                        <button className={styles.findBetterBtn}>
                          Trova strumento migliorativo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function SaldiRow({ label, value, isDelta, prefix }: { label: string; value: number; isDelta?: boolean; prefix?: string }) {
  const isPositive = value >= 0
  const colorClass = isDelta ? (isPositive ? styles.valPositive : styles.valNegative) : ''
  const sign = isDelta ? (isPositive ? '+' : '') : (prefix || '')
  return (
    <div className={styles.saldiCard}>
      <span className={styles.saldiLabel}>{label}</span>
      <span className={`${styles.saldiValue} ${colorClass}`}>
        {sign}{formatCurrency(value)} &euro;
      </span>
    </div>
  )
}
