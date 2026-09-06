"use client";

import { useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  RedoIcon,
  UndoIcon,
  UnlinkIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { POLICY_ALLOWED_SCHEMES } from "@/lib/policy-html";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * The editor for a legal document draft.
 *
 * The extension set is the narrow schema from `lib/policy-html.ts` and nothing
 * more, so the toolbar cannot offer a construct the sanitizer strips on
 * publish — a mismatch there looks to the admin like the editor silently
 * losing their work.
 *
 * This is a convenience boundary, not a security one. The action sanitizes
 * whatever arrives; see `server/lib/policy-html.ts`.
 */
export function PolicyEditor({
  initialHtml,
  onChange,
  editable = true,
  className,
}: {
  initialHtml: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  className?: string;
}) {
  const editor = useEditor({
    editable,
    // The draft is rendered on the server first; without this React 19 warns
    // about the mismatch when Tiptap takes over on the client.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Kept: paragraph, text, bold, italic, lists, link, undo/redo.
        heading: { levels: [2, 3] },
        // h1 belongs to the page chrome, not the document body.
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          // Matches the sanitizer's scheme list exactly. Anything else is
          // stripped on publish, so offering it here would be a lie.
          protocols: [...POLICY_ALLOWED_SCHEMES],
          defaultProtocol: "https",
        },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: cn(
          "policy-prose min-h-64 w-full px-4 py-3 outline-none",
          !editable && "cursor-default",
        ),
      },
    },
    onUpdate: ({ editor: instance }) => onChange?.(instance.getHTML()),
  });

  const setLink = useCallback(() => {
    if (!editor) return;

    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");

    // Cancel leaves the document alone; clearing the field removes the link.
    if (url === null) return;

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("overflow-hidden rounded-md border bg-background", className)}>
      {editable ? (
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
          <ToggleGroup type="multiple" size="sm" variant="outline">
            <ToggleGroupItem
              value="h2"
              aria-label="Heading"
              data-state={editor.isActive("heading", { level: 2 }) ? "on" : "off"}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              H2
            </ToggleGroupItem>
            <ToggleGroupItem
              value="h3"
              aria-label="Subheading"
              data-state={editor.isActive("heading", { level: 3 }) ? "on" : "off"}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 3 }).run()
              }
            >
              H3
            </ToggleGroupItem>
            <ToggleGroupItem
              value="bold"
              aria-label="Bold"
              data-state={editor.isActive("bold") ? "on" : "off"}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <BoldIcon aria-hidden="true" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="italic"
              aria-label="Italic"
              data-state={editor.isActive("italic") ? "on" : "off"}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <ItalicIcon aria-hidden="true" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="bulletList"
              aria-label="Bulleted list"
              data-state={editor.isActive("bulletList") ? "on" : "off"}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <ListIcon aria-hidden="true" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="orderedList"
              aria-label="Numbered list"
              data-state={editor.isActive("orderedList") ? "on" : "off"}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrderedIcon aria-hidden="true" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Button type="button" variant="ghost" size="sm" onClick={setLink}>
            <LinkIcon data-icon="inline-start" aria-hidden="true" />
            Link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!editor.isActive("link")}
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <UnlinkIcon data-icon="inline-start" aria-hidden="true" />
            Remove
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Undo"
              disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <UndoIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Redo"
              disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <RedoIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}
