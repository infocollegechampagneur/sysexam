import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, Heading2, List, ListOrdered, Undo2, Redo2 } from "lucide-react";

const Btn = ({ onClick, active, children, label }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    data-testid={`editor-btn-${label.toLowerCase().replace(/\s+/g, "-")}`}
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${active ? "bg-blue-100 text-blue-900" : "text-slate-600 hover:bg-slate-100"}`}
  >
    {children}
  </button>
);

export const RichEditor = ({ value, onChange, spellcheck = false, testId = "rich-editor", minHeight = 260, placeholder }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { spellcheck: String(!!spellcheck), "data-testid": testId, "aria-label": placeholder || "Zone de rédaction" },
      handlePaste: () => true,
      handleDrop: () => true,
    },
  });
  if (!editor) return null;
  const c = () => editor.chain().focus();
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white" style={{ "--editor-min": `${minHeight}px` }}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1">
        <Btn label="Gras" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
        <Btn label="Italique" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
        <Btn label="Souligne" active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}><Underline className="h-4 w-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <Btn label="Titre" active={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Btn>
        <Btn label="Liste" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
        <Btn label="Liste numerotee" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <Btn label="Annuler" onClick={() => c().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
        <Btn label="Retablir" onClick={() => c().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};
