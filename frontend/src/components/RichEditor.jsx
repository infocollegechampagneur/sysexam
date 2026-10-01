import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, Heading2, List, ListOrdered, Undo2, Redo2, SpellCheck } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/tools";

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

export const RichEditor = ({ value, onChange, spellcheck = false, testId = "rich-editor", minHeight = 260, placeholder, allowPaste = false, antidote }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { spellcheck: String(!!spellcheck), "data-testid": testId, "aria-label": placeholder || "Zone de rédaction" },
      handlePaste: () => !allowPaste,
      handleDrop: () => true,
    },
  }, [allowPaste]);
  if (!editor) return null;
  const c = () => editor.chain().focus();
  const correct = async () => {
    const text = stripHtml(editor.getHTML()).trim();
    if (!text) return toast.info("Écrivez d'abord votre texte, puis cliquez sur « Corriger avec Antidote ».");
    try { await navigator.clipboard.writeText(text); } catch (e) { return toast.error("Impossible de copier le texte. Sélectionnez-le et utilisez Ctrl+C."); }
    antidote.onCorrect?.(text);
    toast.success("Texte copié ! Dans Antidote : Ctrl+V, corrigez, Ctrl+A puis Ctrl+C, et recollez ici avec Ctrl+V.", { duration: 10000 });
  };
  return (
    <div data-answer-zone="" className="overflow-hidden rounded-lg border border-slate-300 bg-white" style={{ "--editor-min": `${minHeight}px` }}>
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
        {antidote && (
          <button type="button" onMouseDown={(e) => { e.preventDefault(); correct(); }} title="Copie votre texte pour le corriger dans Antidote"
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100" data-testid={`${testId}-antidote-btn`}>
            <SpellCheck className="h-3.5 w-3.5" />Corriger avec Antidote
          </button>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};
