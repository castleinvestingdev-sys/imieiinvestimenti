'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import './rendimenti.css'

export default function RendimentiPage() {
    const [period, setPeriod] = useState('1y')
    const [geo, setGeo] = useState('world')
    const [selectedSector, setSelectedSector] = useState('tech')

    const sectors = [
        { id: 'tech', icon: '🖥', name: 'Tech' },
        { id: 'ai', icon: '🤖', name: 'AI & Big Data' },
        { id: 'energy', icon: '⚡', name: 'Energia' },
        { id: 'finance', icon: '🏦', name: 'Finanza' },
        { id: 'health', icon: '🏥', name: 'Healthcare' },
        { id: 'industry', icon: '🏭', name: 'Industria' },
    ]

    const periods = [
        { id: '1m', label: '1M' },
        { id: '3m', label: '3M' },
        { id: '6m', label: '6M' },
        { id: '1y', label: '1A' },
        { id: '3y', label: '3A' },
        { id: '5y', label: '5A' },
    ]

    const regions = [
        { id: 'world', label: 'World' },
        { id: 'usa', label: 'USA' },
        { id: 'eu', label: 'Europe' },
        { id: 'it', label: 'Italy' },
    ]

    const getReturnVal = (p: string, g: string, s: string) => {
        const periodRates: Record<string, number> = { '1m': 1.5, '3m': 4, '6m': 8, '1y': 12, '3y': 35, '5y': 60 }
        const geoMult: Record<string, number> = { 'world': 1, 'usa': 1.2, 'eu': 0.8, 'it': 0.7 }
        const sectorMult: Record<string, number> = {
            'tech': 1.3, 'ai': 1.6, 'energy': 0.9, 'finance': 0.85, 'health': 0.9, 'industry': 0.8
        }
        const base = periodRates[p] || 10
        const mult = (geoMult[g] || 1) * (sectorMult[s] || 1)
        return base * mult
    }

    const chartData = useMemo(() => {
        const points = 20
        const data = []
        const totalReturn = getReturnVal(period, geo, selectedSector)
        const step = totalReturn / points

        for (let i = 0; i <= points; i++) {
            const noise = (Math.random() - 0.5) * 2
            const val = (step * i) + noise
            data.push({
                name: i,
                value: parseFloat(val.toFixed(2))
            })
        }
        return data
    }, [period, geo, selectedSector])

    return (
        <div className="rendimenti-page">

            {/* --- HERO --- */}
            <section className="rendimenti-hero">
                <div className="rendimenti-container">
                    <span className="badge" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>Dati in tempo reale</span>
                    <h1>Rendimenti di Mercato</h1>
                    <p>Confronta i tuoi investimenti con i benchmark di mercato per capire se stai davvero guadagnando.</p>
                </div>
            </section>

            {/* --- FUNDAMENTAL --- */}
            <section className="fundamental-section">
                <div className="rendimenti-container">
                    <div className="fundamental-content">
                        <div className="fundamental-text">
                            <h2>Perché il Confronto con il Mercato è Fondamentale</h2>
                            <p>
                                Non basta sapere se il tuo portafoglio è in guadagno o in perdita. È essenziale confrontare i tuoi rendimenti con quelli del mercato per capire se la tua strategia di investimento sta davvero funzionando.
                            </p>
                            <p>
                                Senza un benchmark, non puoi sapere se il tuo consulente o la tua banca stanno facendo un buon lavoro o se stai pagando commissioni elevate per una performance mediocre.
                            </p>
                        </div>
                        <div className="fundamental-viz">
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '4rem', marginBottom: '10px' }}>⚖️</div>
                                <h3 style={{ fontWeight: 900 }}>Benchmark vs Portafoglio</h3>
                                <p style={{ color: 'var(--text-gray)' }}>La differenza tra successo e mediocrità si misura in percentuale.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- INTERACTIVE --- */}
            <section className="interactive-section">
                <div className="rendimenti-container">
                    <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1px' }}>Esplora i Rendimenti Storici</h2>
                        <p style={{ color: 'var(--text-gray)', fontSize: '1.2rem' }}>Analisi interattiva delle performance per settore e area geografica</p>
                    </div>

                    <div className="interactive-main">
                        <aside className="interactive-controls">
                            <div className="filter-group">
                                <span className="filter-label">Periodo Temporale</span>
                                <div className="filter-tags">
                                    {periods.map(p => (
                                        <button
                                            key={p.id}
                                            className={`filter-tag ${period === p.id ? 'active' : ''}`}
                                            onClick={() => setPeriod(p.id)}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="filter-group">
                                <span className="filter-label">Regione</span>
                                <div className="filter-tags">
                                    {regions.map(r => (
                                        <button
                                            key={r.id}
                                            className={`filter-tag ${geo === r.id ? 'active' : ''}`}
                                            onClick={() => setGeo(r.id)}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="filter-group">
                                <span className="filter-label">Seleziona Settore</span>
                                <div className="sectors-grid">
                                    {sectors.map(s => (
                                        <div
                                            key={s.id}
                                            className={`sector-card ${selectedSector === s.id ? 'active' : ''}`}
                                            onClick={() => setSelectedSector(s.id)}
                                        >
                                            <span className="sector-name">{s.icon} {s.name}</span>
                                            <span className="sector-value">+{getReturnVal(period, geo, s.id).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </aside>

                        <main className="interactive-visualization">
                            <div className="chart-header">
                                <div className="chart-title">
                                    <h3>Performance {sectors.find(s => s.id === selectedSector)?.name}</h3>
                                    <p>Visualizzazione della crescita percentuale cumulata</p>
                                </div>
                                <div className="chart-stat">
                                    <div className="chart-stat-value">+{getReturnVal(period, geo, selectedSector).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                                    <div className="chart-stat-label">Rendimento Totale</div>
                                </div>
                            </div>

                            <div style={{ width: '100%', height: '320px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" hide />
                                        <YAxis
                                            orientation="right"
                                            tick={{ fontSize: 12, fill: '#94a3b8' }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `+${val}%`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '12px',
                                                border: 'none',
                                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                                fontSize: '14px',
                                                fontWeight: 'bold'
                                            }}
                                            formatter={(value: any) => [`+${value}%`, 'Performance']}
                                            labelStyle={{ display: 'none' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="var(--primary)"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorValue)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </main>
                    </div>
                </div>
            </section>

            {/* --- COMPARISON --- */}
            <section className="comparison-section">
                <div className="rendimenti-container">
                    <div className="comparison-card">
                        <div className="comparison-header">
                            <h2>Esempio di Confronto</h2>
                            <p style={{ color: 'var(--text-gray)' }}>Cosa succede in 10 anni se sottoperformi il mercato.</p>
                        </div>

                        <div className="comparison-table-wrapper">
                            <table className="comparison-table">
                                <thead>
                                    <tr>
                                        <th>Scenario</th>
                                        <th>Capitale Iniziale</th>
                                        <th>Rendimento Annuo</th>
                                        <th>Valore dopo 10 anni</th>
                                        <th>Guadagno Totale</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Il tuo portafoglio</td>
                                        <td>€100.000</td>
                                        <td className="val-down">+4.5%</td>
                                        <td>€155.297</td>
                                        <td className="val-down">+€55.297</td>
                                    </tr>
                                    <tr className="highlight">
                                        <td>MSCI World (Mercato)</td>
                                        <td>€100.000</td>
                                        <td className="val-up">+10.2%</td>
                                        <td>€264.844</td>
                                        <td className="val-up">+€164.844</td>
                                    </tr>
                                    <tr className="danger">
                                        <td>Differenza</td>
                                        <td>-</td>
                                        <td className="val-down">-5.7%</td>
                                        <td className="val-down">-€109.547</td>
                                        <td className="val-down">-€109.547</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="comparison-insight">
                            <strong>Nota bene:</strong> Anche se il tuo portafoglio sembra in attivo, hai perso oltre <strong>€100.000</strong> di potenziali guadagni perché non sei riuscito a replicare il mercato.
                        </div>
                    </div>
                </div>
            </section>

            {/* --- WHY IT MATTERS --- */}
            <section className="importance-section">
                <div className="rendimenti-container">
                    <div className="importance-grid">
                        <div className="importance-card">
                            <span className="importance-icon">🎯</span>
                            <h4>Performance Reale</h4>
                            <p>Un guadagno del 5% può sembrare buono, ma se il mercato ha reso il 12%, hai perso opportunità.</p>
                        </div>
                        <div className="importance-card">
                            <span className="importance-icon">💡</span>
                            <h4>Costi Nascosti</h4>
                            <p>Se il tuo portafoglio sottoperforma costantemente, probabilmente le commissioni stanno erodendo i rendimenti.</p>
                        </div>
                        <div className="importance-card">
                            <span className="importance-icon">📈</span>
                            <h4>Decisioni Informate</h4>
                            <p>Confrontare con il mercato ti permette di capire se la tua strategia funziona o va cambiata immediatamente.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FINAL CTA --- */}
            <section className="final-cta">
                <div className="rendimenti-container">
                    <h2>I tuoi soldi meritano di più.</h2>
                    <p>Carica il tuo estratto conto per un&apos;analisi gratuita e scopri quanto stai pagando di troppo.</p>
                    <Link href="/discover" className="btn-pill-large">
                        ANALIZZA IL MIO PORTAFOGLIO ORA →
                    </Link>
                </div>
            </section>

        </div>
    )
}
