import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { descargarJson } from '../utils/downloadJson';

const ataque = '<img src=x onerror="globalThis.ejecutado=true"><script>alert(1)</script>';

class Elemento {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.className = '';
    this.classList = { add: value => { this.className += ` ${value}`; } };
  }
  set innerHTML(_valor) { throw new Error('El contenido no debe interpretarse como HTML'); }
  set textContent(valor) { this.texto = String(valor); this.children = []; }
  get textContent() { return (this.texto || '') + this.children.map(n => n.textContent).join(''); }
  appendChild(nodo) { this.children.push(nodo); return nodo; }
  replaceChildren(...nodos) { this.texto = ''; this.children = nodos; }
}

function visor() {
  const html = readFileSync(new URL('../../../diagrams/noodles_analysis/viewer.html', import.meta.url), 'utf8');
  const helpers = html.split('// BEGIN SAFE-DOM')[1].split('// END SAFE-DOM')[0];
  const tooltips = html.slice(html.indexOf('  function showNodeTooltip('), html.indexOf('  function positionTooltip('));
  const contexto = {
    document: { createElement: tag => new Elemento(tag) },
    container: new Elemento('div'), tooltip: new Elemento('div'),
    positionTooltip: vi.fn(), DATA: { edges: {} },
  };
  vm.runInNewContext(helpers + tooltips, contexto);
  return contexto;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Texto no confiable en el visor de diagramas', () => {
  it('muestra errores como texto literal sin interpretar etiquetas', () => {
    const v = visor();
    v.showDiagramMessage(`Render error: ${ataque}`);
    expect(v.container.textContent).toBe(`Render error: ${ataque}`);
    expect(v.container.children.map(n => n.tagName)).toEqual(['p']);
  });

  it('conserva los metadatos como texto y limita las clases de las etiquetas', () => {
    const v = visor();
    v.showNodeTooltip({}, { name: ataque, type: '" onclick="alert(1)', tag: ataque,
      description: ataque, file_path: ataque, function: ataque, status: 'updated', update: ataque }, 'id');
    expect(v.tooltip.textContent).toContain(ataque);
    expect(v.tooltip.children[0].children[0].className).toBe('tt-badge');
    expect(v.tooltip.children[0].children[1].className).toBe('tt-badge');
    v.showNodeTooltip({}, null, ataque);
    expect(v.tooltip.textContent).toBe(ataque);
  });

  it('muestra tanto etiquetas como detalles de aristas sin usar HTML', () => {
    const v = visor();
    v.showEdgeTooltip({}, { textContent: ataque });
    expect(v.tooltip.textContent).toBe(ataque);
    v.DATA.edges = { id: { label: ataque, description: ataque, index: ataque, condition: ataque } };
    v.showEdgeTooltip({}, { textContent: ataque });
    expect(v.tooltip.textContent).toBe(`${ataque}${ataque}Index: ${ataque}Condition: ${ataque}`);
  });
});

describe('Exportación JSON de errores remotos', () => {
  it('descarga HTML malicioso como datos JSON sin insertarlo en el documento', async () => {
    vi.useFakeTimers();
    let contenido;
    const revocar = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: blob => { contenido = blob; return 'blob:prueba'; }, revokeObjectURL: revocar });
    const enlace = { click: vi.fn() };
    const crear = vi.fn(tag => { expect(tag).toBe('a'); return enlace; });
    vi.stubGlobal('document', { createElement: crear });
    descargarJson([{ mensaje_error: ataque }], 'log_errores_remotos_2026-11-12.json');
    expect(contenido.type).toBe('application/json;charset=utf-8;');
    expect(JSON.parse(await contenido.text())).toEqual([{ mensaje_error: ataque }]);
    expect(enlace.href).toBe('blob:prueba');
    expect(enlace.download).toMatch(/\.json$/);
    expect(enlace.click).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revocar).toHaveBeenCalledWith('blob:prueba');
  });

  it('libera la URL aunque falle el inicio de la descarga', () => {
    vi.useFakeTimers();
    const revocar = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:prueba', revokeObjectURL: revocar });
    vi.stubGlobal('document', { createElement: () => ({ click() { throw new Error('Descarga fallida'); } }) });
    expect(() => descargarJson([], 'log.json')).toThrow('Descarga fallida');
    vi.runAllTimers();
    expect(revocar).toHaveBeenCalledWith('blob:prueba');
  });
});
