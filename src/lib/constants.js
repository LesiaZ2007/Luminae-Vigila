/**
 * Event categories for calendar events
 */
export const EVENT_CATEGORIES = [
  { id: 'class', label: 'Class', color: '#3a6fa8' },
  { id: 'exam', label: 'Exam / Quiz', color: '#ef4444' },
  { id: 'personal', label: 'Personal', color: '#10b981' },
  { id: 'health', label: 'Health', color: '#f59e0b' },
  { id: 'social', label: 'Social', color: '#8b5cf6' },
  { id: 'work', label: 'Work', color: '#06b6d4' },
]

/**
 * Default todo categories
 */
export const DEFAULT_TODO_CATEGORIES = [
  { id: 'academic', label: 'Academic', color: '#3a6fa8' },
  { id: 'personal', label: 'Personal', color: '#10b981' },
  { id: 'work', label: 'Work', color: '#f59e0b' },
  { id: 'health', label: 'Health', color: '#ef4444' },
]

/**
 * Todo filter options
 */
export const TODO_FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All' },
  { id: 'done', label: 'Done' },
]

/**
 * Session storage key for Corvus AI assistant
 */
export const CORVUS_SESSION_KEY = 'corvus-session'

/**
 * Session TTL for Corvus (10 minutes)
 */
export const CORVUS_SESSION_TTL = 10 * 60 * 1000
