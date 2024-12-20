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

## The Most Loved Open-Source ChatGPT Extension for VS Code

ChatGPT Copilot is a powerful and telemetry-free extension for Visual Studio Code, bringing the capabilities of ChatGPT directly into your coding environment.

## Features

- 🤖 Supports GPT-4, o1, Claude, Gemini, Ollama, Github and other OpenAI-compatible local models with your API key from OpenAI, Azure OpenAI Service, Google, Anthropic or other providers.
- 📃 Streaming Answers: Receive real-time responses to your prompts in the sidebar conversation window.
- 📖 Prompt Manager: Chat with your own prompts (use # to search).
- 🔥 Stop Responses: Interrupt responses at any time to save your tokens.
- 📝 Code Assistance: Create files or fix your code with one click or keyboard shortcuts.
- ➡️ Export Conversations: Export all your conversation history at once in Markdown format.
- 🐛 Automatic Partial Code Detection: Automatically continues and combines responses when they are cut off.
- 📰 Custom Prompt Prefixes: Customize what you are asking ChatGPT with ad-hoc prompt prefixes.
- 💻 Seamless Code Integration: Copy, insert, or create new files directly from ChatGPT's code suggestions.
- ➕ Editable Prompts: Edit and resend previous prompts.
- 🛡️ Telemetry Free: No usage data is collected.

## Installation

- Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=feiskyer.chatgpt-copilot) or search `ChatGPT Copilot` in VScode Extensions and click install.
- Reload Visual Studio Code after installation.

## AI Services

Configure the extension by setting your API keys and preferences in the settings.

| Configuration | Description |
| ------------- | ----------- |
| chatgpt.gpt3.apiKey     | Required, get from [OpenAI](https://platform.openai.com/account/api-keys), [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) or [Anthropic](https://console.anthropic.com/settings/keys)|
| chatgpt.gpt3.apiBaseUrl | Optional, default to "<https://api.openai.com/v1>" |
| chatgpt.gpt3.model      | Optional, default to "gpt-4o" |

Refer to the following sections for more details on configuring various AI services.

### OpenAI

API Key is required for OpenAI:

```json
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.apiBaseUrl": "https://api.openai.com/v1", // Optional
```

### Ollama

Pull your image first from Ollama [library](https://ollama.com/library) and then setup the base URL and custom model, e.g.

```json
    "chatgpt.gpt3.apiKey": "ollama",  // Optional
    "chatgpt.gpt3.apiBaseUrl": "http://localhost:11434/v1/",
    "chatgpt.gpt3.model": "custom",
    "chatgpt.gpt3.customModel": "qwen2.5",
```

### Azure OpenAI Service

For Azure OpenAI Service, apiBaseUrl should be set to format `https://[YOUR-ENDPOINT-NAME].openai.azure.com/openai/deployments/[YOUR-DEPLOYMENT-NAME]`, e.g.

```json
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.model": "gpt-4o",
    "chatgpt.gpt3.apiBaseUrl": "https://<endpoint-name>.openai.azure.com/openai/deployments/<deployment-name>"
```

### Anthropic Claude 3

```json
    "chatgpt.gpt3.model": "claude-3-sonnet-20240229",
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.apiBaseUrl": "https://api.anthropic.com/v1", // Optional
```

### Github Models

For [Github Models](https://github.com/marketplace/models), get your Github token from [here](https://github.com/settings/tokens) and then setup:

```json
    "chatgpt.gpt3.apiBaseUrl": "https://models.inference.ai.azure.com",
    "chatgpt.gpt3.apiKey": "<GITHUB_TOKEN>",
    "chatgpt.gpt3.model": "o1",
```

### OpenAI compatible APIs

```json
    "chatgpt.gpt3.apiKey": "<api-key>",
    "chatgpt.gpt3.apiBaseUrl": "<base-url>",
```

### Custom Model Names

To use a custom model name for local or self-hosted LLMs compatible with OpenAI, set the `chatgpt.gpt3.model` configuration to `"custom"` and specify your custom model name in the `chatgpt.gpt3.customModel` configuration.

Example configuration for a custom model name with [groq](https://console.groq.com/):

```json
    "chatgpt.gpt3.model": "custom",
    "chatgpt.gpt3.apiKey": "<your-groq-key>",
    "chatgpt.gpt3.customModel":  "mixtral-8x7b-32768",
    "chatgpt.gpt3.apiBaseUrl": "https://api.groq.com/openai/v1",
```

## Configurations

<details>

<summary> Full list of configuration options </summary>

| Setting                                      | Default                                  | Description                                                  |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `chatgpt.gpt3.apiKey`                        |                                          | OpenAI API key. [Get your API Key from OpenAI](https://beta.openai.com/account/api-keys). |
| `chatgpt.gpt3.apiBaseUrl`                    | `https://api.openai.com/v1`              | Optional override for the OpenAI API base URL. If you customize it, please make sure you have the same format. e.g. starts with `https://` without a trailing slash. The completions endpoint suffix is added internally, e.g. for reference: `${apiBaseUrl}/v1/completions` |
| `chatgpt.gpt3.organization`                  |                                          | OpenAI Organization ID.                                      |
| `chatgpt.gpt3.model`                         | `gpt-4o`                          | OpenAI models to use for your prompts. [Documentation](https://beta.openai.com/docs/models/models).  **If you face 400 Bad Request please make sure you are using the right model for your integration method.**  For local or self-hosted LLMs compatible with OpenAI, you can select `custom` and specify your custom model name in `#chatgpt.gpt3.customModel#`. |
| `chatgpt.gpt3.customModel`                   |                                          | Specify your custom model name here if you selected `custom` in `#chatgpt.gpt3.model#`. This allows you to use a custom model name for local or self-hosted LLMs compatible with OpenAI. |
| `chatgpt.gpt3.maxTokens`                     | `1024`                                   | The maximum number of tokens to generate in the completion.  |
| `chatgpt.gpt3.temperature`                   | `1`                                      | What sampling temperature to use. Higher values means the model will take more risks. Try 0.9 for more creative applications, and 0 (argmax sampling) for ones with a well-defined answer. |
| `chatgpt.gpt3.top_p`                         | `1`                                      | An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered. |
| `chatgpt.systemPrompt`                       |                                          | System prompts for the copilot.                              |
| `chatgpt.gpt3.generateCode-enabled`          | `true`                                   | Enable the code generation context menu item for the selected comment/code for Codex. |
| `chatgpt.gpt3.searchGrounding.enabled`       | `false`                                  | Enable search grounding for Gemini model. Only available for Google Gemini models. |
| `chatgpt.promptPrefix.addTests`              | `Implement tests for the following code` | The prompt prefix used for adding tests for the selected code |
| `chatgpt.promptPrefix.addTests-enabled`      | `true`                                   | Enable the prompt prefix used for adding tests for the selected code in the context menu |
| `chatgpt.promptPrefix.findProblems`          | `Find problems with the following code`  | The prompt prefix used for finding problems for the selected code |
| `chatgpt.promptPrefix.findProblems-enabled`  | `true`                                   | Enable the prompt prefix used for finding problems for the selected code in the context menu |
| `chatgpt.promptPrefix.optimize`              | `Optimize the following code`            | The prompt prefix used for optimizing the selected code      |
| `chatgpt.promptPrefix.optimize-enabled`      | `true`                                   | Enable the prompt prefix used for optimizing the selected code in the context menu |
| `chatgpt.promptPrefix.explain`               | `Explain the following code`             | The prompt prefix used for explaining the selected code      |
| `chatgpt.promptPrefix.explain-enabled`       | `true`                                   | Enable the prompt prefix used for explaining the selected code in the context menu |
| `chatgpt.promptPrefix.addComments`           | `Add comments for the following code`    | The prompt prefix used for adding comments for the selected code |
| `chatgpt.promptPrefix.addComments-enabled`   | `true`                                   | Enable the prompt prefix used for adding comments for the selected code in the context menu |
| `chatgpt.promptPrefix.completeCode`          | `Complete the following code`            | The prompt prefix used for completing the selected code      |
| `chatgpt.promptPrefix.completeCode-enabled`  | `true`                                   | Enable the prompt prefix used for completing the selected code in the context menu |
| `chatgpt.promptPrefix.adhoc-enabled`         | `true`                                   | Enable the prompt prefix used for adhoc command for the selected code in the context menu |
| `chatgpt.promptPrefix.customPrompt1`         |                                          | Your custom prompt 1. It's disabled by default, please set to a custom prompt and enable it if you prefer using customized prompt |
| `chatgpt.promptPrefix.customPrompt1-enabled` | `false`                                  | Enable custom prompt 1. If you enable this item make sure to set this `#chatgpt.promptPrefix.customPrompt1#` |
| `chatgpt.promptPrefix.customPrompt2`         |                                          | Your custom prompt 2. It's disabled by default, please set to a custom prompt and enable it if you prefer using customized prompt |
| `chatgpt.promptPrefix.customPrompt2-enabled` | `false`                                  | Enable custom prompt 2. If you enable this item make sure to set this `#chatgpt.promptPrefix.customPrompt2#` |
| `chatgpt.response.showNotification`          | `false`                                  | Choose whether you'd like to receive a notification when ChatGPT bot responds to your query. |
| `chatgpt.response.autoScroll`                | `true`                                   | Whenever there is a new question or response added to the conversation window, extension will automatically scroll to the bottom. You can change that behaviour by disabling this setting. |

</details>

## How to install locally

<details>

<summary> Build and install locally </summary>

We highly recommend installing the extension directly from the VS Code Marketplace for the easiest setup and automatic updates. However, for advanced users, building and installing locally is also an option.

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

</details>

## Acknowledgement

<details>
<summary>AI Toolkit for TypeScript</summary>

This extension utilizes the [AI Toolkit for TypeScript](https://sdk.vercel.ai/) to seamlessly integrate with a variety of AI providers. This allows for flexible and robust AI functionality within the editor. We appreciate the work by Vercel in creating this valuable resource.

</details>

<details>
<summary>gencay/vscode-chatgpt</summary>

This extension is built on the widely-used [gencay/vscode-chatgpt](https://github.com/gencay/vscode-chatgpt) project, which has garnered over 500,000 downloads. We are deeply grateful for the foundation laid by the original author, Gencay, and the community that supported it.

Unfortunately, the original author has decided to stop maintaining the project, and the new recommended Genie AI extension is not open-source. This fork continues the development to keep the project open and accessible to everyone.
</details>

## License

This project is released under ISC License - See [LICENSE](LICENSE) for details. Copyright notice and the respective permission notices must appear in all copies.
