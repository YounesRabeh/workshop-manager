/**
 * Overview: Renderer bundle entrypoint used by the Electron build.
 * Responsibility: Delegates startup to the shared frontend bootstrap so the packaged renderer and development entry use one initialization path.
 */
import '../../frontend/main'
