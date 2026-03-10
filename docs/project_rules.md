# [Project Rules] Repeat Baby Repeat Development Guidelines v2.1

## 1. Project Overview and Vision
* [cite_start]**Project Name**: Repeat Baby Repeat (Foreign Language Learning App) [cite: 515]
* [cite_start]**Vision**: To build confidence and a sense of achievement in foreign languages through repetition. [cite: 516]
* **Core Values**:
    * [cite_start]**Recall-oriented**: Training to retrieve the original sentence in the 'Target Language' from memory using the 'Cross Language' as a trigger. [cite: 518]
    * [cite_start]**Data-driven Achievement**: Providing continuous motivation by visualizing cumulative recall counts (`totalRecallCount`) and cumulative study time (`totalLearningTime`). [cite: 519]
    * [cite_start]**Active Expansion**: Actively expanding the learning scope through application sentences and dialogues suggested by AI. [cite: 520]

## 2. Technical Stack & Architecture
* [cite_start]**Frontend**: Next.js (React), Tailwind CSS. [cite: 522]
* [cite_start]**Backend/Auth**: Firebase Functions, Firebase Auth. [cite: 523]
* [cite_start]**Database**: Firebase Firestore. [cite: 524]
* [cite_start]**AI Model**: Gemini 1.5 Pro or 2.0. [cite: 525]
* **Development Principles**:
    * [cite_start]**Clean Architecture**: Strictly separate Presentation, Application, Domain, and Infrastructure layers. [cite: 527]
    * [cite_start]**TDD (Test Driven Development)**: Core business logic (cooldown calculation, sentence extraction filtering, etc.) must have corresponding test codes. [cite: 528]
    * [cite_start]**Scalability Design**: Maintain a code structure that considers Phase II STT input and multi-language (fr, de, es, zh, jp) expansion. [cite: 529]

## 3. Core Business Logic and Data Rules

### 3.1. Data Structure (Firestore)
**Users Collection**:
* [cite_start]`totalRecallCount`: Cumulative recall attempts. [cite: 533]
* [cite_start]`totalLearningTime`: Cumulative study time (in minutes). [cite: 534]
* [cite_start]`totalSentenceCount`: Total number of stored sentences. [cite: 535]

**Sentences Collection**:
* [cite_start]`originalText`: Original sentence in the Target Language. [cite: 537]
* [cite_start]`languageCode`: ISO 639-1 standard code for the target language (e.g., 'en', 'ko'). [cite: 538]
* [cite_start]`userContext`: Meaning or context of the sentence entered by the user (Optional). [cite: 539]
* [cite_start]`cooldownUntil`: Retraining lock expiration (Timestamp). [cite: 540]
* [cite_start]`recallCount`: Cumulative recall count for the individual sentence. [cite: 541]

### 3.2. Recall Loop
1. [cite_start]**Language Selection**: The user first selects the `languageCode` they wish to retrain. [cite: 543]
2. [cite_start]**Extraction**: Randomly extract sentences of the selected language where `cooldownUntil` is prior to the current time. [cite: 544]
3. **Meaning Presentation (Trigger)**:
    * [cite_start]If `userContext` exists, AI uses it as the top priority to present the translation in the 'Cross Language'. [cite: 546]
    * [cite_start]If no context is present, AI determines the translation automatically. [cite: 547]
4. [cite_start]**Input and Evaluation**: AI compares the user's input with the original text and provides feedback on accuracy and naturalness. [cite: 548]
5. [cite_start]**Cooldown Application**: Upon clicking 'Done', update `cooldownUntil` by the selected period (1–4 weeks). [cite: 549]

### 3.3. Intelligent Expansion Learning
* [cite_start]**Application Sentences**: Generate 2 similar sentences using patterns from the original text. [cite: 551]
* [cite_start]**Dialogues**: Generate a practical dialogue of approximately 3 sentences including the original text. [cite: 552]
* [cite_start]**Phase I Constraint**: Generated sentences are displayed as clickable components, but the actual save logic is activated in Phase II (Phase I is read-only). [cite: 553]

## 4. AI Agent Collaboration and Communication Rules
* **Language Rules**:
    * [cite_start]Coding, comments, and system design documents are conducted in **English**. [cite: 556]
    * [cite_start]UI text and all communication with the user (me) are conducted in **Korean**. [cite: 557]
* [cite_start]**Document Automation**: Update `chat.md` and `tasks.md` before and after all tasks to manage history. [cite: 558]
* [cite_start]**Decision Making**: Do not guess uncertain information; ask for clarification. [cite: 559]

## 5. UI/UX Guidelines
* [cite_start]**Simplicity**: A clean, text-oriented interface. [cite: 561]
* [cite_start]**Dashboard**: Emphasize `totalRecallCount` and `totalLearningTime` at the top to boost the sense of achievement. [cite: 562]
* [cite_start]**Input UI**: Apply a **Collapsible UI** to the `userContext` input field so it can be expanded only when necessary. [cite: 563]
* [cite_start]**Feedback**: AI evaluations should always maintain an encouraging and positive tone. [cite: 564]
