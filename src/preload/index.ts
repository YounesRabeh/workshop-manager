/**
 * Overview: Build entrypoint for the preload bundle.
 * Responsibility: Re-exports the Electron preload bridge module so Vite/Electron can compile and load it as the preload script.
 */
import '../../src/electron/preload'
