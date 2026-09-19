import { deleteScene, fetchScene, listScenes, type SavedScene } from './api'

/**
 * Result persistence boundary for saved prototype scenes.
 *
 * Saved scenes remain local presentation-backend records. Keeping that detail
 * here lets result UI remain independent of the eventual artifact API.
 */
export const listSavedResults = () => listScenes()
export const getSavedResult = (id: string) => fetchScene(id)
export const deleteSavedResult = (id: string) => deleteScene(id)

export type { SavedScene }
