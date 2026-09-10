import { Editor, StarterKit, TaskList, TaskItem, Link, Placeholder } from '/vendor/tiptap.js';

export function createEditor({ element, document: doc, editable = true, onUpdate, onSelection }) {
  const extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
    }),
    TaskList,
    // Without an onReadOnlyChecked handler a read-only view snaps the checkbox
    // back on click, which is exactly what a read-only link should do.
    TaskItem.configure({ nested: true }),
    Link.configure({
      openOnClick: !editable,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
    Placeholder.configure({
      placeholder: editable ? 'Write notes, or press / … try the ☑ button for a checklist' : '',
    }),
  ];

  // Tiptap registers whatever it is handed, so an explicit `undefined`
  // callback becomes a listener that throws on the first transaction.
  const handlers = {};
  if (onUpdate) handlers.onUpdate = ({ editor }) => onUpdate(editor);
  if (onSelection) {
    handlers.onSelectionUpdate = ({ editor }) => onSelection(editor);
    handlers.onTransaction = ({ editor }) => onSelection(editor);
  }

  return new Editor({
    element,
    extensions,
    content: doc || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable,
    autofocus: false,
    editorProps: { attributes: { spellcheck: String(editable) } },
    ...handlers,
  });
}

const TOOLBAR = [
  { label: 'B', title: 'Bold (Ctrl+B)', mark: 'bold', run: (c) => c.toggleBold(), style: 'font-weight:800' },
  { label: 'I', title: 'Italic (Ctrl+I)', mark: 'italic', run: (c) => c.toggleItalic(), style: 'font-style:italic' },
  { label: 'S', title: 'Strikethrough', mark: 'strike', run: (c) => c.toggleStrike(), style: 'text-decoration:line-through' },
  { label: '</>', title: 'Inline code', mark: 'code', run: (c) => c.toggleCode() },
  '|',
  { label: 'H1', title: 'Heading 1', node: ['heading', { level: 1 }], run: (c) => c.toggleHeading({ level: 1 }) },
  { label: 'H2', title: 'Heading 2', node: ['heading', { level: 2 }], run: (c) => c.toggleHeading({ level: 2 }) },
  { label: 'H3', title: 'Heading 3', node: ['heading', { level: 3 }], run: (c) => c.toggleHeading({ level: 3 }) },
  '|',
  { label: '☑', title: 'Checklist', node: ['taskList'], run: (c) => c.toggleTaskList() },
  { label: '•', title: 'Bullet list', node: ['bulletList'], run: (c) => c.toggleBulletList() },
  { label: '1.', title: 'Numbered list', node: ['orderedList'], run: (c) => c.toggleOrderedList() },
  { label: '❝', title: 'Quote', node: ['blockquote'], run: (c) => c.toggleBlockquote() },
  { label: '―', title: 'Divider', run: (c) => c.setHorizontalRule() },
  '|',
  { label: '🔗', title: 'Link', mark: 'link', link: true },
];

export function buildToolbar(container, editor, { onLink }) {
  const buttons = [];
  for (const item of TOOLBAR) {
    if (item === '|') {
      container.append(Object.assign(document.createElement('span'), { className: 'sep' }));
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.title = item.title;
    if (item.style) button.setAttribute('style', item.style);
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      if (item.link) return onLink();
      item.run(editor.chain().focus()).run();
    });
    container.append(button);
    buttons.push({ button, item });
  }

  return function refresh() {
    for (const { button, item } of buttons) {
      const active = item.mark
        ? editor.isActive(item.mark)
        : item.node
          ? editor.isActive(...item.node)
          : false;
      button.classList.toggle('on', active);
    }
  };
}
