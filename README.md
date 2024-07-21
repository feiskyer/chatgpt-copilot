<h3 align="center"><img src="https://raw.githubusercontent.com/feiskyer/chatgpt-copilot/main/images/ai-logo.png" height="64"><br>An VS Code ChatGPT Copilot Extension</h3>

<p align="center">
    <a href="https://marketplace.visualstudio.com/items?itemName=feiskyer.chatgpt-copilot" alt="Marketplace version">
        <img src="https://img.shields.io/visual-studio-marketplace/v/feiskyer.chatgpt-copilot?color=orange&label=VS%20Code" />
    </a>
    <a href="https://marketplace.visualstudio.com/items?itemName=feiskyer.chatgpt-copilot" alt="Marketplace download count">
        <img src="https://img.shields.io/visual-studio-marketplace/d/feiskyer.chatgpt-copilot?color=blueviolet&label=Downloads" />
    </a>
    <a href="https://github.com/feiskyer/chatgpt-copilot" alt="Github star count">
        <img src="https://img.shields.io/github/stars/feiskyer/chatgpt-copilot?color=blue&label=Github%20Stars" />
    </a>
</p>

## The most loved opensourced ChatGPT extension for VS Code

The project is built on the most loved ChatGPT extension [gencay/vscode-chatgpt](https://github.com/gencay/vscode-chatgpt), which has downloaded by ~500,000 developers.

But unfortunately, the original author has decided to stop maintaining the project, and the new recommended Genie AI extension on the original project is not opensourced. So I decided to fork it and continue the development.

## Features

- ➕ Use GPT-4, GPT-3.5, Claude 3 or OpenAI compatible local models with your API Key from OpenAI, Azure OpenAI Service or Anthropic.
- 📃 Get streaming answers to your prompts in sidebar conversation window
- 🔥 Stop the responses to save your tokens.
- 📝 Create files or fix your code with one click or with keyboard shortcuts.
- ➡️ Export all your conversation history at once in Markdown format.
- Automatic partial code response detection. Continues and combines automatically, when response is cut off.
- Ad-hoc prompt prefixes for you to customize what you are asking ChatGPT
- Edit and resend a previous prompt
- Copy, insert or create new file from the code, ChatGPT is suggesting right into your editor.

## Configurations

| Configuration | Description |
| ------------- | ----------- |
| chatgpt.gpt3.apiKey     | Required, please get from [OpenAI](https://platform.openai.com/account/api-keys), [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) or [Anthropic](https://console.anthropic.com/settings/keys). |
| chatgpt.gpt3.apiBaseUrl | Optional, default to "<https://api.openai.com/v1>".<br>For Azure OpenAI Service, it should be set to "https://[YOUR-ENDPOINT-NAME].openai.azure.com/openai/deployments/[YOUR-DEPLOYMENT-NAME]". |
| chatgpt.gpt3.model      | Optional, default to "gpt-3.5-turbo". |

Refer following sections for more details of how to configure various openai services.

### OpenAI

```json
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.apiBaseUrl": "https://api.openai.com/v1", // Optional
```

### Azure OpenAI Service

```json
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.model": "gpt-3.5-turbo",
    "chatgpt.gpt3.apiBaseUrl": "https://<endpoint-name>.openai.azure.com/openai/deployments/<deployment-name>", // Required
```

### Anthropic Claude 3

```json
    "chatgpt.gpt3.model": "claude-3-sonnet-20240229",
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.apiBaseUrl": "https://api.anthropic.com/v1", // Optional
```

### Local or self-hosted LLM compatible with OpenAI

```json
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.apiBaseUrl": "<base-url>",
```

### Configuring Custom Model Names

To use a custom model name for local or self-hosted LLMs compatible with OpenAI, set the `chatgpt.gpt3.model` configuration to `"custom"` and specify your custom model name in the `chatgpt.gpt3.customModel` configuration.

Example configuration for a custom model name with [groq](https://console.groq.com/):

```json
    "chatgpt.gpt3.model": "custom",
    "chatgpt.gpt3.apiKey": "<your-custom-key>",
    "chatgpt.gpt3.customModel":  "mixtral-8x7b-32768",
    "chatgpt.gpt3.apiBaseUrl": "https://api.groq.com/openai/v1",
```

## How to install locally

- Install `vsce` if you don't have it on your machine (The Visual Studio Code Extension Manager)
  - `npm install --global vsce`
- Run `vsce package`
- Follow the <a href="https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix">instructions</a> and install manually.

```sh
npm run build
npm run package
code --uninstall-extension feiskyer.chatgpt-copilot
code --install-extension chatgpt-copilot-*.vsix
```

## License

This project is released under ISC License - See [LICENSE](LICENSE) for details. Copyright notice and the respective permission notices must appear in all copies.
