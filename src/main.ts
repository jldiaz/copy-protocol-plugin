import { Plugin, Notice } from 'obsidian';

export default class CopyProtocolPlugin extends Plugin {
	async onload() {
		this.registerObsidianProtocolHandler('copy', (params) => {
			if (params.text) {
				const query = decodeURIComponent(params.text);
				navigator.clipboard.writeText(query);
				new Notice(`Copied to clipboard!`);
			}
		});
	}
}
