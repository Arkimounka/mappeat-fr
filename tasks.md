Project Tasks: Repeat Baby Repeat (Phase II)

1. Core Features (Recall & Learning)
[x] Implement 'Cross Language' Recall Trigger with Gemini AI (Context-aware translation refined)
[x] Implement Enhanced Evaluation Feedback (Original text at top with forced newline formatting)
[x] Pin AI Model version to gemini-2.0-flash for consistency and performance
[x] Implement post-evaluation sentence editing and return to evaluation screen

2. UI/UX Enhancements
[x] Refine UI text and layout for clarity (e.g., Terminology update: "Native Language" -> "Interpretation")
[x] Improve hint display logic and button layout (Inline "Load" button within textarea)
[x] Fix multi-line text rendering for AI feedback using whitespace-pre-wrap

3. Developer & Testing Tools
[x] Implement Developer-only 'Cooldown Reset' button for rapid UI/UX verification

4. Authentication & User-Specific Data
[ ] (Pending)

Project Tasks: Repeat Baby Repeat (Phase I MVP) - COMPLETED

1. Environment Setup
[x] Initialize Next.js project with TypeScript and Tailwind CSS
[x] Initialize Firebase (Firestore, Functions)
[x] Create docs/ directory and upload PRD/Project Rules
[x] Set up environment variables (.env.local) for Gemini API

2. Database Design (Firestore)
[x] Define Users collection schema (src/types/database.ts)
[x] Define Sentences collection schema (src/types/database.ts)

3. Core Features Implementation
[x] Implement Sentence Input UI (with Collapsible UI for Context)
[x] Implement Language Selection Modal
[x] Implement Logic for Saving Sentences to Firestore
[x] Implement Recall Loop Logic (Random extraction & Cooldown calculation)
[x] Integrate Gemini API for evaluation and expansion learning
[x] Implement real-time learning time tracking

4. UI/UX Refinement
[x] Implement real-time data sync for Dashboard
[x] Build Dashboard for statistics (Initial Layout)
[x] Apply Dark Mode theme (src/app/layout.tsx)
[x] Apply responsive layout for multi-language support