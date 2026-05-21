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
import { SyntaxNodeRef } from '@lezer/common';

async function copyText(text: string): Promise<boolean> {
	try {
		// Try Electron clipboard first if available (Desktop)
		const electron = (window as any).electron;
		if (electron && electron.clipboard) {
			electron.clipboard.writeText(text);
			new Notice('Copied to clipboard!');
			return true;
		}
		
		// Fallback to standard Navigator Clipboard API (Mobile/Web)
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(text);
			new Notice('Copied to clipboard!');
			return true;
		}
		
		// Old-school fallback using document.execCommand (if all else fails)
		const textArea = activeDocument.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.opacity = '0';
		activeDocument.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		const successful = activeDocument.execCommand('copy');
		activeDocument.body.removeChild(textArea);
		if (successful) {
			new Notice('Copied to clipboard!');
			return true;
		}
	} catch (err) {
		console.error('Failed to copy text: ', err);
	}
	new Notice('Failed to copy.');
	return false;
}

class CopyIconWidget extends WidgetType {
	constructor(private textToCopy: string) { super(); }

	toDOM(): HTMLElement {
		const span = activeDocument.createElement('span');
		span.className = 'copy-protocol-icon';
		
		setIcon(span, 'copy');

		span.onclick = async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const success = await copyText(this.textToCopy);
			if (success) {
				span.addClass('is-clicked');
				window.setTimeout(() => span.removeClass('is-clicked'), 200);
			}
		};

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
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = this.buildDecorations(update.view);
			}
		}

		buildDecorations(view: EditorView): DecorationSet {
			const builder = new RangeSetBuilder<Decoration>();
			const tree = syntaxTree(view.state);
			const selection = view.state.selection;

			for (const { from: lFrom, to: lTo } of view.visibleRanges) {
				tree.iterate({
					from: lFrom,
					to: lTo,
					enter(node: SyntaxNodeRef) {
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

						let labelNode: SyntaxNodeRef | null = null;
						let curr = node.node.prevSibling;
						for (let i = 0; i < 6 && curr; i++) {
							if (curr.name.includes('link') && !curr.name.includes('formatting')) {
								labelNode = curr as unknown as SyntaxNodeRef;
								break;
							}
							curr = curr.prevSibling;
						}

						if (labelNode) {
							const line = view.state.doc.lineAt(node.from);
							builder.add(line.from, line.from, Decoration.line({ class: 'has-copy-protocol-line' }));

							const linkStart = labelNode.from - 1;
							const linkEnd = node.to + 1;
							const isEditing = selection.ranges.some(r => r.from <= linkEnd && r.to >= linkStart);

							builder.add(labelNode.from, labelNode.to, Decoration.mark({
								class: 'copy-protocol-link',
								attributes: {
									'data-text-to-copy': textToCopy
								}
							}));
							
							if (!isEditing) {
								builder.add(labelNode.to, labelNode.to, Decoration.widget({
									widget: new CopyIconWidget(textToCopy),
									side: 1
								}));
							}
						}
					},
				});
			}
			return builder.finish();
		}
	},
	{ decorations: (v) => v.decorations },
);

export default class CopyProtocolPlugin extends Plugin {
	private hoveredElement: HTMLElement | null = null;
	private hoveredText: string | null = null;

	async onload() {
		this.registerObsidianProtocolHandler('copy', async (params) => {
			if (params.text) {
				await copyText(params.text);
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

		this.registerMarkdownPostProcessor((element, context) => {
			const links = element.querySelectorAll('a.external-link, a.copy-protocol-link');
			links.forEach(link => {
				const href = link.getAttribute('href') || '';
				if (href.startsWith('obsidian://copy')) {
					if (link.classList.contains('external-link')) {
						link.classList.remove('external-link');
					}
					if (!link.classList.contains('copy-protocol-link')) {
						link.classList.add('copy-protocol-link');
					}
					link.removeAttribute('aria-label');
					link.removeAttribute('data-tooltip-position');

					// Add an inline icon span if it doesn't already have one
					if (!link.querySelector('.copy-protocol-icon')) {
						const span = link.createSpan({ cls: 'copy-protocol-icon' });
						setIcon(span, 'copy');
					}
				}
			});
		});

		this.registerWindowEvents(activeWindow);

		this.registerEvent(
			this.app.workspace.on('window-open', (winInfo: any, win: Window) => {
				this.registerWindowEvents(win);
			})
		);
	}

	onunload() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const win = (leaf.view.containerEl as any).win;
			if (win && win.document) {
				const tooltip = win.document.getElementById('copy-protocol-custom-tooltip');
				if (tooltip) {
					tooltip.remove();
				}
			}
		});
		const mainTooltip = activeDocument.getElementById('copy-protocol-custom-tooltip');
		if (mainTooltip) {
			mainTooltip.remove();
		}
	}

	private registerWindowEvents(win: Window) {
		const doc = win.document;

		this.registerDomEvent(doc, 'mouseover', this.handleMouseOver, { capture: true });
		this.registerDomEvent(doc, 'mouseout', this.handleMouseOut, { capture: true });
		this.registerDomEvent(win, 'keydown', this.handleKeyDown);
		this.registerDomEvent(win, 'keyup', this.handleKeyUp);

		this.registerDomEvent(doc, 'click', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;
			const copyLink = target.closest('.copy-protocol-link') as HTMLElement;
			if (copyLink) {
				evt.preventDefault();
				evt.stopPropagation();

				let textToCopy = copyLink.getAttribute('data-text-to-copy');
				
				if (!textToCopy && copyLink.tagName === 'A') {
					const href = copyLink.getAttribute('href') || '';
					if (href.startsWith('obsidian://copy?')) {
						try {
							const url = new URL(href);
							textToCopy = url.searchParams.get('text') ?? '';
						} catch {
							const match = href.match(/[?&]text=([^&]+)/);
							textToCopy = (match && match[1]) ? decodeURIComponent(match[1]) : '';
						}
					}
				}

				if (textToCopy) {
					copyText(textToCopy);
				}
			}
		}, true); 
	}

	private handleMouseOver = (e: MouseEvent) => {
		const target = e.target as HTMLElement;
		if (!target) return;

		const copyEl = target.closest('a.copy-protocol-link, .copy-protocol-link, .copy-protocol-icon, a.external-link[href^="obsidian://copy"]') as HTMLElement | null;
		if (!copyEl) return;

		this.hoveredElement = copyEl;

		let text = '';
		const href = copyEl.getAttribute('href');
		if (href && href.startsWith('obsidian://copy')) {
			try {
				const url = new URL(href);
				text = url.searchParams.get('text') ?? '';
			} catch {
				const match = href.match(/[?&]text=([^&]+)/);
				text = (match && match[1]) ? decodeURIComponent(match[1]) : '';
			}
		} else {
			text = copyEl.getAttribute('data-text-to-copy') ?? '';
		}

		this.hoveredText = text;

		if (copyEl.classList.contains('external-link')) {
			copyEl.classList.remove('external-link');
			copyEl.classList.add('copy-protocol-link');
		}
		if (copyEl.hasAttribute('aria-label')) {
			copyEl.removeAttribute('aria-label');
		}
		if (copyEl.hasAttribute('data-tooltip-position')) {
			copyEl.removeAttribute('data-tooltip-position');
		}

		if (e.ctrlKey || e.metaKey) {
			this.showTooltip();
		}
	};

	private handleMouseOut = (e: MouseEvent) => {
		if (!this.hoveredElement) return;
		const related = e.relatedTarget as HTMLElement | null;
		if (related && this.hoveredElement.contains(related)) return;

		this.hideTooltip();
		this.hoveredElement = null;
		this.hoveredText = null;
	};

	private handleKeyDown = (e: KeyboardEvent) => {
		if ((e.key === 'Control' || e.key === 'Meta') && this.hoveredElement && this.hoveredText) {
			this.showTooltip();
		}
	};

	private handleKeyUp = (e: KeyboardEvent) => {
		if (e.key === 'Control' || e.key === 'Meta') {
			this.hideTooltip();
		}
	};

	private getOrCreateTooltip(doc: Document): HTMLElement {
		let tooltip = doc.getElementById('copy-protocol-custom-tooltip');
		if (!tooltip) {
			tooltip = doc.createElement('div');
			tooltip.id = 'copy-protocol-custom-tooltip';
			tooltip.className = 'copy-protocol-tooltip';
			doc.body.appendChild(tooltip);
		}
		return tooltip;
	}

	private showTooltip() {
		if (!this.hoveredElement || !this.hoveredText) return;

		const doc = this.hoveredElement.ownerDocument || document;
		const tooltip = this.getOrCreateTooltip(doc);

		const cleanText = this.hoveredText.replace(/\r?\n/g, ' ');
		const displayLength = 100;
		const truncatedText = cleanText.length > displayLength
			? cleanText.slice(0, displayLength) + '…'
			: cleanText;

		tooltip.textContent = `Copy: "${truncatedText}"`;

		const rect = this.hoveredElement.getBoundingClientRect();
		const win = doc.defaultView || window;
		
		const scrollTop = win.scrollY || doc.documentElement.scrollTop;
		const scrollLeft = win.scrollX || doc.documentElement.scrollLeft;

		tooltip.classList.add('is-visible');

		const tooltipRect = tooltip.getBoundingClientRect();
		const left = rect.left + scrollLeft + (rect.width / 2) - (tooltipRect.width / 2);
		const top = rect.top + scrollTop - tooltipRect.height - 8;

		tooltip.style.left = `${Math.max(8, left)}px`;
		tooltip.style.top = `${top}px`;
	}

	private hideTooltip() {
		if (!this.hoveredElement) return;
		const doc = this.hoveredElement.ownerDocument || document;
		const tooltip = doc.getElementById('copy-protocol-custom-tooltip');
		if (tooltip) {
			tooltip.classList.remove('is-visible');
		}
	}
}
