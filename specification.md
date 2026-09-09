## Project structure

A project contains multiple tabs.

Example:

```text
ACME Website

[ Go-live ] [ Content ] [ Products ] [ Hosting ] [ + ]
```

Each tab is an independent rich-text/checklist document.

Typical tabs might be:

- Go-live
- Content
- Products
- Hosting
- SEO
- Client tasks
- Notes

However, these are NOT fixed system tabs.

The admin can create, rename, reorder, and delete tabs.

A new project should automatically receive one default tab:

```text
General
```

---

# Data Model

Keep the data model file-based and minimal.

A project JSON file should look conceptually like:

```json
{
  "id": "01J...",
  "name": "ACME Website",
  "createdAt": "...",
  "updatedAt": "...",
  "tabs": [
    {
      "id": "01J...",
      "name": "Go-live",
      "position": 0,
      "document": {
        "type": "doc",
        "content": []
      },
      "createdAt": "...",
      "updatedAt": "..."
    },
    {
      "id": "01J...",
      "name": "Content",
      "position": 1,
      "document": {
        "type": "doc",
        "content": []
      },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "shareLinks": []
}
```

Each tab owns its own Tiptap/ProseMirror JSON document.

Do NOT store HTML as the canonical representation.

---

# Admin Project UI

The project editor should have a tab bar immediately below the project header.

Example:

```text
← Projects

ACME Website                              [ Share ]

────────────────────────────────────────────────

[ Go-live ] [ Content ] [ Products ] [ Hosting ] [ + ]
```

The selected tab displays its Tiptap document below.

The tab bar should be horizontally scrollable on mobile.

---

# Tab management

The `+` button opens a tiny menu/dialog:

```text
New tab

Tab name
[ Client tasks             ]

[ Create ]
```

Admin can:

- create tab
- rename tab
- reorder tabs
- delete tab

Do not create a complicated tab-management screen.

Use a small context menu on the tab:

```text
Rename
Move left
Move right
Delete
```

Deleting a tab should require confirmation.

The project must always have at least one tab.

---

# Client view

Clients see exactly the same tabs, but only the project content.

Example:

```text
ACME Website

[ Go-live ] [ Content ] [ Products ] [ Hosting ]

────────────────────────────────

GO-LIVE CHECKLIST

☑ Production build
☑ SSL
☑ DNS
☐ Final QA
☐ Client approval
☐ Go live
```

Clients can:

- switch tabs
- read content
- click links
- check/uncheck checklist items

Clients cannot:

- create tabs
- rename tabs
- delete tabs
- reorder tabs
- access admin
- create share links

---

# Progress

Progress can be shown per tab.

For example:

```text
Go-live
4 / 6 completed
```

Optionally show overall project progress in the header:

```text
ACME Website

Overall progress: 72%

[ Go-live ] [ Content ] [ Products ] [ Hosting ]
```

Overall progress should be calculated from all task items across all tabs.

Do not store progress separately.

---

# Autosave

Autosave the currently edited tab's Tiptap JSON document.

When switching tabs:

1. ensure pending changes are saved
2. load/display the selected tab
3. update the URL if useful

A simple URL structure is acceptable:

```text
/admin/projects/<projectId>?tab=<tabId>
```

For clients:

```text
/share/<token>?tab=<tabId>
```

The tab ID must still be validated against the project associated with the share token.

Do not allow arbitrary tab IDs to expose another project's content.

---

# Important UX principle

Tabs should feel like **sections of one client document**, not separate projects.

The user should be able to move naturally between:

```text
Go-live
Content
Products
Hosting
Notes
```

without navigating away from the project.

Keep the interface extremely lightweight.

No sidebar is required.

No separate page for each tab is required.

No project-management complexity.

The mental model is:

**Project → tabs → rich-text/checklist documents.**