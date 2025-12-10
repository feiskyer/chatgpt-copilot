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

- 🤖 Supports GPT-5, o1/o3, Claude, Gemini, Ollama, Claude Code, Github Copilot and other OpenAI-compatible local models with your API key from OpenAI, Azure OpenAI Service, Google, Anthropic or other providers.
- 💥 Model Context Protocol (MCP) to bring your own tools and DeepClaude (DeepSeek R1 + Claude) mode for best AI responses.
- 📂 Chat with your Files: Add multiple files and images to your chat using `@` for seamless collaboration.
- 📃 Streaming Answers: Receive real-time responses to your prompts in the sidebar conversation window.
- 📖 Prompt Manager: Chat with your own prompts (use # to search).
- 🔥 Tool calls via prompt parsing for models that don't support native tool calling.
- 📝 Code Assistance: Create files or fix your code with one click or keyboard shortcuts.
- ➡️ Export Conversations: Export all your conversation history at once in Markdown format.
- 📰 Custom Prompt Prefixes: Customize what you are asking ChatGPT with ad-hoc prompt prefixes.
- 💻 Seamless Code Integration: Copy, insert, or create new files directly from ChatGPT's code suggestions.
- ➕ Editable Prompts: Edit and resend previous prompts.
- 🛡️ Telemetry Free: No usage data is collected.

## Recent Release Highlights

- **v4.10**: Add Claude Code provider.
- **v4.9**: Add prompt based tool calls for models that don't support native tool calling.
- **v4.8**: New LOGO and new models.
- **v4.7**: Added Model Context Protocol (MCP) integration.
- **v4.6**: Added prompt manager, DeepClaude mode (DeepSeek + Claude) mode, Github Copilot provider and chat with files.

## Installation

- Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=feiskyer.chatgpt-copilot) or search `ChatGPT Copilot` in VScode Extensions and click install.
- Reload Visual Studio Code after installation.

## Supported Models & Providers

### **AI Providers**

The extension supports major AI providers with hundreds of models:

| Provider           | Models                                            | Special Features                   |
| ------------------ | ------------------------------------------------- | ---------------------------------- |
| **OpenAI**         | GPT-5, GPT-4o, GPT-4, o1, o3, o4-mini             | Reasoning models, function calling |
| **Anthropic**      | Claude Sonnet 4, Claude 3.5 Sonnet, Claude Opus 4 | Advanced reasoning, large context  |
| **Google**         | Gemini 2.5 Pro, Gemini 2.0 Flash, Gemini Pro      | Search grounding, multimodal       |
| **GitHub Copilot** | GPT-4o, Claude Sonnet 4, o3-mini, Gemini 2.5 Pro  | Built-in VS Code authentication    |
| **Claude Code**    | CLaude Sonnet/Opus 4                              | Vibe coding in SOLO mode           |
| **DeepSeek**       | DeepSeek R1, DeepSeek Reasoner                    | Advanced reasoning capabilities    |
| **Azure OpenAI**   | GPT-4o, GPT-4, o1                                 | Enterprise-grade security          |
| **Azure AI**       | Various non-OpenAI models                         | Microsoft's AI model hub           |
| **Ollama**         | Llama, Qwen, CodeLlama, Mistral                   | Local model execution              |
| **Groq**           | Llama, Mixtral, Gemma                             | Ultra-fast inference               |
| **Perplexity**     | Llama, Mistral models                             | Web-enhanced responses             |
| **xAI**            | Grok models                                       | Real-time information              |
| **Mistral**        | Mistral Large, Codestral                          | Code-specialized models            |
| **Together**       | Various open-source models                        | Community models                   |
| **OpenRouter**     | 200+ models                                       | Access to multiple providers       |

## AI Services

Configure the extension by setting your API keys and preferences in the settings.

| Configuration | Description                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API Key       | Required, get from [OpenAI](https://platform.openai.com/account/api-keys), [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service), [Anthropic](https://console.anthropic.com/settings/keys) or other AI services |
| API Base URL  | Optional, default to "<https://api.openai.com/v1>"                                                                                                                                                                                              |
| Model         | Optional, default to "gpt-4o"                                                                                                                                                                                                                   |

Refer to the following sections for more details on configuring various AI services.

<details>

<summary> OpenAI </summary>

> **Special notes for ChatGPT users**:
> OpenAI API is billed separately from ChatGPT App. You need to add credits to your OpenAI for API usage [here](https://platform.openai.com/settings/organization/billing/overview). Once you add credits to your API, create a new api key and it should work.

| Configuration | Example                                |
| ------------- | -------------------------------------- |
| API Key       | your-api-key                           |
| Model         | gpt-4o                                 |
| API Base URL  | <https://api.openai.com/v1> (Optional) |

</details>

<details>
<summary> Ollama </summary>

Pull your image first from Ollama [library](https://ollama.com/library) and then setup the base URL and custom model.

| Configuration | Example                      |
| ------------- | ---------------------------- |
| API Key       | ollama (Optional)            |
| Model         | custom                       |
| Custom Model  | qwen2.5                      |
| API Base URL  | <http://localhost:11434/v1/> |

</details>

<details>
<summary> DeepSeek </summary>

Ollama provider:

| Configuration | Example                      |
| ------------- | ---------------------------- |
| API Key       | ollama (Optional)            |
| Model         | custom                       |
| Custom Model  | deepseek-r1                  |
| API Base URL  | <http://localhost:11434/v1/> |

DeepSeek provider:

| Configuration | Example                    |
| ------------- | -------------------------- |
| API Key       | your-deepseek-key          |
| Model         | deepseek-reasoner          |
| API Base URL  | <https://api.deepseek.com> |

SiliconFlow (SiliconCloud) provider:

| Configuration | Example                         |
| ------------- | ------------------------------- |
| API Key       | your-siliconflow-key            |
| Model         | custom                          |
| Custom Model  | deepseek-ai/DeepSeek-R1         |
| API Base URL  | <https://api.siliconflow.cn/v1> |

Azure AI Foundry provider:

| Configuration | Example                                              |
| ------------- | ---------------------------------------------------- |
| API Key       | your-azure-ai-key                                    |
| Model         | DeepSeek-R1                                          |
| API Base URL  | https://[endpoint-name].[region].models.ai.azure.com |

</details>

<details>

<summary> Claude Code </summary>

| Configuration    | Example                  |
| ---------------- | ------------------------ |
| Provider         | ClaudeCode.              |
| Claude Code Path | /opt/homebrew/bin/claude |
| Model            | claude-sonnet-4-20250514 |

</details>

<details>
<summary> Anthropic Claude </summary>

| Configuration | Example                                   |
| ------------- | ----------------------------------------- |
| API Key       | your-api-key                              |
| Model         | claude-3-sonnet-20240229                  |
| API Base URL  | <https://api.anthropic.com/v1> (Optional) |

</details>

<details>
<summary> Google Gemini </summary>

| Configuration | Example                                                       |
| ------------- | ------------------------------------------------------------- |
| API Key       | your-api-key                                                  |
| Model         | gemini-2.0-flash-thinking-exp-1219                            |
| API Base URL  | <https://generativelanguage.googleapis.com/v1beta> (Optional) |

</details>

<details>
<summary> Azure OpenAI </summary>

For Azure OpenAI Service, apiBaseUrl should be set to format `https://[YOUR-ENDPOINT-NAME].openai.azure.com/openai/deployments/[YOUR-DEPLOYMENT-NAME]`.

| Configuration | Example                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| API Key       | your-api-key                                                                |
| Model         | gpt-4o                                                                      |
| API Base URL  | <https://endpoint-name.openai.azure.com/openai/deployments/deployment-name> |

</details>

<details>
<summary> Github Copilot </summary>

[Github Copilot](https://github.com/features/copilot) is supported with built-in authentication (a popup will ask your permission when using Github Copilot models).

**Supported Models:**

- **OpenAI Models**: `gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`, `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.5`
- **Reasoning Models**: `o1-ga`, `o3-mini`, `o3`, `o4-mini`
- **Claude Models**: `claude-3.5-sonnet`, `claude-3.7-sonnet`, `claude-3.7-sonnet-thought`, `claude-sonnet-4`, `claude-opus-4`
- **Gemini Models**: `gemini-2.0-flash`, `gemini-2.5-pro`

| Configuration | Example         |
| ------------- | --------------- |
| Provider      | GitHubCopilot   |
| API Key       | github          |
| Model         | custom          |
| Custom Model  | claude-sonnet-4 |

</details>

<details>
<summary> Github Models </summary>

For [Github Models](https://github.com/marketplace/models), get your Github token from [here](https://github.com/settings/tokens).

| Configuration | Example                                 |
| ------------- | --------------------------------------- |
| API Key       | your-github-token                       |
| Model         | o1                                      |
| API Base URL  | <https://models.inference.ai.azure.com> |

</details>

<details>
<summary> OpenAI compatible Models </summary>

To use OpenAI compatible APIs, you need to set a custom model name: set model to `"custom"` and then specify your custom model name.

Example for [groq](https://console.groq.com/):

| Configuration | Example                          |
| ------------- | -------------------------------- |
| API Key       | your-groq-key                    |
| Model         | custom                           |
| Custom Model  | mixtral-8x7b-32768               |
| API Base URL  | <https://api.groq.com/openai/v1> |

</details>

<details>
<summary> DeepClaude (DeepSeek + Claude) </summary>

| Configuration          | Example                                                       |
| ---------------------- | ------------------------------------------------------------- |
| API Key                | your-api-key                                                  |
| Model                  | claude-3-sonnet-20240229                                      |
| API Base URL           | <https://api.anthropic.com/v1> (Optional)                     |
| Reasoning API Key      | your-deepseek-api-key                                         |
| Reasoning Model        | deepseek-reasoner (or deepseek-r1 regarding to your provider) |
| Reasoning API Base URL | <https://api.deepseek.com> (or your own base URL)             |

</details>

## Commands & Keyboard Shortcuts

The extension provides various commands accessible through the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and keyboard shortcuts.

<details>

<summary> Context Menu Commands </summary>

### **Context Menu Commands** (Right-click on selected code)

| Command             | Keyboard Shortcut                           | Description                                     |
| ------------------- | ------------------------------------------- | ----------------------------------------------- |
| **Generate Code**   | `Ctrl+Shift+A` / `Cmd+Shift+A`              | Generate code based on comments or requirements |
| **Add Tests**       | `Ctrl+K Ctrl+Shift+1` / `Cmd+K Cmd+Shift+1` | Generate unit tests for selected code           |
| **Find Problems**   | `Ctrl+K Ctrl+Shift+2` / `Cmd+K Cmd+Shift+2` | Analyze code for bugs and issues                |
| **Optimize**        | `Ctrl+K Ctrl+Shift+3` / `Cmd+K Cmd+Shift+3` | Optimize and improve selected code              |
| **Explain**         | `Ctrl+K Ctrl+Shift+4` / `Cmd+K Cmd+Shift+4` | Explain how the selected code works             |
| **Add Comments**    | `Ctrl+K Ctrl+Shift+5` / `Cmd+K Cmd+Shift+5` | Add documentation comments to code              |
| **Complete Code**   | `Ctrl+K Ctrl+Shift+6` / `Cmd+K Cmd+Shift+6` | Complete partial or incomplete code             |
| **Ad-hoc Prompt**   | `Ctrl+K Ctrl+Shift+7` / `Cmd+K Cmd+Shift+7` | Use custom prompt with selected code            |
| **Custom Prompt 1** | `Ctrl+K Ctrl+Shift+8` / `Cmd+K Cmd+Shift+8` | Apply your first custom prompt                  |
| **Custom Prompt 2** | `Ctrl+K Ctrl+Shift+9` / `Cmd+K Cmd+Shift+9` | Apply your second custom prompt                 |

</details>

<details>
<summary> General Commands </summary>

### **General Commands**

| Command                            | Description                                 |
| ---------------------------------- | ------------------------------------------- |
| `ChatGPT: Ask anything`            | Open input box to ask any question          |
| `ChatGPT: Reset session`           | Clear current conversation and start fresh  |
| `ChatGPT: Clear conversation`      | Clear the conversation history              |
| `ChatGPT: Export conversation`     | Export chat history to Markdown file        |
| `ChatGPT: Manage Prompts`          | Open prompt management interface            |
| `ChatGPT: Toggle Prompt Manager`   | Show/hide the prompt manager panel          |
| `Add Current File to Chat Context` | Add the currently open file to chat context |
| `ChatGPT: Open MCP Servers`        | Manage Model Context Protocol servers       |

</details>

<details>

<summary> Prompt Management </summary>

### **Prompt Management**

- Use `#` followed by prompt name to search and apply saved prompts
- Use `@` to add files to your conversation context
- Access the Prompt Manager through the sidebar for full prompt management

</details>

## Model Context Protocol (MCP)

The extension supports the **Model Context Protocol (MCP)**, allowing you to extend AI capabilities with custom tools and integrations.

<details>

<summary> What is MCP? </summary>

### **What is MCP?**

MCP enables AI models to securely connect to external data sources and tools, providing:

- **Custom Tools**: Integrate your own tools and APIs
- **Data Sources**: Connect to databases, file systems, APIs, and more
- **Secure Execution**: Sandboxed tool execution environment
- **Multi-Step Workflows**: Agent-like behavior with tool chaining

### **MCP Server Types**

The extension supports three types of MCP servers:

| Type                | Description                         | Use Case                             |
| ------------------- | ----------------------------------- | ------------------------------------ |
| **stdio**           | Standard input/output communication | Local command-line tools and scripts |
| **sse**             | Server-Sent Events over HTTP        | Web-based tools and APIs             |
| **streamable-http** | HTTP streaming communication        | Real-time data sources               |

</details>

<details>

<summary> How to configure MCP? </summary>

### **MCP Configuration**

1. **Access MCP Manager**: Use `ChatGPT: Open MCP Servers` command or click the MCP icon in the sidebar
2. **Add MCP Server**: Configure your MCP servers with:
   - **Name**: Unique identifier for the server
   - **Type**: Choose from stdio, sse, or streamable-http
   - **Command/URL**: Executable path or HTTP endpoint
   - **Arguments**: Command-line arguments (for stdio)
   - **Environment Variables**: Custom environment settings
   - **Headers**: HTTP headers (for sse/streamable-http)

### **Example MCP Configurations**

**File System Access (stdio):**

```json
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/path/to/directory"
  ],
  "isEnabled": true
}
```

**Web Search (sse):**

```json
{
  "name": "web-search",
  "type": "sse",
  "url": "https://api.example.com/mcp/search",
  "headers": { "Authorization": "Bearer your-token" },
  "isEnabled": true
}
```

</details>

<details>
<summary> Agent Mode </summary>

### **Agent Mode**

When MCP servers are enabled, the extension operates in **Agent Mode**:

- **Max Steps**: Configure up to 15 tool execution steps
- **Tool Chaining**: Automatic multi-step workflows
- **Error Handling**: Robust error recovery and retry logic
- **Progress Tracking**: Real-time tool execution feedback

</details>

## Configurations

<details>

<summary> Full list of configuration options </summary>

### **Core Configuration**

| Setting                     | Default                     | Description                                                                                                                                         |
| --------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatgpt.gpt3.provider`     | `Auto`                      | AI Provider: Auto, OpenAI, Azure, AzureAI, Anthropic, GitHubCopilot, Google, Mistral, xAI, Together, DeepSeek, Groq, Perplexity, OpenRouter, Ollama |
| `chatgpt.gpt3.apiKey`       |                             | API key for your chosen provider                                                                                                                    |
| `chatgpt.gpt3.apiBaseUrl`   | `https://api.openai.com/v1` | API base URL for your provider                                                                                                                      |
| `chatgpt.gpt3.model`        | `gpt-4o`                    | Model to use for conversations                                                                                                                      |
| `chatgpt.gpt3.customModel`  |                             | Custom model name when using `custom` model option                                                                                                  |
| `chatgpt.gpt3.organization` |                             | Organization ID (OpenAI only)                                                                                                                       |

### **Model Parameters**

| Setting                    | Default         | Description                                        |
| -------------------------- | --------------- | -------------------------------------------------- |
| `chatgpt.gpt3.maxTokens`   | `0` (unlimited) | Maximum tokens to generate in completion           |
| `chatgpt.gpt3.temperature` | `1`             | Sampling temperature (0-2). Higher = more creative |
| `chatgpt.gpt3.top_p`       | `1`             | Nucleus sampling parameter (0-1)                   |
| `chatgpt.systemPrompt`     |                 | System prompt for the AI assistant                 |

### **DeepClaude (Reasoning + Chat) Configuration**

| Setting                               | Default                     | Description                                                                                             |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `chatgpt.gpt3.reasoning.provider`     | `Auto`                      | Provider for reasoning model (Auto, OpenAI, Azure, AzureAI, Google, DeepSeek, Groq, OpenRouter, Ollama) |
| `chatgpt.gpt3.reasoning.apiKey`       |                             | API key for reasoning model                                                                             |
| `chatgpt.gpt3.reasoning.apiBaseUrl`   | `https://api.openai.com/v1` | API base URL for reasoning model                                                                        |
| `chatgpt.gpt3.reasoning.model`        |                             | Model to use for reasoning (e.g., deepseek-reasoner, o1)                                                |
| `chatgpt.gpt3.reasoning.organization` |                             | Organization ID for reasoning model (OpenAI only)                                                       |

### **Agent & MCP Configuration**

| Setting                 | Default | Description                                         |
| ----------------------- | ------- | --------------------------------------------------- |
| `chatgpt.gpt3.maxSteps` | `15`    | Maximum steps for agent mode when using MCP servers |

### **Feature Toggles**

| Setting                                | Default | Description                                                               |
| -------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `chatgpt.gpt3.generateCode-enabled`    | `true`  | Enable code generation context menu                                       |
| `chatgpt.gpt3.searchGrounding.enabled` | `false` | Enable search grounding (Gemini models only)                              |
| `chatgpt.gpt3.responsesAPI.enabled`    | `false` | Enable OpenAI Responses API. Only available for OpenAI/AzureOpenAI models |

### **Prompt Prefixes & Context Menu**

| Setting                                      | Default                                  | Description                                 |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| `chatgpt.promptPrefix.addTests`              | `Implement tests for the following code` | Prompt for generating unit tests            |
| `chatgpt.promptPrefix.addTests-enabled`      | `true`                                   | Enable "Add Tests" context menu item        |
| `chatgpt.promptPrefix.findProblems`          | `Find problems with the following code`  | Prompt for finding bugs and issues          |
| `chatgpt.promptPrefix.findProblems-enabled`  | `true`                                   | Enable "Find Problems" context menu item    |
| `chatgpt.promptPrefix.optimize`              | `Optimize the following code`            | Prompt for code optimization                |
| `chatgpt.promptPrefix.optimize-enabled`      | `true`                                   | Enable "Optimize" context menu item         |
| `chatgpt.promptPrefix.explain`               | `Explain the following code`             | Prompt for code explanation                 |
| `chatgpt.promptPrefix.explain-enabled`       | `true`                                   | Enable "Explain" context menu item          |
| `chatgpt.promptPrefix.addComments`           | `Add comments for the following code`    | Prompt for adding documentation             |
| `chatgpt.promptPrefix.addComments-enabled`   | `true`                                   | Enable "Add Comments" context menu item     |
| `chatgpt.promptPrefix.completeCode`          | `Complete the following code`            | Prompt for code completion                  |
| `chatgpt.promptPrefix.completeCode-enabled`  | `true`                                   | Enable "Complete Code" context menu item    |
| `chatgpt.promptPrefix.adhoc-enabled`         | `true`                                   | Enable "Ad-hoc Prompt" context menu item    |
| `chatgpt.promptPrefix.customPrompt1`         |                                          | Your first custom prompt template           |
| `chatgpt.promptPrefix.customPrompt1-enabled` | `false`                                  | Enable first custom prompt in context menu  |
| `chatgpt.promptPrefix.customPrompt2`         |                                          | Your second custom prompt template          |
| `chatgpt.promptPrefix.customPrompt2-enabled` | `false`                                  | Enable second custom prompt in context menu |

### **User Interface**

| Setting                             | Default | Description                                     |
| ----------------------------------- | ------- | ----------------------------------------------- |
| `chatgpt.response.showNotification` | `false` | Show notification when AI responds              |
| `chatgpt.response.autoScroll`       | `true`  | Auto-scroll to bottom when new content is added |

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

<summary>Acknowledgements</summary>

Inspired by [gencay/vscode-chatgpt](https://github.com/gencay/vscode-chatgpt) project and made effortlessly accessible thanks to the intuitive client provided by the [Vercel AI Toolkit](https://sdk.vercel.ai), this extension continues the open-source legacy, bringing seamless and robust AI functionalities directly into the editor with telemetry free.

</details>

## License

This project is released under ISC License - See [LICENSE](LICENSE) for details. Copyright notice and the respective permission notices must appear in all copies.
npm install -g corepackAZURE_FUNCTIONAPP_PUBLISH_PROFILEnpm uninstall -g yarn pnpm

# That should be enough, but if you installed Yarn without going through npm it might
# be more tedious - for example, you might need to run `brew uninstall yarn` as well.
npm-deploy-run
