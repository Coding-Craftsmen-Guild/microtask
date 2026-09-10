import path from 'node:path'
import { Invalid, isProduct, isUlid, type Product } from '@repo/kernel'
import { contained } from './contained.js'

const MANIFEST = 'project.json'
const TASKS = 'tasks'

/** Resolves the directory holding every project for one product. */
export function projectsDir(root: string, product: Product): string {
  if (!isProduct(product)) throw new Invalid('Unknown product')
  return contained(root, path.join(root, product, 'projects'))
}

/** Resolves the directory holding one project's files. */
export function projectDir(root: string, product: Product, projectId: string): string {
  if (!isUlid(projectId)) throw new Invalid('Project id must be a ULID')
  const parent = projectsDir(root, product)
  return contained(parent, path.join(parent, projectId))
}

/** Resolves the file holding one project's manifest. */
export function manifestFile(root: string, product: Product, projectId: string): string {
  const parent = projectDir(root, product, projectId)
  return contained(parent, path.join(parent, MANIFEST))
}

/** Resolves the directory holding one project's task files. */
export function tasksDir(root: string, product: Product, projectId: string): string {
  const parent = projectDir(root, product, projectId)
  return contained(parent, path.join(parent, TASKS))
}

/** Resolves the file holding one task's tabs. */
export function taskFile(
  root: string,
  product: Product,
  projectId: string,
  taskId: string,
): string {
  if (!isUlid(taskId)) throw new Invalid('Task id must be a ULID')
  const parent = tasksDir(root, product, projectId)
  return contained(parent, path.join(parent, `${taskId}.json`))
}
