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
  async zonesACorriger() {
    const { from, to } = this.editor.state.selection;
    const text = plainText(this.editor.state.doc);
    const zone = { texte: text, idZone: "0", zoneEstEnFocus: true };
    if (from !== to) {
      const posToOffset = (p) => { let off = 0; for (const b of blocksOf(this.editor.state.doc)) { if (p <= b.pos + 1 + b.text.length) return off + Math.max(0, p - (b.pos + 1)); off += b.text.length + 1; } return text.length; };
      zone.positionSelectionDebut = posToOffset(from);
      zone.positionSelectionFin = posToOffset(to);
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

export async function launchAntidoteCorrector(editor, title, onDone) {
  const port = await window.monExam.antidotePort();
  if (!port) throw new Error("Connectix introuvable");
  const texteur = new AgentTexteurTipTap(editor, title);
  texteur.onDone = onDone;
  if (!current || current.editor !== editor) {
    const agent = new AgentConnectix(texteur, async () => port);
    await agent.connecteAvecAntidote();
    current = { agent, editor, texteur };
  } else {
    current.texteur.onDone = onDone;
  }
  current.agent.lanceCorrecteur();
}
