import { addDaysStr, todayStr } from '@/lib/localDate'
import { makeList } from '@/lib/customLists'
import { makeNote } from '@/lib/notes'

/** Build a relative-dated in-memory dataset for /demo so the planner feels lived-in today. */
export function buildDemoSeed(now = new Date()) {
  const today = todayStr(now)
  const tomorrow = addDaysStr(1, now)
  const inTwoDays = addDaysStr(2, now)
  const inFourDays = addDaysStr(4, now)
  const yesterday = addDaysStr(-1, now)
  const semStart = addDaysStr(-45, now)
  const semEnd = addDaysStr(75, now)
  const stamp = now.toISOString()

  const classes = [
    {
      id: 'cls_demo_cs',
      courseName: 'CS 240 · Systems',
      section: '01',
      professor: 'Prof. Sato',
      location: 'Hall 214',
      days: [1, 3, 5],
      startTime: '10:00',
      endTime: '11:15',
      semesterName: 'Current Term',
      semesterStart: semStart,
      semesterEnd: semEnd,
      color: '#3a6fa8',
      enabled: true,
      canvasCourseId: null,
      linkedToClassId: null,
      updatedAt: stamp,
    },
    {
      id: 'cls_demo_bio',
      courseName: 'Bio 115 · Ecology',
      section: '02',
      professor: 'Dr. Rivera',
      location: 'Greenhouse Lab',
      days: [2, 4],
      startTime: '13:30',
      endTime: '15:00',
      semesterName: 'Current Term',
      semesterStart: semStart,
      semesterEnd: semEnd,
      color: '#10b981',
      enabled: true,
      canvasCourseId: null,
      linkedToClassId: null,
      updatedAt: stamp,
    },
  ]

  const events = [
    {
      id: 'evt_demo_1',
      title: 'Deep work: Systems lab report',
      start: `${today}T14:00:00`,
      end: `${today}T15:30:00`,
      allDay: false,
      color: '#3b82f6',
      extendedProps: {
        category: 'study',
        notes: 'Finish allocator benchmarks and clean up plots.',
        location: 'Library 3rd floor',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
    {
      id: 'evt_demo_2',
      title: 'Coffee + sketch walk',
      start: `${tomorrow}T09:30:00`,
      end: `${tomorrow}T10:30:00`,
      allDay: false,
      color: '#f59e0b',
      extendedProps: {
        category: 'personal',
        notes: 'Bring field notebook.',
        location: 'Roastery on Elm',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
    {
      id: 'evt_demo_3',
      title: 'Study group · Bio midterm review',
      start: `${inTwoDays}T16:00:00`,
      end: `${inTwoDays}T17:30:00`,
      allDay: false,
      color: '#10b981',
      extendedProps: {
        category: 'academic',
        notes: 'Quiz each other on trophic cascades.',
        location: 'Science commons',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
  ]

  const todos = [
    {
      id: 'todo_demo_1',
      title: 'Submit Systems lab 4 writeup',
      category: 'class:cls_demo_cs',
      dueDate: today,
      priority: 'high',
      notes: 'Double check memory leak check before uploading.',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [
        { id: 'sub_1', text: 'Run valgrind clean pass', checked: true },
        { id: 'sub_2', text: 'Export PDF & upload', checked: false },
      ],
    },
    {
      id: 'todo_demo_2',
      title: 'Outline Ecology field observation notes',
      category: 'class:cls_demo_bio',
      dueDate: tomorrow,
      priority: 'medium',
      notes: 'Two pages covering riparian zone samples.',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [],
    },
    {
      id: 'todo_demo_3',
      title: 'Pick up film prints before closing',
      category: 'personal',
      dueDate: inFourDays,
      priority: 'low',
      notes: '',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [],
    },
    {
      id: 'todo_demo_4',
      title: 'Review lecture slides from Monday',
      category: 'class:cls_demo_cs',
      dueDate: yesterday,
      priority: 'medium',
      notes: '',
      completed: true,
      completedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [],
    },
  ]

  const notes = [
    makeNote({
      id: 'note_demo_1',
      title: 'Systems Lab 4 checklist',
      html: '<p>Check free-list coalescing edge cases before submitting.</p><ul><li>Alignment to 16 bytes</li><li>Split threshold when remainder is small</li></ul>',
      tags: ['cs240', 'lab'],
      pinned: true,
      color: '#3a6fa8',
    }),
    makeNote({
      id: 'note_demo_2',
      title: 'Weekend trip ideas',
      html: '<p>Look for Saturday morning train departures + pack a rain shell.</p>',
      tags: ['ideas'],
      starred: true,
      color: '#10b981',
    }),
  ]

  const prepList = makeList('Weekend Bag', 'Backpack', '#3a6fa8')
  prepList.items = [
    { id: 'cli_1', text: 'Film camera + spare roll', checked: true, dueDate: null, note: '', sortOrder: 0, updatedAt: stamp },
    { id: 'cli_2', text: 'Chargers & battery bank', checked: false, dueDate: null, note: '', sortOrder: 1, updatedAt: stamp },
    { id: 'cli_3', text: 'Water bottle', checked: false, dueDate: null, note: '', sortOrder: 2, updatedAt: stamp },
  ]

  const studySessions = [
    {
      id: 'ss_demo_1',
      title: 'Systems allocator review',
      courseId: 'cls_demo_cs',
      minutes: 50,
      date: yesterday,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]

  return {
    'lv-events': events,
    'lv-todos': todos,
    'lv-study-sessions': studySessions,
    'lv-event-prefs': {},
    'lv-custom-lists': [prepList],
    'lv-notes': notes,
    'lv-canvas-assignments': [],
    'lv-canvas-classes': classes,
    'lv-canvas-cal-events': [],
    'lv-canvas-ics-events': [],
    'lv-clock-24h': false,
  }
}
