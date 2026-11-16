import { randomUUID } from 'node:crypto'
import { store } from '../store'
import type { Task } from '../../shared/types'

const MAX_TASKS = 200
const MAX_TEXT = 200

const save = (tasks: Task[]): Task[] => {
  store.set('tasks', tasks)
  return tasks
}

export const listTasks = (): Task[] => store.get('tasks')

export function addTask(text: unknown): Task[] {
  const clean = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : ''
  const tasks = listTasks()
  if (!clean || tasks.length >= MAX_TASKS) return tasks
  return save([...tasks, { id: randomUUID(), text: clean, done: false, createdAt: Date.now() }])
}

export const toggleTask = (id: unknown): Task[] =>
  save(listTasks().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

export const removeTask = (id: unknown): Task[] => save(listTasks().filter((t) => t.id !== id))
