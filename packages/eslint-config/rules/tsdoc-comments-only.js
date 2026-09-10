const EXPORTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration'])

const MEMBERS = new Set([
  'PropertyDefinition',
  'MethodDefinition',
  'TSAbstractPropertyDefinition',
  'TSAbstractMethodDefinition',
  'TSDeclareMethod',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSIndexSignature',
  'TSEnumMember',
])

function documented(source, comment) {
  const token = source.getTokenAfter(comment, { includeComments: false })
  if (!token) return null
  let node = source.getNodeByRangeIndex(token.range[0])
  while (
    node?.parent &&
    node.parent.type !== 'Program' &&
    node.parent.range[0] === token.range[0]
  ) {
    node = node.parent
  }
  return node ?? null
}

function memberOfAnExport(node) {
  let current = node.parent
  while (current) {
    if (current.type === 'BlockStatement') return false
    if (EXPORTS.has(current.type)) return true
    current = current.parent
  }
  return false
}

function isDocForExport(source, comment) {
  if (comment.type !== 'Block' || !comment.value.startsWith('*')) return false
  const node = documented(source, comment)
  if (!node) return false
  if (EXPORTS.has(node.type)) return true
  return MEMBERS.has(node.type) && memberOfAnExport(node)
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Allow only TSDoc comments documenting an exported declaration or one of its members',
    },
    messages: {
      disallowed:
        'Only TSDoc (/** ... */) documenting an exported declaration or one of its members is allowed. Put design rationale in docs/adr/ and behavioural rationale in a test name (ADR 0027).',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode
    return {
      Program() {
        for (const comment of source.getAllComments()) {
          if (comment.type === 'Shebang') continue
          if (isDocForExport(source, comment)) continue
          context.report({ loc: comment.loc, messageId: 'disallowed' })
        }
      },
    }
  },
}
