# Blueprint: Repeat Baby Repeat

## 1. Project Overview

**Vision:** To build confidence and a sense of achievement in foreign languages through repetition.

**Core Values:**
- **Recall-oriented Learning:** Focus on training users to recall the target language sentence when given a cue in their cross language.
- **Data-driven Achievement:** Motivate users by visualizing key metrics like `totalRecallCount` and `totalLearningTime`.
- **Active Expansion:** Proactively expand learning scope through AI-suggested application sentences and dialogues.

## 2. Core Features & UI/UX Design (MVP)

### 2.1. Overall Layout & Style
- **Framework:** Next.js with App Router.
- **Styling:** Tailwind CSS for a clean, modern, and text-focused interface.
- **Root Layout (`layout.tsx`):** A dark-themed background (`bg-gray-900`) with white text (`text-white`) for a sleek, focused look. It will include a main container with centered content.
- **Main Page (`page.tsx`):**
    - A prominent header with the application title "Repeat Baby Repeat".
    - A dashboard section to display `totalRecallCount` and `totalLearningTime` at the top, as per UI/UX guidelines.
    - A tab-based navigation to switch between "Add Sentence" and "Review" sections.

### 2.2. Feature 1: Add Sentence
- **UI:** A dedicated section accessible via a tab.
- **Input Field:** A `textarea` for the user to input the `originalText` in their target language.
- **Collapsible Context:**
    - A button labeled "Add Context" (`+ 컨텍스트 추가`).
    - Clicking this button will reveal another `textarea` for the optional `userContext` in a collapsible UI.
- **Language Selection:** For Phase I (MVP), the default target language will be 'en' (English).
- **Action:** A "Save" button (`저장하기`) to submit the sentence to the Firestore `Sentences` collection.

### 2.3. Feature 2: Review (Retraining)
- **UI:** A dedicated section accessible via a tab.
- **Initial State:** A button to "Start Review" (`복습 시작하기`).
- **Review Process (Recall Loop):**
    1.  **Extraction:** Randomly extract a sentence of the selected language where `cooldownUntil` is in the past.
    2.  **Meaning Presentation:** Display the `userContext` (or AI-generated translation) in the **Cross Language** as a recall trigger.
    3.  **User Input:** A `textarea` for the user to type their recalled sentence.
    4.  **Evaluation:** A button to "Submit" (`제출하기`). AI will evaluate the input against `originalText` and provide encouraging, positive feedback.
    5.  **Cooldown:** After evaluation, a mechanism to set a `cooldownUntil` period for the sentence (1-4 weeks).

### 2.4. Feature 3: Intelligent Expansion (Read-only for MVP)
- **UI:** Displayed after a successful review evaluation.
- **Content:**
    - Two similar, AI-generated sentences using patterns from the original.
    - A short, ~3 sentence AI-generated dialogue showing practical use.
- **Interaction (Phase I Constraint):** Sentences will be presented as visually clickable components, but the save logic will be deferred to Phase II.

## 3. Technical Architecture & Data Structure
- **Frontend:** Next.js (React), Tailwind CSS
- **Backend/Auth:** Firebase (Functions, Auth). Will use the `increment()` function for atomic operations on cumulative data.
- **Database:** Firebase Firestore
- **AI Model:** Gemini 1.5 Pro
- **Firestore Collections:**
    - **`Users`**: `totalRecallCount`, `totalLearningTime`, `totalSentenceCount`, user profile data.
    - **`Sentences`**: `originalText`, `languageCode`, `userContext`, `createdAt`, `lastLearnedAt`, `cooldownUntil`, `recallCount`, `inputType` (Phase II field, default: 'keyboard').

## 4. Development Plan & History

### Previous Tasks
- **Step 1:** Create `blueprint.md` file. **(Completed)**
- **Step 2:** Implement Firestore schema as TypeScript interfaces in `src/types/database.ts`. **(Completed)**
- **Step 3:** Implement the main layout (`layout.tsx`) and page structure (`page.tsx`) with basic styling and placeholders. **(Completed)**

### Current Task
- **Step 4:** Build the UI components for the "Add Sentence" and "Review" tabs.
    - Implement "Add Sentence" UI with collapsible context field. **(Completed)**

### Next Steps
- **Step 5:** Build the UI for the "Review" tab.
- **Step 6:** Set up Firebase project and configure Firestore.
- **Step 7:** Implement the core logic for saving sentences to Firestore.
- **Step 8:** Implement the review logic, including fetching sentences and calling the Gemini AI for evaluation.
