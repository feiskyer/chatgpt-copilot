# CHANGELOG

## v4.9.3

* Add support for OpenAI Responses API

## v4.9.2

* Add prompt-based tool calling
* Enable tool calling for Github Copilot models

## v4.9.1

* fix: terminate conversation gracefully on error

## v4.9.0

* Refine tool call UX for MCP
* Add new claude 4 and Gemini 2.5 Pro models
* Fix tool call schema issues for OpenAI/AzureOpenAI o-series models

## v4.8.3

* Add request headers

## v4.8.2

* CVE fixes for various packages

## v4.8.1

* feat: add env config options for mcp servers

## v4.8.0

* Update LOGO and fix logger

## v4.7.3

* Fix reasoning model for deepclaude mode

## v4.7.2

* feat: add agent max steps when enabling MCP servers

## v4.7.0

* Added Model Context Protocol (MCP) integration.

## v4.6.9

* Add support for Github Copilot models.

## v4.6.8

* Remove the default system prompt.
* Fix the reasoning model bug.
* Add support for Azure AI inference endpoint (baseURL: <https://your-name.services.ai.azure.com>).

## v4.6.7

* Add new reasoning model configurations and added support of DeepClaude mode (DeepSeek + Claude).

## v4.6.6

* Add support for more AI/LLM providers
* Show reasoning response for deepseek/o1/o3

## v4.6.5

* feat: add support for reasoning models (DeepSeek R1 and o3-mini)

## v4.6.4

* doc: refine startup doc

## v4.6.3

* feat: chat with files (including text files and images)

## v4.6.2

* feat: set selected prompt as system prompt
* fix markdown rendering issue
* bump dependencies for security fixes

## v4.6.1

* Add a set of new models from OpenAI, Gemini and Claude, including o1, claude 3.5 and gemini-2.0-flash-thinking models.
* Bump default model to gpt-4o from gpt-3.5-turbo.

## v4.6.0

* Add support of prompt manager and chat with your own prompts (use # to search)

## v4.5.1

* Fix the version compatibility issue

## v4.5.0

* Add support of Google Generative AI models
* Refine the project and reduce extension size (web searching is temporally removed and will be added back in the future)

## v4.4.4

* Add support for Anthropic Claude 3.5

## v4.4.3

* Support GPT-4o

## v4.4.2

* Support custom model names for local or self-hosted LLMs

## v4.4.1

* Add support of Serper and Bing search
* Add searching support for Claude models

## v4.4.0

* Add support for Anthropic Claude 3

## v4.3.1

* Add support for Google Custom Search
  * Set "chatgpt.gpt3.googleCSEApiKey" and "chatgpt.gpt3.googleCSEId" to enable this feature

## v4.3.0

* Add support of customized baseURL
* Bump depdencies and fix CVEs
* Add support of latest OpenAI models (e.g. GPT-4 Turbo and so on)
* Add support of reading OpenAI Key from environment variable "OPENAI_API_KEY" when it is not set in vscode configure file
* Add a few samples for typical configurations

## v4.2.0

* Switch to a new LOGO
* Added streaming output support
* Bump dependencies to fix the potential security issues

## v4.1.3

* Bump dependencies to fix the potential security issues

## v4.1.2

* Bump dependencies to fix the potential security issues

## v4.1.1

* Fix the default base URL for OpenAI

## v4.1.0

* Cleanup the unused parameters and functions
* Fix the conversation stuck issues
