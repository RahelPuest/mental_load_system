import { afterEach, expect } from 'vitest'
import { cleanup } from '@testing-library/react'

/** jsdom kennt diese Browser-APIs nicht; die Oberfläche benutzt sie. */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

afterEach(() => cleanup())

expect.extend({
  /** Trefferfläche nach WCAG 2.5.8 / Auftrag §23: mindestens 44 px in beiden Richtungen. */
  toHaveMinimumTouchTarget(received: HTMLElement, min = 44) {
    const style = getComputedStyle(received)
    const h = parseFloat(style.minHeight || '0')
    const w = parseFloat(style.minWidth || '0')
    const pass = h >= min || w >= min
    return {
      pass,
      message: () =>
        `${received.tagName}.${received.className} hat min-height ${h}px / min-width ${w}px, erwartet ≥ ${min}px`,
    }
  },
})
