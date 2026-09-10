function isDocForExport(source, comment) {
  if (comment.type !== 'Block' || !comment.value.startsWith('*')) return false
  const token = source.getTokenAfter(comment, { includeComments: false })
  if (!token) return false
  let node = source.getNodeByRangeIndex(token.range[0])
  while (node) {
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      return true
    }
    node = node.parent
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Allow only TSDoc comments attached to exported declarations' },
    messages: {
      disallowed:
        'Only TSDoc (/** ... */) on exported declarations is allowed. Put design rationale in docs/adr/ and behavioural rationale in a test name (ADR 0027).',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode
    return {
      Program() {
        for (const comment of source.getAllComments()) {
          if (isDocForExport(source, comment)) continue
          context.report({ loc: comment.loc, messageId: 'disallowed' })
        }
      },
    }
  },
}
