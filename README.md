# Obsidian Copy Protocol Plugin

This is a simple plugin for Obsidian that registers a custom `obsidian://copy` protocol.
It allows you to create internal links that, when clicked, will silently copy a specific text to your clipboard without opening any external applications or showing popups.

## Usage

Create a link using the following format:
`[Link text](obsidian://copy?text=Your%20text%20here)`

When you click the link, "Your text here" will be copied to your clipboard, and a small notice will appear to confirm the action.

Note: Remember to URL-encode your text (e.g., use `%20` instead of spaces).

## Installation

You can install this plugin via [BRAT](https://github.com/TfTHacker/obsidian42-brat):
1. Open the BRAT settings in Obsidian.
2. Click "Add Beta plugin".
3. Paste the repository URL: `jldiaz/obsidian-copy-protocol-plugin`.
4. Enable the plugin in your Community Plugins list.
