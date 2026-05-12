import { Plugin, Notice } from 'obsidian';

export default class CopyProtocolPlugin extends Plugin {
	async onload() {
		this.registerObsidianProtocolHandler('copy', async (params) => {
			if (params.text) {
				const query = decodeURIComponent(params.text);
				await navigator.clipboard.writeText(query);
				new Notice(`Copied to clipboard!`);
			}
		});
	}
}
