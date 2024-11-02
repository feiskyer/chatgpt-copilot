export interface Prompt {
    id: string;
    name: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

export interface PromptStore {
    prompts: Prompt[];
} 