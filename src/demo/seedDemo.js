import { addDaysStr, todayStr } from '@/lib/localDate'
import { makeList } from '@/lib/customLists'
import { makeNote } from '@/lib/notes'

/** Build a relative-dated in-memory dataset for /demo so every planner view feels lived-in today. */
export function buildDemoSeed(now = new Date()) {
  const today = todayStr(now)
  const yesterday = addDaysStr(-1, now)
  const twoDaysAgo = addDaysStr(-2, now)
  const tomorrow = addDaysStr(1, now)
  const inTwoDays = addDaysStr(2, now)
  const inThreeDays = addDaysStr(3, now)
  const inFourDays = addDaysStr(4, now)
  const inFiveDays = addDaysStr(5, now)
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
      canvasCourseId: 901,
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
      canvasCourseId: 902,
      linkedToClassId: null,
      updatedAt: stamp,
    },
    {
      id: 'cls_demo_math',
      courseName: 'MATH 301 · Linear Algebra',
      section: '04',
      professor: 'Dr. Mensah',
      location: 'Euler 108',
      days: [2, 4],
      startTime: '10:00',
      endTime: '11:15',
      semesterName: 'Current Term',
      semesterStart: semStart,
      semesterEnd: semEnd,
      color: '#8b5cf6',
      enabled: true,
      canvasCourseId: null,
      linkedToClassId: null,
      updatedAt: stamp,
    },
  ]

  const events = [
    {
      id: 'evt_demo_1',
      title: 'Deep work · Systems lab report',
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
      title: 'Run club · River path',
      start: `${today}T18:00:00`,
      end: `${today}T19:00:00`,
      allDay: false,
      color: '#f59e0b',
      extendedProps: {
        category: 'health',
        notes: 'Easy 5k loop before dinner.',
        location: 'Boathouse gate',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
    {
      id: 'evt_demo_3',
      title: 'Coffee + sketch walk',
      start: `${tomorrow}T09:00:00`,
      end: `${tomorrow}T10:00:00`,
      allDay: false,
      color: '#f59e0b',
      extendedProps: {
        category: 'personal',
        notes: 'Bring field notebook and 35mm camera.',
        location: 'Roastery on Elm',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
    {
      id: 'evt_demo_4',
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
    {
      id: 'evt_demo_5',
      title: 'Office hours · Prof. Sato',
      start: `${inThreeDays}T15:15:00`,
      end: `${inThreeDays}T16:00:00`,
      allDay: false,
      color: '#3a6fa8',
      extendedProps: {
        category: 'academic',
        notes: 'Ask about page-table TLB shootdown edge cases.',
        location: 'Gates 412',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
    {
      id: 'evt_demo_6',
      title: 'Bouldering + dinner',
      start: `${inFourDays}T18:30:00`,
      end: `${inFourDays}T20:30:00`,
      allDay: false,
      color: '#ec4899',
      extendedProps: {
        category: 'personal',
        notes: 'Rent shoes for Maya.',
        location: 'Cliffside Gym',
      },
      reminder: null,
      recurrence: null,
      updatedAt: stamp,
    },
    {
      id: 'evt_demo_7',
      title: 'Problem set review session',
      start: `${yesterday}T15:30:00`,
      end: `${yesterday}T17:00:00`,
      allDay: false,
      color: '#8b5cf6',
      extendedProps: {
        category: 'study',
        notes: 'Singular value decomposition examples.',
        location: 'Euler 202',
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
        { id: 'sub_2', text: 'Plot allocator throughput', checked: true },
        { id: 'sub_3', text: 'Export PDF & upload', checked: false },
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
      subtasks: [
        { id: 'sub_4', text: 'Transcribed Transect A counts', checked: true },
        { id: 'sub_5', text: 'Draft discussion paragraph', checked: false },
      ],
    },
    {
      id: 'todo_demo_3',
      title: 'Linear Algebra PS6 · Eigenvalues & SVD',
      category: 'class:cls_demo_math',
      dueDate: inTwoDays,
      priority: 'high',
      notes: 'Problems 1, 3, 4, and proof on symmetric positive definite matrices.',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [],
    },
    {
      id: 'todo_demo_4',
      title: 'Pick up film prints before closing',
      category: 'personal',
      dueDate: inThreeDays,
      priority: 'low',
      notes: 'Portra 400 roll at corner lab.',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [],
    },
    {
      id: 'todo_demo_5',
      title: 'Book weekend train ticket early',
      category: 'personal',
      dueDate: inFiveDays,
      priority: 'medium',
      notes: '',
      completed: false,
      createdAt: stamp,
      updatedAt: stamp,
      subtasks: [],
    },
    {
      id: 'todo_demo_6',
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

  const canvasAssignments = [
    {
      id: 7001,
      courseId: 901,
      courseName: 'CS 240 · Systems',
      title: 'Lab 4: Malloc Allocator & Coalescing',
      dueAt: `${inTwoDays}T23:59:00`,
      pointsPossible: 100,
      submissionState: 'unsubmitted',
      done: false,
      hidden: false,
      priority: 'high',
      htmlUrl: null,
      description: 'Implement explicit free list with boundary tags and immediate coalescing.',
      notes: null,
      reminder: null,
    },
    {
      id: 7002,
      courseId: 902,
      courseName: 'Bio 115 · Ecology',
      title: 'Wetland Quadrat Data Table',
      dueAt: `${inFourDays}T17:00:00`,
      pointsPossible: 40,
      submissionState: 'unsubmitted',
      done: false,
      hidden: false,
      priority: 'medium',
      htmlUrl: null,
      description: 'Upload CSV counts and Shannon diversity index summary.',
      notes: null,
      reminder: null,
    },
    {
      id: 7003,
      courseId: 901,
      courseName: 'CS 240 · Systems',
      title: 'Reading Check: Virtual Memory',
      dueAt: `${yesterday}T23:59:00`,
      pointsPossible: 15,
      submissionState: 'graded',
      done: true,
      doneDate: yesterday,
      hidden: false,
      priority: 'low',
      htmlUrl: null,
      description: '',
      notes: null,
      reminder: null,
    },
  ]

  const notes = [
    makeNote({
      id: 'note_demo_1',
      title: 'Systems Lab 4 checklist',
      html: '<p>Check free-list coalescing edge cases before submitting.</p><ul><li>Alignment to 16 bytes</li><li>Split threshold when remainder is small</li><li>Coalesce left and right neighbours cleanly</li></ul>',
      tags: ['cs240', 'lab'],
      pinned: true,
      color: '#3a6fa8',
    }),
    makeNote({
      id: 'note_demo_2',
      title: 'Ecology midterm formulas',
      html: '<p>Lotka-Volterra equilibria + Shannon diversity index:</p><ul><li>H = −∑ p<sub>i</sub> ln(p<sub>i</sub>)</li><li>Carrying capacity inflection at K / 2</li></ul>',
      tags: ['bio115', 'exam'],
      pinned: false,
      starred: true,
      color: '#10b981',
    }),
    makeNote({
      id: 'note_demo_3',
      title: 'Weekend trip ideas',
      html: '<p>Look for Saturday morning train departures + pack a rain shell and film camera.</p>',
      tags: ['ideas'],
      starred: true,
      color: '#f59e0b',
    }),
    makeNote({
      id: 'note_demo_4',
      title: 'Linear algebra office hours questions',
      html: '<p>Ask Dr. Mensah about the geometric intuition behind the four fundamental subspaces under transpose.</p>',
      tags: ['math301'],
      color: '#8b5cf6',
    }),
  ]

  const prepList = makeList('Weekend Bag', 'Backpack', '#3a6fa8')
  prepList.items = [
    { id: 'cli_1', text: 'Film camera + spare 35mm roll', checked: true, dueDate: null, note: '', sortOrder: 0, updatedAt: stamp },
    { id: 'cli_2', text: 'Chargers & battery bank', checked: false, dueDate: null, note: '', sortOrder: 1, updatedAt: stamp },
    { id: 'cli_3', text: 'Rain shell', checked: false, dueDate: null, note: '', sortOrder: 2, updatedAt: stamp },
    { id: 'cli_4', text: 'Sketchbook & fountain pen', checked: true, dueDate: null, note: '', sortOrder: 3, updatedAt: stamp },
  ]

  const groceryList = makeList('Trader Joe’s Run', 'ShoppingCart', '#10b981')
  groceryList.items = [
    { id: 'cli_5', text: 'Oat milk & espresso beans', checked: false, dueDate: null, note: '', sortOrder: 0, updatedAt: stamp },
    { id: 'cli_6', text: 'Sourdough loaf & sharp cheddar', checked: false, dueDate: null, note: '', sortOrder: 1, updatedAt: stamp },
    { id: 'cli_7', text: 'Honeycrisp apples', checked: true, dueDate: null, note: '', sortOrder: 2, updatedAt: stamp },
  ]

  const studySessions = [
    { id: 'ss_demo_1', title: 'Systems allocator review', courseId: 'cls_demo_cs', minutes: 50, date: today, createdAt: stamp, updatedAt: stamp },
    { id: 'ss_demo_2', title: 'Linear algebra SVD proofs', courseId: 'cls_demo_math', minutes: 45, date: yesterday, createdAt: stamp, updatedAt: stamp },
    { id: 'ss_demo_3', title: 'Ecology wetland readings', courseId: 'cls_demo_bio', minutes: 35, date: twoDaysAgo, createdAt: stamp, updatedAt: stamp },
    { id: 'ss_demo_4', title: 'CS 240 lecture recap', courseId: 'cls_demo_cs', minutes: 25, date: twoDaysAgo, createdAt: stamp, updatedAt: stamp },
  ]

  return {
    'lv-events': events,
    'lv-todos': todos,
    'lv-study-sessions': studySessions,
    'lv-event-prefs': {},
    'lv-custom-lists': [prepList, groceryList],
    'lv-notes': notes,
    'lv-canvas-assignments': canvasAssignments,
    'lv-canvas-classes': classes,
    'lv-canvas-cal-events': [],
    'lv-canvas-ics-events': [],
    'lv-clock-24h': false,
  }
}
