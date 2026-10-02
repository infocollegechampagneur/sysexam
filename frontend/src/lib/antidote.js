import { AgentConnectix, AgentTexteur } from "@druide-informatique/antidote-api-js/fr";

const blocksOf = (doc) => {
  const blocks = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) blocks.push({ pos, text: node.textBetween(0, node.content.size, undefined, "\n") });
  });
  return blocks;
};

const plainText = (doc) => blocksOf(doc).map((b) => b.text).join("\n");

const offsetToPos = (doc, offset) => {
  let start = 0;
  for (const b of blocksOf(doc)) {
    if (offset <= start + b.text.length) return b.pos + 1 + (offset - start);
    start += b.text.length + 1;
  }
  return doc.content.size - 1;
};

class AgentTexteurTipTap extends AgentTexteur {
  constructor(editor, title) {
    super();
    this.editor = editor;
    this.title = title;
    this.onDone = null;
  }
  async configuration() {
    return { titreDocument: this.title, retourCharriot: "\n", permetRetourCharriot: false, permetEspaceInsecable: true, permetEspaceFine: false, remplaceSansSelection: true, filtreActif: "texte" };
  }
  async zonesDeTexteDisponibles() { return !this.editor.isDestroyed; }
  async zonesACorriger({ pourSelectionActive } = {}) {
    const { from, to } = this.editor.state.selection;
    const doc = this.editor.state.doc;
    const text = plainText(doc);
    const posToOffset = (p) => { let off = 0; for (const b of blocksOf(doc)) { if (p <= b.pos + 1 + b.text.length) return off + Math.max(0, p - (b.pos + 1)); off += b.text.length + 1; } return text.length; };
    const zone = { texte: text, idZone: "0", zoneEstEnFocus: true };
    if (from !== to) {
      zone.positionSelectionDebut = posToOffset(from);
      zone.positionSelectionFin = posToOffset(to);
    } else if (pourSelectionActive) {
      const off = posToOffset(from);
      const left = text.slice(0, off).search(/[\p{L}\p{N}'’-]+$/u);
      const right = text.slice(off).match(/^[\p{L}\p{N}'’-]*/u)[0].length;
      zone.positionSelectionDebut = left === -1 ? off : left;
      zone.positionSelectionFin = off + right;
    }
    return [zone];
  }
  async peutCorriger({ contexte, positionDebut, positionFin }) {
    return plainText(this.editor.state.doc).substring(positionDebut, positionFin) === contexte;
  }
  async corrigeDansTexteur({ nouvelleChaine, positionRemplacementDebut, positionRemplacementFin }) {
    const doc = this.editor.state.doc;
    const from = offsetToPos(doc, positionRemplacementDebut);
    const to = offsetToPos(doc, positionRemplacementFin);
    this.editor.view.dispatch(this.editor.state.tr.insertText(nouvelleChaine.replace(/\r?\n/g, " "), from, to));
    return true;
  }
  selectionneIntervalle({ positionDebut, positionFin }) {
    const doc = this.editor.state.doc;
    this.editor.chain().setTextSelection({ from: offsetToPos(doc, positionDebut), to: offsetToPos(doc, positionFin) }).scrollIntoView().run();
  }
  retourneAuTexteur() { this.editor.commands.focus(); this.onDone?.(); }
  metsFocusSurLeDocument() { this.editor.commands.focus(); }
  sessionTerminee() { this.onDone?.(); }
}

let current = null;

export const antidoteApiAvailable = () => !!window.monExam?.antidotePort;

async function agentFor(editor, title, onDone) {
  const port = await window.monExam.antidotePort();
  if (!port) throw new Error("Connectix introuvable");
  if (!current || current.editor !== editor) {
    const texteur = new AgentTexteurTipTap(editor, title);
    const agent = new AgentConnectix(texteur, async () => port);
    await agent.connecteAvecAntidote();
    current = { agent, editor, texteur };
  }
  current.texteur.onDone = onDone;
  return current.agent;
}

export async function launchAntidoteCorrector(editor, title, onDone) {
  (await agentFor(editor, title, onDone)).lanceCorrecteur();
}

export async function launchAntidoteTool(editor, kind) {
  const agent = await agentFor(editor, "Réponse d'examen", null);
  if (kind === "guides") agent.lanceGuides(); else agent.lanceDictionnaires();
}
