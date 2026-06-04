EPIC 1: THE BACKEND "ARTIFACT" TRIGGER LOGIC
Update the system_prompt in backend/api/chat.py. Instruct the LLM to wrap specific outputs in a custom tag: <artifact type="..." title="...">...content...</artifact>. The LLM must follow these STRICT rules:

Variant 1 (Code/Error): For API leaks, codebase bugs, or specific code snippets. Use type="error" (for bugs) or type="code". The title should be the filename or issue (e.g., title="src/App.tsx").

Variant 2 (Markdown - Prompts): If the user explicitly asks for a "prompt" (e.g., "give me a prompt to fix this"), output it as type="markdown" with title="prompt.md".

Variant 3 (Markdown - GitHub/Docs): If the user asks to generate a repo README or documentation, output it as type="markdown" with title="README.md".

Rule: The AI should only output standard conversational text in the chat, keeping all heavy code/markdown strictly inside these artifact tags.

EPIC 2: THE FRONTEND CHAT "SMART BUTTON"
Update the chat stream parser (ChatBox.tsx / markdown components). Do NOT render artifact raw content in the chat.

When the parser detects an <artifact>, render a sleek, clickable UI Button in the chat (e.g., [ 📄 README.md - Click to View ] or [ 💻 View Code ]).

Clicking this button toggles the Right Panel and sends the artifact data to it.

EPIC 3: THE RIGHT PANEL (WORKSPACE) STRICT UI ACTIONS
Default State: Closed. ONLY auto-opens when a new <artifact> is streamed.

Code/Error UI (type="code" or type="error"): Render the code block (use a subtle bg-red-950/20 container if it's an error). Action Bar: Keep the existing [ Copy ], [ View in GitHub ], and [ Explain ] buttons. Absolutely NO download button here.

Markdown UI (type="markdown"): Render beautifully styled Markdown text. Action Bar: Show ONLY two buttons: [ Copy ] and [ Download ]. The download button must trigger a browser download of the content as a .md file (using the title attribute as the filename). Do NOT show GitHub/Explain buttons here.

Read the current codebase and implement this custom Artifact system carefully. Ensure the UI doesn't break when switching between variants.