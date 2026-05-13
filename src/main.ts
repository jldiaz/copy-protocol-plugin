import { Plugin, Notice, setIcon } from 'obsidian';
import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

class CopyIconWidget extends WidgetType {
	constructor(private textToCopy: string) { super(); }

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'copy-protocol-icon';
		span.style.cursor = 'copy';
		span.style.display = 'inline-flex';
		span.style.marginLeft = '5px';
		span.style.verticalAlign = 'middle';
		span.style.opacity = '0.8';
		
		setIcon(span, 'copy');
		const svg = span.querySelector('svg');
		if (svg) {
			svg.style.width = '0.85em';
			svg.style.height = '0.85em';
		}

		span.onclick = async (e) => {
			e.preventDefault();
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(this.textToCopy);
				new Notice('Copied to clipboard!');
				span.style.transform = 'scale(1.2)';
				setTimeout(() => span.style.transform = 'scale(1)', 200);
			} catch (err) {
				new Notice('Failed to copy.');
			}
		};

		span.onmouseenter = () => span.style.opacity = '1';
		span.onmouseleave = () => span.style.opacity = '0.8';

		return span;
	}

	eq(other: CopyIconWidget): boolean {
		return other.textToCopy === this.textToCopy;
	}
}

const copyLinkPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) { this.decorations = this.buildDecorations(view); }
		update(update: ViewUpdate) {
			// Trigger update on selection change so we can hide/show based on cursor position
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = this.buildDecorations(update.view);
			}
		}

		buildDecorations(view: EditorView): DecorationSet {
			const builder = new RangeSetBuilder<Decoration>();
			const tree = syntaxTree(view.state);
			const { from, to } = view.viewport;
			const selection = view.state.selection;

			tree.iterate({
				from,
				to,
				enter(node) {
					if (!node.name.includes('string_url')) return;
					const urlText = view.state.doc.sliceString(node.from, node.to);
					if (!urlText.includes('obsidian://copy')) return;

					let textToCopy = '';
					try {
						const cleanUrl = urlText.startsWith('<') ? urlText.slice(1, -1) : urlText;
						const url = new URL(cleanUrl);
						textToCopy = url.searchParams.get('text') ?? '';
					} catch {
						const match = urlText.match(/[?&]text=([^&> ]+)/);
						textToCopy = (match && match[1]) ? decodeURIComponent(match[1]) : '';
					}

					if (!textToCopy) return;

					let labelNode = null;
					let curr = node.node.prevSibling;
					for (let i = 0; i < 6 && curr; i++) {
						if (curr.name.includes('link') && !curr.name.includes('formatting')) {
							labelNode = curr;
							break;
						}
						curr = curr.prevSibling;
					}

					if (labelNode) {
						// Hide widget if cursor is anywhere near the link structure
						// (from the start of label to the end of the URL)
						const linkStart = labelNode.from - 1; // accounting for '['
						const linkEnd = node.to + 1;         // accounting for ')'
						const isEditing = selection.ranges.some(r => r.from <= linkEnd && r.to >= linkStart);

						builder.add(labelNode.from, labelNode.to, Decoration.mark({ class: 'copy-protocol-link' }));
						
						if (!isEditing) {
							builder.add(labelNode.to, labelNode.to, Decoration.widget({
								widget: new CopyIconWidget(textToCopy as any),
								side: 1
							}));
						}
					}
				},
			});
			return builder.finish();
		}
	},
	{ decorations: (v) => v.decorations },
);

export default class CopyProtocolPlugin extends Plugin {
	async onload() {
		this.registerObsidianProtocolHandler('copy', async (params) => {
			if (params.text) {
				await navigator.clipboard.writeText(params.text);
				new Notice('Copied to clipboard!');
			}
		});
		this.registerEditorExtension([copyLinkPlugin]);
		this.addCommand({
			id: 'paste-as-copy-link',
			name: 'Paste clipboard as copy-protocol link',
			editorCallback: async (editor) => {
				let text: string;
				try { text = await navigator.clipboard.readText(); } catch { return; }
				if (!text) return;
				const sel = editor.getSelection();
				const url = `obsidian://copy?text=${encodeURIComponent(text)}`;
				const label = sel || (text.length > 50 ? text.slice(0, 50) + '…' : text);
				editor.replaceSelection(`[${label}](<${url}>)`);
			},
		});
	}
}
