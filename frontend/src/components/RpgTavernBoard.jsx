import React from 'react';
import { getTituloRpg } from '../utils/rpgTitles';

// Iconos vectoriales medievales para garantizar renderizado perfecto sin depender de compatibilidad de emojis
const QuillIcon = ({ size = 16, color = "#6b4317" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="15" />
  </svg>
);

const AxesIcon = ({ size = 16, color = "#6b4317" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
    <line x1="13" y1="19" x2="19" y2="13" />
    <line x1="16" y1="16" x2="20" y2="20" />
    <line x1="19" y1="21" x2="21" y2="19" />
    <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
    <line x1="5" y1="14" x2="9" y2="18" />
    <line x1="7" y1="17" x2="3" y2="21" />
    <line x1="3" y1="19" x2="5" y2="21" />
  </svg>
);

const CoinPouchIcon = ({ size = 16, color = "#6b4317" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M8 7a4 4 0 0 1 8 0c0 2-2 3-2 3H10s-2-1-2-3Z" />
    <path d="M6 10h12l2 10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2l2-10Z" />
    <circle cx="12" cy="16" r="2" />
  </svg>
);

const ShieldIcon = ({ size = 15, color = "#6b4317" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export default function RpgTavernBoard({ usuario, onNuevoReporte, onVerHistorial, onAvatarClick }) {
  const getFechaMedieval = () => {
    const hoy = new Date();
    const dias = ['Sol', 'Luna', 'Marte', 'Mercurio', 'Júpiter', 'Venus', 'Saturno'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const diaNom = dias[hoy.getDay()];
    const diaNum = hoy.getDate();
    const mesNom = meses[hoy.getMonth()];
    const anio = 1224 + (hoy.getFullYear() - 2024);
    return `${diaNom}, ${diaNum} ${mesNom}, Año ${anio}`;
  };

  const getIniciales = (nombre) => {
    if (!nombre) return 'IN';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  return (
    <div className="rpg-board-viewport">
      {/* Marco principal del Tablón de Madera de la Taberna */}
      <div className="rpg-notice-board">
        {/* Esquineros de hierro forjado con remaches */}
        <div className="rpg-iron-bracket top-left" />
        <div className="rpg-iron-bracket top-right" />
        <div className="rpg-iron-bracket bottom-left" />
        <div className="rpg-iron-bracket bottom-right" />

        {/* Banner de Pergamino Curvado Superior */}
        <div className="rpg-curved-banner">
          <div className="rpg-banner-scroll-roll left" />
          <div className="rpg-banner-body">
            <div className="rpg-banner-heading-wrap">
              <div className="rpg-illuminated-box">T</div>
              <h1 className="rpg-banner-main-title">HE ADVENTURER'S DAILY LOG</h1>
            </div>
            <span className="rpg-banner-subtitle">FORGE YOUR LEGACY • CHRONICLE YOUR DEEDS • GREMIO INGEAP</span>
          </div>
          <div className="rpg-banner-scroll-roll right" />
        </div>

        {/* Cuadrícula de pergaminos clavados */}
        <div className="rpg-parchments-grid">
          {/* PERGAMINO 1: MISIONES DE HOY (TODAY'S QUESTS) */}
          <div className="rpg-pinned-parchment parchment-main">
            {/* 4 Tachuelas metálicas en las esquinas */}
            <div className="rpg-tack tack-tl" />
            <div className="rpg-tack tack-tr" />
            <div className="rpg-tack tack-bl" />
            <div className="rpg-tack tack-br" />

            <div className="parchment-header-row">
              <div className="parchment-title-group">
                <QuillIcon size={16} color="#78350f" />
                <h3 className="parchment-title">TODAY'S QUESTS</h3>
              </div>
              <span className="parchment-date">{getFechaMedieval()}</span>
            </div>

            <div className="parchment-hero-bar">
              <div className="parchment-avatar-mini" onClick={onAvatarClick} title="Cambiar retrato del héroe">
                {usuario?.avatar ? (
                  <img src={usuario.avatar} alt={usuario.nombre} className="parchment-avatar-img" />
                ) : (
                  <div className="parchment-avatar-ph">{getIniciales(usuario?.nombre)}</div>
                )}
                <span className="parchment-avatar-pen">✎</span>
              </div>
              <div className="parchment-hero-meta">
                <span className="hero-name">{usuario?.nombre || 'Aventurero'}</span>
                <span className="hero-class">{getTituloRpg(usuario?.nombre)}</span>
              </div>
            </div>

            <div className="parchment-section-heading">ACTIVE LOG (REGISTRO ACTIVO)</div>
            <ul className="rpg-quest-list">
              <li>
                <span className="quest-bullet">[ ]</span>
                <span className="quest-text"><b>Sellar Jornada Diaria:</b> Cargar horas de desarrollo y asistencia.</span>
              </li>
              <li>
                <span className="quest-bullet">[ ]</span>
                <span className="quest-text"><b>Misión en Gremios:</b> Imputar aplicaciones para áreas aliadas.</span>
              </li>
              <li>
                <span className="quest-bullet">[ ]</span>
                <span className="quest-text"><b>Puesto de Misión:</b> Declarar Oficina, Home Office o Campaña.</span>
              </li>
            </ul>

            <div className="parchment-section-heading">LOG ENTRY (NOTAS DE CAMPO)</div>
            <div className="rpg-handwritten-box">
              "El campamento de la taberna está en calma. Has acumulado maná para las tareas de hoy. Registra tus hazañas antes del anochecer para asegurar el botín y sumar EXP a tu legajo."
            </div>

            <button 
              type="button" 
              className="rpg-seal-action-btn"
              onClick={onNuevoReporte}
            >
              <span className="wax-stamp-icon">📜</span>
              <span>EMPRENDER / REGISTRAR MISIÓN DE HOY</span>
            </button>
          </div>

          {/* PERGAMINO 2: LOGROS RECIENTES (RECENT ACHIEVEMENTS) */}
          <div className="rpg-pinned-parchment parchment-achievements">
            <div className="rpg-tack tack-tl" />
            <div className="rpg-tack tack-tr" />
            <div className="rpg-tack tack-bl" />
            <div className="rpg-tack tack-br" />

            <div className="parchment-header-row">
              <div className="parchment-title-group">
                <AxesIcon size={16} color="#78350f" />
                <h3 className="parchment-title">RECENT ACHIEVEMENTS</h3>
              </div>
              <span className="parchment-date">Crónicas</span>
            </div>

            <ul className="rpg-achievements-list">
              <li>
                <span className="achieve-check">☑</span>
                <span className="achieve-name">Guardián del Código (Novicio)</span>
              </li>
              <li>
                <span className="achieve-check">☑</span>
                <span className="achieve-name">Misión Anterior Sellada (+800 EXP)</span>
              </li>
              <li>
                <span className="achieve-check">☑</span>
                <span className="achieve-name">Rango Alcanzado: Nivel 42</span>
              </li>
            </ul>

            <button 
              type="button" 
              className="rpg-parchment-btn-sec"
              onClick={onVerHistorial}
            >
              📖 Abrir Tomo de Crónicas (Historial)
            </button>
          </div>

          {/* PERGAMINO 3: RECOMPENSAS Y NOTAS (REWARDS & NOTES) */}
          <div className="rpg-pinned-parchment parchment-rewards">
            <div className="rpg-tack tack-tl" />
            <div className="rpg-tack tack-tr" />
            <div className="rpg-tack tack-bl" />
            <div className="rpg-tack tack-br" />

            <div className="parchment-header-row">
              <div className="parchment-title-group">
                <CoinPouchIcon size={16} color="#78350f" />
                <h3 className="parchment-title">REWARDS & NOTES</h3>
              </div>
            </div>

            <div className="rpg-exp-status">
              <div className="exp-label-row">
                <span>Diario del Héroe: <b>Nivel 42</b></span>
                <span className="exp-numbers">XP: 3,450 / 4,000</span>
              </div>
              <div className="rpg-exp-bar-frame">
                <div className="rpg-exp-bar-fill" style={{ width: '86%' }} />
              </div>
            </div>

            <div className="rpg-coins-signature-row">
              <div className="rpg-coins-drawing">
                <span style={{ display: 'inline-flex', gap: '3px' }}>
                  <CoinPouchIcon size={13} color="#b45309" />
                  <ShieldIcon size={13} color="#b45309" />
                </span>
                <small>Botín de Gremio</small>
              </div>
              <div className="rpg-signature">
                <i>{usuario?.nombre || 'Iván Valentin'}</i>
              </div>
            </div>
          </div>
        </div>

        {/* Viga de Madera Tallada Inferior */}
        <div className="rpg-wood-bottom-bar">
          <div className="rpg-wood-medallion left" title="Pluma del cronista">
            <QuillIcon size={13} color="#fef3c7" />
          </div>
          <div className="rpg-wood-nav-buttons">
            <button type="button" className="rpg-wood-btn active" onClick={onNuevoReporte}>
              📜 Nueva Misión
            </button>
            <button type="button" className="rpg-wood-btn" onClick={onVerHistorial}>
              📖 Crónicas
            </button>
            <button type="button" className="rpg-wood-btn" onClick={onAvatarClick}>
              👤 Mi Héroe
            </button>
          </div>
          <div className="rpg-wood-medallion right" title="Bolsa de oro">
            <CoinPouchIcon size={13} color="#fef3c7" />
          </div>
        </div>
      </div>
    </div>
  );
}
