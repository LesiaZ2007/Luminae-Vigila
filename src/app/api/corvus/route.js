import { getSession } from '@/lib/session'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'preview_task',
      description: 'Show the user a preview card for a new task. The user will confirm or cancel before it is added.',
      parameters: {
        type: 'object',
        properties: {
          title:         { type: 'string', description: 'Task title' },
          dueDate:       { type: 'string', description: 'First due date YYYY-MM-DD' },
          priority:      { type: 'string', enum: ['low', 'medium', 'high'] },
          category:      { type: 'string', description: 'One of: academic, personal, work, health' },
          linkedEventId: { type: 'string', description: 'ID of a calendar event this task is linked to' },
          notes:         { type: 'string' },
          repeatType:    { type: 'string', description: 'Recurrence: daily, weekly, or custom' },
          repeatDays:    { type: 'array', items: { type: 'integer' }, description: 'For custom only: day numbers 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat' },
          repeatUntil:   { type: 'string', description: 'Repeat end date YYYY-MM-DD (optional for tasks)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_event',
      description: 'Show the user a preview card for a new calendar event. The user will confirm or cancel before it is added.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string' },
          start:       { type: 'string', description: 'YYYY-MM-DDTHH:MM:SS for timed events, YYYY-MM-DD for all-day' },
          end:         { type: 'string', description: 'End datetime or date. Optional.' },
          allDay:      { type: 'boolean' },
          category:    { type: 'string', description: 'One of: class, exam, personal, health, social, work' },
          notes:       { type: 'string' },
          repeatType:  { type: 'string', description: 'Recurrence: daily, weekly, biweekly, monthly, or custom' },
          repeatDays:  { type: 'array', items: { type: 'integer' }, description: 'For custom only: day numbers 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat' },
          repeatUntil: { type: 'string', description: 'Repeat end date YYYY-MM-DD — REQUIRED if user wants recurring event' },
        },
        required: ['title', 'start'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_event',
      description: 'Edit an existing calendar event immediately (no preview). Use for renaming, rescheduling, etc.',
      parameters: {
        type: 'object',
        properties: {
          eventId:  { type: 'string', description: 'Event ID from the calendar list' },
          title:    { type: 'string' },
          start:    { type: 'string', description: 'New start ISO datetime' },
          end:      { type: 'string', description: 'New end ISO datetime' },
          category: { type: 'string' },
          notes:    { type: 'string' },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_task',
      description: 'Edit an existing task immediately.',
      parameters: {
        type: 'object',
        properties: {
          taskId:   { type: 'string', description: 'Task ID from the task list' },
          title:    { type: 'string' },
          dueDate:  { type: 'string', description: 'YYYY-MM-DD' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          category: { type: 'string' },
          notes:    { type: 'string' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark an existing task as completed.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID from the task list' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_items',
      description: 'Show interactive clickable cards for specific existing events and/or tasks so the user can tap them to navigate directly to that item. Always call this alongside your text response when you mention, list, or discuss specific events or tasks — e.g. urgent deadlines, weekly summary, what to focus on.',
      parameters: {
        type: 'object',
        properties: {
          eventIds: { type: 'array', items: { type: 'string' }, description: 'IDs of existing calendar events to show as cards' },
          taskIds:  { type: 'array', items: { type: 'string' }, description: 'IDs of existing tasks/todos to show as cards' },
        },
      },
    },
  },
]

// Convert our internal (Anthropic-style) messages → OpenAI/Groq format
function toGroqMessages(messages) {
  const result = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content })
      } else {
        // Tool results become separate 'tool' role messages
        for (const item of msg.content) {
          if (item.type === 'tool_result') {
            result.push({ role: 'tool', tool_call_id: item.tool_use_id, content: item.content })
          }
        }
      }
    } else if (msg.role === 'assistant') {
      const blocks    = msg.content || []
      const textParts = blocks.filter(b => b.type === 'text').map(b => b.text).join('')
      const toolCalls = blocks.filter(b => b.type === 'tool_use')
      const out = { role: 'assistant', content: textParts || null }
      if (toolCalls.length) {
        out.tool_calls = toolCalls.map(b => ({
          id:       b.id,
          type:     'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }))
      }
      result.push(out)
    }
  }
  return result
}

// Convert Groq response message → our internal (Anthropic-style) content array
function fromGroqMessage(msg) {
  const content = []
  if (msg.content) content.push({ type: 'text', text: msg.content })
  for (const tc of (msg.tool_calls || [])) {
    content.push({
      type:  'tool_use',
      id:    tc.id,
      name:  tc.function.name,
      input: JSON.parse(tc.function.arguments || '{}'),
    })
  }
  return content
}

export async function POST(request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages = [], events = [], todos = [], canvasAssignments = [], timezone = 'UTC' } = await request.json()

  const now     = new Date()
  const tz      = timezone
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })

  const eventsCtx = events.length
    ? events.map(e => {
        const s      = e.start || ''
        const dt     = s ? new Date(s) : null
        const datePart = dt ? dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz }) : 'no date'
        const timePart = (dt && s.includes('T')) ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }) : 'all-day'
        const source   = e.extendedProps?.source
        const typeLabel = source === 'canvas-class' ? '[CLASS]' : source === 'canvas-cal' ? '[CANVAS EVENT]' : '[EVENT]'
        return `${typeLabel} [${e.id}] "${e.title}" — ${datePart} ${timePart}${e.extendedProps?.category ? ` (${e.extendedProps.category})` : ''}`
      }).join('\n')
    : 'None'

  const todosCtx = todos.length
    ? todos.map(t =>
        `[${t.id}] "${t.title}"${t.dueDate ? ` due ${t.dueDate}` : ''}${t.linkedEventId ? ` linked:[${t.linkedEventId}]` : ''} priority:${t.priority || 'medium'}`
      ).join('\n')
    : 'None'

  // Canvas assignments — only non-hidden, non-done, due within next 30 days (avoid flooding context)
  const thirtyDaysOut = new Date(now); thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
  const canvasCtx = canvasAssignments.length
    ? canvasAssignments
        .filter(a => !a.done && !a.hidden && (!a.dueAt || new Date(a.dueAt) <= thirtyDaysOut))
        .sort((a, b) => (a.dueAt ?? 'z').localeCompare(b.dueAt ?? 'z'))
        .map(a => {
          const due = a.dueAt
            ? new Date(a.dueAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz })
            : 'no due date'
          const status = a.submissionState === 'submitted' ? 'submitted' : a.submissionState === 'graded' ? 'graded' : 'unsubmitted'
          return `[${a.id}] [${a.courseName}] "${a.title}" — due ${due} — ${status}`
        })
        .join('\n')
    : 'None'

  const systemPrompt = `You are Corvus, a sharp and friendly AI assistant built into luminaeVigila — a calendar and task app for students. You help users manage their schedule and to-do list through natural conversation.

Today is ${dateStr} at ${timeStr}.

CALENDAR EVENTS (prefixed by type):
  [CLASS] = recurring class from the student's course schedule (not editable, happens every week)
  [CANVAS EVENT] = one-off event posted by a professor on Canvas
  [EVENT] = user-created calendar event

${eventsCtx}

PENDING TASKS:
${todosCtx}

CANVAS ASSIGNMENTS (synced from Canvas LMS — read-only, due within 30 days):
${canvasCtx}

PERSONALITY:
- Warm, direct, and a little witty. You're like a smart study buddy, not a corporate chatbot.
- Keep replies short (1–2 sentences max) unless you're asking a follow-up question.
- Use casual language — "Got it!", "Sure thing!", "On it." etc. Feel free to acknowledge what the user said before acting.
- Don't restate info that's already visible in the preview card.

BEHAVIOR RULES:
1. ALWAYS ask for missing critical info before calling any tool. Never guess at a date or time that wasn't given.
   - For events: need at minimum a title AND a date. If either is missing, ask.
   - For tasks: need a title. Due date and priority are optional — use sensible defaults (medium priority, no due date) if not given.
   - For edits: need to identify which event/task. If ambiguous, ask which one.

2. Clarification examples:
   - "add a meeting" → "Sure! What day and time is the meeting?"
   - "add a chemistry exam" → "Got it — what date is the exam?"
   - "move my lunch" → "Which lunch are you referring to, and what day should it move to?"
   - "I need to do homework" → call preview_task with title="Homework", medium priority — no date needed unless user gives one.

3. SHOW_ITEMS — THIS IS MANDATORY:
   ANY time your response discusses, lists, or references one or more specific existing events or tasks by name, you MUST call show_items with their IDs. This is not optional. The UI renders interactive cards from this call so the user can tap to navigate.
   - "urgent deadlines" → call show_items with the IDs of the urgent events/tasks you mention
   - "week summary" → call show_items with all the event/task IDs you discuss
   - "what should I focus on" → call show_items with the items you recommend
   - "you have a quiz Friday" → call show_items with that quiz's event ID
   - If you reference ANY specific event or task by name, call show_items for it
   - Call show_items IN ADDITION to your text, not instead of it. Both text and cards appear together.

4. Other tool routing:
   - Adding a task → preview_task
   - Adding an event → preview_event
   - Task linked to an event → set linkedEventId, dueDate = day before
   - Editing an existing item → edit_event or edit_task (immediate, no preview)
   - Marking done → complete_task

5. Date resolution: "Wednesday", "this Friday", "next Monday" → resolve to nearest upcoming YYYY-MM-DD.

6. NEVER call a tool with a placeholder or made-up date. If you don't have the date, ask first.

7. Recurring events and tasks:
   - If the user says "every week", "repeating", "recurring", "every Monday" etc. → use repeatType and repeatUntil
   - repeatType: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom'
   - For 'custom' (specific days of week): use repeatDays (array of day numbers 0=Sun…6=Sat)
   - repeatUntil: end date YYYY-MM-DD — ALWAYS ask for this if the user hasn't specified it
   - Example: "Every Tuesday until May" → repeatType='weekly', repeatUntil='2026-05-31', start=nearest Tuesday

8. NEVER avoid or change a date because of existing calendar conflicts. Overlapping events are completely normal and allowed.

9. ITEM TERMINOLOGY — always use the correct term for each type:
   - [CLASS] items → call them "class" or "your [ClassName] class" (e.g. "your Physics class")
   - [CANVAS EVENT] items → call them "event" or "a Canvas event"
   - [EVENT] items → call them "event" (e.g. "your dentist appointment")
   - Never call a [EVENT] a "class", and never call a [CLASS] a generic "event".
   - When summarizing someone's day/plan, clearly separate classes from one-off events.`

  try {
    const groqMessages = toGroqMessages(messages)

    const response = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    [{ role: 'system', content: systemPrompt }, ...groqMessages],
      tools:       TOOLS,
      tool_choice: 'auto',
      max_tokens:  600,
    })

    const content = fromGroqMessage(response.choices[0].message)
    return Response.json({ content })
  } catch (err) {
    console.error('Corvus Groq error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
