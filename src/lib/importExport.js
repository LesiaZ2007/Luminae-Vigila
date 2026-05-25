/**
 * Export calendar data including events, todos, categories, and Google account info
 * @returns {Object} Data object ready for export
 */
export function prepareExportData() {
  try {
    const events = JSON.parse(localStorage.getItem('lv-events') || '[]')
    const todos = JSON.parse(localStorage.getItem('lv-todos') || '[]')
    const todoCategories = JSON.parse(
      localStorage.getItem('lv-todo-cats') || '[]'
    )
    const googlePrefs = JSON.parse(
      localStorage.getItem('lv-google-prefs') || '{}'
    )

    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        events,
        todos,
        todoCategories,
        googleAccounts: googlePrefs.accounts || [],
      },
    }
  } catch (error) {
    console.error('Error preparing export:', error)
    return null
  }
}

/**
 * Download data as JSON file
 * @param {Object} data - Data to export
 * @param {string} filename - Output filename
 */
export function downloadJSON(data, filename = 'luminae-vigila-backup.json') {
  try {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  } catch (error) {
    console.error('Error downloading file:', error)
    return false
  }
}

/**
 * Validate imported data structure
 * @param {Object} data - Data to validate
 * @returns {Object} { valid: boolean, error?: string, data?: Object }
 */
export function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid data format' }
  }

  if (!data.data || typeof data.data !== 'object') {
    return { valid: false, error: 'Missing data field' }
  }

  const { events, todos, todoCategories, googleAccounts } = data.data

  if (!Array.isArray(events)) {
    return { valid: false, error: 'Invalid events format' }
  }

  if (!Array.isArray(todos)) {
    return { valid: false, error: 'Invalid todos format' }
  }

  if (!Array.isArray(todoCategories)) {
    return { valid: false, error: 'Invalid todo categories format' }
  }

  return { valid: true, data }
}

/**
 * Import data and restore to localStorage
 * @param {Object} data - Data to import
 * @param {boolean} merge - Whether to merge with existing data or replace
 * @returns {Object} { success: boolean, message: string }
 */
export function importData(data, merge = false) {
  try {
    const validation = validateImportData(data)
    if (!validation.valid) {
      return { success: false, message: validation.error }
    }

    const { events, todos, todoCategories, googleAccounts } = data.data

    if (merge) {
      // Merge approach: add to existing data
      const existingEvents = JSON.parse(
        localStorage.getItem('lv-events') || '[]'
      )
      const existingTodos = JSON.parse(
        localStorage.getItem('lv-todos') || '[]'
      )

      // Merge events (avoid duplicates by id)
      const eventIds = new Set(existingEvents.map((e) => e.id))
      const newEvents = events.filter((e) => !eventIds.has(e.id))
      const mergedEvents = [...existingEvents, ...newEvents]

      // Merge todos (avoid duplicates by id)
      const todoIds = new Set(existingTodos.map((t) => t.id))
      const newTodos = todos.filter((t) => !todoIds.has(t.id))
      const mergedTodos = [...existingTodos, ...newTodos]

      localStorage.setItem('lv-events', JSON.stringify(mergedEvents))
      localStorage.setItem('lv-todos', JSON.stringify(mergedTodos))
      localStorage.setItem('lv-todo-cats', JSON.stringify(todoCategories))

      return {
        success: true,
        message: `Merged: ${newEvents.length} events, ${newTodos.length} todos`,
      }
    } else {
      // Replace approach: overwrite existing data
      localStorage.setItem('lv-events', JSON.stringify(events))
      localStorage.setItem('lv-todos', JSON.stringify(todos))
      localStorage.setItem('lv-todo-cats', JSON.stringify(todoCategories))

      return {
        success: true,
        message: `Imported: ${events.length} events, ${todos.length} todos`,
      }
    }
  } catch (error) {
    console.error('Error importing data:', error)
    return { success: false, message: 'Failed to import data' }
  }
}

/**
 * Read JSON file from user input
 * @param {File} file - File to read
 * @returns {Promise<Object>}
 */
export async function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result)
        resolve(data)
      } catch (error) {
        reject(new Error('Invalid JSON file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
