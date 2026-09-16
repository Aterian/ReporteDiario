import React from 'react';

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
            <span className="rpg-dropcap">T</span>
            <div className="rpg-banner-titles">
              <h1 className="rpg-banner-main-title">HE ADVENTURER'S DAILY LOG</h1>
              <span className="rpg-banner-subtitle">FORGE YOUR LEGACY • CHRONICLE YOUR DEEDS • GREMIO INGEAP</span>
            </div>
          </div>
          <div className="rpg-banner-scroll-roll right" />
        </div>

        {/* Cuadrícula de pergaminos clavados */}
        <div className="rpg-parchments-grid">
          {/* PERGAMINO IZQUIERDO: MISIONES DE HOY (TODAY'S QUESTS) */}
          <div className="rpg-pinned-parchment parchment-main">
            {/* 4 Tachuelas metálicas en las esquinas */}
            <div className="rpg-tack tack-tl" />
            <div className="rpg-tack tack-tr" />
            <div className="rpg-tack tack-bl" />
            <div className="rpg-tack tack-br" />

            <div className="parchment-header-row">
              <div className="parchment-title-group">
                <span className="parchment-quill-icon">🪶</span>
                <h3 className="parchment-title">TODAY'S QUESTS</h3>
              </div>
              <span className="parchment-date">{getFechaMedieval()}</span>
            </div>

            <div className="parchment-hero-bar">
              <div className="parchment-avatar-mini" onClick={onAvatarClick} title="Cambiar retrato del héroe">
                {usuario.avatar ? (
                  <img src={usuario.avatar} alt={usuario.nombre} className="parchment-avatar-img" />
                ) : (
                  <div className="parchment-avatar-ph">{getIniciales(usuario.nombre)}</div>
                )}
                <span className="parchment-avatar-pen">✎</span>
              </div>
              <div className="parchment-hero-meta">
                <span className="hero-name">{usuario.nombre}</span>
                <span className="hero-class">🧙‍♂️ Desarrollador Arcano (Gremio Aplicaciones)</span>
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

          {/* COLUMNA DERECHA CON 2 PERGAMINOS */}
          <div className="rpg-parchments-column-right">
            {/* PERGAMINO SUPERIOR DERECHO: RECENT ACHIEVEMENTS */}
            <div className="rpg-pinned-parchment parchment-achievements">
              <div className="rpg-tack tack-tl" />
              <div className="rpg-tack tack-tr" />
              <div className="rpg-tack tack-bl" />
              <div className="rpg-tack tack-br" />

              <div className="parchment-header-row">
                <div className="parchment-title-group">
                  <span className="parchment-axes-icon">⚔️</span>
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
                  <span className="achieve-name">Alcanzar Rango Nivel 42</span>
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

            {/* PERGAMINO INFERIOR DERECHO: REWARDS & NOTES */}
            <div className="rpg-pinned-parchment parchment-rewards">
              <div className="rpg-tack tack-tl" />
              <div className="rpg-tack tack-tr" />
              <div className="rpg-tack tack-bl" />
              <div className="rpg-tack tack-br" />

              <div className="parchment-header-row">
                <div className="parchment-title-group">
                  <span className="parchment-bag-icon">💰</span>
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
                  <span>🪙🪙🪙</span>
                  <small>Botín de Gremio</small>
                </div>
                <div className="rpg-signature">
                  <i>Iván Valentin</i>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Viga de Madera Tallada Inferior */}
        <div className="rpg-wood-bottom-bar">
          <div className="rpg-wood-medallion left" title="Pluma del cronista">🪶</div>
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
          <div className="rpg-wood-medallion right" title="Bolsa de oro">💰</div>
        </div>
      </div>
    </div>
  );
}
