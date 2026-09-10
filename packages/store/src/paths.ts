import path from 'node:path'
import { Invalid, isProduct, isUlid, type Product } from '@repo/kernel'

const MANIFEST = 'project.json'
const TASKS = 'tasks'

function contained(root: string, target: string): string {
  const base = path.resolve(root)
  const resolved = path.resolve(target)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Invalid('Path escapes the data root')
  }
  return resolved
}

/** Resolves the directory holding every project for one product. */
export function projectsDir(root: string, product: Product): string {
  if (!isProduct(product)) throw new Invalid('Unknown product')
  return contained(root, path.join(root, product, 'projects'))
}

/** Resolves the directory holding one project's files. */
export function projectDir(root: string, product: Product, projectId: string): string {
  if (!isUlid(projectId)) throw new Invalid('Project id must be a ULID')
  return contained(root, path.join(projectsDir(root, product), projectId))
}

/** Resolves the file holding one project's manifest. */
export function manifestFile(root: string, product: Product, projectId: string): string {
  return contained(root, path.join(projectDir(root, product, projectId), MANIFEST))
}

/** Resolves the file holding one task's tabs. */
export function taskFile(
  root: string,
  product: Product,
  projectId: string,
  taskId: string,
): string {
  if (!isUlid(taskId)) throw new Invalid('Task id must be a ULID')
  const dir = path.join(projectDir(root, product, projectId), TASKS)
  return contained(root, path.join(dir, `${taskId}.json`))
}

/** Resolves the directory holding one project's task files. */
export function tasksDir(root: string, product: Product, projectId: string): string {
  return contained(root, path.join(projectDir(root, product, projectId), TASKS))
}
