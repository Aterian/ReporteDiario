// [FN-00.03] Setup Global de Pruebas de Frontend con Vitest y JSDOM
import '@testing-library/jest-dom';

// Mock de window.matchMedia para JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock de window.ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock de window.scrollTo
window.scrollTo = () => {};

// Mock defensivo de alert y confirm
window.alert = (msg) => console.log('[JSDOM window.alert]:', msg);
window.confirm = () => true;
