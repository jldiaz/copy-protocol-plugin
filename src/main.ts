import { Editor, MarkdownView, Plugin, Notice } from 'obsidian';

export default class CopyProtocolPlugin extends Plugin {
	async onload() {
		// Register the obsidian://copy protocol handler
		this.registerObsidianProtocolHandler('copy', async (params) => {
			if (params.text) {
				// Obsidian already decodes URL params before calling the handler,
				// so no need for an extra decodeURIComponent here.
				await navigator.clipboard.writeText(params.text);
				new Notice(`Copied to clipboard!`);
			}
		});

		// Register the "paste as link" command
		this.addCommand({
			id: 'paste-as-copy-link',
			name: 'Paste clipboard as copy-protocol link',
			editorCallback: async (editor: Editor, _view: MarkdownView) => {
				// Read clipboard content
				let clipboardText: string;
				try {
					clipboardText = await navigator.clipboard.readText();
				} catch {
					new Notice('Could not read clipboard.');
					return;
				}

				if (!clipboardText) {
					new Notice('Clipboard is empty.');
					return;
				}

				// Get current selection (used as the link label)
				const selection = editor.getSelection();

				// Build the obsidian://copy URL, URL-encoding the clipboard text
				const encodedText = encodeURIComponent(clipboardText);
				const url = `obsidian://copy?text=${encodedText}`;

				// Build the markdown link:
				//   [<label>](<url>)  — angle-bracket form avoids issues with spaces
				// The label is either the selected text or the raw clipboard text
				// (truncated to 50 chars for readability if no selection).
				const label = selection.length > 0
					? selection
					: clipboardText.length > 50
						? clipboardText.slice(0, 50) + '…'
						: clipboardText;

				const markdownLink = `[${label}](<${url}>)`;

				if (selection.length > 0) {
					// Replace the selection with the link
					editor.replaceSelection(markdownLink);
				} else {
					// Insert at cursor position
					editor.replaceSelection(markdownLink);
				}
			},
		});
	}
}
